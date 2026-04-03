import { useState, useMemo } from "react";
import { CoverageMap, FileCoverage, AnalysisResult } from "../types";

interface CoverageMapPanelProps {
  analysis: AnalysisResult;
  testOutput: string;
}

function buildCoverageMap(analysis: AnalysisResult, testOutput: string): CoverageMap {
  const testLower = testOutput.toLowerCase();

  // Group functions by file
  const fileMap = new Map<string, string[]>();
  for (const fn of analysis.functions) {
    const existing = fileMap.get(fn.file) ?? [];
    existing.push(fn.name);
    fileMap.set(fn.file, existing);
  }

  const files: FileCoverage[] = [];

  for (const [filePath, fnNames] of fileMap.entries()) {
    const fileInfo = analysis.files.find(f => f.path === filePath);
    const covered: string[] = [];
    const uncovered: string[] = [];

    for (const fnName of fnNames) {
      // Check if function name appears in test output (case-insensitive)
      if (testLower.includes(fnName.toLowerCase())) {
        covered.push(fnName);
      } else {
        uncovered.push(fnName);
      }
    }

    const total = fnNames.length;
    const pct = total === 0 ? 0 : Math.round((covered.length / total) * 100);

    let heatLevel: FileCoverage["heatLevel"] = "none";
    if (total > 0) {
      if (pct >= 75) heatLevel = "hot";
      else if (pct >= 40) heatLevel = "warm";
      else heatLevel = "cold";
    }

    files.push({
      path: filePath,
      language: fileInfo?.language ?? "Unknown",
      totalFunctions: total,
      coveredFunctions: covered,
      uncoveredFunctions: uncovered,
      coveragePercent: pct,
      heatLevel,
    });
  }

  // Sort by coverage descending
  files.sort((a, b) => b.coveragePercent - a.coveragePercent);

  const totalFunctions = files.reduce((s, f) => s + f.totalFunctions, 0);
  const coveredCount = files.reduce((s, f) => s + f.coveredFunctions.length, 0);
  const overallPercent = totalFunctions === 0 ? 0 : Math.round((coveredCount / totalFunctions) * 100);

  return { files, overallPercent, totalFunctions, coveredCount };
}

const HEAT_STYLES: Record<FileCoverage["heatLevel"], { bg: string; border: string; bar: string; badge: string }> = {
  hot:  { bg: "bg-[#00ff9d]/5",  border: "border-[#00ff9d]/25", bar: "bg-[#00ff9d]",  badge: "bg-[#00ff9d]/15 text-[#00ff9d]" },
  warm: { bg: "bg-[#f59e0b]/5",  border: "border-[#f59e0b]/25", bar: "bg-[#f59e0b]",  badge: "bg-[#f59e0b]/15 text-[#f59e0b]" },
  cold: { bg: "bg-[#ef4444]/5",  border: "border-[#ef4444]/25", bar: "bg-[#ef4444]",  badge: "bg-[#ef4444]/15 text-[#ef4444]" },
  none: { bg: "bg-white/[0.02]", border: "border-white/10",      bar: "bg-white/20",   badge: "bg-white/10 text-white/40" },
};

const LANG_ICONS: Record<string, string> = {
  TypeScript: "🔷", JavaScript: "🟨", Python: "🐍", Java: "☕",
  Ruby: "💎", Go: "🐹", Rust: "🦀", PHP: "🐘", Unknown: "📄",
};

