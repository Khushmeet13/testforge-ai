import { useState, useRef, useMemo } from "react";
import { AnalysisResult, DiffResult, FileDiff, SessionRecord, TestFramework } from "../types";
import { extractZip, analyzeProject } from "../utils/analyzer";

// ─── Session History ──────────────────────────────────────────────────────────
const SESSION_KEY = "testforge_sessions";

export function loadSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveSession(record: Omit<SessionRecord, "id">): SessionRecord {
  const sessions = loadSessions();
  const newRecord: SessionRecord = { ...record, id: `sess-${Date.now()}` };
  sessions.unshift(newRecord);
  const trimmed = sessions.slice(0, 10); // keep last 10
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(trimmed)); } catch { /* storage full */ }
  return newRecord;
}

export function deleteSession(id: string) {
  const sessions = loadSessions().filter(s => s.id !== id);
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(sessions)); } catch { /* */ }
}

// ─── Diff computation ─────────────────────────────────────────────────────────
function computeDiff(oldAnalysis: AnalysisResult, newAnalysis: AnalysisResult): DiffResult {
  const oldPaths = new Set(oldAnalysis.files.map(f => f.path));
  const newPaths = new Set(newAnalysis.files.map(f => f.path));
  const oldByPath = new Map(oldAnalysis.files.map(f => [f.path, f]));
  const newByPath = new Map(newAnalysis.files.map(f => [f.path, f]));

  const diffs: FileDiff[] = [];

  for (const path of new Set([...oldPaths, ...newPaths])) {
    const oldFile = oldByPath.get(path);
    const newFile = newByPath.get(path);

    if (!oldFile && newFile) {
      diffs.push({ path, status: "added", linesAdded: newFile.content.split("\n").length, linesRemoved: 0, newContent: newFile.content });
    } else if (oldFile && !newFile) {
      diffs.push({ path, status: "removed", linesAdded: 0, linesRemoved: oldFile.content.split("\n").length, oldContent: oldFile.content });
    } else if (oldFile && newFile) {
      if (oldFile.content === newFile.content) {
        diffs.push({ path, status: "unchanged", linesAdded: 0, linesRemoved: 0 });
      } else {
        const oldLines = oldFile.content.split("\n");
        const newLines = newFile.content.split("\n");
        const added = newLines.filter(l => !oldLines.includes(l)).length;
        const removed = oldLines.filter(l => !newLines.includes(l)).length;
        diffs.push({ path, status: "modified", linesAdded: added, linesRemoved: removed, oldContent: oldFile.content, newContent: newFile.content });
      }
    }
  }

  const changed = diffs.filter(d => d.status !== "unchanged");
  return {
    files: diffs,
    hasChanges: changed.length > 0,
    addedFiles: diffs.filter(d => d.status === "added").length,
    removedFiles: diffs.filter(d => d.status === "removed").length,
    modifiedFiles: diffs.filter(d => d.status === "modified").length,
  };
}

const DIFF_META: Record<FileDiff["status"], { color: string; bg: string; border: string; icon: string; label: string }> = {
  added:     { color: "text-[#00ff9d]", bg: "bg-[#00ff9d]/8",  border: "border-[#00ff9d]/20", icon: "+", label: "Added" },
  removed:   { color: "text-[#ef4444]", bg: "bg-[#ef4444]/8",  border: "border-[#ef4444]/20", icon: "−", label: "Removed" },
  modified:  { color: "text-[#f59e0b]", bg: "bg-[#f59e0b]/8",  border: "border-[#f59e0b]/20", icon: "~", label: "Modified" },
  unchanged: { color: "text-white/30",  bg: "bg-white/[0.02]", border: "border-white/8",       icon: "=", label: "Unchanged" },
};

// ─── Diff Viewer Component ─────────────────────────────────────────────────────
interface DiffViewerProps {
  analysis: AnalysisResult;
}

