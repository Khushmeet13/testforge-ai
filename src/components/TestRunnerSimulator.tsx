import { useState, useEffect, useRef } from "react";
import { AnalysisResult, TestFramework } from "../types";

interface TestRunnerSimulatorProps {
  testOutput: string;
  analysis: AnalysisResult;
  framework: TestFramework;
}

interface TestLine {
  id: string;
  type: "suite" | "pass" | "fail" | "skip" | "summary" | "log" | "error" | "timing";
  text: string;
  duration?: number;
}

const FRAMEWORK_BANNER: Record<TestFramework, string> = {
  jest:   " JEST  v29.7.0",
  vitest: " VITEST v1.6.0",
  mocha:  " MOCHA v10.4.0",
  pytest: " pytest v8.2.0",
  junit:  " JUnit Platform v1.10.2",
  rspec:  " RSpec v3.13.0",
  "react-testing-library": " RTL v16.3.0",
  supertest: " Supertest v7.0.0",
  cypress: " Cypress v13.10.0",
};

const FRAMEWORK_PASS: Record<TestFramework, string> = {
  jest: "✓", vitest: "✓", mocha: "passing", pytest: "PASSED", junit: "[INFO]", rspec: "·","react-testing-library": "✓", supertest: "✓", cypress: "passing",
};

