import { useState } from "react";
import { AnalysisResult, BugReport, BugSeverity } from "../types";

interface BugDetectionPanelProps {
  analysis: AnalysisResult;
}

const SEV_META: Record<BugSeverity, { icon: string; label: string; color: string; bg: string; border: string }> = {
  critical: { icon: "🔴", label: "Critical", color: "text-[#ef4444]", bg: "bg-[#ef4444]/8", border: "border-[#ef4444]/25" },
  warning:  { icon: "🟡", label: "Warning",  color: "text-[#f59e0b]", bg: "bg-[#f59e0b]/8", border: "border-[#f59e0b]/25" },
  info:     { icon: "🔵", label: "Info",     color: "text-[#3b82f6]", bg: "bg-[#3b82f6]/8", border: "border-[#3b82f6]/25" },
};

const CAT_ICONS: Record<string, string> = {
  "null-safety": "🚫", "error-handling": "⚠️", "security": "🔐",
  "performance": "⚡", "logic": "🧠", "type-safety": "🔷",
};

function parseBugReports(raw: string): BugReport[] {
  try {
    // Handle Gemini's response format
    let clean = raw;
    
    // If it's a Gemini response object
    if (raw.includes('"candidates"')) {
      try {
        const geminiResponse = JSON.parse(raw);
        if (geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
          clean = geminiResponse.candidates[0].content.parts[0].text;
        }
      } catch {
        // Not a Gemini response object
      }
    }
    
    // Remove markdown code blocks
    clean = clean.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return (Array.isArray(parsed) ? parsed : parsed.bugs ?? []).map((b: Partial<BugReport>, i: number) => ({
      id: `bug-${i}`,
      file: b.file ?? "unknown",
      line: b.line,
      function: b.function,
      severity: (b.severity ?? "info") as BugSeverity,
      title: b.title ?? "Issue detected",
      description: b.description ?? "",
      suggestion: b.suggestion ?? "",
      category: b.category ?? "logic",
    }));
  } catch (error) {
    console.error("Failed to parse bug reports:", error);
    return [];
  }
}

