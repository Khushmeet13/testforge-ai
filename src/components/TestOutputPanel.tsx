import { useState, useRef, useEffect } from "react";
import { AnalysisResult, TestFramework } from "../types";
import { CoverageMapPanel } from "./CoverageMapPanel";
import { MockGenerationPanel } from "./MockGenerationPanel";
import { CICDPanel } from "./CICDPanel";
import { TestQualityScorer } from "./TestQualityScorer";
import { IterativeRefinement } from "./IterativeRefinement";
import { BugDetectionPanel } from "./BugDetectionPanel";
import { DocGeneratorPanel } from "./DocGeneratorPanel";
import { FileTreeExplorer } from "./FileTreeExplorer";
import { DiffViewer, SessionHistory } from "./HistoryAndDiff";
import { TestRunnerSimulator } from "./TestRunnerSimulator";
import { VSCodePreview } from "./VSCodePreview";
import { ExportPanel } from "./ExportPanel";
import { GitHubIntegration } from "./GitHubIntegration";
import {
  FiCopy, FiPackage, FiDownload, FiFileText, FiTrendingUp,
  FiAward, FiMessageCircle, FiBook,
  FiFolder, FiMonitor, FiGitMerge, FiPlay,
  FiGithub, FiClipboard,
  FiUser
} from "react-icons/fi";

import { FaPuzzlePiece, FaRocket, FaBug } from "react-icons/fa";
import { TestSummaryPanel } from "./TestSummaryPanel";

interface TestOutputPanelProps {
  testOutput: string;
  analysis: AnalysisResult;
  framework: TestFramework;
  projectName: string;
  onRegenerate: () => void;
  onNewAnalysis?: (a: AnalysisResult) => void;
  sourceFiles?: Record<string, string>;
  selectedFiles?: string[];  // ✅ Add this - optional since it might not always be passed
  onBackToSelect?: () => void;  // ✅ Add this - optional callback
}

const FRAMEWORK_EXTENSIONS: Record<TestFramework, string> = {
  jest: ".test.js", vitest: ".test.ts", mocha: ".spec.js",
  pytest: "_test.py", junit: "Test.java", rspec: "_spec.rb",
  "react-testing-library": ".test.tsx", supertest: ".test.js",
  cypress: ".cy.js",
};

type Tab =
  | "code" | "coverage" | "mocks" | "cicd"
  | "quality" | "chat" | "bugs" | "docs" | "summary"
  | "filetree" | "diff" | "runner" | "history"
  | "github" | "vscode" | "export";

const TAB_GROUPS = [
  {
    label: "Generated",
    tabs: [
      { id: "code" as Tab, icon: <FiFileText className="text-sm" />, label: "Test Code" },
      { id: "coverage" as Tab, icon: <FiTrendingUp className="text-sm" />, label: "Coverage" },
      { id: "mocks" as Tab, icon: <FaPuzzlePiece className="text-sm" />, label: "Mocks" },
      { id: "cicd" as Tab, icon: <FaRocket className="text-sm" />, label: "CI/CD" },
    ],
  },
  {
    label: "AI Tools",
    tabs: [
      { id: "quality" as Tab, icon: <FiAward className="text-sm" />, label: "Quality" },
      { id: "chat" as Tab, icon: <FiMessageCircle className="text-sm" />, label: "Refine" },
      { id: "bugs" as Tab, icon: <FaBug className="text-sm" />, label: "Bug Scan" },
      { id: "docs" as Tab, icon: <FiBook className="text-sm" />, label: "Docs" },
      { id: "summary" as Tab, icon: <FiUser className="text-sm" />, label: "Summary" },
    ],
  },
  {
    label: "Explorer",
    tabs: [
      { id: "filetree" as Tab, icon: <FiFolder className="text-sm" />, label: "File Tree" },
      { id: "vscode" as Tab, icon: <FiMonitor className="text-sm" />, label: "VS Code" },
      { id: "diff" as Tab, icon: <FiGitMerge className="text-sm" />, label: "Diff" },
      { id: "runner" as Tab, icon: <FiPlay className="text-sm" />, label: "Runner" },
    ],
  },
  {
    label: "Share",
    tabs: [
      { id: "github" as Tab, icon: <FiGithub className="text-sm" />, label: "GitHub" },
      { id: "export" as Tab, icon: <FiPackage className="text-sm" />, label: "Export" },
      { id: "history" as Tab, icon: <FiClipboard className="text-sm" />, label: "History" },
    ],
  },
];

