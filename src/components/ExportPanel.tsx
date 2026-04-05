import { useState } from "react";
import JSZip from "jszip";
import { AnalysisResult, TestFramework } from "../types";

interface ExportPanelProps {
  testOutput: string;
  analysis: AnalysisResult;
  framework: TestFramework;
  projectName: string;
}

const FRAMEWORK_EXTENSIONS: Record<TestFramework, string> = {
  jest: ".test.js", vitest: ".test.ts", mocha: ".spec.js",
  pytest: "_test.py", junit: "Test.java", rspec: "_spec.rb",
   "react-testing-library": ".test.tsx", supertest: ".test.js", cypress: ".cy.js",
};
const FRAMEWORK_INSTALL: Record<TestFramework, string> = {
  jest: "npm install --save-dev jest @types/jest", vitest: "npm install --save-dev vitest",
  mocha: "npm install --save-dev mocha chai", pytest: "pip install pytest pytest-cov",
  junit: "# Add JUnit 5 to pom.xml dependencies", rspec: "gem install rspec",
   "react-testing-library": "npm install --save-dev @testing-library/react @testing-library/jest-dom",
  supertest: "npm install --save-dev supertest @types/supertest",
  cypress: "npm install --save-dev cypress",
};
const FRAMEWORK_RUN: Record<TestFramework, string> = {
  jest: "npx jest --coverage", vitest: "npx vitest run --coverage",
  mocha: "npx mocha", pytest: "pytest --cov=. -v",
  junit: "mvn test", rspec: "rspec spec/",
   "react-testing-library": "npx react-scripts test --coverage",
  supertest: "npx jest --testPathPattern=api",
  cypress: "npx cypress run",
};

type ExportStatus = "idle" | "loading" | "done" | "error";

