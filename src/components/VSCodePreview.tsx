import { useState, useMemo } from "react";
import { AnalysisResult, TestFramework } from "../types";

interface VSCodePreviewProps {
  analysis: AnalysisResult;
  testOutput: string;
  framework: TestFramework;
  projectName: string;
}

const LANG_ICONS: Record<string, string> = {
  TypeScript: "🔷", JavaScript: "🟨", Python: "🐍", Java: "☕",
  Ruby: "💎", Go: "🐹", JSON: "⚙️", YAML: "⚙️",
};

const FRAMEWORK_EXTENSIONS: Record<TestFramework, string> = {
  jest: ".test.js", vitest: ".test.ts", mocha: ".spec.js",
  pytest: "_test.py", junit: "Test.java", rspec: "_spec.rb",
   "react-testing-library": ".test.tsx", supertest: ".test.js", cypress: ".cy.js",
};

function syntaxHighlight(code: string, lang: string): string {
  const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let result = escaped;

  // Strings
  result = result.replace(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g, '<span style="color:#ce9178">$1$2$1</span>');
  // Comments
  result = result.replace(/(\/\/[^\n]*)/g, '<span style="color:#6a9955;font-style:italic">$1</span>');
  result = result.replace(/(#[^\n]*)/g, '<span style="color:#6a9955;font-style:italic">$1</span>');

  if (lang === "Python") {
    result = result.replace(/\b(def|class|import|from|return|if|else|elif|for|while|try|except|with|as|pass|True|False|None|assert|raise|yield|lambda|async|await|self)\b/g, '<span style="color:#569cd6">$1</span>');
    result = result.replace(/\b(str|int|float|bool|list|dict|tuple|set|None|print|len|range|type)\b/g, '<span style="color:#4ec9b0">$1</span>');
  } else {
    result = result.replace(/\b(const|let|var|function|return|if|else|for|while|import|export|from|default|class|extends|new|this|typeof|instanceof|try|catch|finally|throw|async|await|null|undefined|true|false|void|type|interface|enum)\b/g, '<span style="color:#569cd6">$1</span>');
    result = result.replace(/\b(console|Promise|Array|Object|String|Number|Boolean|Map|Set|Error|Math)\b/g, '<span style="color:#4ec9b0">$1</span>');
    result = result.replace(/\b(describe|it|test|expect|beforeEach|afterEach|beforeAll|afterAll|jest|vi|mock)\b/g, '<span style="color:#dcdcaa">$1</span>');
  }

  result = result.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#b5cea8">$1</span>');
  return result;
}

interface PanelFile { path: string; content: string; language: string; isTest?: boolean; }

export function VSCodePreview({ analysis, testOutput, framework, projectName }: VSCodePreviewProps) {
  const testFilename = `tests/${projectName.replace(/[^a-zA-Z0-9]/g, "_")}${FRAMEWORK_EXTENSIONS[framework]}`;

  // Build tab list: source files + test file
  const sourceTabs: PanelFile[] = analysis.files
    .filter(f => ["JavaScript","TypeScript","Python","Java"].includes(f.language))
    .slice(0, 10)
    .map(f => ({ path: f.path, content: f.content, language: f.language }));

  const testTab: PanelFile = { path: testFilename, content: testOutput, language: framework === "pytest" ? "Python" : framework === "junit" ? "Java" : "TypeScript", isTest: true };

  const [leftFile, setLeftFile] = useState<PanelFile>(sourceTabs[0] ?? testTab);
  const [rightFile, setRightFile] = useState<PanelFile>(testTab);
  const [splitMode, setSplitMode] = useState<"split" | "left" | "right">("split");
  const [leftWidth, setLeftWidth] = useState(50);
  const [dragging, setDragging] = useState(false);

  // Find which functions in left file are covered in right
  const functionsInLeftFile = analysis.functions.filter(fn => fn.file === leftFile.path);
  const testLower = testOutput.toLowerCase();
  const coveredFns = functionsInLeftFile.filter(fn => testLower.includes(fn.name.toLowerCase()));

  // Line highlighting for covered functions
  const highlightedLeft = useMemo(() => {
    let highlighted = syntaxHighlight(leftFile.content, leftFile.language);
    // Highlight lines that contain covered function names
    const lines = highlighted.split("\n");
    return lines.map((line, i) => {
      const isCoveredLine = coveredFns.some(fn => leftFile.content.split("\n")[i]?.includes(fn.name));
      return `<span class="line-block" style="display:block;padding:1px 0;${isCoveredLine ? "background:rgba(0,255,157,0.06);border-left:2px solid rgba(0,255,157,0.4);" : ""}">${line}</span>`;
    }).join("\n");
  }, [leftFile, coveredFns]);

  const highlightedRight = useMemo(() => syntaxHighlight(rightFile.content, rightFile.language), [rightFile]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startWidth = leftWidth;
    const onMove = (ev: MouseEvent) => {
      const container = document.getElementById("split-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newPct = Math.max(20, Math.min(80, ((ev.clientX - rect.left) / rect.width) * 100));
      setLeftWidth(newPct);
    };
    const onUp = () => { setDragging(false); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  function FileTab({ file, active, onClick }: { file: PanelFile; active: boolean; onClick: () => void }) {
    const fname = file.path.split("/").pop()!;
    return (
      <button onClick={onClick}
        className={`flex items-center gap-1.5 px-3 py-2 text-[11px] border-t-2 transition-all flex-shrink-0 whitespace-nowrap ${
          active
            ? "bg-[#1e1e2e] border-t-[#6e40c9] text-white"
            : "bg-[#2d2d3f] border-t-transparent text-white/40 hover:text-white/70 hover:bg-[#252535]"
        }`}>
        <span className="text-xs">{file.isTest ? "🧪" : (LANG_ICONS[file.language] ?? "📄")}</span>
        <span>{fname}</span>
        {file.isTest && <span className="w-1.5 h-1.5 rounded-full bg-[#00ff9d]/60 flex-shrink-0" />}
      </button>
    );
  }

  const EditorPane = ({ file, highlighted, title }: { file: PanelFile; highlighted: string; title?: string }) => {
    const lines = file.content.split("\n");
    return (
      <div className="flex flex-col h-full bg-[#1e1e2e] overflow-hidden">
        {/* Tab bar */}
        <div className="flex overflow-x-auto bg-[#2d2d3f] border-b border-[#0d0d14] scrollbar-none">
          {(title === "left" ? sourceTabs : [testTab]).map(f => (
            <FileTab key={f.path} file={f} active={file.path === f.path}
              onClick={() => title === "left" ? setLeftFile(f) : setRightFile(f)} />
          ))}
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 px-4 py-1.5 bg-[#252535] border-b border-[#0d0d14] text-[10px] text-white/30">
          {file.path.split("/").map((p, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              {i < arr.length - 1 ? <><span className="hover:text-white/60 cursor-pointer">{p}</span><span>›</span></> : <span className="text-white/60">{p}</span>}
            </span>
          ))}
        </div>

        {/* Code with line numbers */}
        <div className="flex-1 overflow-auto">
          <div className="flex min-w-max">
            {/* Line numbers */}
            <div className="sticky left-0 bg-[#1e1e2e] flex flex-col items-end pr-4 pt-4 pb-4 pl-4 select-none border-r border-white/5 min-w-[48px]">
              {lines.map((_, i) => (
                <span key={i} className="text-[11px] leading-5 font-mono text-white/20">{i + 1}</span>
              ))}
            </div>
            {/* Code */}
            <pre className="flex-1 p-4 text-[11px] font-mono leading-5 text-white/80 whitespace-pre overflow-visible"
              dangerouslySetInnerHTML={{ __html: highlighted }} />
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-4 px-4 py-1 bg-[#6e40c9] text-white/70 text-[10px]">
          <span>{file.language}</span>
          <span>UTF-8</span>
          <span className="ml-auto">{lines.length} lines</span>
          {file.isTest && coveredFns.length > 0 && (
            <span className="text-[#00ff9d]">✓ {coveredFns.length} functions covered</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[#6e40c9]/20 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-[#6e40c9]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
          </div>
          <span className="text-white/60 text-xs font-medium">VS Code Preview</span>
          {functionsInLeftFile.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00ff9d]/10 text-[#00ff9d] border border-[#00ff9d]/20">
              {coveredFns.length}/{functionsInLeftFile.length} covered
            </span>
          )}
        </div>
        <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/8 rounded-lg">
          {([
            { id: "left" as const, label: "Source", icon: "▣" },
            { id: "split" as const, label: "Split", icon: "⊞" },
            { id: "right" as const, label: "Tests", icon: "▥" },
          ]).map(m => (
            <button key={m.id} onClick={() => setSplitMode(m.id)}
              className={`px-3 py-1 text-xs rounded-md transition-all flex items-center gap-1 ${splitMode === m.id ? "bg-[#6e40c9]/30 text-[#6e40c9]" : "text-white/30 hover:text-white/60"}`}>
              <span>{m.icon}</span><span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Coverage legend */}
      {functionsInLeftFile.length > 0 && (
        <div className="flex items-center gap-3 text-[10px] text-white/30">
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#00ff9d]/20 border-l-2 border-[#00ff9d]/60 inline-block" />Covered function</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-white/5 inline-block" />Not covered</span>
        </div>
      )}

      {/* Editor */}
      <div id="split-container" className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl"
        style={{ height: "520px", cursor: dragging ? "col-resize" : "default" }}>

        {splitMode === "split" ? (
          <div className="flex h-full">
            {/* Left pane */}
            <div style={{ width: `${leftWidth}%` }} className="h-full overflow-hidden flex-shrink-0">
              <EditorPane file={leftFile} highlighted={highlightedLeft} title="left" />
            </div>

            {/* Divider */}
            <div onMouseDown={handleMouseDown}
              className="w-1 bg-[#0d0d14] hover:bg-[#6e40c9]/60 cursor-col-resize flex-shrink-0 transition-colors group relative z-10">
              <div className="absolute inset-y-0 -left-1 -right-1" />
            </div>

            {/* Right pane */}
            <div style={{ width: `${100 - leftWidth}%` }} className="h-full overflow-hidden flex-shrink-0">
              <EditorPane file={rightFile} highlighted={highlightedRight} title="right" />
            </div>
          </div>
        ) : splitMode === "left" ? (
          <EditorPane file={leftFile} highlighted={highlightedLeft} title="left" />
        ) : (
          <EditorPane file={rightFile} highlighted={highlightedRight} title="right" />
        )}
      </div>
    </div>
  );
}
