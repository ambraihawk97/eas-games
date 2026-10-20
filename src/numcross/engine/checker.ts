import { applyOp, type Operator } from './arithmetic'
import type { Cell, LevelData } from './types'

function cellVal(cell: Cell): number | Operator | '=' | null {
  if (!cell) return null
  return cell.t === 'F' ? cell.v : cell.val
}

function evalSeg(toks: (number | Operator | '=' | null)[]): number | null {
  const t = toks.filter(x => x !== null) as (number | Operator | '=')[]
  if (!t.length || t.every(x => typeof x === 'string')) return null
  if (t.length === 1) return typeof t[0] === 'number' ? t[0] : null
  let res = t[0]
  if (typeof res !== 'number') return null
  for (let i = 1; i + 1 < t.length; i += 2) {
    const r = applyOp(res, t[i] as Operator, t[i + 1] as number)
    if (r === null || typeof t[i + 1] !== 'number') return null
    res = r
  }
  return res
}

export function checkLine(cells: Cell[]): { has: boolean; ok: boolean } {
  const vals = cells.map(cellVal)
  const parts: (number | Operator | null)[][] = []
  let cur: (number | Operator | null)[] = []
  for (const v of vals) {
    if (v === '=') { parts.push([...cur]); cur = [] }
    else cur.push(v)
  }
  parts.push([...cur])
  if (parts.length < 2) return { has: false, ok: true }
  const results = parts.map(evalSeg)
  if (results.every(r => r === null)) return { has: false, ok: true }
  if (results.some(r => r === null || isNaN(r as number))) return { has: true, ok: false }
  const f = results[0] as number
  return { has: true, ok: results.every(r => Math.abs((r as number) - f) < 0.0001) }
}

/** Returns the set of "r,c" keys that are wrong, or null if not all filled */
export function validateGrid(
  liveGrid: Cell[][],
  levelData: LevelData,
): Set<string> | null {
  // Check all blanks filled
  for (const row of liveGrid)
    for (const cell of row)
      if (cell && cell.t === 'B' && cell.val === null) return null

  const wrong = new Set<string>()
  for (const line of levelData.eqLines) {
    const cells = line.map(([r, c]) => liveGrid[r][c])
    const { has, ok } = checkLine(cells)
    if (has && !ok)
      line.forEach(([r, c]) => {
        if (liveGrid[r][c]?.t === 'B') wrong.add(`${r},${c}`)
      })
  }
  return wrong
}
