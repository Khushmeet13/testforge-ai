import { AnalysisResult, TestFramework } from "../types";
import { exportSummaryPDF } from "../utils/exportSummaryPDF";

interface Props {
  testOutput: string;
  analysis: AnalysisResult;
  framework: TestFramework;
  runnerLines?: string[]; // runner tab se pass karo — optional
}

interface ParsedTest {
  name: string;
  type: "unit" | "api" | "edge";
  description: string;
  result?: "pass" | "fail" | "unknown";
  errorMessage?: string;
}

// function parseTestsForHumans(testOutput: string, runnerLines: string[]): ParsedTest[] {
//   const lines = testOutput.split("\n");
//   const tests: ParsedTest[] = [];

//   lines.forEach((line) => {
//     const match = line.match(/it\(['"`](.*?)['"`]|test\(['"`](.*?)['"`]|def (test_\w+)|@Test[\s\S]*?void (\w+)/);
//     if (match) {
//       const raw = (match[1] || match[2] || match[3] || match[4] || "").trim();
//       if (!raw) return;

//       let type: "unit" | "api" | "edge" = "unit";
//       if (/should fail|invalid|missing|error|null|undefined|empty|wrong|duplicate/i.test(raw))
//         type = "edge";
//       else if (/api|endpoint|request|response|http|status|get|post|put|delete/i.test(raw))
//         type = "api";

//       const human = raw
//         .replace(/([A-Z])/g, " $1")
//         .replace(/_/g, " ")
//         .toLowerCase()
//         .replace(/^./, (c) => c.toUpperCase())
//         .trim();

//       // Runner output se result match karo
//       let result: "pass" | "fail" | "unknown" = "unknown";
//       let errorMessage: string | undefined;

//      if (runnerLines.length > 0) {
//   const rawLower = raw.toLowerCase().trim();

//   for (let i = 0; i < runnerLines.length; i++) {
//     // Runner line se symbols aur extra spaces hata do
//     const cleanedLine = runnerLines[i]
//       .replace(/[✓✅✗❌●○\-–]/g, "")
//       .replace(/\s+/g, " ")
//       .toLowerCase()
//       .trim();

//     // Check karo ki test name runner line mein hai ya nahi
//     if (cleanedLine.includes(rawLower) || rawLower.includes(cleanedLine) && cleanedLine.length > 5) {
//       if (/✓|✅|pass|passed/i.test(runnerLines[i])) {
//         result = "pass";
//       } else if (/✗|❌|fail|failed|×/i.test(runnerLines[i])) {
//         result = "fail";
//         const errLines = runnerLines
//           .slice(i + 1, i + 5)
//           .filter(l => l.trim() && !/✓|✗|describe|●/.test(l))
//           .join(" ");
//         if (errLines) errorMessage = errLines.trim();
//       }
//       break;
//     }
//   }
// }

//       const descriptions: Record<string, string> = {
//         edge: "Makes sure the app handles unusual or incorrect input gracefully — no crashes, just a clear error.",
//         api: "Verifies that this network call returns the right data and status when working normally.",
//         unit: "Confirms this specific piece of logic works correctly under normal conditions.",
//       };

//       tests.push({ name: human, type, description: descriptions[type], result, errorMessage });
//     }
//   });

//   return tests.slice(0, 15);
// }

const NOISE_PATTERNS = [
  /webcontainer/i,
  /booting/i,
  /installing/i,
  /npm install/i,
  /node_modules/i,
  /📦|🚀|⏳|📡|🔬/,
  /^\s*[\u2550\u2500]+\s*$/,   // ═══ or ─── separator lines
  /ready in \d/i,
  /added \d+ package/i,
  /packages installed/i,
  /setting up/i,
  /mounting/i,
];

function isNoiseLine(line: string): boolean {
  return NOISE_PATTERNS.some(p => p.test(line));
}

