export type Point = { x: number; y: number };
export type Stroke = Point[];

const GRID = 16;
const MIN_POINTS = 4;
const MIN_PATH_LENGTH = 12;

/** Ideal 16×16 occupancy templates for digits 1–9 (row-major, 0/1). */
const TEMPLATES: Record<number, number[][]> = {
  1: [
    "....##..........",
    "...###..........",
    "..##.#..........",
    ".##..#..........",
    ".....#..........",
    ".....#..........",
    ".....#..........",
    ".....#..........",
    ".....#..........",
    ".....#..........",
    ".....#..........",
    ".....#..........",
    "...###..........",
    "..#####.........",
    ".#######........",
    "................",
  ],
  2: [
    "................",
    "..########......",
    ".##......##.....",
    "##........##....",
    "..........##....",
    "..........##....",
    ".........##.....",
    "........##......",
    ".......##.......",
    "......##........",
    ".....##.........",
    "....##..........",
    "...##...........",
    "..##########....",
    ".############...",
    "................",
  ],
  3: [
    "................",
    "..########......",
    ".##......##.....",
    "..........##....",
    "..........##....",
    ".........##.....",
    "....######......",
    "....######......",
    ".........##.....",
    "..........##....",
    "..........##....",
    "..........##....",
    ".##......##.....",
    "..########......",
    "................",
    "................",
  ],
  4: [
    "................",
    "....##..........",
    "...###..........",
    "...#.#..........",
    "..##.#..........",
    "..#..#..........",
    ".##..#..........",
    ".#...#..........",
    "##...#..........",
    "##############..",
    "##############..",
    ".....#..........",
    ".....#..........",
    ".....#..........",
    ".....#..........",
    "................",
  ],
  5: [
    "................",
    ".###########....",
    ".###########....",
    ".##.............",
    ".##.............",
    ".##.............",
    ".##########.....",
    ".##########.....",
    "..........##....",
    "...........##...",
    "...........##...",
    "...........##...",
    ".##.......##....",
    "..#########.....",
    "................",
    "................",
  ],
  6: [
    "................",
    "....######......",
    "...##....##.....",
    "..##............",
    ".##.............",
    ".##.............",
    ".##.######......",
    ".##########.....",
    ".##......##.....",
    ".##.......##....",
    ".##.......##....",
    ".##.......##....",
    "..##.....##.....",
    "....######......",
    "................",
    "................",
  ],
  7: [
    "................",
    ".#############..",
    ".#############..",
    "...........##...",
    "..........##....",
    ".........##.....",
    "........##......",
    ".......##.......",
    "......##........",
    ".....##.........",
    "....##..........",
    "...##...........",
    "...##...........",
    "..##............",
    "..##............",
    "................",
  ],
  8: [
    "................",
    "...######.......",
    "..##....##......",
    ".##......##.....",
    ".##......##.....",
    "..##....##......",
    "...######.......",
    "...######.......",
    "..##....##......",
    ".##......##.....",
    ".##......##.....",
    ".##......##.....",
    "..##....##......",
    "...######.......",
    "................",
    "................",
  ],
  9: [
    "................",
    "....######......",
    "...##....##.....",
    "..##......##....",
    "..##......##....",
    "..##......##....",
    "...##....##.....",
    "....########....",
    ".....######.#...",
    "..........##....",
    "..........##....",
    ".........##.....",
    "...##...##......",
    "....#####.......",
    "................",
    "................",
  ],
};

function parseTemplate(rows: string[]): Float32Array {
  const out = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < GRID; x++) {
      out[y * GRID + x] = row[x] === "#" ? 1 : 0;
    }
  }
  return out;
}

const PARSED_TEMPLATES: { digit: number; grid: Float32Array }[] = Object.entries(TEMPLATES).map(
  ([digit, rows]) => ({ digit: Number(digit), grid: parseTemplate(rows) })
);

function pathLength(stroke: Stroke): number {
  let len = 0;
  for (let i = 1; i < stroke.length; i++) {
    const dx = stroke[i].x - stroke[i - 1].x;
    const dy = stroke[i].y - stroke[i - 1].y;
    len += Math.hypot(dx, dy);
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
  return { minX, minY, maxX, maxY };
}

function paintLine(
  grid: Float32Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brush: number
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const cx = Math.round(x);
    const cy = Math.round(y);
    for (let dy = -brush; dy <= brush; dy++) {
      for (let dx = -brush; dx <= brush; dx++) {
        if (dx * dx + dy * dy > brush * brush + 1) continue;
        const px = cx + dx;
        const py = cy + dy;
        if (px < 0 || py < 0 || px >= GRID || py >= GRID) continue;
        grid[py * GRID + px] = 1;
      }
    }
  }
}

function strokesToGrid(strokes: Stroke[]): Float32Array {
  const grid = new Float32Array(GRID * GRID);
  const { minX, minY, maxX, maxY } = boundsOf(strokes);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const scale = (GRID - 3) / Math.max(width, height);
  const offsetX = (GRID - width * scale) / 2;
  const offsetY = (GRID - height * scale) / 2;

  const map = (p: Point) => ({
    x: (p.x - minX) * scale + offsetX,
    y: (p.y - minY) * scale + offsetY,
  });

  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    if (stroke.length === 1) {
      const p = map(stroke[0]);
      paintLine(grid, p.x, p.y, p.x, p.y, 1);
      continue;
    }
    for (let i = 1; i < stroke.length; i++) {
      const a = map(stroke[i - 1]);
      const b = map(stroke[i]);
      paintLine(grid, a.x, a.y, b.x, b.y, 1);
    }
  }
  return grid;
}

function correlation(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

function aspectFeatures(strokes: Stroke[]) {
  const { minX, minY, maxX, maxY } = boundsOf(strokes);
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  return { aspect: h / w, width: w, height: h };
}

/**
 * Recognize a handwritten digit 1–9 from one or more strokes.
 * Returns null if confidence is too low or input is too small.
 */
export function recognizeDigit(
  strokes: Stroke[],
  minConfidence = 0.42
): { digit: number; confidence: number } | null {
  if (!strokes.length || totalPoints(strokes) < MIN_POINTS) return null;
  if (totalPathLength(strokes) < MIN_PATH_LENGTH) return null;

  const grid = strokesToGrid(strokes);
  const { aspect } = aspectFeatures(strokes);
  const strokeCount = strokes.filter((s) => s.length > 0).length;

  let bestDigit = 0;
  let bestScore = -Infinity;
  let secondScore = -Infinity;

  for (const { digit, grid: template } of PARSED_TEMPLATES) {
    let score = correlation(grid, template);

    // Light geometric priors for common ambiguities.
    if (digit === 1 && aspect > 1.6 && strokeCount <= 2) score += 0.08;
    if (digit === 4 && strokeCount >= 2) score += 0.05;
    if (digit === 7 && aspect > 1.1) score += 0.03;
    if ((digit === 8 || digit === 0) && aspect < 0.85) score -= 0.04;
    if (digit === 5 && strokeCount >= 2) score += 0.03;

    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestDigit = digit;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (bestDigit < 1 || bestDigit > 9) return null;
  if (bestScore < minConfidence) return null;
  // Reject near-ties unless the winner is clearly ahead.
  if (bestScore - secondScore < 0.035 && bestScore < 0.62) return null;

  return { digit: bestDigit, confidence: bestScore };
}