export function DiffViewer({ analysis }: DiffViewerProps) {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<FileDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FileDiff["status"] | "all">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith(".zip")) { setError("Please upload a .zip file"); return; }
    setLoading(true); setError(null);
    try {
      const files = await extractZip(file);
      const newAnalysis = analyzeProject(files, file.name);
      const result = computeDiff(analysis, newAnalysis);
      setDiff(result);
      const firstChanged = result.files.find(f => f.status !== "unchanged");
      setSelectedDiff(firstChanged ?? result.files[0] ?? null);
    } catch { setError("Failed to process ZIP file"); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    if (!diff) return [];
    return filterStatus === "all" ? diff.files.filter(f => f.status !== "unchanged") : diff.files.filter(f => f.status === filterStatus);
  }, [diff, filterStatus]);

  if (!diff) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-6">
        <div className="text-5xl">🔄</div>
        <div className="text-center">
          <p className="text-white/60 text-sm">Upload an updated version of your project</p>
          <p className="text-white/25 text-xs mt-1">See what changed and only re-generate tests for modified files</p>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer px-6 py-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-white/25 rounded-xl text-white/50 hover:text-white/80 transition-all text-sm flex items-center gap-2">
          {loading ? <><span className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /> Analyzing...</> : <><span>📁</span> Upload Updated Project ZIP</>}
        </div>
        <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white/[0.02] border border-white/10 rounded-xl">
        <div className="flex gap-4">
          {[
            { label: "Modified", count: diff.modifiedFiles, color: "#f59e0b" },
            { label: "Added",    count: diff.addedFiles,    color: "#00ff9d" },
            { label: "Removed",  count: diff.removedFiles,  color: "#ef4444" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.count}</p>
              <p className="text-white/30 text-[10px]">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {diff.hasChanges
            ? <span className="text-xs px-3 py-1.5 bg-[#f59e0b]/15 border border-[#f59e0b]/25 text-[#f59e0b] rounded-full">{diff.modifiedFiles + diff.addedFiles} files changed</span>
            : <span className="text-xs px-3 py-1.5 bg-[#00ff9d]/15 border border-[#00ff9d]/25 text-[#00ff9d] rounded-full">No changes detected</span>}
          <button onClick={() => { setDiff(null); setSelectedDiff(null); }} className="text-[10px] text-white/30 hover:text-white/60 border border-white/10 px-2 py-1.5 rounded-md transition-colors">
            Upload New
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {(["all", "modified", "added", "removed"] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 text-xs rounded-full border transition-all capitalize ${filterStatus === s ? "bg-white/10 text-white border-white/20" : "text-white/30 border-white/8 hover:text-white/60"}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* File list */}
        <div className="space-y-1.5 max-h-[450px] overflow-y-auto pr-1">
          {filtered.length === 0
            ? <p className="text-white/20 text-xs text-center py-6">No files match this filter</p>
            : filtered.map((fd, i) => {
              const m = DIFF_META[fd.status];
              return (
                <button key={i} onClick={() => setSelectedDiff(fd)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${m.bg} ${m.border} ${selectedDiff === fd ? "ring-1 ring-white/20" : "hover:border-white/20"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold flex-shrink-0 ${m.color}`}>{m.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-white/70 text-xs truncate">{fd.path.split("/").pop()}</p>
                      <p className="text-white/25 text-[10px] truncate">{fd.path.split("/").slice(0, -1).join("/")}</p>
                    </div>
                    {fd.status === "modified" && (
                      <div className="text-[10px] flex gap-1 flex-shrink-0">
                        <span className="text-[#00ff9d]">+{fd.linesAdded}</span>
                        <span className="text-[#ef4444]">-{fd.linesRemoved}</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
        </div>

        {/* Diff content */}
        <div className="lg:col-span-2">
          {selectedDiff ? (
            <div>
              <div className="flex items-center gap-2 px-4 py-2 bg-[#111118] border border-white/8 rounded-t-xl">
                <span className={`text-sm font-bold ${DIFF_META[selectedDiff.status].color}`}>{DIFF_META[selectedDiff.status].icon}</span>
                <span className="text-white/40 text-xs font-mono">{selectedDiff.path}</span>
                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${DIFF_META[selectedDiff.status].bg} ${DIFF_META[selectedDiff.status].color} border ${DIFF_META[selectedDiff.status].border}`}>
                  {DIFF_META[selectedDiff.status].label}
                </span>
              </div>
              <div className="bg-[#0d0d14] border border-t-0 border-white/8 rounded-b-xl overflow-auto max-h-[400px]">
                {selectedDiff.status === "modified" && selectedDiff.oldContent && selectedDiff.newContent ? (
                  <SideBySideDiff oldContent={selectedDiff.oldContent} newContent={selectedDiff.newContent} />
                ) : (
                  <pre className="text-xs leading-relaxed p-4 font-mono text-white/60 whitespace-pre-wrap">
                    {(selectedDiff.newContent ?? selectedDiff.oldContent ?? "No content").slice(0, 3000)}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-white/20 text-sm">Select a file to view diff</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SideBySideDiff({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const oldLines = oldContent.split("\n").slice(0, 60);
  const newLines = newContent.split("\n").slice(0, 60);
  const maxLen = Math.max(oldLines.length, newLines.length);

  return (
    <div className="grid grid-cols-2 divide-x divide-white/8 text-[11px] font-mono">
      <div className="p-3 overflow-auto">
        <p className="text-[#ef4444]/50 text-[10px] mb-2 tracking-widest uppercase">Before</p>
        {Array.from({ length: maxLen }, (_, i) => {
          const line = oldLines[i] ?? "";
          const isRemoved = line && !newLines.includes(line);
          return (
            <div key={i} className={`px-2 py-0.5 rounded-sm ${isRemoved ? "bg-[#ef4444]/10 text-[#ef4444]/70" : "text-white/40"}`}>
              <span className="text-white/15 mr-2 select-none">{i + 1}</span>{line}
            </div>
          );
        })}
      </div>
      <div className="p-3 overflow-auto">
        <p className="text-[#00ff9d]/50 text-[10px] mb-2 tracking-widest uppercase">After</p>
        {Array.from({ length: maxLen }, (_, i) => {
          const line = newLines[i] ?? "";
          const isAdded = line && !oldLines.includes(line);
          return (
            <div key={i} className={`px-2 py-0.5 rounded-sm ${isAdded ? "bg-[#00ff9d]/10 text-[#00ff9d]/70" : "text-white/40"}`}>
              <span className="text-white/15 mr-2 select-none">{i + 1}</span>{line}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Session History Component ─────────────────────────────────────────────────
interface SessionHistoryProps {
  currentAnalysis: AnalysisResult;
  currentTestOutput: string;
  currentFramework: TestFramework;
  onLoadSession: (session: SessionRecord) => void;
}

export function SessionHistory({ currentAnalysis, currentTestOutput, currentFramework, onLoadSession }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<SessionRecord[]>(() => loadSessions());
  const [comparing, setComparing] = useState<SessionRecord | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveSession({
      projectName: currentAnalysis.projectName,
      framework: currentFramework,
      timestamp: Date.now(),
      testOutput: currentTestOutput,
      analysis: currentAnalysis,
    });
    setSessions(loadSessions());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = (id: string) => {
    deleteSession(id);
    setSessions(loadSessions());
    if (comparing?.id === id) setComparing(null);
  };

  const compareDiff = useMemo(() => {
    if (!comparing) return null;
    return computeDiff(comparing.analysis, currentAnalysis);
  }, [comparing, currentAnalysis]);

  return (
    <div className="space-y-5">
      {/* Save current */}
      <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/10 rounded-xl">
        <div>
          <p className="text-white/70 text-sm font-medium">Current Session</p>
          <p className="text-white/30 text-xs mt-0.5">{currentAnalysis.projectName} · {currentFramework} · {currentTestOutput.split("\n").length} lines</p>
        </div>
        <button onClick={handleSave}
          className="px-4 py-2 text-xs bg-[#7b2fff]/20 border border-[#7b2fff]/30 text-[#7b2fff] hover:bg-[#7b2fff]/30 rounded-lg transition-all flex items-center gap-1.5">
          {saved ? "✓ Saved!" : "💾 Save Session"}
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3 text-center">
          <span className="text-4xl">📋</span>
          <p className="text-white/30 text-sm">No saved sessions yet</p>
          <p className="text-white/15 text-xs">Save your current session to compare versions later</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-white/40 text-xs tracking-widest uppercase">Saved Sessions ({sessions.length}/10)</p>
          {sessions.map(s => {
            const age = Date.now() - s.timestamp;
            const ageLabel = age < 60000 ? "just now" : age < 3600000 ? `${Math.floor(age / 60000)}m ago` : age < 86400000 ? `${Math.floor(age / 3600000)}h ago` : `${Math.floor(age / 86400000)}d ago`;
            const testCount = (s.testOutput.match(/\bit\(|def test_|@Test/g) || []).length;
            const isComparing = comparing?.id === s.id;

            return (
              <div key={s.id} className={`p-4 rounded-xl border transition-all ${isComparing ? "bg-[#7b2fff]/8 border-[#7b2fff]/30" : "bg-white/[0.02] border-white/10 hover:border-white/20"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white/70 text-xs font-medium truncate">{s.projectName}</p>
                      <span className="text-[10px] px-1.5 py-0.5 bg-white/8 text-white/40 rounded">{s.framework}</span>
                      {s.qualityScore && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${s.qualityScore >= 70 ? "bg-[#00ff9d]/15 text-[#00ff9d]" : "bg-[#f59e0b]/15 text-[#f59e0b]"}`}>
                          {s.qualityScore}/100
                        </span>
                      )}
                    </div>
                    <p className="text-white/25 text-[10px] mt-1">{ageLabel} · {testCount} tests · {s.testOutput.split("\n").length} lines</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => setComparing(isComparing ? null : s)}
                      className={`px-2.5 py-1 text-[10px] rounded-md border transition-all ${isComparing ? "bg-[#7b2fff]/20 border-[#7b2fff]/40 text-[#7b2fff]" : "border-white/10 text-white/40 hover:text-white/70 hover:border-white/25"}`}>
                      {isComparing ? "✓ Comparing" : "Compare"}
                    </button>
                    <button onClick={() => onLoadSession(s)}
                      className="px-2.5 py-1 text-[10px] rounded-md border border-white/10 text-white/40 hover:text-[#00ff9d] hover:border-[#00ff9d]/30 transition-all">
                      Load
                    </button>
                    <button onClick={() => handleDelete(s.id)}
                      className="px-2 py-1 text-[10px] rounded-md border border-white/8 text-white/20 hover:text-[#ef4444] hover:border-[#ef4444]/30 transition-all">
                      ✕
                    </button>
                  </div>
                </div>

                {/* Compare diff summary */}
                {isComparing && compareDiff && (
                  <div className="mt-3 pt-3 border-t border-white/8">
                    <p className="text-[#7b2fff]/60 text-[10px] tracking-widest uppercase mb-2">Changes vs Current</p>
                    {compareDiff.hasChanges ? (
                      <div className="flex gap-3 text-[10px]">
                        <span className="text-[#00ff9d]">+{compareDiff.addedFiles} added</span>
                        <span className="text-[#f59e0b]">~{compareDiff.modifiedFiles} modified</span>
                        <span className="text-[#ef4444]">-{compareDiff.removedFiles} removed</span>
                      </div>
                    ) : (
                      <p className="text-white/30 text-[10px]">No file changes between versions</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