function parseTestsForHumans(testOutput: string, runnerLines: string[]): ParsedTest[] {
  const tests: ParsedTest[] = [];

  // Step 1: Runner lines se directly pass/fail results nikalo
  const runnerResults: { name: string; result: "pass" | "fail"; errorMessage?: string }[] = [];

  for (let i = 0; i < runnerLines.length; i++) {
    const line = runnerLines[i];

    // Match lines like:  ✓ should update name field (6 ms)
    //                    ✗ should return false for null inputs (5 ms)
    const passMatch = line.match(/✓|✅/);
    const failMatch = line.match(/✗|❌|×/);

    if (passMatch || failMatch) {
      // Symbol ke baad ka text nikalo, timing hata do
      const name = line
        .replace(/[✓✅✗❌×]/g, "")
        .replace(/\(\d+\s*ms\)/g, "")
        .replace(/\s+/g, " ")
        .trim();

      if (name.length < 3) continue; // empty lines skip

      let errorMessage: string | undefined;
      if (failMatch) {
        // Agle kuch lines mein error message dhundo
        const errLines = runnerLines
          .slice(i + 1, i + 6)
          .filter(l => l.trim() && !/✓|✗|describe|●|RUNS|PASS|FAIL/.test(l))
          .join(" ")
          .trim();
        if (errLines) errorMessage = errLines;
      }

      runnerResults.push({
        name,
        result: passMatch ? "pass" : "fail",
        errorMessage,
      });
    }
  }

  // Step 2: Runner results ko ParsedTest format mein convert karo
  // Agar runner results mile toh unhe use karo
  if (runnerResults.length > 0) {
    return runnerResults.map(r => {
      let type: "unit" | "api" | "edge" = "unit";
      if (/fail|invalid|missing|error|null|undefined|empty|wrong|duplicate|out of bounds/i.test(r.name))
        type = "edge";
      else if (/api|endpoint|request|response|http|status|get|post|put|delete/i.test(r.name))
        type = "api";

      const descriptions: Record<string, string> = {
        edge: "Makes sure the app handles unusual or incorrect input gracefully — no crashes, just a clear error.",
        api: "Verifies that this network call returns the right data and status when working normally.",
        unit: "Confirms this specific piece of logic works correctly under normal conditions.",
      };

      // Human readable name
      const human = r.name
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/^./, c => c.toUpperCase())
        .trim();

      return {
        name: human,
        type,
        description: descriptions[type],
        result: r.result,
        errorMessage: r.errorMessage,
      };
    });
  }

  // Step 3: Fallback — agar runner nahi chala toh source code se parse karo
  const lines = testOutput.split("\n");
  lines.forEach(line => {
    const match = line.match(/it\(['"`](.*?)['"`]|test\(['"`](.*?)['"`]/);
    if (match) {
      const raw = (match[1] || match[2] || "").trim();
      if (!raw) return;

      let type: "unit" | "api" | "edge" = "unit";
      if (/fail|invalid|missing|error|null|undefined|empty|wrong|duplicate/i.test(raw))
        type = "edge";
      else if (/api|endpoint|request|response|http/i.test(raw))
        type = "api";

      const human = raw
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^./, c => c.toUpperCase())
        .trim();

      const descriptions: Record<string, string> = {
        edge: "Makes sure the app handles unusual or incorrect input gracefully — no crashes, just a clear error.",
        api: "Verifies that this network call returns the right data and status when working normally.",
        unit: "Confirms this specific piece of logic works correctly under normal conditions.",
      };

      tests.push({ name: human, type, description: descriptions[type], result: "unknown" });
    }
  });

  return tests.slice(0, 15);
}

const TYPE_STYLES = {
  unit: { dot: "#1D9E75", badge: { bg: "#E1F5EE", color: "#0F6E56" }, label: "unit" },
  api: { dot: "#185FA5", badge: { bg: "#E6F1FB", color: "#185FA5" }, label: "api" },
  edge: { dot: "#EF9F27", badge: { bg: "#FAEEDA", color: "#854F0B" }, label: "edge case" },
};

const RESULT_STYLES = {
  pass: {
    icon: "✓",
    label: "Passed",
    iconColor: "#1D9E75",
    bg: "bg-[#1D9E75]/5",
    border: "border-[#1D9E75]/20",
    labelColor: "text-[#1D9E75]",
  },
  fail: {
    icon: "✗",
    label: "Failed",
    iconColor: "#f87171",
    bg: "bg-[#f87171]/5",
    border: "border-[#f87171]/20",
    labelColor: "text-[#f87171]",
  },
  unknown: {
    icon: "–",
    label: "Not run yet",
    iconColor: "#ffffff40",
    bg: "bg-white/[0.02]",
    border: "border-white/8",
    labelColor: "text-white/25",
  },
};

