import { useState, useEffect, useRef, useCallback } from "react";
import { AnalysisResult, TestFramework } from "../types";
import { runTests } from "../utils/universalTestRunner";
import { TestSummaryPanel } from "./TestSummaryPanel";

interface TestRunnerSimulatorProps {
  testOutput: string;
  analysis: AnalysisResult;
  framework: TestFramework;
  sourceFiles?: Record<string, string>;
}

const FRAMEWORK_BANNER: Record<TestFramework, string> = {
  jest: "JEST  v29.7.0",
  vitest: "VITEST v1.6.0",
  mocha: "MOCHA v10.4.0",
  pytest: "pytest v8.2.0",
  junit: "JUnit 5 v1.10.2",
  rspec: "RSpec v3.13.0",
  "react-testing-library": "RTL v16.3.0",
  supertest: "Supertest v7.0.0",
  cypress: "Cypress v13.10.0",
};

const FRAMEWORK_ENGINE: Record<TestFramework, "webcontainer" | "judge0" | "unsupported"> = {
  jest: "webcontainer",
  vitest: "webcontainer",
  mocha: "webcontainer",
  "react-testing-library": "webcontainer",
  supertest: "webcontainer",
  pytest: "judge0",
  junit: "judge0",
  rspec: "judge0",
  cypress: "unsupported",
};

