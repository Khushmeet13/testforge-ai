import { useState, useEffect } from "react";
import { AnalysisResult, TestFramework, QualityReport, QualityDimension, QualitySuggestion } from "../types";

interface TestQualityScorerProps {
  testOutput: string;
  analysis: AnalysisResult;
  framework: TestFramework;
}

const GRADE_META = {
  A: { color: "#00ff9d", bg: "bg-[#00ff9d]/10", border: "border-[#00ff9d]/30", label: "Excellent" },
  B: { color: "#3b82f6", bg: "bg-[#3b82f6]/10", border: "border-[#3b82f6]/30", label: "Good" },
  C: { color: "#f59e0b", bg: "bg-[#f59e0b]/10", border: "border-[#f59e0b]/30", label: "Fair" },
  D: { color: "#f97316", bg: "bg-[#f97316]/10", border: "border-[#f97316]/30", label: "Needs Work" },
  F: { color: "#ef4444", bg: "bg-[#ef4444]/10", border: "border-[#ef4444]/30", label: "Poor" },
};

const SEV_META = {
  error: { icon: "✗", color: "text-[#ef4444]", bg: "bg-[#ef4444]/8 border-[#ef4444]/20" },
  warning: { icon: "⚠", color: "text-[#f59e0b]", bg: "bg-[#f59e0b]/8 border-[#f59e0b]/20" },
  info: { icon: "ℹ", color: "text-[#3b82f6]", bg: "bg-[#3b82f6]/8 border-[#3b82f6]/20" },
};

function parseQualityReport(raw: string): QualityReport {
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return parsed as QualityReport;
  } catch {
    // Fallback: return a default report if parsing fails
    return {
      overallScore: 50,
      grade: "C",
      dimensions: [
        { name: "Coverage", score: 5, max: 20, feedback: "Unable to parse AI response" },
        { name: "Edge Cases", score: 5, max: 20, feedback: "Unable to parse AI response" },
        { name: "Assertions", score: 5, max: 20, feedback: "Unable to parse AI response" },
        { name: "Readability", score: 5, max: 20, feedback: "Unable to parse AI response" },
        { name: "Best Practices", score: 5, max: 20, feedback: "Unable to parse AI response" },
      ],
      suggestions: [{ severity: "info", message: "Run quality scorer again for detailed feedback" }],
      strengths: ["Tests were generated successfully"],
    };
  }
}