export function TestSummaryPanel({ testOutput, analysis, framework, runnerLines = [] }: Props) {
  const cleanLines = runnerLines.filter(line => !isNoiseLine(line));
  const tests = parseTestsForHumans(testOutput, cleanLines);
  const testCount = (testOutput.match(/\bit\(|def test_|@Test/g) || []).length;
  const edgeCount = tests.filter((t) => t.type === "edge").length;
  const featureCount = (testOutput.match(/\bdescribe\(|class Test/g) || []).length || 1;

  const passedCount = tests.filter((t) => t.result === "pass").length;
  const failedCount = tests.filter((t) => t.result === "fail").length;
  const notRunCount = tests.filter((t) => t.result === "unknown").length;
  const hasResults = runnerLines.length > 0;

  const fileName = analysis.files[0]?.name || "your project";
  const projectSummary = analysis.summary || "your codebase";

  const handleExport = () => {
    exportSummaryPDF({
      fileName: analysis.files[0]?.name?.replace(/\.[^.]+$/, "") || "project",
      framework,
      tests,
      passedCount,
      failedCount,
      totalTests: testCount,
      projectSummary: analysis.summary || "your codebase",
      edgeCount,
    });
  }

  return (
    <div className="space-y-4">

      {/* Hero */}
      <div className="p-5 bg-white/[0.03] border border-white/10 rounded-xl">
          <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white text-sm font-medium mb-1">What was tested?</p>
          <p className="text-white/50 text-sm leading-relaxed">
            Your <span className="text-white font-medium">{fileName}</span> file was checked.{" "}
            It handles <span className="text-white/70">{projectSummary}</span> — and{" "}
            <span className="text-[#00ff9d] font-medium">{testCount} automated checks</span> were
            written to make sure everything works correctly without any bugs.
          </p>
        </div>

        {/* Export button */}
        <button
          onClick={handleExport}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/10 hover:border-[#7b2fff]/40 text-white/40 hover:text-[#7b2fff] bg-white/[0.02] hover:bg-[#7b2fff]/5 rounded-lg transition-all font-mono"
          title="Export summary as PDF"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v7M3 5l3 3 3-3M1 9v1a1 1 0 001 1h8a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Export PDF
        </button>
      </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { num: testCount, label: "Total checks written", color: "#1D9E75" },
          { num: featureCount, label: "Features covered", color: "#7F77DD" },
          { num: edgeCount, label: "Edge cases handled", color: "#EF9F27" },
          { num: framework, label: "Testing tool used", color: "#185FA5" },
        ].map((s) => (
          <div key={s.label} className="p-3 bg-white/[0.02] border border-white/8 rounded-xl">
            <p className="text-xl font-medium" style={{ color: s.color }}>{s.num}</p>
            <p className="text-white/30 text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Run result bar — sirf tab dikhao jab runner chala ho */}
      {hasResults && (
        <div className="flex items-center gap-3 p-4 bg-white/[0.03] border border-white/10 rounded-xl flex-wrap">
          <p className="text-white/40 text-xs tracking-widest uppercase mr-2">Run Results</p>
          {passedCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1D9E75]/10 border border-[#1D9E75]/20 text-[#1D9E75] text-xs font-medium">
              <span>✓</span> {passedCount} passed
            </span>
          )}
          {failedCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f87171]/10 border border-[#f87171]/20 text-[#f87171] text-xs font-medium">
              <span>✗</span> {failedCount} failed
            </span>
          )}
          {notRunCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/30 text-xs">
              – {notRunCount} not matched
            </span>
          )}
          {/* Progress bar */}
          {passedCount + failedCount > 0 && (
            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1D9E75] rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((passedCount / (passedCount + failedCount)) * 100)}%` }}
                />
              </div>
              <span className="text-white/30 text-xs">
                {Math.round((passedCount / (passedCount + failedCount)) * 100)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Test list */}
      <div>
        <p className="text-white/30 text-[10px] tracking-widest uppercase mb-3">
          {hasResults ? "Each check — what it does & what happened" : "What each check does"}
        </p>
        <div className="space-y-2">
          {tests.map((t, i) => {
            const typeStyle = TYPE_STYLES[t.type];
            const resultStyle = RESULT_STYLES[t.result ?? "unknown"];
            return (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 border rounded-xl transition-all ${resultStyle.bg} ${resultStyle.border}`}
              >
                {/* Result icon */}
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold border"
                  style={{
                    color: resultStyle.iconColor,
                    borderColor: resultStyle.iconColor + "40",
                    backgroundColor: resultStyle.iconColor + "15",
                  }}
                >
                  {resultStyle.icon}
                </div>

                <div className="min-w-0 flex-1">
                  {/* Test name + badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white/85 text-sm font-medium">{t.name}</p>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: typeStyle.badge.bg, color: typeStyle.badge.color }}
                    >
                      {typeStyle.label}
                    </span>
                    {hasResults && (
                      <span className={`text-[10px] font-medium ${resultStyle.labelColor}`}>
                        {resultStyle.label}
                      </span>
                    )}
                  </div>

                  {/* Plain English description */}
                  <p className="text-white/40 text-xs mt-1 leading-relaxed">{t.description}</p>

                  {/* Error message if failed */}
                  {t.result === "fail" && t.errorMessage && (
                    <div className="mt-2 px-3 py-2 bg-[#f87171]/5 border border-[#f87171]/15 rounded-lg">
                      <p className="text-[#f87171]/70 text-[11px] font-mono leading-relaxed">
                        {t.errorMessage}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {tests.length === 0 && (
            <div className="p-6 text-center text-white/20 text-sm border border-white/8 rounded-xl">
              No test cases found in the generated output.
            </div>
          )}
        </div>
      </div>

      {/* Why it matters */}
      <div className="p-4 border-l-2 border-[#7b2fff]/50 bg-[#7b2fff]/5 rounded-r-xl">
        <p className="text-white/80 text-sm font-medium mb-1">Why does this matter?</p>
        <p className="text-white/40 text-xs leading-relaxed">
          These checks run automatically every time your code changes. If someone accidentally
          breaks a feature, the test catches it before it reaches your users — saving time,
          money, and headaches.
        </p>
      </div>

      <p className="text-white/20 text-xs border-t border-white/8 pt-3">
        Tip: Share this summary with your team lead or product manager — no coding knowledge needed.
      </p>
    </div>
  );
}