export type Point = { x: number; y: number };
export type Stroke = Point[];

export type DigitGuess = { digit: number; confidence: number };

const MIN_POINTS = 4;
const MIN_PATH_LENGTH = 10;
const AUTO_ACCEPT_CONFIDENCE = 0.62;
const AUTO_ACCEPT_MARGIN = 0.12;

function pathLength(stroke: Stroke): number {
  let len = 0;
  for (let i = 1; i < stroke.length; i++) {
    len += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
  }
  return len;
}

function totalPathLength(strokes: Stroke[]): number {
  return strokes.reduce((sum, s) => sum + pathLength(s), 0);
}

function totalPoints(strokes: Stroke[]): number {
  return strokes.reduce((sum, s) => sum + s.length, 0);
}

function boundsOf(strokes: Stroke[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** Flatten + normalize strokes into unit square [0,1], preserving aspect with letterboxing. */
function normalizePoints(strokes: Stroke[]): Point[] {
  const b = boundsOf(strokes);
  const scale = 1 / Math.max(b.width, b.height);
  const ox = (1 - b.width * scale) / 2;
  const oy = (1 - b.height * scale) / 2;
  const out: Point[] = [];
  for (const stroke of strokes) {
    for (const p of stroke) {
      out.push({
        x: (p.x - b.minX) * scale + ox,
        y: (p.y - b.minY) * scale + oy,
      });
    }
  }
  return out;
}

function resample(points: Point[], n: number): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0] }));
  const dists = [0];
  for (let i = 1; i < points.length; i++) {
    dists.push(dists[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = dists[dists.length - 1] || 1;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1);
    let j = 1;
    while (j < dists.length && dists[j] < target) j++;
    const a = points[j - 1];
    const b = points[Math.min(j, points.length - 1)];
    const span = dists[Math.min(j, dists.length - 1)] - dists[j - 1] || 1;
    const t = (target - dists[j - 1]) / span;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function densityIn(
  points: Point[],
  x0: number,
  x1: number,
  y0: number,
  y1: number
): number {
  if (!points.length) return 0;
  let hit = 0;
  for (const p of points) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) hit++;
  }
  return hit / points.length;
}

function meanPoint(points: Point[], from: number, to: number): Point {
  const slice = points.slice(from, to);
  if (!slice.length) return { x: 0.5, y: 0.5 };
  let x = 0;
  let y = 0;
  for (const p of slice) {
    x += p.x;
    y += p.y;
  }
  return { x: x / slice.length, y: y / slice.length };
}

function rightwardMotion(points: Point[], fromFrac: number, toFrac: number): number {
  const a = Math.floor(points.length * fromFrac);
  const b = Math.max(a + 1, Math.floor(points.length * toFrac));
  let right = 0;
  let left = 0;
  for (let i = a + 1; i < b; i++) {
    const dx = points[i].x - points[i - 1].x;
    if (dx > 0) right += dx;
    else left += -dx;
  }
  const sum = right + left || 1;
  return right / sum;
}

function downwardMotion(points: Point[], fromFrac: number, toFrac: number): number {
  const a = Math.floor(points.length * fromFrac);
  const b = Math.max(a + 1, Math.floor(points.length * toFrac));
  let down = 0;
  let up = 0;
  for (let i = a + 1; i < b; i++) {
    const dy = points[i].y - points[i - 1].y;
    if (dy > 0) down += dy;
    else up += -dy;
  }
  const sum = down + up || 1;
  return down / sum;
}

/** Rough loop score in a vertical band: path wanders and returns near an earlier point. */
function loopScoreInBand(points: Point[], y0: number, y1: number): number {
  const band = points.filter((p) => p.y >= y0 && p.y <= y1);
  if (band.length < 8) return 0;
  const start = band[0];
  let minDist = Infinity;
  for (let i = Math.floor(band.length * 0.55); i < band.length; i++) {
    minDist = Math.min(minDist, Math.hypot(band[i].x - start.x, band[i].y - start.y));
  }
  // Also check horizontal span in band (loops are wider than stems).
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of band) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  const width = maxX - minX;
  const closure = Math.max(0, 1 - minDist * 3);
  return closure * 0.65 + Math.min(1, width * 1.6) * 0.35;
}

type Features = {
  aspect: number;
  strokeCount: number;
  start: Point;
  end: Point;
  mid: Point;
  zones: number[]; // 3x3 row-major
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerCol: number;
  earlyRight: number;
  lateDown: number;
  topLoop: number;
  bottomLoop: number;
  topBar: number; // rightward motion early near top
};

