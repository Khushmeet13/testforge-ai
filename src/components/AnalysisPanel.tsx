import { useState } from "react";
import { AnalysisResult, TestFramework, AppState } from "../types";
import { generateTests } from "../utils/testGenerator";

interface AnalysisPanelProps {
  analysis: AnalysisResult;
  selectedFramework: TestFramework | "";
  setSelectedFramework: (f: TestFramework) => void;
  projectName: string;
  onTestsGenerated: (tests: string) => void;
  onStateChange: (state: AppState) => void;
  isGenerating: boolean;
}

const FRAMEWORKS: { id: TestFramework; label: string; lang: string; color: string }[] = [
  { id: "jest", label: "Jest", lang: "JavaScript", color: "#c21325" },
  { id: "vitest", label: "Vitest", lang: "TypeScript", color: "#729b1a" },
  { id: "mocha", label: "Mocha", lang: "JavaScript", color: "#8d6748" },
  { id: "pytest", label: "Pytest", lang: "Python", color: "#3776ab" },
  { id: "junit", label: "JUnit 5", lang: "Java", color: "#f89820" },
  { id: "rspec", label: "RSpec", lang: "Ruby", color: "#cc0000" },
];

const PROJECT_TYPE_LABELS: Record<string, string> = {
  nodejs: "Node.js",
  typescript: "TypeScript",
  python: "Python",
  java: "Java",
  unknown: "Unknown",
};

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f7df1e",
  Python: "#3776ab",
  Java: "#f89820",
  JSON: "#6b7280",
  YAML: "#6b7280",
  HTML: "#e34f26",
  CSS: "#1572b6",
};

