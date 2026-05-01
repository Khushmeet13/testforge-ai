// utils/exportSummaryPDF.ts
// Drop-in replacement — uses jsPDF only, no canvas/html2canvas needed.
// npm install jspdf  (if not already installed)

import jsPDF from "jspdf";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedTest {
  name: string;
  type: "unit" | "api" | "edge";
  description?: string;
  result?: "pass" | "fail" | "unknown";
  errorMessage?: string;
}

export interface ExportOptions {
  fileName: string;
  framework: string;
  tests: ParsedTest[];
  passedCount: number;
  failedCount: number;
  totalTests: number;
  projectSummary: string;
  edgeCount: number;
  /** Raw Jest/Vitest/etc test source code — shown on last page */
  testSourceCode?: string;
}

// ─── Palette ──────────────────────────────────────────────────────────────────

type RGB = [number, number, number];

const C = {
  bg:       [8,  8,  18]  as RGB,
  surface:  [16, 16, 32]  as RGB,
  card:     [22, 22, 42]  as RGB,
  border:   [38, 38, 65]  as RGB,
  white:    [255,255,255] as RGB,
  muted:    [130,130,160] as RGB,
  dim:      [70, 70, 100] as RGB,

  pass:     [29, 198, 120]  as RGB,
  passDim:  [20, 80,  55]   as RGB,
  fail:     [248,100,100]   as RGB,
  failDim:  [90, 30,  30]   as RGB,
  skip:     [100,100,130]   as RGB,

  purple:   [140, 80, 255]  as RGB,
  purpleDim:[50,  25, 100]  as RGB,
  blue:     [56, 150, 240]  as RGB,
  amber:    [240,160,  40]  as RGB,
  teal:     [30, 200, 180]  as RGB,

  unit:     [29, 198, 120]  as RGB,
  api:      [56, 150, 240]  as RGB,
  edge:     [240,160,  40]  as RGB,

  codeKw:   [200,140,255]   as RGB,  // keywords
  codeStr:  [150,220,130]   as RGB,  // strings
  codeCmt:  [90, 110, 130]  as RGB,  // comments
  codeFn:   [100,180,255]   as RGB,  // functions
  codeNum:  [240,180,100]   as RGB,  // numbers
  codePunc: [180,180,200]   as RGB,  // punctuation / default
} as const;

// ─── Main export function ─────────────────────────────────────────────────────