export function ExportPanel({ testOutput, analysis, framework, projectName }: ExportPanelProps) {
  const [zipStatus,  setZipStatus]  = useState<ExportStatus>("idle");
  const [pdfStatus,  setPdfStatus]  = useState<ExportStatus>("idle");
  const [gistStatus, setGistStatus] = useState<ExportStatus>("idle");
  const [gistUrl,    setGistUrl]    = useState<string | null>(null);
  const [gistToken,  setGistToken]  = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);

  const testFilename = `${projectName.replace(/[^a-zA-Z0-9]/g, "_")}${FRAMEWORK_EXTENSIONS[framework]}`;
  const testCount = (testOutput.match(/\bit\(|def test_|@Test|it\s*\(/g) || []).length;

  // ── ZIP Export ────────────────────────────────────────────────────────────────
  const handleZipExport = async () => {
    setZipStatus("loading");
    try {
      const zip = new JSZip();

      // Root README
      zip.file("README.md", generateReadme(projectName, framework, analysis));

      // Test file in proper folder
      const testFolder = framework === "pytest" ? "tests" : framework === "junit" ? "src/test/java" : "__tests__";
      zip.file(`${testFolder}/${testFilename}`, testOutput);

      // Original source files
      const srcFolder = zip.folder("src")!;
      for (const file of analysis.files.slice(0, 20)) {
        if (file.content) {
          const safePath = file.path.replace(/^[./]+/, "");
          try { srcFolder.file(safePath, file.content); } catch { /* skip */ }
        }
      }

      // Package config files
      if (analysis.projectType === "nodejs" || analysis.projectType === "typescript") {
        zip.file("package.json", generatePackageJson(projectName, framework));
        zip.file(".gitignore", "node_modules/\ncoverage/\ndist/\n.env\n");
        if (framework === "jest") zip.file("jest.config.js", `module.exports = { testEnvironment: 'node', collectCoverageFrom: ['src/**/*.js'], coverageDirectory: 'coverage' };\n`);
        if (framework === "vitest") zip.file("vitest.config.ts", `import { defineConfig } from 'vitest/config';\nexport default defineConfig({ test: { coverage: { provider: 'v8' } } });\n`);
      }
      if (analysis.projectType === "python") {
        zip.file("requirements.txt", [...new Set([...analysis.dependencies, "pytest", "pytest-cov", "pytest-mock"])].join("\n"));
        zip.file("pytest.ini", "[pytest]\ntestpaths = tests\naddopts = --cov=. -v\n");
        zip.file(".gitignore", "__pycache__/\n*.pyc\n.pytest_cache/\nhtmlcov/\n.coverage\n");
      }

      // .github/workflows/ci.yml
      zip.file(".github/workflows/ci.yml", generateCIYml(analysis.projectType, framework));

      // Coverage report placeholder
      zip.file("coverage/README.md", "# Coverage Report\nRun `" + FRAMEWORK_RUN[framework] + "` to generate this report.\n");

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName.replace(/\s+/g, "_")}-tests.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setZipStatus("done");
      setTimeout(() => setZipStatus("idle"), 3000);
    } catch { setZipStatus("error"); }
  };

  // ── PDF Export ────────────────────────────────────────────────────────────────
  const handlePdfExport = () => {
    setPdfStatus("loading");
    try {
      const html = generatePdfHtml(projectName, framework, analysis, testOutput, testCount);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) {
        win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 500); };
      }
      setPdfStatus("done");
      setTimeout(() => setPdfStatus("idle"), 3000);
    } catch { setPdfStatus("error"); }
  };

  // ── GitHub Gist ────────────────────────────────────────────────────────────────
  const handleGistExport = async () => {
    if (!gistToken.trim()) { setShowTokenInput(true); return; }
    setGistStatus("loading");
    try {
      const description = `TestForge AI — ${projectName} test suite (${framework})`;
      const readmeContent = `# ${projectName} — Test Suite\n\nGenerated by TestForge AI\n\n## Stats\n- Framework: ${framework}\n- Test cases: ${testCount}\n- Functions: ${analysis.functions.length}\n- API endpoints: ${analysis.apiEndpoints.length}\n\n## Run\n\`\`\`bash\n${FRAMEWORK_INSTALL[framework]}\n${FRAMEWORK_RUN[framework]}\n\`\`\`\n`;

      const res = await fetch("https://api.github.com/gists", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gistToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description,
          public: false,
          files: {
            [testFilename]: { content: testOutput },
            "README.md": { content: readmeContent },
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Failed to create gist");
      }

      const gist = await res.json() as { html_url: string };
      setGistUrl(gist.html_url);
      setGistStatus("done");
    } catch (e) {
      console.error(e);
      setGistStatus("error");
    }
  };

  const STATUS_BTN = (status: ExportStatus, idle: string, loadLabel: string, doneLabel: string) => {
    if (status === "loading") return <><span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />{loadLabel}</>;
    if (status === "done")    return <><span>✓</span>{doneLabel}</>;
    if (status === "error")   return <><span>✗</span>Error – Retry</>;
    return <>{idle}</>;
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-white/70 text-sm font-medium">Export Formats</h3>
        <p className="text-white/30 text-xs mt-1">Package and share your generated test suite in multiple formats</p>
      </div>

      <div className="grid grid-cols-1 gap-4">

        {/* ── ZIP ── */}
        <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#3b82f6]/15 flex items-center justify-center text-2xl flex-shrink-0">📦</div>
            <div className="flex-1">
              <p className="text-white/80 font-medium text-sm">Export as ZIP</p>
              <p className="text-white/35 text-xs mt-1">Complete project package with proper folder structure, config files, and CI/CD pipeline</p>
            </div>
            <button onClick={handleZipExport} disabled={zipStatus === "loading"}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 flex-shrink-0 ${
                zipStatus === "done" ? "bg-[#00ff9d]/20 text-[#00ff9d] border border-[#00ff9d]/30" :
                zipStatus === "error" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                "bg-[#3b82f6] text-white hover:bg-[#2563eb]"
              } disabled:opacity-50`}>
              {STATUS_BTN(zipStatus, "⬇ Download ZIP", "Packaging...", "Downloaded!")}
            </button>
          </div>
          {/* ZIP contents preview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
            {[
              { icon: "🧪", label: `${FRAMEWORK_EXTENSIONS[framework]}`, desc: "Test file" },
              { icon: "📁", label: "src/", desc: "Source files" },
              { icon: "⚙️", label: "package.json", desc: "Config" },
              { icon: "🚀", label: "ci.yml", desc: "GitHub Actions" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5 p-2 bg-white/[0.03] rounded-lg border border-white/6">
                <span>{item.icon}</span>
                <div>
                  <p className="text-white/50 font-mono">{item.label}</p>
                  <p className="text-white/25">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── PDF ── */}
        <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#ef4444]/15 flex items-center justify-center text-2xl flex-shrink-0">📄</div>
            <div className="flex-1">
              <p className="text-white/80 font-medium text-sm">Export Test Report as PDF</p>
              <p className="text-white/35 text-xs mt-1">Beautiful print-ready report: project summary, function list, test cases, coverage metrics — opens browser print dialog</p>
            </div>
            <button onClick={handlePdfExport} disabled={pdfStatus === "loading"}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 flex-shrink-0 ${
                pdfStatus === "done" ? "bg-[#00ff9d]/20 text-[#00ff9d] border border-[#00ff9d]/30" :
                pdfStatus === "error" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                "bg-[#ef4444] text-white hover:bg-[#dc2626]"
              } disabled:opacity-50`}>
              {STATUS_BTN(pdfStatus, "🖨 Export PDF", "Generating...", "Opened Print!")}
            </button>
          </div>
          {/* PDF sections preview */}
          <div className="flex flex-wrap gap-2 text-[10px]">
            {["📊 Executive Summary", "⚙️ Functions Analyzed", "🧪 Test Cases", "🔥 Coverage Report", "📦 Dependencies", "🚀 Run Instructions"].map(s => (
              <span key={s} className="px-2 py-1 bg-white/[0.04] border border-white/8 rounded-full text-white/40">{s}</span>
            ))}
          </div>
        </div>

        {/* ── Gist ── */}
        <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#6e40c9]/15 flex items-center justify-center text-2xl flex-shrink-0">🐙</div>
            <div className="flex-1">
              <p className="text-white/80 font-medium text-sm">Copy as GitHub Gist</p>
              <p className="text-white/35 text-xs mt-1">Create a private secret Gist with test file + README. Shareable link instantly.</p>
            </div>
            {gistStatus === "done" && gistUrl ? (
              <a href={gistUrl} target="_blank" rel="noopener noreferrer"
                className="px-4 py-2.5 text-xs font-bold rounded-xl bg-[#00ff9d]/20 text-[#00ff9d] border border-[#00ff9d]/30 flex items-center gap-2 flex-shrink-0 hover:bg-[#00ff9d]/30 transition-all">
                🔗 View Gist
              </a>
            ) : (
              <button onClick={handleGistExport} disabled={gistStatus === "loading"}
                className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 flex-shrink-0 ${
                  gistStatus === "error" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                  "bg-[#6e40c9] text-white hover:bg-[#5b2fa8]"
                } disabled:opacity-50`}>
                {STATUS_BTN(gistStatus, "📤 Create Gist", "Creating...", "Created!")}
              </button>
            )}
          </div>

          {/* Token input */}
          {(showTokenInput || gistStatus === "error") && gistStatus !== "done" && (
            <div className="space-y-2">
              <label className="text-white/30 text-[10px] tracking-widest uppercase">GitHub Token (needs <span className="font-mono text-[#6e40c9]/70">gist</span> scope)</label>
              <div className="flex gap-2">
                <input type="password" value={gistToken} onChange={e => setGistToken(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleGistExport()}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className="flex-1 bg-white/[0.04] border border-white/10 focus:border-[#6e40c9]/50 rounded-lg px-3 py-2 text-xs text-white/70 placeholder-white/20 outline-none font-mono transition-all" />
                <button onClick={handleGistExport} disabled={!gistToken.trim() || gistStatus === "loading"}
                  className="px-4 py-2 text-xs bg-[#6e40c9] text-white font-bold rounded-lg hover:bg-[#5b2fa8] disabled:opacity-50 flex items-center gap-1.5">
                  {gistStatus === "loading" ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Create"}
                </button>
              </div>
            </div>
          )}
          {!showTokenInput && gistStatus === "idle" && (
            <button onClick={() => setShowTokenInput(true)} className="text-[10px] text-white/25 hover:text-white/50 transition-colors">
              + Add GitHub token to create Gist
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Generators ────────────────────────────────────────────────────────────────
function generateReadme(projectName: string, framework: TestFramework, analysis: AnalysisResult): string {
  return `# ${projectName} — Test Suite

Auto-generated by [TestForge AI](https://github.com/testforge)

## 📊 Stats
| Metric | Value |
|--------|-------|
| Framework | ${framework} |
| Functions | ${analysis.functions.length} |
| API Endpoints | ${analysis.apiEndpoints.length} |
| Languages | ${analysis.languages.join(", ")} |

## 🚀 Getting Started

\`\`\`bash
${FRAMEWORK_INSTALL[framework]}
${FRAMEWORK_RUN[framework]}
\`\`\`

## 📁 Structure
\`\`\`
${analysis.projectType === "python" ? "tests/\n  test_*.py" : analysis.projectType === "java" ? "src/test/java/\n  *Test.java" : "__tests__/\n  *.test.ts"}
\`\`\`
`;
}

function generatePackageJson(name: string, framework: TestFramework): string {
  const safe = name.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  const devDeps: Record<string, Record<string, string>> = {
    jest: { jest: "^29.0.0", "@types/jest": "^29.0.0", "ts-jest": "^29.0.0" },
    vitest: { vitest: "^1.0.0", "@vitest/coverage-v8": "^1.0.0" },
    mocha: { mocha: "^10.0.0", chai: "^4.3.0", "@types/mocha": "^10.0.0" },
  };
  const scripts: Record<string, string> = {
    jest: "jest --coverage", vitest: "vitest run --coverage", mocha: "mocha",
    pytest: "pytest", junit: "mvn test", rspec: "rspec",
  };
  return JSON.stringify({
    name: safe, version: "1.0.0",
    scripts: { test: scripts[framework] ?? "jest" },
    devDependencies: devDeps[framework] ?? {},
  }, null, 2);
}

function generateCIYml(projectType: string, framework: TestFramework): string {
  const cmds: Record<string, { install: string; test: string; runtime: string }> = {
    python:     { install: "pip install -r requirements.txt", test: "pytest --cov", runtime: "python-version: '3.11'" },
    java:       { install: "mvn install -DskipTests",         test: "mvn test",     runtime: "java-version: '17'" },
    typescript: { install: "npm ci",                          test: `npx ${framework} --coverage`, runtime: "node-version: '20'" },
    nodejs:     { install: "npm ci",                          test: `npx ${framework}`,            runtime: "node-version: '20'" },
  };
  const c = cmds[projectType] ?? cmds["nodejs"];
  return `name: CI\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          ${c.runtime}\n      - run: ${c.install}\n      - run: ${c.test}\n`;
}

function generatePdfHtml(name: string, framework: TestFramework, analysis: AnalysisResult, testOutput: string, testCount: number): string {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const lines = testOutput.split("\n").length;
  const coveragePct = Math.round((testCount / Math.max(analysis.testableItems, 1)) * 100);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${name} — Test Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',sans-serif; background:#fff; color:#1a1a2e; padding:48px; max-width:900px; margin:0 auto; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #6e40c9; padding-bottom:24px; margin-bottom:32px; }
  .logo { font-size:24px; font-weight:700; color:#6e40c9; }
  .logo span { color:#00cc7a; }
  .meta { text-align:right; color:#666; font-size:13px; }
  h1 { font-size:28px; font-weight:700; margin-bottom:4px; }
  h2 { font-size:16px; font-weight:700; color:#6e40c9; margin:28px 0 12px; border-bottom:1px solid #e5e7eb; padding-bottom:6px; }
  .stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:28px; }
  .stat { background:#f8f7ff; border:1px solid #e5e7eb; border-radius:12px; padding:16px; text-align:center; }
  .stat-val { font-size:28px; font-weight:700; color:#6e40c9; }
  .stat-label { font-size:11px; color:#888; margin-top:4px; text-transform:uppercase; letter-spacing:.05em; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { background:#6e40c9; color:#fff; padding:10px 12px; text-align:left; font-weight:600; }
  td { padding:8px 12px; border-bottom:1px solid #f0f0f0; }
  tr:nth-child(even) td { background:#fafafa; }
  .badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:700; }
  .badge-green { background:#d1fae5; color:#065f46; }
  .badge-blue  { background:#dbeafe; color:#1e40af; }
  .badge-purple{ background:#ede9fe; color:#5b21b6; }
  .code-block { background:#1e1e2e; color:#d4d4d4; font-family:'JetBrains Mono',monospace; font-size:10px; line-height:1.6; padding:20px; border-radius:10px; overflow-x:auto; white-space:pre-wrap; max-height:500px; overflow-y:auto; }
  .progress-bar { background:#e5e7eb; border-radius:4px; height:8px; overflow:hidden; }
  .progress-fill { background:linear-gradient(90deg,#6e40c9,#00cc7a); height:100%; border-radius:4px; }
  .footer { margin-top:48px; padding-top:16px; border-top:1px solid #e5e7eb; color:#aaa; font-size:11px; text-align:center; }
  @media print { .no-print { display:none; } body { padding:20px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">test<span>forge</span>.ai</div>
    <h1>${name}</h1>
    <p style="color:#666;font-size:14px;margin-top:4px">AI-Generated Test Report</p>
  </div>
  <div class="meta">
    <div><strong>Date</strong>: ${date}</div>
    <div><strong>Framework</strong>: ${framework}</div>
    <div><strong>Project Type</strong>: ${analysis.projectType}</div>
    <div><strong>Languages</strong>: ${analysis.languages.join(", ")}</div>
  </div>
</div>

<div class="stats-grid">
  <div class="stat"><div class="stat-val">${testCount}</div><div class="stat-label">Test Cases</div></div>
  <div class="stat"><div class="stat-val">${lines}</div><div class="stat-label">Lines</div></div>
  <div class="stat"><div class="stat-val">${analysis.functions.length}</div><div class="stat-label">Functions</div></div>
  <div class="stat"><div class="stat-val">${coveragePct}%</div><div class="stat-label">Coverage Est.</div></div>
</div>

<div style="margin-bottom:28px">
  <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px;color:#666">
    <span>Estimated Coverage</span><span>${coveragePct}%</span>
  </div>
  <div class="progress-bar"><div class="progress-fill" style="width:${coveragePct}%"></div></div>
</div>

<h2>Functions Analyzed (${analysis.functions.length})</h2>
<table>
  <tr><th>Function</th><th>Parameters</th><th>File</th><th>Type</th></tr>
  ${analysis.functions.slice(0, 20).map(f => `
  <tr>
    <td><code>${f.name}</code></td>
    <td><code>${f.params.join(", ") || "—"}</code></td>
    <td style="color:#888;font-size:11px">${f.file.split("/").pop()}</td>
    <td>${f.isAsync ? '<span class="badge badge-blue">async</span>' : '<span class="badge badge-purple">sync</span>'}</td>
  </tr>`).join("")}
</table>

${analysis.apiEndpoints.length > 0 ? `
<h2>API Endpoints (${analysis.apiEndpoints.length})</h2>
<table>
  <tr><th>Method</th><th>Path</th><th>File</th></tr>
  ${analysis.apiEndpoints.map(e => `
  <tr>
    <td><span class="badge ${e.method === "GET" ? "badge-green" : "badge-blue"}">${e.method}</span></td>
    <td><code>${e.path}</code></td>
    <td style="color:#888;font-size:11px">${e.file.split("/").pop()}</td>
  </tr>`).join("")}
</table>
` : ""}

<h2>Dependencies (${analysis.dependencies.length})</h2>
<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
  ${analysis.dependencies.slice(0, 20).map(d => `<span class="badge badge-purple">${d}</span>`).join("")}
</div>

<h2>Run Instructions</h2>
<div class="code-block"># Install\n${FRAMEWORK_INSTALL[framework]}\n\n# Run tests\n${FRAMEWORK_RUN[framework]}</div>

<h2>Generated Test Suite</h2>
<div class="code-block">${testOutput.replace(/</g,"&lt;").replace(/>/g,"&gt;").slice(0, 8000)}${testOutput.length > 8000 ? "\n\n... (truncated for PDF — full file in ZIP export)" : ""}</div>

<div class="footer">
  Generated by TestForge AI · ${date} · ${analysis.projectName} · ${framework}
</div>
</body>
</html>`;
}