function extractFeatures(strokes: Stroke[]): Features {
  const b = boundsOf(strokes);
  const aspect = b.height / b.width;
  const strokeCount = strokes.filter((s) => s.length > 0).length;
  const norm = resample(normalizePoints(strokes), 64);
  const start = norm[0];
  const end = norm[norm.length - 1];
  const mid = meanPoint(norm, 20, 44);

  const zones: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      zones.push(
        densityIn(norm, col / 3, (col + 1) / 3, row / 3, (row + 1) / 3)
      );
    }
  }

  const left = densityIn(norm, 0, 0.38, 0, 1);
  const right = densityIn(norm, 0.62, 1, 0, 1);
  const top = densityIn(norm, 0, 1, 0, 0.38);
  const bottom = densityIn(norm, 0, 1, 0.62, 1);
  const centerCol = densityIn(norm, 0.35, 0.65, 0, 1);

  const earlyRight = rightwardMotion(norm, 0, 0.25);
  const lateDown = downwardMotion(norm, 0.55, 1);
  const topLoop = loopScoreInBand(norm, 0, 0.5);
  const bottomLoop = loopScoreInBand(norm, 0.45, 1);

  // Top bar: early segment stays in upper third and moves right.
  const early = norm.slice(0, Math.floor(norm.length * 0.22));
  const earlyTopFrac =
    early.filter((p) => p.y < 0.35).length / Math.max(1, early.length);
  const topBar = earlyTopFrac * earlyRight;

  return {
    aspect,
    strokeCount,
    start,
    end,
    mid,
    zones,
    left,
    right,
    top,
    bottom,
    centerCol,
    earlyRight,
    lateDown,
    topLoop,
    bottomLoop,
    topBar,
  };
}

