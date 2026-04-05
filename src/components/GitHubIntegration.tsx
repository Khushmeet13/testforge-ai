import { useState, useCallback } from "react";
import {
  GitHubRepo, GitHubFile, GitHubConnection, GitHubPR,
  AnalysisResult, TestFramework
} from "../types";
import { analyzeProject } from "../utils/analyzer";
import { FiGithub } from "react-icons/fi";

interface GitHubIntegrationProps {
  onAnalysisComplete: (analysis: AnalysisResult, files: GitHubFile[]) => void;
  testOutput?: string;
  analysis?: AnalysisResult;
  framework?: TestFramework;
  projectName?: string;
}

type Step = "connect" | "repos" | "browse" | "analyze" | "pr";

const GH_API = "https://api.github.com";

async function ghFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${GH_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `GitHub API error: ${res.status}`);
  }
  return res.json();
}

// Decode base64 content from GitHub API
function decodeContent(encoded: string): string {
  try { return atob(encoded.replace(/\n/g, "")); }
  catch { return ""; }
}

const FRAMEWORK_EXTENSIONS: Record<TestFramework, string> = {
  jest: ".test.js", vitest: ".test.ts", mocha: ".spec.js",
  pytest: "_test.py", junit: "Test.java", rspec: "_spec.rb",
   "react-testing-library": ".test.tsx", supertest: ".test.js", cypress: ".cy.js",
};