export function TestQualityScorer({ testOutput, analysis, framework }: TestQualityScorerProps) {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    if (report) {
      let current = 0;
      const target = report.overallScore;
      const step = Math.ceil(target / 40);
      const timer = setInterval(() => {
        current = Math.min(current + step, target);
        setAnimatedScore(current);
        if (current >= target) clearInterval(timer);
      }, 30);
      return () => clearInterval(timer);
    }
  }, [report]);

  const runScorer = async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    setAnimatedScore(0);

    const prompt = `You are a senior test engineer. Evaluate the quality of these tests for a ${analysis.projectType} project.

FRAMEWORK: ${framework}
FUNCTIONS TO TEST: ${analysis.functions.slice(0, 15).map(f => f.name).join(", ")}
API ENDPOINTS: ${analysis.apiEndpoints.map(e => `${e.method} ${e.path}`).join(", ")}

TEST CODE (first 3000 chars):
${testOutput.slice(0, 3000)}

Return ONLY a valid JSON object (no markdown, no explanation) matching exactly this schema:
{
  "overallScore": <number 0-100>,
  "grade": <"A"|"B"|"C"|"D"|"F">,
  "dimensions": [
    { "name": "Coverage", "score": <0-20>, "max": 20, "feedback": "<one sentence>" },
    { "name": "Edge Cases", "score": <0-20>, "max": 20, "feedback": "<one sentence>" },
    { "name": "Assertions", "score": <0-20>, "max": 20, "feedback": "<one sentence>" },
    { "name": "Readability", "score": <0-20>, "max": 20, "feedback": "<one sentence>" },
    { "name": "Best Practices", "score": <0-20>, "max": 20, "feedback": "<one sentence>" }
  ],
  "suggestions": [
    { "severity": "error"|"warning"|"info", "message": "<concrete improvement>", "location": "<function or area>", "fix": "<how to fix>" }
  ],
  "strengths": ["<what is done well>"]
}

Be specific and actionable. Include 3-7 suggestions. Include 2-4 strengths.`;



    try {

      const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_KEY;
      if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not found in environment variables");
      }

      const GEMINI_API_URL = import.meta.env.VITE_GEMINI_API_URL


       const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3, // Lower temperature for more consistent JSON output
            maxOutputTokens: 2000,
            topP: 0.95,
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
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      if (!text) {
        throw new Error("No response text from Gemini API");
      }
      
      setReport(parseQualityReport(text));
    } catch (e) {
      setError("Failed to score tests. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!report && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-6">
        <div className="relative w-28 h-28">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(123,47,255,0.3)" strokeWidth="10" strokeDasharray="80 171" strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl">🏆</span>
          </div>
        </div>
        <div className="text-center">
          <p className="text-white/60 text-sm">AI will review your test suite across 5 dimensions</p>
          <p className="text-white/25 text-xs mt-1">Coverage · Edge Cases · Assertions · Readability · Best Practices</p>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          onClick={runScorer}
          className="px-8 py-3 bg-gradient-to-r from-[#7b2fff] to-[#5b1fd4] text-white font-bold rounded-xl hover:shadow-[0_0_30px_rgba(123,47,255,0.4)] transition-all text-sm"
        >
          ⚡ Run Quality Scorer
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-6">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 border-2 border-[#7b2fff]/20 rounded-full animate-ping" />
          <div className="absolute inset-2 border-t-2 border-[#7b2fff] rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-xl">🔍</div>
        </div>
        <div className="text-center">
          <p className="text-[#7b2fff] text-sm tracking-widest uppercase">Analyzing Test Quality</p>
          <p className="text-white/30 text-xs mt-1">Reviewing coverage, assertions, edge cases...</p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const grade = report.grade as keyof typeof GRADE_META;
  const gradeMeta = GRADE_META[grade];
  const circumference = 2 * Math.PI * 40;
  const dash = (animatedScore / 100) * circumference;

  return (
    <div className="space-y-5">
      {/* Score header */}
      <div className="flex flex-wrap items-center gap-6 p-5 bg-white/[0.02] border border-white/10 rounded-xl">
        {/* Donut */}
        <div className="relative w-28 h-28 flex-shrink-0">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
            <circle cx="50" cy="50" r="40" fill="none" stroke={gradeMeta.color} strokeWidth="10"
              strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.05s linear" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-white">{animatedScore}</span>
            <span className="text-white/30 text-[10px] tracking-wide">/ 100</span>
          </div>
        </div>
        {/* Grade badge + label */}
        <div className="flex flex-col gap-2">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border ${gradeMeta.bg} ${gradeMeta.border}`}>
            <span className="text-3xl font-black" style={{ color: gradeMeta.color }}>{grade}</span>
            <span className="text-sm font-medium text-white/70">{gradeMeta.label}</span>
          </div>
          <p className="text-white/30 text-xs">{report.strengths[0] ?? "Test suite reviewed"}</p>
          <button onClick={runScorer} className="text-[10px] text-white/30 hover:text-white/60 transition-colors text-left">
            ↺ Re-score
          </button>
        </div>
        {/* Dimension mini bars */}
        <div className="flex-1 min-w-[200px] space-y-2">
          {report.dimensions.map((dim: QualityDimension) => (
            <div key={dim.name} className="flex items-center gap-2">
              <span className="text-white/40 text-[10px] w-24 flex-shrink-0">{dim.name}</span>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(dim.score / dim.max) * 100}%`, backgroundColor: gradeMeta.color }} />
              </div>
              <span className="text-white/50 text-[10px] w-8 text-right">{dim.score}/{dim.max}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Suggestions */}
        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl space-y-2">
          <p className="text-white/40 text-xs tracking-widest uppercase mb-3">💡 Suggestions</p>
          {report.suggestions.map((s: QualitySuggestion, i: number) => {
            const sev = SEV_META[s.severity];
            return (
              <div key={i} className={`p-3 rounded-lg border ${sev.bg}`}>
                <div className="flex items-start gap-2">
                  <span className={`text-xs flex-shrink-0 mt-0.5 font-bold ${sev.color}`}>{sev.icon}</span>
                  <div className="min-w-0">
                    <p className="text-white/70 text-xs font-medium">{s.message}</p>
                    {s.location && <p className="text-white/30 text-[10px] mt-0.5 font-mono">@ {s.location}</p>}
                    {s.fix && <p className={`text-[10px] mt-1 ${sev.color} opacity-70`}>Fix: {s.fix}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dimension details + Strengths */}
        <div className="space-y-4">
          <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl space-y-3">
            <p className="text-white/40 text-xs tracking-widest uppercase">📊 Dimension Breakdown</p>
            {report.dimensions.map((dim: QualityDimension) => (
              <div key={dim.name} className="border-l-2 pl-3" style={{ borderColor: `${gradeMeta.color}40` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white/70 text-xs font-medium">{dim.name}</span>
                  <span className="text-xs font-bold" style={{ color: gradeMeta.color }}>{dim.score}/{dim.max}</span>
                </div>
                <p className="text-white/30 text-[10px] leading-relaxed">{dim.feedback}</p>
              </div>
            ))}
          </div>

          {report.strengths.length > 0 && (
            <div className="p-4 bg-[#00ff9d]/[0.03] border border-[#00ff9d]/15 rounded-xl space-y-2">
              <p className="text-[#00ff9d]/60 text-xs tracking-widest uppercase">✦ Strengths</p>
              {report.strengths.map((s: string, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[#00ff9d]/50 text-xs flex-shrink-0">✓</span>
                  <p className="text-white/60 text-xs">{s}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
