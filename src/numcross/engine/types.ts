import type { Operator } from './arithmetic'

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert'

/** A single cell in the live grid */
export type CellFixed = { t: 'F'; v: number | Operator | '=' }
export type CellBlank = { t: 'B'; ans: number; val: number | null; status?: 'ok' | 'bad'; hint?: true }
export type Cell = CellFixed | CellBlank | null

/** The generated level data — everything needed to render and validate */
export interface LevelData {
  cols: number
  rows: number
  /** Grid of cells (null = empty/dead space) */
  grid: Cell[][]
  /** Sorted tile bank values the player places */
  tiles: number[]
  eqCount: number
  /** Each entry is the 5 [row,col] positions of one equation segment */
  eqLines: [number, number][][]
  difficulty: Difficulty
  levelNum: number
  seed: number
  name: string
}

/** An undo snapshot */
export interface UndoEntry {
  r: number
  c: number
  prevVal: number | null
  prevTileIdx: number
}

/** Score breakdown returned by computeScoreBreakdown */
export interface ScoreBreakdown {
  base: number
  timeBonus: number
  streakBonus: number
  streakPct: number
  mistakePen: number
  hintPen: number
  total: number
}
