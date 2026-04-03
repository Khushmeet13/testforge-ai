import { useRef, useState, useCallback } from "react";
import { AppState, AnalysisResult } from "../types";
import { extractZip, analyzeProject } from "../utils/analyzer";
import { FiSearch, FiZap, FiPackage, FiPieChart } from "react-icons/fi";

interface UploadZoneProps {
  onAnalysisComplete: (result: AnalysisResult) => void;
  onStateChange: (state: AppState) => void;
  setProjectName: (name: string) => void;
}

export function UploadZone({ onAnalysisComplete, onStateChange, setProjectName }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".zip")) {
        setError("Please upload a .zip file containing your project.");
        return;
      }

      setError(null);
      onStateChange("analyzing");
      setProjectName(file.name);

      try {
        const files = await extractZip(file);
        if (files.length === 0) {
          setError("No supported code files found in the ZIP.");
          onStateChange("idle");
          return;
        }
        const analysis = analyzeProject(files, file.name);
        onAnalysisComplete(analysis);
      } catch (err) {
        setError("Failed to process ZIP file. Please try again.");
        onStateChange("idle");
      }
    },
    [onAnalysisComplete, onStateChange, setProjectName]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="flex flex-col items-center gap-12">
      {/* Hero */}
      <div className="text-center max-w-4xl mx-auto">
        {/* <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#00ff9d]/10 border border-[#00ff9d]/20 rounded-full text-[#00ff9d] text-xs tracking-widest uppercase mb-6">
          <span>✦</span> Powered by Claude AI <span>✦</span>
        </div> */}
        <h2 className="text-5xl sm:text-6xl font-semibold tracking-tight leading-tight">
          Upload Code.
          
          <span className="pl-5 text-transparent bg-clip-text bg-gradient-to-r from-[#00ff9d] to-[#00cc7a]">
            Get Tests.
          </span>
        </h2>
        <p className="text-white/40 text-lg mt-5 leading-relaxed">
          Drop your project ZIP and AI will analyze every function, API endpoint, and business logic — then generate production-ready tests.
        </p>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative w-full max-w-5xl cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 p-16
          ${isDragging
            ? "border-[#00ff9d] bg-[#00ff9d]/5 shadow-[0_0_40px_rgba(0,255,157,0.15)]"
            : "border-white/10 hover:border-white/25 bg-white/[0.02] hover:bg-white/[0.04]"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          onChange={handleChange}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-6 pointer-events-none">
          <div className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300 ${isDragging ? "bg-[#00ff9d]/20" : "bg-white/5"}`}>
            <svg
              className={`w-10 h-10 transition-colors duration-300 ${isDragging ? "text-[#00ff9d]" : "text-white/30"}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
          </div>

          <div className="text-center">
            <p className={`text-lg font-medium transition-colors duration-300 ${isDragging ? "text-[#00ff9d]" : "text-white/60"}`}>
              {isDragging ? "Release to upload" : "Drop your project ZIP here"}
            </p>
            <p className="text-white/30 text-sm mt-1">or click to browse files</p>
          </div>

          <div className="flex items-center gap-6 text-xs text-white/30">
            <span className="flex items-center gap-1.5"><span className="text-yellow-400/60">●</span> Node.js </span>
             <span className="flex items-center gap-1.5"><span className="text-cyan-400/60">●</span> TypeScript</span>
            <span className="flex items-center gap-1.5"><span className="text-blue-400/60">●</span> Python</span>
            <span className="flex items-center gap-1.5"><span className="text-orange-400/60">●</span> Java</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-5 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Feature tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 w-full max-w-4xl">
        {[
          { icon: <FiSearch className="text-2xl" />, title: "Deep Analysis", desc: "Scans functions, APIs, and patterns" },
          { icon: <FiZap className="text-2xl" />, title: "AI Generation", desc: "Unit + integration + edge case tests" },
          { icon: <FiPackage className="text-2xl" />, title: "Right Framework", desc: "Jest, Pytest, JUnit auto-detected" },
          { icon: <FiPieChart className="text-2xl" />, title: "Coverage Map", desc: "Identifies untested functions & hot paths" }
        ].map((f) => (
          <div key={f.title} className="p-4 bg-white/[0.03] border border-white/8 rounded-xl">
            <div className="text-2xl mb-2">{f.icon}</div>
            <p className="text-white/80 text-sm font-medium">{f.title}</p>
            <p className="text-white/30 text-xs mt-1">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