const ENGINE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  webcontainer: { label: "WebContainers", color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
  judge0: { label: "Judge0 API", color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  unsupported: { label: "Not Supported", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function getLineStyle(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('✅') || t.includes('passed') || t.includes('pass') || t.includes('✓'))
    return 'text-[#00ff9d]';
  if (t.includes('❌') || t.includes('fail') || t.includes('✗') || t.includes('error'))
    return 'text-[#f87171]';
  if (t.includes('warn') || t.includes('⚠️'))
    return 'text-[#fbbf24]';
  if (t.includes('🚀') || t.includes('📦') || t.includes('⏳') || t.includes('📡') || t.includes('🧪') || t.includes('🔬'))
    return 'text-[#38bdf8]';
  if (t.startsWith('═') || t.startsWith('─'))
    return 'text-white/20';
  if (t.includes('running') || t.includes('booting') || t.includes('installing'))
    return 'text-[#a78bfa]';
  return 'text-white/65';
}

export function TestRunnerSimulator({
  testOutput,
  analysis,
  framework,
  sourceFiles = {},
}: TestRunnerSimulatorProps) {
  const [status, setStatus] = useState<"idle" | "running" | "pass" | "fail">("idle");
  const [termLines, setTermLines] = useState<string[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const termRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const abortRef = useRef(false);
  const [showSummary, setShowSummary] = useState(false);

  // ✅ Persistent store: last successful run ka result hamesha yahan rehta hai
  const [persistedRunnerLines, setPersistedRunnerLines] = useState<string[]>([]);
  const [persistedStatus, setPersistedStatus] = useState<"pass" | "fail" | null>(null);

  const engine = FRAMEWORK_ENGINE[framework] ?? "unsupported";
  const badge = ENGINE_BADGE[engine];

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTo({ top: termRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [termLines]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const appendOutput = useCallback((chunk: string) => {
    if (abortRef.current) return;
    const lines = stripAnsi(chunk).split('\n');
    setTermLines(prev => {
      const next = [...prev];
      if (lines.length > 0) {
        lines.forEach((line, i) => {
          if (i === 0 && next.length > 0 && !next[next.length - 1].endsWith('\n')) {
            next[next.length - 1] += line;
          } else {
            next.push(line);
          }
        });
      }
      return next.slice(-500);
    });
  }, []);

  const handleRun = async () => {
    if (status === "running") return;

    abortRef.current = false;
    setStatus("running");
    setTermLines([]);
    setElapsedMs(0);

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);

    try {
      const result = await runTests(
        framework,
        testOutput,
        sourceFiles,
        appendOutput
      );
      setStatus(result);
      setShowSummary(true);

      // ✅ Run complete hone ke baad lines ko persist kar do
      // termLines ka latest snapshot lene ke liye functional update use karo
      setTermLines(currentLines => {
        setPersistedRunnerLines(currentLines);
        setPersistedStatus(result);
        return currentLines; // unchanged
      });

    } catch (e: any) {
      appendOutput(`\n❌ Unexpected error: ${e.message}\n`);
      setStatus("fail");
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedMs(Date.now() - startTimeRef.current);
    }
  };

  const handleClear = () => {
    setTermLines([]);
    setStatus("idle");
    setShowSummary(false);
    // ✅ Note: persistedRunnerLines clear NAHI karte
    //    taaki summary tab mein data bana rahe
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const statusDotColor = {
    idle: "bg-white/20",
    running: "bg-[#fbbf24] animate-pulse",
    pass: "bg-[#00ff9d]",
    fail: "bg-[#f87171]",
  }[status];

  const totalLines = termLines.length;
  const passedCount = termLines.filter(l => /✓|✅|passed|PASSED/.test(l)).length;
  const failedCount = termLines.filter(l => /✗|❌|failed|FAILED|FAIL/.test(l)).length;

  return (
    <div className="space-y-3">

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDotColor}`} />
          <span className="text-white/50 text-xs font-mono tracking-widest">
            {FRAMEWORK_BANNER[framework]}
          </span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium border"
            style={{
              color: badge.color,
              backgroundColor: badge.bg,
              borderColor: badge.color + '40',
            }}
          >
            {badge.label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {termLines.length > 0 && (
            <button
              onClick={handleClear}
              className="px-3 py-1.5 text-xs border border-white/10 text-white/30 hover:text-white/60 rounded-lg transition-all font-mono"
            >
              clear
            </button>
          )}
          <button
            onClick={handleRun}
            disabled={status === "running" || engine === "unsupported"}
            className="px-5 py-2 text-xs bg-[#0d0d14] border border-white/15 hover:border-[#00ff9d]/40 text-white/60 hover:text-[#00ff9d] rounded-lg transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed font-mono"
          >
            {status === "running" ? (
              <>
                <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                running...
              </>
            ) : (
              <>
                <span className="text-[#00ff9d]">▶</span>
                {status === "idle" ? "Run Tests" : "Run Again"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Terminal window ──────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden border border-white/8 shadow-2xl">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a2e] border-b border-white/5">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28ca41]" />
          </div>
          <span className="text-white/25 text-xs font-mono mx-auto">
            {framework === "pytest" ? "pytest --tb=short" :
              framework === "junit" ? "mvn test" :
                framework === "rspec" ? "rspec --format documentation" :
                  framework === "cypress" ? "cypress run" :
                    `npx ${framework}`} — terminal
          </span>
          {(status === "pass" || status === "fail") && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
              style={{
                color: status === "pass" ? "#00ff9d" : "#f87171",
                backgroundColor: status === "pass" ? "rgba(0,255,157,0.15)" : "rgba(248,113,113,0.15)",
              }}
            >
              {status === "pass" ? "PASS" : "FAIL"}
            </span>
          )}
        </div>

        <div
          ref={termRef}
          className="bg-[#080810] h-96 overflow-y-auto p-4 font-mono text-xs leading-5 scroll-smooth"
        >
          {status === "idle" && termLines.length === 0 && (
            <div className="flex items-center gap-2 text-white/20">
              <span className="text-[#00ff9d]">$</span>
              <span>
                {framework === "pytest" ? "pytest --tb=short -v" :
                  framework === "junit" ? "mvn test" :
                    framework === "rspec" ? "rspec --format d" :
                      `npx ${framework} --coverage`}
              </span>
              <span className="w-2 h-4 bg-white/15 animate-pulse" />
            </div>
          )}

          {engine === "unsupported" && status === "idle" && (
            <div className="mt-4 p-4 border border-[#f87171]/20 bg-[#f87171]/5 rounded-lg text-[#f87171]/80 text-xs leading-6">
              <p className="font-bold mb-1">⚠️ {framework} requires a real browser + server</p>
              <p className="text-white/40">Cypress E2E tests cannot run without a backend.</p>
              <p className="text-white/40 mt-1">Consider: React Testing Library for component tests.</p>
            </div>
          )}

          {termLines.map((line, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-all leading-5 min-h-[1.25rem] ${getLineStyle(line)}`}
            >
              {line || '\u00A0'}
            </div>
          ))}

          {status === "running" && (
            <div className="flex items-center gap-1.5 mt-2 py-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[#00ff9d]/50 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 bg-[#0d0d14] border-t border-white/6 flex items-center gap-4 text-[10px] font-mono">
          {passedCount > 0 && (
            <span className="flex items-center gap-1 text-[#00ff9d]">
              <span>✓</span> {passedCount} passed
            </span>
          )}
          {failedCount > 0 && (
            <span className="flex items-center gap-1 text-[#f87171]">
              <span>✗</span> {failedCount} failed
            </span>
          )}
          {totalLines === 0 && status === "idle" && (
            <span className="text-white/20">no output yet</span>
          )}
          {(status === "running" || status === "pass" || status === "fail") && (
            <span className="text-white/25 ml-auto">{formatTime(elapsedMs)}</span>
          )}
          <span className="text-white/15 ml-auto">{badge.label}</span>
        </div>
      </div>

      {/* ── Setup hint ──────────────────────────────────────── */}
      {status === "idle" && engine !== "unsupported" && (
        <div className="text-[10px] text-white/25 font-mono px-1 space-y-0.5">
          {engine === "webcontainer" ? (
            <>
              <p>Runs inside WebContainers (Node.js WASM) — no backend needed.</p>
              <p>
                Requires Vite headers:{" "}
                <span className="text-white/40">Cross-Origin-Embedder-Policy: require-corp</span>
              </p>
            </>
          ) : (
            <>
              <p>Runs via Judge0 API — requires a free RapidAPI key.</p>
              <p>
                Set <span className="text-white/40">JUDGE0_KEY</span> in{" "}
                <span className="text-white/40">utils/universalTestRunner.ts</span>
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Summary panel ───────────────────────────────────── */}
      {/*
        ✅ Ab summary tab ko persisted lines milti hain, runner tab se independent.
        - showSummary: pehli baar run ke baad true hota hai
        - persistedRunnerLines: last run ka poora output store rehta hai
        - persistedStatus: last run pass/fail status badge ke liye
        - "clear" se terminal saaf hota hai, lekin summary data nahi jaata
      */}
      {showSummary && persistedStatus !== null && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-white/30 text-md tracking-widest uppercase">Summary</p>
            {/* ✅ Last run ka status badge hamesha dikhta hai */}
            <span
              className="text-[10px] px-2.5 py-1 rounded-full font-bold border"
              style={{
                color: persistedStatus === "pass" ? "#00ff9d" : "#f87171",
                backgroundColor: persistedStatus === "pass" ? "rgba(0,255,157,0.1)" : "rgba(248,113,113,0.1)",
                borderColor: persistedStatus === "pass" ? "rgba(0,255,157,0.3)" : "rgba(248,113,113,0.3)",
              }}
            >
              Last run: {persistedStatus === "pass" ? "PASSED" : "FAILED"}
            </span>
          </div>
          <TestSummaryPanel
            testOutput={testOutput}
            analysis={analysis}
            framework={framework}
            runnerLines={persistedRunnerLines}  // ✅ Persisted lines use ho rahi hain
          />
        </div>
      )}

    </div>
  );
}