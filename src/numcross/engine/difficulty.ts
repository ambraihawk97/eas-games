import { createPRNG } from './prng'
import { generateLayout } from './generator'
import type { LevelData, Difficulty } from './types'
import type { Operator } from './arithmetic'

interface DiffParams {
  label: Difficulty
  eqs: number
  ops: Operator[]
  fr: number
  maxGrid: number
}

export function getDiff(lv: number): DiffParams {
  if (lv <= 3)  return { label: 'Easy',   eqs: 2, ops: ['+'],                  fr: 0.55, maxGrid: 7  }
  if (lv <= 6)  return { label: 'Easy',   eqs: 3, ops: ['+', '−'],             fr: 0.40, maxGrid: 7  }
  if (lv <= 9)  return { label: 'Medium', eqs: 3, ops: ['+', '−'],             fr: 0.20, maxGrid: 9  }
  if (lv <= 12) return { label: 'Medium', eqs: 4, ops: ['+', '−', '×'],        fr: 0.10, maxGrid: 9  }
  if (lv <= 15) return { label: 'Hard',   eqs: 5, ops: ['+', '−', '×'],        fr: 0.0,  maxGrid: 11 }
  if (lv <= 18) return { label: 'Hard',   eqs: 5, ops: ['+', '−', '×', '÷'],  fr: 0.0,  maxGrid: 11 }
  if (lv <= 21) return { label: 'Expert', eqs: 6, ops: ['+', '−', '×', '÷'],  fr: 0.0,  maxGrid: 11 }
  const extra   = Math.floor((lv - 22) / 3)
  const eqs     = Math.min(10, 6 + extra)
  const maxGrid = Math.min(13, 11 + Math.floor(extra / 2))
  return { label: 'Expert', eqs, ops: ['+', '−', '×', '÷'], fr: 0.0, maxGrid }
}

export function shapeName(lv: Pick<LevelData, 'cols' | 'rows' | 'eqCount'>): string {
  const { cols, rows, eqCount } = lv
  const ar = cols / rows
  if (eqCount <= 2) return ar > 1.5 ? 'L-Shape' : ar < 0.7 ? 'Tower' : 'Corner'
  if (eqCount === 3) return ar > 1.3 ? 'T-Shape' : ar < 0.8 ? 'T-Stack' : 'Plus'
  if (eqCount === 4) return ar > 1.5 ? 'H-Grid'  : ar < 0.7 ? 'V-Grid'  : 'Cross'
  if (eqCount === 5) return ar > 1.4 ? 'Wide Star' : 'Star'
  if (eqCount === 6) return 'Double Cross'
  if (eqCount === 7) return 'Cluster'
  if (eqCount >= 8)  return 'Web'
  return 'Grid'
}

export function generateLevel(lv: number, seed: number): LevelData | null {
  const p = getDiff(lv)
  const rng = createPRNG((seed * 0x9e3779b9 ^ lv * 2654435761) >>> 0)
  const layout = generateLayout(p.eqs, p.ops, p.fr, p.maxGrid, rng)
  if (layout) {
    return { ...layout, difficulty: p.label, levelNum: lv, seed, name: shapeName(layout) }
  }
  // Guaranteed easy fallback
  const rng2 = createPRNG(seed + lv * 31337)
  const fb = generateLayout(2, ['+'], 0.4, 7, rng2)
  return fb ? { ...fb, difficulty: 'Easy', levelNum: lv, seed, name: 'L-Shape' } : null
}