export function GitHubIntegration({
  onAnalysisComplete, testOutput, analysis, framework, projectName
}: GitHubIntegrationProps) {
  const [step, setStep] = useState<Step>("connect");
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [token, setToken] = useState("");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [repoFiles, setRepoFiles] = useState<GitHubFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [prResult, setPrResult] = useState<GitHubPR | null>(null);
  const [prStatus, setPrStatus] = useState<"idle" | "creating" | "done" | "error">("idle");
  const [prError, setPrError] = useState<string | null>(null);

  // ── Connect ──────────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    if (!token.trim()) return;
    setLoading(true); setError(null);
    try {
      const user = await ghFetch("/user", token);
      setConnection({ token, user: user.login, avatar_url: user.avatar_url });
      const repoData = await ghFetch("/user/repos?per_page=50&sort=updated&type=all", token);
      setRepos(repoData as GitHubRepo[]);
      setStep("repos");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect. Check your token.");
    } finally { setLoading(false); }
  };

  // ── Load repo tree ────────────────────────────────────────────────────────────
  const handleSelectRepo = async (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setLoading(true); setError(null);
    try {
      const tree = await ghFetch(`/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`, connection!.token);
      const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".java", ".rb", ".go", ".cs", ".php"]);
      const ignoredDirs = new Set(["node_modules", "dist", "build", ".git", "__pycache__", "coverage", "target", ".next"]);

      const relevantFiles: GitHubFile[] = (tree.tree as { path: string; type: string }[])
        .filter((item) => {
          if (item.type !== "blob") return false;
          const parts = item.path.split("/");
          if (parts.some(p => ignoredDirs.has(p))) return false;
          const ext = "." + item.path.split(".").pop()?.toLowerCase();
          return codeExtensions.has(ext);
        })
        .slice(0, 40)
        .map((item) => ({ path: item.path, content: "" }));

      setRepoFiles(relevantFiles);
      setStep("browse");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load repository");
    } finally { setLoading(false); }
  };

  // ── Fetch file contents & analyze ────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!selectedRepo || !connection) return;
    setStep("analyze"); setLoading(true); setError(null);

    try {
      // Fetch content of top files (limit API calls)
      const filesToFetch = repoFiles.slice(0, 20);
      const fetched: GitHubFile[] = [];

      for (const file of filesToFetch) {
        try {
          const data = await ghFetch(`/repos/${selectedRepo.full_name}/contents/${file.path}`, connection.token) as { content: string; encoding: string };
          const content = data.encoding === "base64" ? decodeContent(data.content) : data.content;
          fetched.push({ path: file.path, content: content.slice(0, 50000) });
        } catch { fetched.push({ path: file.path, content: "" }); }
      }

      // Build FileInfo array for analyzer
      const LANG_MAP: Record<string, string> = {
        ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
        ".mjs": "JavaScript", ".py": "Python", ".java": "Java", ".rb": "Ruby",
        ".go": "Go", ".cs": "C#", ".php": "PHP",
      };

      const fileInfos = fetched.map(f => {
        const ext = "." + f.path.split(".").pop()!.toLowerCase();
        return { name: f.path.split("/").pop()!, path: f.path, content: f.content, language: LANG_MAP[ext] ?? "Text", size: f.content.length };
      });

      const result = analyzeProject(fileInfos, selectedRepo.name);
      onAnalysisComplete(result, fetched);
      setStep("pr");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setStep("browse");
    } finally { setLoading(false); }
  };

  // ── Create PR ─────────────────────────────────────────────────────────────────
  const handleCreatePR = async () => {
    if (!selectedRepo || !connection || !testOutput || !framework) return;
    setPrStatus("creating"); setPrError(null);

    const ext = FRAMEWORK_EXTENSIONS[framework];
    const testFilename = `tests/${(projectName ?? selectedRepo.name).replace(/[^a-zA-Z0-9]/g, "_")}${ext}`;
    const branchName = `testforge/add-tests-${Date.now()}`;

    try {
      // 1. Get base SHA
      const baseRef = await ghFetch(`/repos/${selectedRepo.full_name}/git/ref/heads/${selectedRepo.default_branch}`, connection.token);
      const baseSha = baseRef.object.sha;

      // 2. Create branch
      await ghFetch(`/repos/${selectedRepo.full_name}/git/refs`, connection.token, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
      });

      // 3. Create test file on branch
      await ghFetch(`/repos/${selectedRepo.full_name}/contents/${testFilename}`, connection.token, {
        method: "PUT",
        body: JSON.stringify({
          message: `✅ Add AI-generated test suite via TestForge`,
          content: btoa(unescape(encodeURIComponent(testOutput))),
          branch: branchName,
        }),
      });

      // 4. Create PR
      const pr = await ghFetch(`/repos/${selectedRepo.full_name}/pulls`, connection.token, {
        method: "POST",
        body: JSON.stringify({
          title: `✅ Add AI-generated test suite (${framework})`,
          body: `## 🤖 TestForge AI — Auto-Generated Tests\n\nThis PR adds a comprehensive test suite generated by [TestForge AI](https://testforge.ai).\n\n### 📊 Summary\n- **Framework**: ${framework}\n- **Test file**: \`${testFilename}\`\n- **Functions covered**: ${analysis?.functions.length ?? 0}\n- **API endpoints tested**: ${analysis?.apiEndpoints.length ?? 0}\n- **Test cases**: ~${(testOutput.match(/\bit\(|def test_|@Test/g) || []).length}\n\n### 🔍 What's included\n- Unit tests for all exported functions\n- Integration tests for API endpoints\n- Edge case coverage (null inputs, boundary values, errors)\n- Mocks for external dependencies\n\n> Generated with ❤️ by TestForge AI`,
          head: branchName,
          base: selectedRepo.default_branch,
        }),
      }) as GitHubPR;

      setPrResult(pr);
      setPrStatus("done");
    } catch (e) {
      setPrError(e instanceof Error ? e.message : "Failed to create PR");
      setPrStatus("error");
    }
  };

  const filteredRepos = repos.filter(r =>
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Render steps ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {(["connect", "repos", "browse", "analyze", "pr"] as Step[]).map((s, i) => {
          const steps = ["connect", "repos", "browse", "analyze", "pr"];
          const current = steps.indexOf(step);
          const idx = steps.indexOf(s);
          const done = idx < current;
          const active = idx === current;
          const labels = ["Connect", "Repos", "Browse", "Analyze", "PR"];
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] transition-all ${active ? "bg-[#6e40c9]/20 border border-[#6e40c9]/40 text-[#6e40c9]" :
                done ? "bg-[#00ff9d]/15 border border-[#00ff9d]/25 text-[#00ff9d]" :
                  "bg-white/[0.03] border border-white/8 text-white/25"
                }`}>
                {done ? "✓" : <span className="w-3 h-3 rounded-full flex items-center justify-center text-[8px] font-bold bg-current/20">{i + 1}</span>}
                <span className="hidden sm:inline">{labels[i]}</span>
              </div>
              {i < 4 && <div className={`h-px w-4 ${done ? "bg-[#00ff9d]/40" : "bg-white/10"}`} />}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
          <span>⚠</span> {error}
        </div>
      )}

      {/* Step: Connect */}
      {step === "connect" && (
        <div className="space-y-5">
          <div className="p-6 bg-white/[0.02] border border-white/10 rounded-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#6e40c9]/20 flex items-center justify-center text-xl">
                <FiGithub className="text-base" size={20} /></div>
              <div>
                <p className="text-white/80 text-sm font-medium">Connect GitHub Account</p>
                <p className="text-white/30 text-xs">Uses a Personal Access Token (PAT) — never stored</p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-white/40 text-xs tracking-widest uppercase">GitHub Personal Access Token</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleConnect()}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="flex-1 bg-white/[0.04] border border-white/10 hover:border-white/20 focus:border-[#6e40c9]/50 rounded-xl px-4 py-3 text-sm text-white/80 placeholder-white/20 outline-none transition-all font-mono"
                />
                <button onClick={handleConnect} disabled={!token.trim() || loading}
                  className="px-5 py-3 bg-[#6e40c9] text-white font-bold rounded-xl hover:bg-[#5b2fa8] transition-all disabled:opacity-50 text-sm flex items-center gap-2">
                  {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Connect"}
                </button>
              </div>
            </div>
            <div className="p-3 bg-[#6e40c9]/8 border border-[#6e40c9]/20 rounded-lg space-y-2">
              <p className="text-[#6e40c9]/80 text-xs font-medium">How to get a token:</p>
              <ol className="text-white/30 text-xs space-y-1 list-none">
                <li>1. Go to <span className="font-mono text-[#6e40c9]/70">github.com → Settings → Developer Settings → Personal access tokens</span></li>
                <li>2. Click <span className="font-medium text-white/50">"Generate new token (classic)"</span></li>
                <li>3. Select scopes: <span className="font-mono text-[#00ff9d]/60">repo</span> (full control of private repos)</li>
                <li>4. Copy and paste above</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Step: Repos */}
      {step === "repos" && connection && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-[#00ff9d]/5 border border-[#00ff9d]/20 rounded-xl">
            <img src={connection.avatar_url} alt={connection.user} className="w-8 h-8 rounded-full" />
            <div>
              <p className="text-[#00ff9d] text-sm font-medium">@{connection.user}</p>
              <p className="text-white/30 text-xs">{repos.length} repositories found</p>
            </div>
            <button onClick={() => { setConnection(null); setToken(""); setStep("connect"); }}
              className="ml-auto text-xs text-white/30 hover:text-white/60 border border-white/10 px-2 py-1 rounded-md">
              Disconnect
            </button>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] rounded-xl border border-white/8">
            <svg className="w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search repositories..." className="flex-1 bg-transparent text-sm text-white/70 placeholder-white/20 outline-none" />
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {filteredRepos.map(repo => (
              <button key={repo.id} onClick={() => handleSelectRepo(repo)} disabled={loading}
                className="w-full text-left p-4 bg-white/[0.02] hover:bg-white/[0.05] border border-white/8 hover:border-white/20 rounded-xl transition-all group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white/80 text-sm font-medium group-hover:text-white transition-colors">{repo.full_name}</p>
                      {repo.private && <span className="text-[9px] px-1.5 py-0.5 bg-[#f59e0b]/15 text-[#f59e0b] rounded-full border border-[#f59e0b]/25">Private</span>}
                      {repo.language && <span className="text-[9px] px-1.5 py-0.5 bg-white/8 text-white/40 rounded-full">{repo.language}</span>}
                    </div>
                    {repo.description && <p className="text-white/30 text-xs mt-1 truncate">{repo.description}</p>}
                    <p className="text-white/20 text-[10px] mt-1 font-mono">branch: {repo.default_branch}</p>
                  </div>
                  <svg className="w-4 h-4 text-white/20 group-hover:text-white/50 flex-shrink-0 mt-1 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: Browse */}
      {step === "browse" && selectedRepo && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/10 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="text-lg">📁</span>
              <div>
                <p className="text-white/70 text-sm font-medium">{selectedRepo.full_name}</p>
                <p className="text-white/30 text-xs">{repoFiles.length} code files detected</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep("repos")} className="text-xs text-white/40 hover:text-white/70 border border-white/10 px-3 py-1.5 rounded-lg transition-colors">← Back</button>
              <button onClick={handleAnalyze} disabled={loading}
                className="px-4 py-1.5 text-xs bg-[#6e40c9] text-white font-bold rounded-lg hover:bg-[#5b2fa8] transition-all disabled:opacity-50 flex items-center gap-1.5">
                {loading ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Fetching...</> : "⚡ Analyze & Generate Tests"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
            {repoFiles.map((f, i) => {
              const ext = "." + f.path.split(".").pop()?.toLowerCase();
              const langIcons: Record<string, string> = { ".ts": "🔷", ".tsx": "🔷", ".js": "🟨", ".jsx": "🟨", ".py": "🐍", ".java": "☕", ".rb": "💎", ".go": "🐹" };
              return (
                <div key={i} className="flex items-center gap-2 p-2 bg-white/[0.02] rounded-lg border border-white/6">
                  <span className="text-sm flex-shrink-0">{langIcons[ext] ?? "📄"}</span>
                  <span className="text-white/50 text-xs truncate">{f.path}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step: Analyze loading */}
      {step === "analyze" && (
        <div className="flex flex-col items-center justify-center py-14 gap-6">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 border-2 border-[#6e40c9]/20 rounded-full animate-ping" />
            <div className="absolute inset-2 border-t-2 border-[#6e40c9] rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-xl">🐙</div>
          </div>
          <div className="text-center">
            <p className="text-[#6e40c9] text-sm tracking-widest uppercase">Fetching from GitHub</p>
            <p className="text-white/30 text-xs mt-1">Reading {repoFiles.length} files from {selectedRepo?.full_name}...</p>
          </div>
        </div>
      )}

      {/* Step: PR */}
      {step === "pr" && selectedRepo && (
        <div className="space-y-5">
          <div className="p-4 bg-[#00ff9d]/5 border border-[#00ff9d]/20 rounded-xl flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-[#00ff9d] text-sm font-medium">Analysis complete!</p>
              <p className="text-white/40 text-xs">{selectedRepo.full_name} — tests generated successfully</p>
            </div>
          </div>

          {!testOutput ? (
            <div className="p-4 bg-[#f59e0b]/8 border border-[#f59e0b]/20 rounded-xl text-[#f59e0b] text-xs">
              ⚠ Generate tests first before creating a PR. Go to the Analysis panel and click "Generate Test Suite".
            </div>
          ) : prStatus === "done" && prResult ? (
            <div className="p-5 bg-[#6e40c9]/8 border border-[#6e40c9]/25 rounded-xl space-y-3">
              <p className="text-[#6e40c9] text-sm font-bold">🎉 Pull Request Created!</p>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-white/40">PR Number</span>
                  <span className="text-white/70 font-mono">#{prResult.number}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40">Title</span>
                  <span className="text-white/70 truncate max-w-xs">{prResult.title}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40">Status</span>
                  <span className="px-2 py-0.5 rounded-full bg-[#00ff9d]/15 text-[#00ff9d] text-[10px]">{prResult.state}</span>
                </div>
              </div>
              <a href={prResult.html_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#6e40c9] text-white text-xs font-bold rounded-lg hover:bg-[#5b2fa8] transition-all">
                🐙 View Pull Request on GitHub
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            </div>
          ) : (
            <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl space-y-4">
              <p className="text-white/60 text-sm font-medium">Create a Pull Request</p>
              <div className="space-y-2 text-xs text-white/40">
                <div className="flex items-center justify-between p-2 bg-white/[0.03] rounded-lg">
                  <span>Repository</span><span className="text-white/60 font-mono">{selectedRepo.full_name}</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-white/[0.03] rounded-lg">
                  <span>Base branch</span><span className="text-white/60 font-mono">{selectedRepo.default_branch}</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-white/[0.03] rounded-lg">
                  <span>New branch</span><span className="text-white/60 font-mono">testforge/add-tests-*</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-white/[0.03] rounded-lg">
                  <span>Test file</span><span className="text-white/60 font-mono">tests/{(projectName ?? selectedRepo.name).replace(/[^a-zA-Z0-9]/g, "_")}{FRAMEWORK_EXTENSIONS[framework ?? "jest"]}</span>
                </div>
              </div>
              {prError && <p className="text-red-400 text-xs p-2 bg-red-500/10 rounded-lg">{prError}</p>}
              <button onClick={handleCreatePR} disabled={prStatus === "creating"}
                className="w-full py-3 bg-[#6e40c9] text-white font-bold rounded-xl hover:bg-[#5b2fa8] transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                {prStatus === "creating"
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating PR...</>
                  : <>🐙 Create Pull Request</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
