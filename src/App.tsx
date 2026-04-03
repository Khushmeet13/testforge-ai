import { useState } from "react";
import { UploadZone } from "./components/UploadZone";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { TestOutputPanel } from "./components/TestOutputPanel";
import { Header } from "./components/Header";
import { GitHubIntegration } from "./components/GitHubIntegration";
import { AppState, AnalysisResult } from "./types";
import { FiFolder, FiGithub } from "react-icons/fi";

type EntryMode = "upload" | "github";

export default function App() {
  const [state, setState] = useState<AppState>("idle");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [testOutput, setTestOutput] = useState<string>("");
  const [selectedFramework, setSelectedFramework] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [entryMode, setEntryMode] = useState<EntryMode>("upload");

  const handleAnalysisComplete = (result: AnalysisResult) => {
    setAnalysis(result);
    setSelectedFramework(result.suggestedFramework);
    setState("analyzed");
  };

  const handleTestsGenerated = (tests: string) => {
    setTestOutput(tests);
    setState("done");
  };

  const handleReset = () => {
    setState("idle");
    setAnalysis(null);
    setTestOutput("");
    setSelectedFramework("");
    setProjectName("");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-mono overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#00ff9d]/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[#7b2fff]/5 blur-[100px]" />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-[#6e40c9]/3 blur-[80px]" />
        <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h60v60H0z' fill='none'/%3E%3Cpath d='M0 0h1v60H0zM60 0h1v60H0z' stroke='%23fff' stroke-width='0.5'/%3E%3Cpath d='M0 0v1h60V0zM0 60v1h60V0z' stroke='%23fff' stroke-width='0.5'/%3E%3C/svg%3E")` }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Header onReset={handleReset} showReset={state !== "idle"} />

        <main className="mt-5">
          {state === "idle" && (
            <div className="space-y-6">
              {/* Entry mode toggle */}
              <div className="flex justify-center">
                <div className="flex gap-1 p-1 bg-white/[0.04] border border-white/10 rounded-lg">
                  <button onClick={() => setEntryMode("upload")}
                    className={`px-5 py-1.5 text-sm rounded-md transition-all flex items-center gap-2 ${entryMode === "upload" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}>
                       <FiFolder className="text-base" />
                     Upload ZIP
                  </button>
                  <button onClick={() => setEntryMode("github")}
                    className={`px-5 py-1.5 text-sm rounded-md transition-all flex items-center gap-2 ${entryMode === "github" ? "bg-[#6e40c9]/30 text-[#6e40c9]" : "text-white/40 hover:text-white/70"}`}>
                        <FiGithub className="text-base" />
                     Connect GitHub
                  </button>
                </div>
              </div>

              {entryMode === "upload" ? (
                <UploadZone onAnalysisComplete={handleAnalysisComplete} onStateChange={setState} setProjectName={setProjectName} />
              ) : (
                <div className="max-w-2xl mx-auto p-6 bg-white/[0.02] border border-white/10 rounded-2xl">
                  <GitHubIntegration
                    onAnalysisComplete={(result) => {
                      setProjectName(result.projectName);
                      handleAnalysisComplete(result);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {state === "analyzing" && <AnalyzingScreen />}

          {(state === "analyzed" || state === "generating") && analysis && (
            <AnalysisPanel
              analysis={analysis}
              selectedFramework={selectedFramework}
              setSelectedFramework={setSelectedFramework}
              projectName={projectName}
              onTestsGenerated={handleTestsGenerated}
              onStateChange={setState}
              isGenerating={state === "generating"}
            />
          )}

          {state === "done" && analysis && (
            <TestOutputPanel
              testOutput={testOutput}
              analysis={analysis}
              framework={selectedFramework}
              projectName={projectName}
              onRegenerate={() => setState("analyzed")}
              onNewAnalysis={(newAnalysis) => {
                setAnalysis(newAnalysis);
                setProjectName(newAnalysis.projectName);
                setSelectedFramework(newAnalysis.suggestedFramework);
                setState("analyzed");
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function AnalyzingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 border-2 border-[#00ff9d]/20 rounded-full animate-ping" />
        <div className="absolute inset-2 border-2 border-[#00ff9d]/40 rounded-full animate-spin" style={{ animationDuration: "3s" }} />
        <div className="absolute inset-4 border-t-2 border-[#00ff9d] rounded-full animate-spin" style={{ animationDuration: "1s" }} />
        <div className="absolute inset-0 flex items-center justify-center"><span className="text-[#00ff9d] text-2xl">⚡</span></div>
      </div>
      <div className="text-center">
        <p className="text-[#00ff9d] text-lg tracking-widest uppercase">Analyzing Code</p>
        <p className="text-white/40 text-sm mt-2 tracking-wide">Scanning project structure...</p>
      </div>
      <div className="flex gap-1">
        {[0,1,2,3,4].map(i => (
          <div key={i} className="w-1.5 h-8 bg-[#00ff9d]/60 rounded-full animate-bounce" style={{ animationDelay: `${i*0.1}s` }} />
        ))}
      </div>
    </div>
  );
}
