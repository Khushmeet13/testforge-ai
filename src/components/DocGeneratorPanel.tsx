import { useState } from "react";
import { AnalysisResult, TestFramework } from "../types";

interface DocGeneratorPanelProps {
  analysis: AnalysisResult;
  framework: TestFramework;
}

type DocTab = "jsdoc" | "readme";

export function DocGeneratorPanel({ analysis, framework }: DocGeneratorPanelProps) {
  const [jsdoc, setJsdoc] = useState("");
  const [readme, setReadme] = useState("");
  const [loading, setLoading] = useState<DocTab | null>(null);
  const [activeTab, setActiveTab] = useState<DocTab>("jsdoc");
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async (type: DocTab) => {
    setLoading(type);
    const isReadme = type === "readme";
    const isPy = analysis.projectType === "python";
    const isJava = analysis.projectType === "java";
    const docStyle = isPy ? "Python docstrings (Google style)" : isJava ? "Javadoc comments" : "JSDoc comments";

    const codeSnippets = analysis.files
      .filter(f => ["JavaScript", "TypeScript", "Python", "Java"].includes(f.language))
      .slice(0, 5)
      .map(f => `FILE: ${f.path}\n${f.content.slice(0, 1500)}`)
      .join("\n\n---\n\n");

    const prompt = isReadme
      ? `Generate a comprehensive, professional README.md for this project.

PROJECT: ${analysis.projectName}
TYPE: ${analysis.projectType}
LANGUAGES: ${analysis.languages.join(", ")}
TEST FRAMEWORK: ${framework}
FUNCTIONS: ${analysis.functions.slice(0, 15).map(f => `${f.name}(${f.params.join(", ")})`).join(", ")}
API ENDPOINTS: ${analysis.apiEndpoints.map(e => `${e.method} ${e.path}`).join(", ")}
DEPENDENCIES: ${analysis.dependencies.slice(0, 10).join(", ")}

CODE SAMPLES:
${codeSnippets.slice(0, 2000)}

Generate a complete README.md with:
- Project title & description badge row
- Features list
- Installation steps
- Usage examples with code blocks
- API reference table (if endpoints exist)
- Function reference (key exported functions)
- Testing section (how to run ${framework})
- Contributing guide
- License section

Use real function names and endpoints. Make it professional and developer-friendly. Return ONLY the markdown content.`

      : `Generate ${docStyle} for all functions in this ${analysis.projectType} project.

FUNCTIONS TO DOCUMENT:
${analysis.functions.slice(0, 20).map(f => `- ${f.name}(${f.params.join(", ")})${f.isAsync ? " [async]" : ""} in ${f.file}`).join("\n")}

CODE:
${codeSnippets.slice(0, 3000)}

Generate complete documentation strings for each function. Include:
- Brief description (first line)
- @param / Args: for each parameter (with types)
- @returns / Returns: describing the return value
- @throws / Raises: for error conditions
- @example / Example: showing usage

${isPy ? "Use Google-style docstrings. Format: def functionName():\n    \"\"\"description.\n\n    Args:\n        param: description\n\n    Returns:\n        description\n    \"\"\""
: isJava ? "Use Javadoc format with /** ... */ blocks."
: "Use JSDoc format with /** ... */ blocks. Include TypeScript types in @param and @returns."}

Return ONLY the documentation — one block per function, clearly labeled with the filename.`;

    try {
      // Get API key from environment
      const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_KEY || import.meta.env.VITE_GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not found in environment variables");
      }

      const GEMINI_API_URL = import.meta.env.VITE_GEMINI_API_URL;

      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "USER",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4000,
            topP: 0.95,
            topK: 40,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_NONE",
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_NONE",
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_NONE",
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_NONE",
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Extract text from Gemini response
      let text = "";
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        text = data.candidates[0].content.parts[0].text || "";
      }
      
      if (!text) {
        throw new Error("No response text from Gemini API");
      }

      // Update state with generated content
      if (isReadme) {
        setReadme(text);
      } else {
        setJsdoc(text);
      }
    } catch (err) {
      console.error("Documentation generation error:", err);
      const errorMsg = "// Error generating documentation. Please try again.\n// Check your API key and network connection.";
      if (isReadme) {
        setReadme(errorMsg);
      } else {
        setJsdoc(errorMsg);
      }
    } finally {
      setLoading(null);
    }
  };

  const handleCopy = (content: string, key: string) => {
    navigator.clipboard.writeText(content);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const currentContent = activeTab === "jsdoc" ? jsdoc : readme;
  const hasContent = currentContent.length > 0;
  const isLoading = loading === activeTab;

  return (
    <div className="space-y-4">
      {/* Tabs + generate buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/10 rounded-xl">
          {([
            { id: "jsdoc" as DocTab, icon: "📝", label: analysis.projectType === "python" ? "Docstrings" : analysis.projectType === "java" ? "Javadoc" : "JSDoc" },
            { id: "readme" as DocTab, icon: "📖", label: "README.md" },
          ]).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-xs rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === t.id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
              }`}>
              <span>{t.icon}</span><span>{t.label}</span>
              {(t.id === "jsdoc" ? jsdoc : readme).length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ff9d] flex-shrink-0" />
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {hasContent && (
            <>
              <button onClick={() => handleCopy(currentContent, activeTab)}
                className="px-3 py-1.5 text-xs text-white/50 hover:text-white border border-white/10 hover:border-white/25 rounded-lg transition-all">
                {copied === activeTab ? "✓ Copied!" : "📋 Copy"}
              </button>
              <button onClick={() => handleDownload(currentContent, activeTab === "readme" ? "README.md" : `docs.${analysis.projectType === "python" ? "py" : analysis.projectType === "java" ? "java" : "js"}`)}
                className="px-3 py-1.5 text-xs text-white/50 hover:text-white border border-white/10 hover:border-white/25 rounded-lg transition-all">
                ⬇ Download
              </button>
            </>
          )}
          <button
            onClick={() => generate(activeTab)}
            disabled={loading !== null}
            className="px-4 py-1.5 text-xs bg-gradient-to-r from-[#00ff9d] to-[#00cc7a] text-black font-bold rounded-lg hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5">
            {isLoading
              ? <><span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Generating...</>
              : <>{activeTab === "readme" ? "📖" : "📝"} Generate {activeTab === "readme" ? "README" : "Docs"}</>}
          </button>
        </div>
      </div>

      {/* Content viewer */}
      {!hasContent && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <span className="text-5xl">{activeTab === "readme" ? "📖" : "📝"}</span>
          <p className="text-white/40 text-sm text-center">
            {activeTab === "readme"
              ? "Generate a professional README with installation, usage, API reference, and more"
              : `Generate ${analysis.projectType === "python" ? "Google-style docstrings" : analysis.projectType === "java" ? "Javadoc comments" : "JSDoc comments"} for all ${analysis.functions.length} functions`}
          </p>
          <p className="text-white/20 text-xs">{analysis.functions.length} functions • {analysis.apiEndpoints.length} endpoints</p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="flex gap-1">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="w-1.5 h-8 bg-[#00ff9d]/50 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
          <p className="text-[#00ff9d]/60 text-xs tracking-widest uppercase">
            {activeTab === "readme" ? "Writing README..." : "Generating documentation..."}
          </p>
          {/* Streaming preview */}
          {currentContent && (
            <div className="w-full max-w-2xl bg-white/[0.02] border border-white/8 rounded-xl p-4 max-h-40 overflow-hidden">
              <pre className="text-xs text-white/40 font-mono whitespace-pre-wrap">{currentContent.slice(-400)}</pre>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#111118] border border-white/8 rounded-t-xl">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
            </div>
            <span className="text-white/40 text-xs font-mono ml-2">
              {activeTab === "readme" ? "README.md" : `documentation.${analysis.projectType === "python" ? "py" : "js"}`}
            </span>
            <span className="ml-auto text-white/20 text-xs">{currentContent.split("\n").length} lines</span>
          </div>
          <div className="bg-[#0d0d14] border border-t-0 border-white/8 rounded-b-xl overflow-auto max-h-[60vh]">
            <pre className="text-xs leading-relaxed p-6 font-mono text-white/70 whitespace-pre-wrap">
              {currentContent}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}