export function AnalysisPanel({
  analysis,
  selectedFramework,
  setSelectedFramework,
  projectName,
  onTestsGenerated,
  onStateChange,
  isGenerating,
}: AnalysisPanelProps) {
  const [streamedText, setStreamedText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!selectedFramework) {
    setError("Please select a test framework");
    return;
  }
  
    setError(null);
    setStreamedText("");
    onStateChange("generating");

    try {
      const tests = await generateTests(analysis, selectedFramework, (chunk) => {
        setStreamedText((prev) => prev + chunk);
      });
      onTestsGenerated(tests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      onStateChange("analyzed");
    }
  };

  return (
    <div className="space-y-6">
      {/* Project summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white/[0.03] border border-white/10 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#00ff9d]/10 flex items-center justify-center">
            <span className="text-[#00ff9d] text-sm">✓</span>
          </div>
          <div>
            <p className="text-white font-medium text-sm">{projectName.replace(".zip", "")}</p>
            <p className="text-white/40 text-xs">{analysis.summary}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-[#7b2fff]/20 border border-[#7b2fff]/30 rounded-full text-[#7b2fff] text-xs">
            {PROJECT_TYPE_LABELS[analysis.projectType]}
          </div>
          <div className="px-3 py-1 bg-[#00ff9d]/10 border border-[#00ff9d]/20 rounded-full text-[#00ff9d] text-xs">
            {analysis.testableItems} testable items
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: stats */}
        <div className="space-y-4">
          <StatsCard analysis={analysis} />
          <FilesCard files={analysis.files} />
        </div>

        {/* Middle: functions & endpoints */}
        <div className="space-y-4">
          <FunctionsCard functions={analysis.functions.slice(0, 12)} />
          {analysis.apiEndpoints.length > 0 && (
            <EndpointsCard endpoints={analysis.apiEndpoints} />
          )}
        </div>

        {/* Right: framework picker + generate */}
        <div className="space-y-4">
          <FrameworkPicker
            selected={selectedFramework}
            onChange={setSelectedFramework}
            projectType={analysis.projectType}
          />

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full py-4 px-6 bg-gradient-to-r from-[#00ff9d] to-[#00cc7a] text-black font-bold rounded-xl hover:shadow-[0_0_30px_rgba(0,255,157,0.3)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm tracking-wide"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Generating Tests...
              </span>
            ) : (
              "⚡ Generate Test Suite"
            )}
          </button>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
              {error}
            </div>
          )}

          {isGenerating && streamedText && (
            <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
              <p className="text-white/30 text-xs mb-2 tracking-widest uppercase">Live Preview</p>
              <pre className="text-[#00ff9d]/70 text-xs leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono">
                {streamedText.slice(-1000)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsCard({ analysis }: { analysis: AnalysisResult }) {
  const stats = [
    { label: "Files", value: analysis.files.length, icon: "📁" },
    { label: "Functions", value: analysis.functions.length, icon: "⚙️" },
    { label: "Endpoints", value: analysis.apiEndpoints.length, icon: "🔗" },
    { label: "Languages", value: analysis.languages.length, icon: "💬" },
  ];

  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-white/40 text-xs tracking-widest uppercase mb-3">Overview</p>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="p-3 bg-white/[0.03] rounded-lg">
            <p className="text-2xl font-bold text-white">{s.value}</p>
            <p className="text-white/40 text-xs mt-0.5">{s.icon} {s.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {analysis.languages.map((lang) => (
          <span
            key={lang}
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `${LANGUAGE_COLORS[lang] || "#6b7280"}20`,
              color: LANGUAGE_COLORS[lang] || "#9ca3af",
              border: `1px solid ${LANGUAGE_COLORS[lang] || "#6b7280"}40`,
            }}
          >
            {lang}
          </span>
        ))}
      </div>
    </div>
  );
}

function FilesCard({ files }: { files: { name: string; language: string }[] }) {
  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-white/40 text-xs tracking-widest uppercase mb-3">Files Detected</p>
      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {files.slice(0, 15).map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: LANGUAGE_COLORS[f.language] || "#6b7280" }}
            />
            <span className="text-white/60 text-xs truncate">{f.name}</span>
            <span className="text-white/20 text-xs ml-auto flex-shrink-0">{f.language}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FunctionsCard({ functions }: { functions: { name: string; params: string[]; isAsync?: boolean; file: string }[] }) {
  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-white/40 text-xs tracking-widest uppercase mb-3">Functions Found</p>
      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
        {functions.map((f, i) => (
          <div key={i} className="group flex items-start gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
            <span className="text-[#7b2fff]/60 text-xs flex-shrink-0 mt-0.5">fn</span>
            <div className="min-w-0">
              <span className="text-white/80 text-xs font-medium">
                {f.name}
              </span>
              <span className="text-white/30 text-xs">({f.params.slice(0, 3).join(", ")}{f.params.length > 3 ? "..." : ""})</span>
              {f.isAsync && (
                <span className="ml-1.5 text-[10px] text-yellow-400/50 bg-yellow-400/10 px-1 rounded">async</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EndpointsCard({ endpoints }: { endpoints: { method: string; path: string }[] }) {
  const methodColors: Record<string, string> = {
    GET: "#22c55e",
    POST: "#3b82f6",
    PUT: "#f59e0b",
    PATCH: "#8b5cf6",
    DELETE: "#ef4444",
  };

  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-white/40 text-xs tracking-widest uppercase mb-3">API Endpoints</p>
      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
        {endpoints.map((e, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
              style={{
                color: methodColors[e.method] || "#9ca3af",
                backgroundColor: `${methodColors[e.method] || "#9ca3af"}15`,
              }}
            >
              {e.method}
            </span>
            <span className="text-white/60 text-xs truncate">{e.path}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FrameworkPicker({
  selected,
  onChange,
}: {
  selected: TestFramework | "";
  onChange: (f: TestFramework) => void;
  projectType: string;
}) {
  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-white/40 text-xs tracking-widest uppercase mb-3">Test Framework</p>
      <div className="grid grid-cols-2 gap-2">
        {FRAMEWORKS.map((fw) => (
          <button
            key={fw.id}
            onClick={() => onChange(fw.id)}
            className={`flex flex-col p-3 rounded-lg border transition-all duration-200 text-left ${
              selected === fw.id
                ? "border-[#00ff9d]/50 bg-[#00ff9d]/10"
                : "border-white/8 bg-white/[0.02] hover:border-white/20 hover:bg-white/5"
            }`}
          >
            <span className={`text-sm font-medium ${selected === fw.id ? "text-[#00ff9d]" : "text-white/70"}`}>
              {fw.label}
            </span>
            <span className="text-[10px] text-white/30 mt-0.5">{fw.lang}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