function scoreDigits(f: Features): DigitGuess[] {
  const scores: Record<number, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
    9: 0,
  };

  // --- 1: tall, thin, vertical ---
  if (f.aspect > 1.35) scores[1] += 0.25;
  if (f.aspect > 1.8) scores[1] += 0.15;
  scores[1] += f.centerCol * 0.45;
  scores[1] += Math.max(0, 0.35 - f.left) * 0.4;
  scores[1] += Math.max(0, 0.35 - f.right) * 0.4;
  if (f.start.y < 0.35 && f.end.y > 0.65) scores[1] += 0.2;
  if (f.strokeCount >= 3) scores[1] -= 0.2;

  // --- 7: top bar then diagonal down ---
  scores[7] += f.topBar * 0.5;
  if (f.start.y < 0.3 && f.start.x < 0.45) scores[7] += 0.15;
  if (f.end.y > 0.55) scores[7] += 0.1;
  scores[7] += Math.max(0, f.top - f.bottom) * 0.35;
  if (f.bottomLoop > 0.45) scores[7] -= 0.25;
  if (f.aspect < 0.9) scores[7] -= 0.1;

  // --- 4: open angle + vertical stem (often 2 strokes) ---
  if (f.strokeCount >= 2) scores[4] += 0.28;
  scores[4] += f.zones[0] * 0.15 + f.zones[3] * 0.2 + f.zones[4] * 0.25 + f.zones[5] * 0.2;
  if (f.end.y > 0.55 && f.end.x > 0.35 && f.end.x < 0.75) scores[4] += 0.12;
  // Crossbar-ish middle density
  scores[4] += densityWeight(f.zones, [3, 4, 5]) * 0.25;
  if (f.topLoop > 0.55) scores[4] -= 0.2;

  // --- 2: top curve, ends with bottom horizontal ---
  if (f.start.y < 0.4) scores[2] += 0.1;
  if (f.end.y > 0.7 && f.end.x < 0.55) scores[2] += 0.22;
  scores[2] += f.bottom * 0.25;
  if (f.end.y > 0.65 && f.earlyRight > 0.45) scores[2] += 0.12;
  if (f.left < 0.25 && f.bottom > 0.28) scores[2] += 0.1;
  if (f.topLoop > 0.6 && f.bottomLoop < 0.35) scores[2] -= 0.15; // more like 9

  // --- 3: open on left, stacked curves on right ---
  scores[3] += Math.max(0, f.right - f.left) * 0.7;
  if (f.left < 0.22) scores[3] += 0.2;
  if (f.start.y < 0.35 && f.end.y > 0.6) scores[3] += 0.1;
  if (f.topLoop > 0.5 && f.bottomLoop > 0.5) scores[3] -= 0.15; // 8

  // --- 5 vs 9 (critical) ---
  // 5: top horizontal bar + left spine + bottom opening right; NOT a top loop
  scores[5] += f.topBar * 0.7;
  scores[5] += f.left * 0.35;
  scores[5] += Math.max(0, 0.55 - f.topLoop) * 0.45;
  if (f.start.x < 0.4 && f.start.y < 0.3) scores[5] += 0.15;
  if (f.end.x > 0.45 && f.end.y > 0.45) scores[5] += 0.12;
  if (f.strokeCount >= 2) scores[5] += 0.1;
  // Penalize closed top loop (that's 9/6/8/0-like)
  scores[5] -= f.topLoop * 0.55;
  if (f.bottomLoop > 0.5 && f.topLoop < 0.35) scores[5] -= 0.1; // more 6

  // 9: top loop, stem down, little top bar
  scores[9] += f.topLoop * 0.85;
  scores[9] += Math.max(0, 0.5 - f.topBar) * 0.4;
  scores[9] += f.lateDown * 0.25;
  if (f.end.y > 0.7) scores[9] += 0.18;
  if (f.bottomLoop < 0.4) scores[9] += 0.12;
  scores[9] -= f.topBar * 0.5;
  scores[9] -= Math.max(0, f.left - 0.28) * 0.25; // 5 has stronger left bar
  if (f.bottomLoop > 0.55 && f.topLoop > 0.45) scores[9] -= 0.35; // 8

  // --- 6: bottom loop, often starts at top/right going down-left ---
  scores[6] += f.bottomLoop * 0.8;
  scores[6] += Math.max(0, f.bottom - f.top) * 0.3;
  if (f.start.y < 0.45) scores[6] += 0.1;
  if (f.topLoop > 0.55 && f.bottomLoop < 0.4) scores[6] -= 0.4; // 9
  scores[6] -= f.topBar * 0.25;

  // --- 8: loops in both halves ---
  scores[8] += Math.min(f.topLoop, f.bottomLoop) * 1.1;
  if (f.topLoop > 0.4 && f.bottomLoop > 0.4) scores[8] += 0.35;
  scores[8] += (1 - Math.abs(f.top - f.bottom)) * 0.15;
  if (Math.abs(f.start.x - f.end.x) < 0.25 && Math.abs(f.start.y - f.end.y) < 0.25) {
    scores[8] += 0.1;
  }

  // Soft aspect cleanups
  if (f.aspect < 0.85) {
    scores[1] -= 0.25;
    scores[7] -= 0.1;
  }
  if (f.aspect > 1.7) {
    scores[8] -= 0.1;
    scores[3] -= 0.05;
  }

  return Object.entries(scores)
    .map(([digit, confidence]) => ({ digit: Number(digit), confidence }))
    .sort((a, b) => b.confidence - a.confidence);
}

function densityWeight(zones: number[], idxs: number[]): number {
  let s = 0;
  for (const i of idxs) s += zones[i] ?? 0;
  return s;
}

/**
 * Ranked guesses for a handwritten digit 1–9.
 */
export function rankDigitGuesses(strokes: Stroke[]): DigitGuess[] {
  if (!strokes.length || totalPoints(strokes) < MIN_POINTS) return [];
  if (totalPathLength(strokes) < MIN_PATH_LENGTH) return [];
  return scoreDigits(extractFeatures(strokes));
}

/**
 * Auto-accept only when the top guess is clearly ahead; otherwise null
 * (UI should let the user confirm).
 */
export function recognizeDigit(strokes: Stroke[]): DigitGuess | null {
  const ranked = rankDigitGuesses(strokes);
  if (!ranked.length) return null;
  const best = ranked[0];
  const second = ranked[1]?.confidence ?? 0;
  if (best.confidence < AUTO_ACCEPT_CONFIDENCE) return null;
  if (best.confidence - second < AUTO_ACCEPT_MARGIN) return null;
  if (best.digit < 1 || best.digit > 9) return null;
  return best;
}

/** Top N candidates for a confirmation UI. */
export function topDigitCandidates(strokes: Stroke[], n = 3): DigitGuess[] {
  return rankDigitGuesses(strokes).slice(0, n).filter((g) => g.confidence > 0.15);
}