export function BugDetectionPanel({ analysis }: BugDetectionPanelProps) {
  const [bugs, setBugs] = useState<BugReport[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<BugSeverity | "all">("all");
  const [selected, setSelected] = useState<BugReport | null>(null);

  const runDetection = async () => {
    setLoading(true);
    setError(null);
    setBugs(null);
    setSelected(null);

    const codeSnippets = analysis.files
      .filter(f => ["JavaScript", "TypeScript", "Python", "Java"].includes(f.language))
      .slice(0, 6)
      .map(f => `FILE: ${f.path}\n${f.content.slice(0, 1200)}`)
      .join("\n\n---\n\n");

    const prompt = `You are a senior code reviewer and security expert. Analyze this ${analysis.projectType} project for potential bugs, vulnerabilities, and code quality issues.

PROJECT FILES:
${codeSnippets}

FUNCTIONS: ${analysis.functions.slice(0, 15).map(f => `${f.name}(${f.params.join(", ")}) in ${f.file}`).join("\n")}

Return ONLY a valid JSON array (no markdown) of bug reports. Each item must have:
{
  "file": "<filename>",
  "line": <line number or null>,
  "function": "<function name or null>",
  "severity": "critical"|"warning"|"info",
  "title": "<short title>",
  "description": "<detailed description of the issue>",
  "suggestion": "<specific fix or improvement>",
  "category": "null-safety"|"error-handling"|"security"|"performance"|"logic"|"type-safety"
}

Focus on:
- Missing null/undefined checks before property access
- Unhandled promise rejections or missing try/catch
- SQL injection, XSS, insecure direct object references  
- Missing input validation on public functions
- Memory leaks (event listeners not removed, intervals not cleared)
- Race conditions in async code
- Type coercion bugs (== vs ===)
- Missing error propagation

Return 5-12 specific bugs. Be concrete - reference actual function names and line numbers where possible.`;

    try {
      // Get API key from environment
      const GEMINI_API_KEY = (import.meta as any).VITE_GEMINI_KEY ;
      if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not found in environment variables");
      }

      const GEMINI_API_URL = (import.meta as any).VITE_GEMINI_API_URL;

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
            temperature: 0.3, // Lower temperature for more consistent JSON output
            maxOutputTokens: 3000,
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
      
      const parsed = parseBugReports(text);
      setBugs(parsed);
      if (parsed.length > 0) setSelected(parsed[0]);
    } catch (err) {
      console.error("Bug detection error:", err);
      setError(err instanceof Error ? err.message : "Bug detection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = bugs
    ? filter === "all" ? bugs : bugs.filter(b => b.severity === filter)
    : [];

  const counts = bugs
    ? { critical: bugs.filter(b => b.severity === "critical").length, warning: bugs.filter(b => b.severity === "warning").length, info: bugs.filter(b => b.severity === "info").length }
    : { critical: 0, warning: 0, info: 0 };

  if (!bugs && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-6">
        <div className="text-6xl animate-pulse">🐛</div>
        <div className="text-center">
          <p className="text-white/60 text-sm">AI will scan your code for potential bugs & vulnerabilities</p>
          <p className="text-white/25 text-xs mt-1">null-safety · error handling · security · logic · performance</p>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button onClick={runDetection}
          className="px-8 py-3 bg-gradient-to-r from-[#ef4444] to-[#dc2626] text-white font-bold rounded-xl hover:shadow-[0_0_30px_rgba(239,68,68,0.3)] transition-all text-sm">
          🔍 Scan for Bugs
        </button>
      </div>
    );
  }

  if (loading) {
    const steps = ["Reading source files...", "Checking null safety...", "Scanning for security issues...", "Analyzing error handling...", "Reviewing logic..."];
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-6">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 border-2 border-[#ef4444]/20 rounded-full animate-ping" />
          <div className="absolute inset-2 border-t-2 border-[#ef4444] rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-xl">🔍</div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-[#ef4444] text-sm tracking-widest uppercase">Scanning Code</p>
          {steps.map((s, i) => (
            <p key={i} className="text-white/20 text-xs" style={{ animationDelay: `${i * 0.4}s` }}>{s}</p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white/[0.02] border border-white/10 rounded-xl">
        <div className="flex items-center gap-4">
          {(["critical", "warning", "info"] as BugSeverity[]).map(sev => {
            const m = SEV_META[sev];
            return (
              <button key={sev} onClick={() => setFilter(filter === sev ? "all" : sev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-xs ${
                  filter === sev ? `${m.bg} ${m.border}` : "bg-white/[0.02] border-white/8 hover:border-white/20"
                }`}>
                <span>{m.icon}</span>
                <span className={filter === sev ? m.color : "text-white/50"}>{counts[sev]}</span>
                <span className="text-white/30">{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/30 text-xs">{bugs!.length} issues found</span>
          <button onClick={runDetection} className="text-[10px] text-white/30 hover:text-white/60 transition-colors border border-white/10 px-2 py-1 rounded-md">
            ↺ Re-scan
          </button>
        </div>
      </div>

      {bugs!.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <span className="text-5xl">✅</span>
          <p className="text-[#00ff9d] text-sm">No significant bugs detected!</p>
          <p className="text-white/30 text-xs">Your code looks clean</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bug list */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filtered.map(bug => {
              const m = SEV_META[bug.severity];
              return (
                <button key={bug.id} onClick={() => setSelected(bug)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${m.bg} ${m.border} ${
                    selected?.id === bug.id ? "ring-1 ring-white/25 scale-[1.01]" : "hover:border-white/20"
                  }`}>
                  <div className="flex items-start gap-2">
                    <span className="text-sm flex-shrink-0 mt-0.5">{CAT_ICONS[bug.category] ?? "⚠️"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white/80 text-xs font-medium">{bug.title}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${m.bg} ${m.color} border ${m.border}`}>
                          {m.label}
                        </span>
                      </div>
                      <p className="text-white/30 text-[10px] mt-0.5 truncate">
                        {bug.function ? `${bug.function}()` : ""} {bug.file.split("/").pop()}
                        {bug.line ? ` :${bug.line}` : ""}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bug detail */}
          {selected && (() => {
            const m = SEV_META[selected.severity];
            return (
              <div className={`p-5 rounded-xl border space-y-4 ${m.bg} ${m.border}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{CAT_ICONS[selected.category] ?? "⚠️"}</span>
                  <div>
                    <p className={`text-sm font-semibold ${m.color}`}>{selected.title}</p>
                    <p className="text-white/30 text-[10px] font-mono mt-0.5">
                      {selected.file.split("/").pop()}{selected.line ? `:${selected.line}` : ""}
                      {selected.function ? ` · ${selected.function}()` : ""}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <p className="text-white/40 text-[10px] tracking-widest uppercase mb-1">Description</p>
                    <p className="text-white/70 leading-relaxed">{selected.description}</p>
                  </div>
                  <div className="p-3 bg-[#00ff9d]/5 border border-[#00ff9d]/15 rounded-lg">
                    <p className="text-[#00ff9d]/60 text-[10px] tracking-widest uppercase mb-1">💡 Suggested Fix</p>
                    <p className="text-white/60 leading-relaxed">{selected.suggestion}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${m.bg} ${m.color} border ${m.border}`}>
                      {selected.category}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${m.bg} ${m.color} border ${m.border}`}>
                      {m.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}