function buildTestLines(testOutput: string, analysis: AnalysisResult, framework: TestFramework): TestLine[] {
  const lines: TestLine[] = [];
  const isPy = framework === "pytest";
  const isJava = framework === "junit";

  // Extract describe blocks and test names
  const describeMatches = [...testOutput.matchAll(/describe\(['"`]([^'"`]+)['"`]/g)];
  const testMatches = [
    ...testOutput.matchAll(/(?:it|test)\(['"`]([^'"`]+)['"`]/g),
    ...testOutput.matchAll(/def (test_\w+)/g),
    ...testOutput.matchAll(/@Test[\s\S]*?void (\w+)\s*\(/g),
  ];

  const suites = describeMatches.map(m => m[1]);
  const tests = testMatches.map(m => m[1]).slice(0, 30);

  // Assign random pass/fail (mostly pass, ~10% fail for realism)
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed + 1) * 10000;
    return x - Math.floor(x);
  };

  if (isPy) {
    lines.push({ id: "h1", type: "log", text: `============================= test session starts ==============================` });
    lines.push({ id: "h2", type: "log", text: `platform linux -- Python 3.11.0, pytest-8.2.0, pluggy-1.5.0` });
    lines.push({ id: "h3", type: "log", text: `rootdir: /project, configfile: pyproject.toml` });
    lines.push({ id: "h4", type: "log", text: `collected ${tests.length} items` });
    lines.push({ id: "sep", type: "log", text: "" });

    tests.forEach((test, i) => {
      const pass = seededRandom(i * 137) > 0.12;
      const dur = (seededRandom(i * 31) * 0.08 + 0.01).toFixed(3);
      lines.push({
        id: `t-${i}`, type: pass ? "pass" : "fail",
        text: `${analysis.files[0]?.name ?? "test_main.py"}::${test}`,
        duration: parseFloat(dur),
      });
    });

    const passed = lines.filter(l => l.type === "pass").length;
    const failed = lines.filter(l => l.type === "fail").length;
    const total = (lines.filter(l => l.type === "pass" || l.type === "fail").reduce((s, l) => s + (l.duration ?? 0), 0)).toFixed(2);

    lines.push({ id: "sep2", type: "log", text: "" });
    if (failed > 0) {
      lines.push({ id: "sum", type: "summary", text: `${failed} failed, ${passed} passed in ${total}s` });
    } else {
      lines.push({ id: "sum", type: "summary", text: `${passed} passed in ${total}s` });
    }

  } else if (isJava) {
    lines.push({ id: "h1", type: "log", text: `[INFO] -------------------------------------------------------` });
    lines.push({ id: "h2", type: "log", text: `[INFO]  T E S T S` });
    lines.push({ id: "h3", type: "log", text: `[INFO] -------------------------------------------------------` });
    lines.push({ id: "h4", type: "log", text: `[INFO] Running ${analysis.projectName}Tests` });

    tests.forEach((test, i) => {
      const pass = seededRandom(i * 137) > 0.12;
      lines.push({
        id: `t-${i}`, type: pass ? "pass" : "fail",
        text: `${pass ? "[INFO]" : "[ERROR]"} Tests run: 1, Failures: ${pass ? 0 : 1}, Errors: 0, Skipped: 0, Time elapsed: ${(seededRandom(i) * 0.1 + 0.01).toFixed(3)}s - ${test}`,
        duration: seededRandom(i) * 0.1,
      });
    });

    const passed = lines.filter(l => l.type === "pass").length;
    const failed = lines.filter(l => l.type === "fail").length;
    lines.push({ id: "sep", type: "log", text: "[INFO]" });
    lines.push({ id: "sum", type: "summary", text: `[INFO] Tests run: ${passed + failed}, Failures: ${failed}, Errors: 0, Skipped: 0` });
    lines.push({ id: "res", type: failed > 0 ? "error" : "pass", text: failed > 0 ? "[ERROR] BUILD FAILURE" : "[INFO] BUILD SUCCESS" });

  } else {
    // Jest/Vitest/Mocha style
    let suiteIdx = 0;
    const testsByFile = new Map<string, string[]>();

    if (suites.length > 0) {
      suites.forEach((suite, si) => {
        const fileTests = tests.slice(si * 3, si * 3 + 3);
        testsByFile.set(suite, fileTests);
      });
    } else {
      testsByFile.set(analysis.projectName ?? "tests", tests);
    }

    for (const [suite, sTests] of testsByFile.entries()) {
      lines.push({ id: `suite-${suiteIdx++}`, type: "suite", text: suite });
      sTests.forEach((test, i) => {
        const pass = seededRandom((suiteIdx * 100 + i) * 137) > 0.12;
        const dur = Math.round(seededRandom(suiteIdx * 100 + i) * 15 + 1);
        lines.push({ id: `t-${suiteIdx}-${i}`, type: pass ? "pass" : "fail", text: test, duration: dur });
      });
    }

    const passed = lines.filter(l => l.type === "pass").length;
    const failed = lines.filter(l => l.type === "fail").length;
    const totalDur = lines.filter(l => l.type === "pass" || l.type === "fail").reduce((s, l) => s + (l.duration ?? 0), 0);

    lines.push({ id: "sep", type: "log", text: "" });
    lines.push({
      id: "sum", type: "summary",
      text: framework === "mocha"
        ? `  ${passed} passing (${totalDur}ms)${failed > 0 ? `\n  ${failed} failing` : ""}`
        : `Tests: ${failed > 0 ? `${failed} failed, ` : ""}${passed} passed, ${passed + failed} total\nTime: ${(totalDur / 1000).toFixed(2)}s`,
    });
  }

  return lines;
}

export function TestRunnerSimulator({ testOutput, analysis, framework }: TestRunnerSimulatorProps) {
  const [running, setRunning] = useState(false);
  const [visibleLines, setVisibleLines] = useState<TestLine[]>([]);
  const [finished, setFinished] = useState(false);
  const [allLines, setAllLines] = useState<TestLine[]>([]);
  const termRef = useRef<HTMLDivElement>(null);

  const run = () => {
    const lines = buildTestLines(testOutput, analysis, framework);
    setAllLines(lines);
    setVisibleLines([]);
    setRunning(true);
    setFinished(false);
  };

  useEffect(() => {
    if (!running || allLines.length === 0) return;
    let idx = 0;
    const interval = setInterval(() => {
      if (idx >= allLines.length) {
        setRunning(false);
        setFinished(true);
        clearInterval(interval);
        return;
      }
      setVisibleLines(prev => [...prev, allLines[idx]]);
      idx++;
      termRef.current?.scrollTo({ top: termRef.current.scrollHeight, behavior: "smooth" });
    }, 60);
    return () => clearInterval(interval);
  }, [running, allLines]);

  const passed = visibleLines.filter(l => l.type === "pass").length;
  const failed = visibleLines.filter(l => l.type === "fail").length;
  const allPass = finished && failed === 0;
  const allFail = finished && failed > 0;

  return (
    <div className="space-y-4">
      {/* Terminal header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${running ? "bg-[#f59e0b] animate-pulse" : allPass ? "bg-[#00ff9d]" : allFail ? "bg-[#ef4444]" : "bg-white/20"}`} />
          <span className="text-white/60 text-xs font-mono">{FRAMEWORK_BANNER[framework]}</span>
        </div>
        <button onClick={run} disabled={running}
          className="px-5 py-2 text-xs bg-[#0d0d14] border border-white/15 hover:border-[#00ff9d]/40 text-white/60 hover:text-[#00ff9d] rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 font-mono">
          {running
            ? <><span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> running...</>
            : <><span className="text-[#00ff9d]">▶</span> {finished ? "Run Again" : "Run Tests"}</>}
        </button>
      </div>

      {/* Terminal */}
      <div className="rounded-xl overflow-hidden border border-white/8 shadow-2xl">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a2e]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28ca41]" />
          </div>
          <span className="text-white/30 text-xs font-mono mx-auto">
            {framework === "pytest" ? "pytest" : framework === "junit" ? "mvn test" : `npx ${framework}`} — terminal
          </span>
          {finished && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${allPass ? "bg-[#00ff9d]/20 text-[#00ff9d]" : "bg-[#ef4444]/20 text-[#ef4444]"}`}>
              {allPass ? "PASS" : "FAIL"}
            </span>
          )}
        </div>

        {/* Output */}
        <div ref={termRef} className="bg-[#0d0d14] h-80 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
          {!running && !finished && (
            <div className="flex items-center gap-2 text-white/25">
              <span className="text-[#00ff9d]">$</span>
              <span className="animate-pulse">npx {framework} --coverage</span>
              <span className="w-2 h-4 bg-white/20 animate-pulse" />
            </div>
          )}

          {visibleLines.map(line => {
            if (line.type === "suite") return (
              <div key={line.id} className="text-white/70 mt-3 mb-1 font-semibold">
                <span className="text-white/30 mr-2">●</span>{line.text}
              </div>
            );
            if (line.type === "pass") return (
              <div key={line.id} className="flex items-center gap-2 pl-4 py-0.5">
                <span className="text-[#00ff9d] text-xs flex-shrink-0">✓</span>
                <span className="text-white/60">{line.text}</span>
                {line.duration !== undefined && (
                  <span className="text-white/20 text-[10px] ml-auto flex-shrink-0">{line.duration}ms</span>
                )}
              </div>
            );
            if (line.type === "fail") return (
              <div key={line.id} className="flex items-center gap-2 pl-4 py-0.5">
                <span className="text-[#ef4444] text-xs flex-shrink-0">✗</span>
                <span className="text-[#ef4444]/80">{line.text}</span>
                {line.duration !== undefined && (
                  <span className="text-[#ef4444]/40 text-[10px] ml-auto flex-shrink-0">{line.duration}ms</span>
                )}
              </div>
            );
            if (line.type === "summary") return (
              <div key={line.id} className="mt-3 pt-3 border-t border-white/8">
                {line.text.split("\n").map((t, i) => (
                  <p key={i} className={`text-xs ${t.includes("fail") || t.includes("FAIL") || t.includes("Failure") ? "text-[#ef4444]" : "text-[#00ff9d]"} font-semibold`}>{t}</p>
                ))}
              </div>
            );
            if (line.type === "error") return (
              <div key={line.id} className="text-[#ef4444] font-bold mt-2">{line.text}</div>
            );
            return (
              <div key={line.id} className={`py-0.5 ${line.text === "" ? "h-2" : "text-white/30"}`}>{line.text}</div>
            );
          })}

          {running && (
            <div className="flex items-center gap-1 mt-2">
              {[0,1,2].map(i => (
                <div key={i} className="w-1 h-1 rounded-full bg-[#00ff9d]/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          )}
        </div>

        {/* Status bar */}
        {(running || finished) && (
          <div className="px-4 py-2 bg-[#111118] border-t border-white/8 flex items-center gap-4 text-[10px]">
            <span className="flex items-center gap-1 text-[#00ff9d]"><span>✓</span> {passed} passed</span>
            {failed > 0 && <span className="flex items-center gap-1 text-[#ef4444]"><span>✗</span> {failed} failed</span>}
            <span className="text-white/20 ml-auto">{FRAMEWORK_PASS[framework]} {framework}</span>
          </div>
        )}
      </div>
    </div>
  );
}