export function exportSummaryPDF(opts: ExportOptions): void {
  const {
    fileName, framework, tests,
    passedCount, failedCount, totalTests,
    projectSummary, edgeCount,
    testSourceCode = "",
  } = opts;

  const doc  = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const PW   = doc.internal.pageSize.getWidth();   // 595
  const PH   = doc.internal.pageSize.getHeight();  // 842
  const M    = 36;       // margin
  const CW   = PW - M * 2; // content width = 523

  // ── Page state ────────────────────────────────────────────────────────────
  let currentPage = 1;
  let y = M;

  const addPage = () => {
    doc.addPage();
    currentPage++;
    fillBg();
    drawPageDecor();
    y = M + 10;
  };

  const guard = (needed: number) => {
    if (y + needed > PH - M - 20) addPage();
  };

  // ── Low-level drawing helpers ─────────────────────────────────────────────

  const fillBg = () => {
    doc.setFillColor(...C.bg);
    doc.rect(0, 0, PW, PH, "F");
  };

  /** Subtle grid dots watermark */
  const drawPageDecor = () => {
    doc.setFillColor(30, 30, 55);
    for (let gx = M; gx <= PW - M; gx += 24) {
      for (let gy = M; gy <= PH - M; gy += 24) {
        doc.circle(gx, gy, 0.6, "F");
      }
    }
  };

  const setFont = (size: number, style: "normal"|"bold" = "normal", color: RGB = C.white) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    doc.setTextColor(...color);
  };

  const txt = (
    s: string, x: number, yy: number,
    size = 10, style: "normal"|"bold" = "normal",
    color: RGB = C.white,
    align: "left"|"center"|"right" = "left"
  ) => {
    setFont(size, style, color);
    doc.text(s, x, yy, { align });
  };

  const roundRect = (
    x: number, yy: number, w: number, h: number,
    r = 6,
    fill?: RGB, stroke?: RGB, sw = 0.5
  ) => {
    if (fill)   { doc.setFillColor(...fill);   }
    if (stroke) { doc.setDrawColor(...stroke); doc.setLineWidth(sw); }
    const mode = fill && stroke ? "FD" : fill ? "F" : "D";
    doc.roundedRect(x, yy, w, h, r, r, mode);
  };

  const hLine = (yy: number, color: RGB = C.border, w = 0.5) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(w);
    doc.line(M, yy, PW - M, yy);
  };

  // ── Donut chart (drawn with arc approximation via bezier) ─────────────────
  /**
   * jsPDF doesn't natively support arcs as filled slices,
   * so we approximate each slice as a pie using polygon points on a circle.
   */
  const drawDonut = (
    cx: number, cy: number, R: number, r: number,
    slices: { value: number; color: RGB; label: string }[]
  ) => {
    const total = slices.reduce((a, s) => a + s.value, 0);
    if (total === 0) return;

    let startAngle = -Math.PI / 2;

    slices.forEach((slice) => {
      if (slice.value === 0) return;
      const sweep = (slice.value / total) * Math.PI * 2;
      const endAngle = startAngle + sweep;
      const steps = Math.max(24, Math.ceil((sweep / Math.PI) * 40));

      // Outer arc points
      const outer: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const a = startAngle + (sweep * i) / steps;
        outer.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
      }
      // Inner arc points (reversed)
      const inner: [number, number][] = [];
      for (let i = steps; i >= 0; i--) {
        const a = startAngle + (sweep * i) / steps;
        inner.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }

      const pts = [...outer, ...inner];
      doc.setFillColor(...slice.color);
      // draw as filled polygon
      (doc as any).polygon(pts.map(([px, py]) => ({ x: px, y: py })), "F");

      startAngle = endAngle;
    });

    // Center hole fill
    doc.setFillColor(...C.surface);
    (doc as any).circle
      ? doc.circle(cx, cy, r - 1, "F")
      : (() => {
          // fallback: filled circle via roundedRect approximation
          doc.setFillColor(...C.surface);
          doc.circle(cx, cy, r - 1, "F");
        })();
  };

  /**
   * Fallback donut using pie wedges drawn as polygon arrays.
   * jsPDF's doc.lines / doc.path work on internal state,
   * so we use a small helper that draws via moveTo + arc trick.
   */
  const drawDonutSafe = (
    cx: number, cy: number, outerR: number, innerR: number,
    slices: { value: number; color: RGB; label: string }[]
  ) => {
    const total = slices.reduce((a, s) => a + s.value, 0);
    if (total === 0) return;

    let startDeg = -90;

    slices.forEach((slice) => {
      if (slice.value === 0) return;
      const sweepDeg = (slice.value / total) * 360;
      const endDeg = startDeg + sweepDeg;
      const steps = Math.max(20, Math.ceil(sweepDeg / 3));

      const toRad = (d: number) => (d * Math.PI) / 180;

      // Build polygon: outer arc forward + inner arc backward
      const pts: number[] = [];
      for (let i = 0; i <= steps; i++) {
        const a = toRad(startDeg + (sweepDeg * i) / steps);
        pts.push(cx + outerR * Math.cos(a), cy + outerR * Math.sin(a));
      }
      for (let i = steps; i >= 0; i--) {
        const a = toRad(startDeg + (sweepDeg * i) / steps);
        pts.push(cx + innerR * Math.cos(a), cy + innerR * Math.sin(a));
      }

      doc.setFillColor(...slice.color);
      // jsPDF lines() draws a polyline — we close+fill manually
      const first = [pts[0], pts[1]];
      const rest: [number, number, number, number, number, number][] = [];
      for (let i = 2; i < pts.length - 1; i += 2) {
        const x1 = pts[i], y1 = pts[i + 1];
        rest.push([x1 - pts[i - 2], y1 - pts[i - 1], 0, 0, 0, 0]);
      }
      doc.lines(rest, first[0], first[1], [1, 1], "F", true);

      startDeg = endDeg;
    });

    // Punch inner hole
    doc.setFillColor(...C.surface);
    doc.circle(cx, cy, innerR - 0.5, "F");
  };

  // ── Horizontal bar chart ──────────────────────────────────────────────────
  const drawBarChart = (
    x: number, yy: number, w: number,
    bars: { label: string; value: number; max: number; color: RGB }[],
    barH = 14, gap = 10
  ) => {
    bars.forEach((bar, i) => {
      const by = yy + i * (barH + gap);
      const pct = bar.max > 0 ? bar.value / bar.max : 0;

      // Track
      roundRect(x + 80, by, w - 80, barH, 3, C.surface, C.border, 0.3);
      // Fill
      if (pct > 0) {
        roundRect(x + 80, by, Math.max(6, (w - 80) * pct), barH, 3, bar.color);
      }
      // Label
      txt(bar.label, x, by + barH / 2 + 3.5, 8, "normal", C.muted);
      // Value
      txt(String(bar.value), x + 80 + (w - 80) * pct + 6, by + barH / 2 + 3.5, 8, "bold", bar.color);
    });
  };

  // ── Mini sparkline (fake trend line) ─────────────────────────────────────
  const drawSparkline = (
    x: number, yy: number, w: number, h: number,
    points: number[], color: RGB
  ) => {
    if (points.length < 2) return;
    const max = Math.max(...points, 1);
    const step = w / (points.length - 1);

    const coords: [number, number][] = points.map((v, i) => [
      x + i * step,
      yy + h - (v / max) * h,
    ]);

    // Fill area under curve
    doc.setFillColor(...color, 0.08 as any);
    const areaLines: [number, number, number, number, number, number][] = [];
    for (let i = 1; i < coords.length; i++) {
      areaLines.push([coords[i][0] - coords[i-1][0], coords[i][1] - coords[i-1][1], 0,0,0,0]);
    }
    // close to bottom
    areaLines.push([0, h - (coords[coords.length-1][1] - yy), 0,0,0,0]);
    areaLines.push([-(w), 0, 0,0,0,0]);

    doc.setFillColor(...color);
    doc.setDrawColor(...color);
    doc.setLineWidth(1.2);

    // Draw stroke line
    for (let i = 1; i < coords.length; i++) {
      doc.line(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
    }

    // Dots at each point
    coords.forEach(([px, py]) => {
      doc.setFillColor(...color);
      doc.circle(px, py, 2, "F");
    });
  };

  // ── Code block with syntax colouring ─────────────────────────────────────
  /**
   * Very lightweight tokeniser for Jest/JS/TS:
   * We split each line into coloured segments and render them.
   */
  type Segment = { text: string; color: RGB };

  const tokeniseLine = (line: string): Segment[] => {
    const segs: Segment[] = [];

    // Comment
    const cmtIdx = line.indexOf("//");
    if (cmtIdx !== -1) {
      const before = line.slice(0, cmtIdx);
      const after  = line.slice(cmtIdx);
      segs.push(...tokeniseLine(before));
      segs.push({ text: after, color: C.codeCmt });
      return segs;
    }

    // Tokenise word by word (simple)
    const KEYWORDS = new Set([
      "const","let","var","function","return","import","export","default",
      "from","if","else","for","while","class","extends","new","this",
      "async","await","try","catch","throw","typeof","instanceof",
      "describe","it","test","expect","beforeEach","afterEach",
      "beforeAll","afterAll","jest","vi",
    ]);
    const MATCHERS = new Set([
      "toBe","toEqual","toStrictEqual","toContain","toHaveLength",
      "toBeTruthy","toBeFalsy","toBeNull","toBeUndefined","toBeGreaterThan",
      "toBeLessThan","toThrow","toHaveBeenCalled","toMatchObject","resolves","rejects","not",
    ]);

    // Split preserving delimiters
    const tokens = line.split(/(\s+|[(){}[\],;.<>=!+\-*/%&|^~?:"`]|'[^']*'|"[^"]*"|`[^`]*`)/);

    tokens.forEach((tok) => {
      if (!tok) return;
      if (/^(['"`]).*\1$/.test(tok) || /^`/.test(tok)) {
        segs.push({ text: tok, color: C.codeStr });
      } else if (KEYWORDS.has(tok)) {
        segs.push({ text: tok, color: C.codeKw });
      } else if (MATCHERS.has(tok)) {
        segs.push({ text: tok, color: C.teal });
      } else if (/^\d+(\.\d+)?$/.test(tok)) {
        segs.push({ text: tok, color: C.codeNum });
      } else if (/^[A-Z][a-zA-Z0-9]*$/.test(tok)) {
        segs.push({ text: tok, color: C.blue });
      } else if (/^[a-z][a-zA-Z0-9]*\s*\(/.test(tok) || /^[a-z][a-zA-Z0-9]*$/.test(tok)) {
        segs.push({ text: tok, color: C.codeFn });
      } else {
        segs.push({ text: tok, color: C.codePunc });
      }
    });

    return segs;
  };

  const drawCodeBlock = (
    x: number, yStart: number, w: number,
    code: string,
    maxLines = 60
  ): number => {
    const lines = code.split("\n").slice(0, maxLines);
    const lineH = 11;
    const padV  = 10;
    const padH  = 14;
    const totalH = lines.length * lineH + padV * 2;

    // Background
    roundRect(x, yStart, w, totalH, 6, C.surface, C.border, 0.4);
    // Left accent stripe
    roundRect(x, yStart, 3, totalH, 1.5, C.purple);

    // Line numbers + code
    lines.forEach((line, i) => {
      const ly = yStart + padV + i * lineH + 7.5;
      const trimmed = line.replace(/\t/g, "  ");

      // Line number
      txt(String(i + 1), x + padH, ly, 7, "normal", C.dim);

      // Code with syntax colouring
      const segs = tokeniseLine(trimmed);
      let curX = x + padH + 22;

      segs.forEach((seg) => {
        doc.setFontSize(7.5);
        doc.setFont("courier", "normal");
        doc.setTextColor(...seg.color);
        doc.text(seg.text, curX, ly);
        curX += doc.getStringUnitWidth(seg.text) * 7.5 * 0.6;
      });
    });

    if (code.split("\n").length > maxLines) {
      const moreY = yStart + totalH - 6;
      txt(`… ${code.split("\n").length - maxLines} more lines`, x + padH, moreY, 7, "normal", C.dim);
    }

    return totalH;
  };

  // ── Section header ────────────────────────────────────────────────────────
  const sectionHeader = (label: string, icon: string) => {
    guard(30);
    txt(`${icon}  ${label.toUpperCase()}`, M, y + 10, 8, "bold", C.muted);
    hLine(y + 16, C.border, 0.4);
    y += 24;
  };

  // ── Stat tile ─────────────────────────────────────────────────────────────
  const statTile = (
    x: number, yy: number, w: number, h: number,
    value: string, label: string, accent: RGB
  ) => {
    roundRect(x, yy, w, h, 8, C.card, C.border, 0.5);
    // Top accent line
    roundRect(x, yy, w, 2.5, 1, accent);
    txt(value, x + w / 2, yy + h / 2 - 2, 18, "bold", accent, "center");
    txt(label,  x + w / 2, yy + h / 2 + 11, 7.5, "normal", C.muted, "center");
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Cover / Analytics Dashboard
  // ═══════════════════════════════════════════════════════════════════════════

  fillBg();
  drawPageDecor();

  // ── Hero gradient bar ──────────────────────────────────────────────────────
  // Simulate gradient with layered rects
  const barColors: RGB[] = [C.purple, [120,60,240], [100,50,220], [80,40,200]];
  barColors.forEach((bc, i) => {
    doc.setFillColor(...bc, (0.9 - i * 0.15) as any);
    doc.rect(0, 0, PW * (1 - i * 0.05), 5, "F");
  });
  doc.setFillColor(...C.purple);
  doc.rect(0, 0, PW, 4, "F");

  y = 38;

  // ── Logo / brand chip ────────────────────────────────────────────────────
  roundRect(M, y, 90, 18, 9, C.purpleDim, C.purple, 0.6);
  txt("TEST ANALYTICS", M + 45, y + 12, 6.5, "bold", C.purple, "center");

  // Framework badge (right)
  roundRect(PW - M - 80, y, 80, 18, 9, C.surface, C.border, 0.5);
  txt(framework.toUpperCase(), PW - M - 40, y + 12, 7, "bold", C.blue, "center");

  y += 30;

  // ── Title block ───────────────────────────────────────────────────────────
  txt("Test Summary Report", M, y + 16, 24, "bold", C.white);
  y += 24;
  txt(fileName, M, y + 12, 10, "normal", C.muted);
  y += 12;
  txt(new Date().toLocaleString("en-IN", {
    dateStyle: "long", timeStyle: "short"
  }), M, y + 12, 9, "normal", C.dim);
  y += 26;

  hLine(y, C.border);
  y += 20;

  // ── 4 stat tiles ─────────────────────────────────────────────────────────
  const tileW = (CW - 9) / 4;
  const tileH = 64;
  const passRate = (passedCount + failedCount) > 0
    ? Math.round((passedCount / (passedCount + failedCount)) * 100) : 0;

  [
    { v: String(totalTests),   l: "Total Tests",   a: C.purple },
    { v: String(passedCount),  l: "Passed",         a: C.pass   },
    { v: String(failedCount),  l: "Failed",         a: C.fail   },
    { v: `${passRate}%`,       l: "Pass Rate",      a: passRate >= 80 ? C.teal : C.amber },
  ].forEach((s, i) => {
    statTile(M + i * (tileW + 3), y, tileW, tileH, s.v, s.l, s.a);
  });
  y += tileH + 18;

  // ── Analytics row: Donut + Bar chart side by side ─────────────────────────
  const chartRowH = 160;
  const donutPanelW = 200;
  const barPanelW   = CW - donutPanelW - 12;

  // Donut panel bg
  roundRect(M, y, donutPanelW, chartRowH, 8, C.card, C.border, 0.5);
  txt("Result Distribution", M + donutPanelW / 2, y + 16, 8, "bold", C.muted, "center");

  const donutSlices = [
    { value: passedCount, color: C.pass,  label: "Passed" },
    { value: failedCount, color: C.fail,  label: "Failed" },
    { value: Math.max(0, totalTests - passedCount - failedCount), color: C.skip, label: "Unknown" },
  ].filter(s => s.value > 0);

  const dcx = M + donutPanelW / 2;
  const dcy = y + chartRowH / 2 + 8;
  drawDonutSafe(dcx, dcy, 52, 30, donutSlices);

  // Center label inside donut
  txt(`${passRate}%`, dcx, dcy + 4, 13, "bold",
    passRate >= 80 ? C.pass : passRate >= 50 ? C.amber : C.fail, "center");
  txt("pass rate", dcx, dcy + 14, 7, "normal", C.muted, "center");

  // Donut legend (bottom of donut panel)
  const legendY = y + chartRowH - 24;
  donutSlices.forEach((s, i) => {
    const lx = M + 14 + i * 60;
    doc.setFillColor(...s.color);
    doc.circle(lx + 4, legendY + 4, 3, "F");
    txt(`${s.label} (${s.value})`, lx + 10, legendY + 7, 7, "normal", C.muted);
  });

  // Bar chart panel
  const bpx = M + donutPanelW + 12;
  roundRect(bpx, y, barPanelW, chartRowH, 8, C.card, C.border, 0.5);
  txt("Coverage by Category", bpx + 12, y + 16, 8, "bold", C.muted);

  const unitCount = tests.filter(t => t.type === "unit").length;
  const apiCount  = tests.filter(t => t.type === "api").length;
  const edgeCnt   = tests.filter(t => t.type === "edge").length;
  const maxCat    = Math.max(unitCount, apiCount, edgeCnt, 1);

  drawBarChart(
    bpx + 10, y + 30, barPanelW - 20,
    [
      { label: "Unit",      value: unitCount, max: maxCat, color: C.unit },
      { label: "API",       value: apiCount,  max: maxCat, color: C.api  },
      { label: "Edge case", value: edgeCnt,   max: maxCat, color: C.edge },
      { label: "Passed",    value: passedCount, max: Math.max(totalTests,1), color: C.pass },
      { label: "Failed",    value: failedCount, max: Math.max(totalTests,1), color: C.fail },
    ],
    16, 8
  );

  y += chartRowH + 16;

  // ── Sparkline (fake trend — "build history") ──────────────────────────────
  roundRect(M, y, CW, 72, 8, C.card, C.border, 0.5);
  txt("Pass trend (simulated build history)", M + 14, y + 16, 8, "bold", C.muted);

  // Generate plausible-looking points ending at current pass rate
  const trend = Array.from({ length: 8 }, (_, i) => {
    const noise = (Math.sin(i * 1.3 + 2) * 15 + Math.cos(i * 0.7) * 10);
    return Math.min(100, Math.max(0, passRate - 20 + (i / 7) * 20 + noise));
  });
  trend[trend.length - 1] = passRate; // anchor last point to real value

  drawSparkline(M + 14, y + 24, CW - 100, 36, trend, C.teal);

  // Latest value callout
  txt(`Latest: ${passRate}%`, PW - M - 60, y + 36, 9, "bold",
    passRate >= 80 ? C.pass : passRate >= 50 ? C.amber : C.fail);
  txt("Current run", PW - M - 60, y + 48, 7, "normal", C.muted);

  y += 90;

  // ── Project summary ───────────────────────────────────────────────────────
  roundRect(M, y, CW, 52, 8, C.card, C.border, 0.5);
  // Purple left bar
  roundRect(M, y, 3, 52, 1, C.purple);
  txt("Project scope", M + 14, y + 16, 8, "bold", C.muted);
  const sumLines = doc.splitTextToSize(projectSummary, CW - 28);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.white);
  doc.text(sumLines.slice(0, 2), M + 14, y + 30);
  y += 66;

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — Test Cases Detail
  // ═══════════════════════════════════════════════════════════════════════════

  addPage();
  sectionHeader("Test Cases Detail", "◈");

  // Column headers
  const colX = { status: M, name: M + 22, type: M + 260, result: M + 340 };
  txt("Status", colX.status, y, 7.5, "bold", C.dim);
  txt("Test Name",  colX.name,   y, 7.5, "bold", C.dim);
  txt("Type",       colX.type,   y, 7.5, "bold", C.dim);
  txt("Result",     colX.result, y, 7.5, "bold", C.dim);
  y += 5;
  hLine(y, C.border, 0.3);
  y += 10;

  tests.forEach((t, idx) => {
    const result = t.result ?? "unknown";
    const hasErr = result === "fail" && !!t.errorMessage;
    const rowH   = hasErr ? 48 : 30;

    guard(rowH + 6);

    // Zebra stripe
    if (idx % 2 === 0) {
      roundRect(M, y, CW, rowH, 4, [18, 18, 36]);
    }

    // Status dot
    const dotColor = result === "pass" ? C.pass : result === "fail" ? C.fail : C.skip;
    doc.setFillColor(...dotColor);
    doc.circle(colX.status + 5, y + rowH / 2, 3.5, "F");

    // Test index
    txt(`${idx + 1}.`, colX.name - 10, y + rowH / 2 + 3.5, 7, "normal", C.dim);

    // Test name (truncate)
    let name = t.name;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    while (doc.getStringUnitWidth(name) * 9 * 0.6 > 220 && name.length > 8) {
      name = name.slice(0, -4) + "…";
    }
    txt(name, colX.name, y + 13, 9, "bold", C.white);

    // Description (small)
    if (t.description) {
      const desc = doc.splitTextToSize(t.description, 220)[0];
      txt(desc, colX.name, y + 24, 7, "normal", C.muted);
    }

    // Type badge
    const typeColor = t.type === "unit" ? C.unit : t.type === "api" ? C.api : C.edge;
    const typeLabel = t.type === "edge" ? "edge" : t.type;
    roundRect(colX.type, y + rowH / 2 - 7, 42, 14, 7, [...typeColor, 0.15] as any);
    doc.setDrawColor(...typeColor, 0.4 as any);
    doc.setLineWidth(0.4);
    doc.roundedRect(colX.type, y + rowH / 2 - 7, 42, 14, 7, 7, "D");
    txt(typeLabel, colX.type + 21, y + rowH / 2 + 3.5, 7, "bold", typeColor, "center");

    // Result badge
    const rLabel = result === "pass" ? "PASS" : result === "fail" ? "FAIL" : "—";
    const rColor = result === "pass" ? C.pass : result === "fail" ? C.fail : C.dim;
    roundRect(colX.result, y + rowH / 2 - 7, 36, 14, 7, [...rColor, 0.15] as any);
    txt(rLabel, colX.result + 18, y + rowH / 2 + 3.5, 7, "bold", rColor, "center");

    // Error message
    if (hasErr) {
      const errText = doc.splitTextToSize(`⚠ ${t.errorMessage}`, CW - 30)[0];
      txt(errText, colX.name, y + 36, 7, "normal", C.fail);
    }

    y += rowH + 4;
  });

  if (tests.length === 0) {
    txt("No test cases found.", M, y + 20, 10, "normal", C.muted);
    y += 40;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 3 — Analytics Deep Dive
  // ═══════════════════════════════════════════════════════════════════════════

  addPage();
  sectionHeader("Analytics Deep Dive", "◇");

  // ── Health score card ─────────────────────────────────────────────────────
  const healthScore = Math.round(
    passRate * 0.6 +
    (edgeCount / Math.max(totalTests, 1)) * 100 * 0.25 +
    Math.min(totalTests * 2, 100) * 0.15
  );
  const healthLabel = healthScore >= 80 ? "Excellent" : healthScore >= 60 ? "Good" : healthScore >= 40 ? "Fair" : "Needs Work";
  const healthColor = healthScore >= 80 ? C.pass : healthScore >= 60 ? C.teal : healthScore >= 40 ? C.amber : C.fail;

  roundRect(M, y, CW, 76, 8, C.card, C.border, 0.5);
  roundRect(M, y, 3, 76, 1, healthColor);

  // Score circle (simulated with concentric circles)
  const scx = M + 50, scy = y + 38;
  doc.setDrawColor(...C.border);
  doc.setLineWidth(4);
  doc.circle(scx, scy, 26, "D");
  doc.setDrawColor(...healthColor);
  doc.setLineWidth(4);
  // Arc approximation for score
  const scoreAng = (healthScore / 100) * 360;
  const arcSteps = Math.ceil(scoreAng / 6);
  for (let i = 0; i < arcSteps; i++) {
    const a1 = (-90 + (scoreAng * i) / arcSteps) * (Math.PI / 180);
    const a2 = (-90 + (scoreAng * (i + 1)) / arcSteps) * (Math.PI / 180);
    doc.line(
      scx + 26 * Math.cos(a1), scy + 26 * Math.sin(a1),
      scx + 26 * Math.cos(a2), scy + 26 * Math.sin(a2)
    );
  }
  txt(String(healthScore), scx, scy + 5, 14, "bold", healthColor, "center");

  txt("Test Health Score", M + 90, y + 22, 11, "bold", C.white);
  txt(healthLabel, M + 90, y + 38, 9, "normal", healthColor);
  txt(
    `Based on pass rate (60%), edge coverage (25%), and test volume (15%).`,
    M + 90, y + 52, 7.5, "normal", C.muted
  );
  y += 90;

  // ── Segmented progress bar (type breakdown) ───────────────────────────────
  sectionHeader("Test Composition", "◉");
  roundRect(M, y, CW, 44, 8, C.card, C.border, 0.5);
  txt("Types", M + 12, y + 16, 8, "bold", C.muted);

  const typeTotal = unitCount + apiCount + edgeCnt || 1;
  let segX = M + 12;
  const segBarW = CW - 24;
  const segBarY = y + 24;
  const segH = 12;

  [
    { count: unitCount, color: C.unit, label: "Unit" },
    { count: apiCount,  color: C.api,  label: "API" },
    { count: edgeCnt,   color: C.edge, label: "Edge" },
  ].forEach((seg, si) => {
    const segW = (seg.count / typeTotal) * segBarW;
    if (segW > 0) {
      const r = si === 0 ? 4 : si === 2 ? 4 : 0;
      doc.setFillColor(...seg.color);
      doc.roundedRect(segX, segBarY, segW, segH, r, r, "F");
      if (segW > 30) {
        txt(`${seg.label} ${seg.count}`, segX + segW / 2, segBarY + 8.5, 6.5, "bold", C.bg, "center");
      }
      segX += segW;
    }
  });
  y += 58;

  // ── Insights grid ─────────────────────────────────────────────────────────
  sectionHeader("Key Insights", "◆");

  const insights = [
    {
      icon: passedCount === totalTests ? "✓" : failedCount > passedCount ? "✗" : "~",
      title: passedCount === totalTests ? "All tests passing" : failedCount > 0 ? `${failedCount} test${failedCount > 1 ? "s" : ""} need attention` : "Most tests passing",
      body: passedCount === totalTests
        ? "Every single test case is green. Your code is in great shape."
        : `${failedCount} out of ${totalTests} tests are failing. Review the failed cases on page 2.`,
      color: passedCount === totalTests ? C.pass : failedCount > passedCount ? C.fail : C.amber,
    },
    {
      icon: "◈",
      title: `${edgeCount} edge case${edgeCount !== 1 ? "s" : ""} covered`,
      body: edgeCount >= 3
        ? "Good edge coverage — your code is tested against unusual inputs and error conditions."
        : "Consider adding more edge cases to improve robustness and catch boundary errors.",
      color: edgeCount >= 3 ? C.pass : C.amber,
    },
    {
      icon: "◇",
      title: `${framework.toUpperCase()} framework`,
      body: `Tests are written in ${framework}. This is a ${
        ["jest","vitest"].includes(framework) ? "fast, modern" : "reliable"
      } test runner with excellent tooling support.`,
      color: C.blue,
    },
  ];

  const insW = (CW - 8) / 3;
  insights.forEach((ins, i) => {
    const ix = M + i * (insW + 4);
    roundRect(ix, y, insW, 90, 8, C.card, C.border, 0.5);
    roundRect(ix, y, insW, 2.5, 1, ins.color);

    // Icon circle
    doc.setFillColor(...ins.color, 0.15 as any);
    doc.circle(ix + 18, y + 18, 10, "F");
    txt(ins.icon, ix + 18, y + 22, 9, "bold", ins.color, "center");

    txt(ins.title, ix + 10, y + 38, 8, "bold", C.white);
    const bodyLines = doc.splitTextToSize(ins.body, insW - 18);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.muted);
    doc.text(bodyLines.slice(0, 4), ix + 10, y + 50);
  });
  y += 106;

  // ── Why it matters ────────────────────────────────────────────────────────
  guard(60);
  roundRect(M, y, CW, 52, 8, C.purpleDim, C.purple, 0.5);
  roundRect(M, y, 3, 52, 1, C.purple);
  txt("Why automated tests matter", M + 14, y + 16, 9, "bold", C.white);
  const wtm = "These checks run automatically every time your code changes — catching bugs before they reach production, saving time, money, and user trust.";
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.muted);
  doc.text(doc.splitTextToSize(wtm, CW - 28), M + 14, y + 30);
  y += 66;

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 4 — Test Source Code (if provided)
  // ═══════════════════════════════════════════════════════════════════════════

  if (testSourceCode.trim()) {
    addPage();
    sectionHeader("Test Source Code", "{ }");

    // Framework chip
    roundRect(M, y, 70, 16, 8, C.surface, C.purple, 0.5);
    txt(framework.toLowerCase() + ".test", M + 35, y + 11, 7, "bold", C.purple, "center");
    y += 24;

    // Split code into chunks that fit pages
    const codeLines = testSourceCode.split("\n");
    const chunkSize = 45;
    let lineOffset = 0;

    while (lineOffset < codeLines.length) {
      const chunk = codeLines.slice(lineOffset, lineOffset + chunkSize).join("\n");
      const blockH = drawCodeBlock(M, y, CW, chunk, chunkSize);
      y += blockH + 12;
      lineOffset += chunkSize;

      if (lineOffset < codeLines.length) {
        addPage();
        sectionHeader(`Test Source Code (continued)`, "{ }");
        y += 4;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Footer on every page
  // ═══════════════════════════════════════════════════════════════════════════

  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Footer bar
    doc.setFillColor(...C.surface);
    doc.rect(0, PH - 28, PW, 28, "F");
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.4);
    doc.line(0, PH - 28, PW, PH - 28);

    txt("Test Analytics Report", M, PH - 12, 7.5, "normal", C.dim);
    txt(`Page ${p} of ${totalPages}`, PW / 2, PH - 12, 7.5, "normal", C.dim, "center");
    txt(framework.toUpperCase(), PW - M, PH - 12, 7.5, "normal", C.dim, "right");
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const safeName = (fileName || "project").replace(/[^a-z0-9_-]/gi, "_");
  doc.save(`${safeName}-test-report.pdf`);
}