export function TestOutputPanel({
  testOutput: initialTestOutput, analysis, framework, projectName, onRegenerate, onNewAnalysis, sourceFiles = {}, selectedFiles = [],  // ✅ Add with default empty array
  onBackToSelect,
}: TestOutputPanelProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("code");
  const [testOutput, setTestOutput] = useState(initialTestOutput);
  const codeRef = useRef<HTMLPreElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(initialTestOutput);
  const [codeWarning, setCodeWarning] = useState("");

  // testOutput change hone par draft bhi update karo
  useEffect(() => { setEditDraft(testOutput); }, [testOutput]);
  useEffect(() => {
    if (testOutput) {
      const completeness = checkCodeCompleteness(testOutput, framework);
      if (!completeness.isComplete) {
        setCodeWarning(completeness.warning);
      } else {
        setCodeWarning("");
      }
    }
  }, [testOutput, framework]);

  function checkCodeCompleteness(code: string, framework: TestFramework): { isComplete: boolean; warning: string } {
    const issues: string[] = [];

    // Check for truncation patterns
    if (/\.\.\.\s*$/.test(code)) {
      issues.push("Code appears truncated with '...'");
    }

    // Check bracket balance
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      issues.push(`Unbalanced braces (${openBraces} open, ${closeBraces} close)`);
    }

    // Check for incomplete tests
    const tests = code.match(/\bit\(|def test_|@Test\b/g) || [];
    const assertions = code.match(/\bexpect\(|assert\b|\.should\b/g) || [];
    if (tests.length > 0 && assertions.length === 0) {
      issues.push("Tests found but no assertions detected");
    }

    return {
      isComplete: issues.length === 0,
      warning: issues.join("; "),
    };
  }

  const filename =
    projectName.replace(".zip", "").replace(/\s+/g, "_").toLowerCase() +
    FRAMEWORK_EXTENSIONS[framework];

  const lineCount = testOutput.split("\n").length;
  const testCount = (testOutput.match(/\bit\(|def test_|@Test|it\s*\(/g) || []).length;
  const describeCount = (testOutput.match(/\bdescribe\(|class Test|context\s*\(/g) || []).length;

  const handleCopy = () => { navigator.clipboard.writeText(testOutput); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const handleDownload = () => {
    const blob = new Blob([testOutput], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  };

  const highlighted = syntaxHighlight(testOutput, framework);

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[#00ff9d]/5 border border-[#00ff9d]/20 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#00ff9d]/20 flex items-center justify-center"><span className="text-[#00ff9d]">✓</span></div>
          <div>
            <p className="text-[#00ff9d] text-sm font-medium">Test Suite Generated!</p>
            <p className="text-white/40 text-xs">
              {selectedFiles.length} file(s) selected  · {lineCount} lines · {testCount} tests · {describeCount} describe blocks</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {onBackToSelect && (
            <button
              onClick={onBackToSelect}
              className="px-3 py-2 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Files
            </button>
          )}
          <button onClick={onRegenerate} className="px-3 py-2 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-all flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Regenerate
          </button>
          <button onClick={handleCopy} className="px-3 py-2 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-all flex items-center gap-1.5">
            {copied ? <><svg className="w-3.5 h-3.5 text-[#00ff9d]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Copied!</> : <> <FiCopy className="text-xs" /> Copy</>}
          </button>
          <button onClick={handleDownload} className="px-4 py-2 text-xs bg-[#00ff9d] text-black font-bold rounded-lg hover:bg-[#00ff9d]/90 transition-all flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Download
          </button>
          <button onClick={() => setActiveTab("export")} className="px-4 py-2 text-xs bg-[#7b2fff]/20 border border-[#7b2fff]/30 text-[#7b2fff] hover:bg-[#7b2fff]/30 rounded-lg transition-all flex items-center gap-1.5">
            <FiPackage className="text-xs" /> Export
          </button>
        </div>
      </div>





      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Test Cases", value: testCount, color: "#00ff9d" },
          { label: "Lines", value: lineCount, color: "#3b82f6" },
          { label: "Describe Blocks", value: describeCount, color: "#7b2fff" },
          { label: "Mock Deps", value: analysis.externalDeps.length, color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} className="p-3 bg-white/[0.03] border border-white/10 rounded-xl">
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-white/30 text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Grouped tabs */}
      <div className="space-y-2">
        {TAB_GROUPS.map(group => (
          <div key={group.label} className="flex items-center gap-2 flex-wrap">
            <span className="text-white/20 text-[10px] tracking-widest uppercase w-14 flex-shrink-0">{group.label}</span>
            <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/8 rounded-lg flex-wrap">
              {group.tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-1.5 ${activeTab === tab.id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"}`}>
                  <span>{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tab.id === "mocks" && analysis.externalDeps.length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-[#f59e0b]/30 text-[#f59e0b] text-[9px] flex items-center justify-center font-bold">{analysis.externalDeps.length}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {activeTab === "code" && (
          <div>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#111118] border-b border-white/8 rounded-t-xl">
              <div className="flex gap-1.5">...</div>
              <span className="text-white/40 text-xs ml-2 font-mono">{filename}</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="text-white/20 text-xs">{framework}</span>

                {/* Edit / Save / Cancel buttons */}
                {!isEditing ? (
                  <button
                    onClick={() => { setEditDraft(testOutput); setIsEditing(true); }}
                    className="px-2.5 py-1 text-[11px] text-blue-400 border border-blue-400/30 rounded-md hover:bg-blue-400/10 transition-all"
                  >
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { setTestOutput(editDraft); setIsEditing(false); }}
                      className="px-2.5 py-1 text-[11px] text-[#00ff9d] border border-[#00ff9d]/30 rounded-md hover:bg-[#00ff9d]/10 transition-all"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditDraft(testOutput); setIsEditing(false); }}
                      className="px-2.5 py-1 text-[11px] text-red-400 border border-red-400/20 rounded-md hover:bg-red-400/10 transition-all"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </span>
            </div>

            <div className="bg-[#0d0d14] border border-t-0 border-white/8 rounded-b-xl overflow-auto max-h-[70vh]">
              {isEditing ? (
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  className="w-full bg-transparent text-sm leading-relaxed p-6 font-mono text-[#abb2bf] outline-none resize-y min-h-[400px]"
                  spellCheck={false}
                />
              ) : (
                <pre ref={codeRef} className="text-sm leading-relaxed p-6 font-mono"
                  dangerouslySetInnerHTML={{ __html: highlighted }} />
              )}
            </div>

            {isEditing && (
              <p className="text-xs text-white/20 mt-1.5 px-1">
                Editing mode — "Save" karoge to changes dusre tabs mein bhi reflect honge
              </p>
            )}
          </div>
        )}
        {activeTab === "coverage" && <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl"><CoverageMapPanel analysis={analysis} testOutput={testOutput} /></div>}
        {activeTab === "mocks" && <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl"><MockGenerationPanel analysis={analysis} framework={framework} /></div>}
        {activeTab === "cicd" && <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl"><CICDPanel analysis={analysis} framework={framework} /></div>}
        {activeTab === "quality" && <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl"><TestQualityScorer testOutput={testOutput} analysis={analysis} framework={framework} /></div>}
        {activeTab === "chat" && <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl"><IterativeRefinement testOutput={testOutput} analysis={analysis} framework={framework} onTestsUpdated={setTestOutput} /></div>}
        {activeTab === "bugs" && <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl"><BugDetectionPanel analysis={analysis} /></div>}
        {activeTab === "docs" && <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl"><DocGeneratorPanel analysis={analysis} framework={framework} /></div>}
        {activeTab === "summary" && (
          <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl">
            <TestSummaryPanel testOutput={testOutput} analysis={analysis} framework={framework} />
          </div>
        )}
        {activeTab === "filetree" && <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl"><FileTreeExplorer analysis={analysis} testOutput={testOutput} /></div>}
        {activeTab === "vscode" && <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl"><VSCodePreview analysis={analysis} testOutput={testOutput} framework={framework} projectName={projectName} /></div>}
        {activeTab === "diff" && <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl"><DiffViewer analysis={analysis} /></div>}
        {activeTab === "runner" && <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl"><TestRunnerSimulator testOutput={testOutput} analysis={analysis} framework={framework} sourceFiles={sourceFiles} /></div>}
        {activeTab === "github" && (
          <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl">
            <GitHubIntegration
              onAnalysisComplete={(a) => onNewAnalysis?.(a)}
              testOutput={testOutput}
              analysis={analysis}
              framework={framework}
              projectName={projectName}
            />
          </div>
        )}
        {activeTab === "export" && <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl"><ExportPanel testOutput={testOutput} analysis={analysis} framework={framework} projectName={projectName} /></div>}
        {activeTab === "history" && (
          <div className="p-5 bg-white/[0.02] border border-white/10 rounded-xl">
            <SessionHistory currentAnalysis={analysis} currentTestOutput={testOutput} currentFramework={framework} onLoadSession={(s) => setTestOutput(s.testOutput)} />
          </div>
        )}
      </div>

      {codeWarning && (
        <div className="mt-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-yellow-400 text-sm flex items-center gap-2">
            <span>⚠️</span> {codeWarning}
          </p>
          <button
            onClick={onRegenerate}
            className="mt-2 text-xs text-yellow-400/80 hover:text-yellow-400 underline"
          >
            Regenerate to fix
          </button>
        </div>
      )}
    </div>
  );
}

function syntaxHighlight(code: string, framework: TestFramework): string {
  const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const isPython = framework === "pytest";
  const isJava = framework === "junit";
  let result = escaped;
  result = result.replace(/(&quot;|&#39;|`)(.*?)\1/g, '<span style="color:#98c379">$1$2$1</span>');
  if (isPython) result = result.replace(/\b(def|class|import|from|return|if|else|elif|for|while|try|except|with|as|pass|True|False|None|assert|raise|yield|lambda|async|await)\b/g, '<span style="color:#c678dd">$1</span>');
  else if (isJava) result = result.replace(/\b(public|private|protected|class|void|static|new|return|if|else|for|while|import|package|throws|extends|implements|interface|final|abstract|try|catch|finally|null|true|false|this|super)\b/g, '<span style="color:#c678dd">$1</span>');
  else result = result.replace(/\b(const|let|var|function|return|if|else|for|while|import|export|from|default|class|extends|new|this|typeof|instanceof|try|catch|finally|throw|async|await|null|undefined|true|false)\b/g, '<span style="color:#c678dd">$1</span>');
  result = result.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#d19a66">$1</span>');
  result = result.replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span style="color:#5c6370;font-style:italic">$1</span>');
  result = result.replace(/\b(describe|it|test|expect|beforeEach|afterEach|beforeAll|afterAll|jest|vi|mock|def test_|@Test|@BeforeEach|assert)\b/g, '<span style="color:#61afef">$1</span>');
  return result;
}