export function CoverageMapPanel({ analysis, testOutput }: CoverageMapPanelProps) {
  const coverageMap = useMemo(() => buildCoverageMap(analysis, testOutput), [analysis, testOutput]);
  const [selectedFile, setSelectedFile] = useState<FileCoverage | null>(coverageMap.files[0] ?? null);
  const [filter, setFilter] = useState<"all" | "hot" | "warm" | "cold">("all");

  const filtered = filter === "all"
    ? coverageMap.files
    : coverageMap.files.filter(f => f.heatLevel === filter);

  const circumference = 2 * Math.PI * 42;
  const dash = (coverageMap.overallPercent / 100) * circumference;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-white font-semibold text-sm tracking-wide">Coverage Heatmap</h3>
          <p className="text-white/30 text-xs mt-0.5">
            {coverageMap.coveredCount} of {coverageMap.totalFunctions} functions tested across {coverageMap.files.length} files
          </p>
        </div>
        {/* Filter pills */}
        <div className="flex gap-1.5">
          {(["all", "hot", "warm", "cold"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                filter === f
                  ? "bg-white/15 text-white"
                  : "text-white/30 hover:text-white/60"
              }`}
            >
              {f === "all" ? "All" : f === "hot" ? "🟢 High" : f === "warm" ? "🟡 Mid" : "🔴 Low"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left — donut + legend */}
        <div className="flex flex-col gap-4">
          {/* Donut chart */}
          <div className="p-5 bg-white/[0.03] border border-white/10 rounded-xl flex flex-col items-center gap-4">
            <div className="relative w-28 h-28">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke={coverageMap.overallPercent >= 75 ? "#00ff9d" : coverageMap.overallPercent >= 40 ? "#f59e0b" : "#ef4444"}
                  strokeWidth="10"
                  strokeDasharray={`${dash} ${circumference}`}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dasharray 0.8s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white">{coverageMap.overallPercent}%</span>
                <span className="text-white/30 text-[10px] tracking-wide">COVERAGE</span>
              </div>
            </div>
            <div className="w-full space-y-2">
              {[
                { label: "High (≥75%)", color: "#00ff9d", count: coverageMap.files.filter(f => f.heatLevel === "hot").length },
                { label: "Mid (40–74%)", color: "#f59e0b", count: coverageMap.files.filter(f => f.heatLevel === "warm").length },
                { label: "Low (<40%)", color: "#ef4444", count: coverageMap.files.filter(f => f.heatLevel === "cold").length },
                { label: "No functions", color: "#6b7280", count: coverageMap.files.filter(f => f.heatLevel === "none").length },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                    <span className="text-white/50 text-xs">{item.label}</span>
                  </div>
                  <span className="text-white/70 text-xs font-medium">{item.count} files</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Middle — file list */}
        <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
          <p className="text-white/40 text-xs tracking-widest uppercase mb-3">File Tree</p>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
            {filtered.length === 0 && (
              <p className="text-white/20 text-xs text-center py-4">No files match this filter</p>
            )}
            {filtered.map((fc, i) => {
              const style = HEAT_STYLES[fc.heatLevel];
              const filename = fc.path.split("/").pop() ?? fc.path;
              const dir = fc.path.split("/").slice(0, -1).join("/");
              return (
                <button
                  key={i}
                  onClick={() => setSelectedFile(fc)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all ${style.bg} ${style.border} ${
                    selectedFile?.path === fc.path ? "ring-1 ring-white/20" : "hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm flex-shrink-0">{LANG_ICONS[fc.language] ?? "📄"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-white/80 text-xs font-medium truncate">{filename}</p>
                      {dir && <p className="text-white/25 text-[10px] truncate">{dir}</p>}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${style.badge}`}>
                      {fc.coveragePercent}%
                    </span>
                  </div>
                  {/* Mini progress bar */}
                  <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
                      style={{ width: `${fc.coveragePercent}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right — function detail */}
        <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
          {selectedFile ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">{LANG_ICONS[selectedFile.language] ?? "📄"}</span>
                <div>
                  <p className="text-white/80 text-xs font-medium">
                    {selectedFile.path.split("/").pop()}
                  </p>
                  <p className="text-white/30 text-[10px]">{selectedFile.language}</p>
                </div>
                <span className={`ml-auto text-xs px-2 py-1 rounded-full font-bold ${HEAT_STYLES[selectedFile.heatLevel].badge}`}>
                  {selectedFile.coveragePercent}%
                </span>
              </div>

              {selectedFile.coveredFunctions.length > 0 && (
                <div className="mb-3">
                  <p className="text-[#00ff9d]/60 text-[10px] tracking-widest uppercase mb-1.5">
                    ✓ Covered ({selectedFile.coveredFunctions.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedFile.coveredFunctions.map(fn => (
                      <span key={fn} className="text-[10px] px-1.5 py-0.5 bg-[#00ff9d]/10 text-[#00ff9d]/80 border border-[#00ff9d]/20 rounded font-mono">
                        {fn}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedFile.uncoveredFunctions.length > 0 && (
                <div>
                  <p className="text-[#ef4444]/60 text-[10px] tracking-widest uppercase mb-1.5">
                    ✗ Not Covered ({selectedFile.uncoveredFunctions.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedFile.uncoveredFunctions.map(fn => (
                      <span key={fn} className="text-[10px] px-1.5 py-0.5 bg-[#ef4444]/10 text-[#ef4444]/70 border border-[#ef4444]/20 rounded font-mono">
                        {fn}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedFile.totalFunctions === 0 && (
                <p className="text-white/20 text-xs text-center py-6">No functions detected in this file</p>
              )}
            </>
          ) : (
            <p className="text-white/20 text-xs text-center py-8">Select a file to see function coverage</p>
          )}
        </div>
      </div>
    </div>
  );
}
