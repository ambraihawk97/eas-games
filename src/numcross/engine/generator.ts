import { createPRNG, type PRNG } from './prng'
import { applyOp, type Operator } from './arithmetic'
import type { Cell, LevelData } from './types'

// ── Grid key helpers ──────────────────────────────────────────────────────
const K = (r: number, c: number) => `${r},${c}`
const unK = (k: string): [number, number] => k.split(',').map(Number) as [number, number]

// ── Segment cell positions ────────────────────────────────────────────────
// H: num(r,c)  op(r,c+1)  num(r,c+2)  =(r,c+3)  num(r,c+4)
// V: num(r,c)  op(r+1,c)  num(r+2,c)  =(r+3,c)  num(r+4,c)
interface NumPos { r: number; c: number; role: 0 | 1 | 2 }
interface Slot {
  nums: NumPos[]
  opPos: { r: number; c: number }
  eqPos: { r: number; c: number }
}

function segmentCells(type: 'H' | 'V', r: number, c: number): Slot {
  if (type === 'H') return {
    nums:  [{ r, c,     role: 0 }, { r, c: c+2, role: 1 }, { r, c: c+4, role: 2 }],
    opPos: { r, c: c+1 },
    eqPos: { r, c: c+3 },
  }
  return {
    nums:  [{ r,     c, role: 0 }, { r: r+2, c, role: 1 }, { r: r+4, c, role: 2 }],
    opPos: { r: r+1, c },
    eqPos: { r: r+3, c },
  }
}

// ── Topological sort ──────────────────────────────────────────────────────
interface Seg {
  type: 'H' | 'V'
  r: number
  c: number
  nums: NumPos[]
  opPos: { r: number; c: number }
  eqPos: { r: number; c: number }
}

function topoOrder(eqs: Seg[]): number[] {
  const resultOf: Record<string, number> = {}
  for (let i = 0; i < eqs.length; i++)
    resultOf[K(eqs[i].nums[2].r, eqs[i].nums[2].c)] = i

  const deps = eqs.map(eq => {
    const kL = K(eq.nums[0].r, eq.nums[0].c)
    const kR = K(eq.nums[1].r, eq.nums[1].c)
    return ([resultOf[kL], resultOf[kR]]).filter(x => x !== undefined) as number[]
  })

  const order: number[] = []
  const seen = new Set<number>()
  function visit(i: number) {
    if (seen.has(i)) return
    seen.add(i)
    for (const d of deps[i]) visit(d)
    order.push(i)
  }
  for (let i = 0; i < eqs.length; i++) visit(i)
  return order
}

// ── STEP 1: Place segments ────────────────────────────────────────────────
interface CellMeta { type: 'num' | 'op' | 'eq'; segs: number[] }

function placeSegments(
  n: number,
  maxGrid: number,
  rng: PRNG,
): { cells: Record<string, CellMeta>; segs: Seg[] } | null {
  const cells: Record<string, CellMeta> = {}
  const segs: Seg[] = []

  for (let i = 0; i < n; i++) {
    let placed = false
    for (let p = 0; p < 500 && !placed; p++) {
      const type = rng.pick(['H', 'V'] as const)
      let r = rng.int(0, maxGrid - (type === 'V' ? 5 : 1))
      let c = rng.int(0, maxGrid - (type === 'H' ? 5 : 1))
      if (type === 'V') r = r - r % 2
      if (type === 'H') c = c - c % 2

      const slot = segmentCells(type, r, c)
      let conflict = false

      for (const pos of [slot.opPos, slot.eqPos]) {
        const k = K(pos.r, pos.c)
        if (cells[k]?.type === 'num' || cells[k]?.type === 'op') { conflict = true; break }
      }
      if (conflict) continue

      for (const pos of slot.nums) {
        const k = K(pos.r, pos.c)
        if (!cells[k]) continue
        if (cells[k].type !== 'num') { conflict = true; break }
        if (cells[k].segs.some(si => segs[si].type === type)) { conflict = true; break }
      }
      if (conflict) continue

      if (i > 0 && !slot.nums.some(pos => cells[K(pos.r, pos.c)]?.type === 'num')) continue

      if (i > 0) {
        const sharedPerSeg: Record<number, number> = {}
        for (const pos of slot.nums) {
          const k = K(pos.r, pos.c)
          if (cells[k]?.type === 'num')
            for (const si of cells[k].segs) sharedPerSeg[si] = (sharedPerSeg[si] ?? 0) + 1
        }
        if (Object.values(sharedPerSeg).some(v => v > 1)) continue
      }

      if (type === 'H' && segs.some(s => s.type === 'H' && s.r === r)) continue
      if (type === 'V' && segs.some(s => s.type === 'V' && s.c === c)) continue

      for (const pos of [slot.opPos, slot.eqPos]) {
        const k = K(pos.r, pos.c)
        if (!cells[k]) cells[k] = { type: pos === slot.opPos ? 'op' : 'eq', segs: [] }
        cells[k].segs.push(i)
      }
      for (const pos of slot.nums) {
        const k = K(pos.r, pos.c)
        if (!cells[k]) cells[k] = { type: 'num', segs: [] }
        cells[k].segs.push(i)
      }
      segs.push({ type, r, c, nums: slot.nums, opPos: slot.opPos, eqPos: slot.eqPos })
      placed = true
    }
    if (!placed) return null
  }
  return { cells, segs }
}

// ── STEP 2: Solve constraints ─────────────────────────────────────────────
function solveConstraints(
  cells: Record<string, CellMeta>,
  segs: Seg[],
  opsPool: Operator[],
  rng: PRNG,
): { vals: Record<string, number>; ops: Operator[] } | null {
  const numKeys = Object.keys(cells).filter(k => cells[k].type === 'num')
  const resultKs = new Set(segs.map(s => K(s.nums[2].r, s.nums[2].c)))
  const freeKeys = numKeys.filter(k => !resultKs.has(k))
  const order = topoOrder(segs)

  for (let attempt = 0; attempt < 4000; attempt++) {
    const ops = segs.map(() => rng.pick(opsPool))
    const vals: Record<string, number> = {}

    for (const k of freeKeys) vals[k] = rng.int(1, 9)

    let ok = true
    for (const i of order) {
      const seg = segs[i]
      const kL = K(seg.nums[0].r, seg.nums[0].c)
      const kR = K(seg.nums[1].r, seg.nums[1].c)
      const kRs = K(seg.nums[2].r, seg.nums[2].c)

      if (vals[kL] === undefined) vals[kL] = rng.int(1, 9)
      if (vals[kR] === undefined) vals[kR] = rng.int(1, 9)

      const res = applyOp(vals[kL], ops[i], vals[kR])
      if (res === null || res < 1 || res > 81 || !Number.isInteger(res)) { ok = false; break }
      if (vals[kRs] !== undefined && vals[kRs] !== res) { ok = false; break }
      vals[kRs] = res
    }
    if (!ok) continue

    if (!segs.every((seg, i) => {
      const L = vals[K(seg.nums[0].r, seg.nums[0].c)]
      const R = vals[K(seg.nums[1].r, seg.nums[1].c)]
      const S = vals[K(seg.nums[2].r, seg.nums[2].c)]
      return applyOp(L, ops[i], R) === S
    })) continue

    const allVals = numKeys.map(k => vals[k])
    if (allVals.some(v => !v || v > 50)) continue
    if (new Set(allVals).size < Math.ceil(allVals.length * 0.5)) continue

    return { vals, ops }
  }
  return null
}

// ── STEP 3: Build grid ────────────────────────────────────────────────────
function buildGrid(
  cells: Record<string, CellMeta>,
  segs: Seg[],
  vals: Record<string, number>,
  ops: Operator[],
  fixedRatio: number,
  rng: PRNG,
): Omit<LevelData, 'difficulty' | 'levelNum' | 'seed' | 'name'> {
  const positions = Object.keys(cells).map(k => { const [r, c] = unK(k); return { r, c } })
  const minR = Math.min(...positions.map(p => p.r))
  const maxR = Math.max(...positions.map(p => p.r))
  const minC = Math.min(...positions.map(p => p.c))
  const maxC = Math.max(...positions.map(p => p.c))
  const rows = maxR - minR + 1
  const cols = maxC - minC + 1

  const numKeys = Object.keys(cells).filter(k => cells[k].type === 'num')
  const maxBlanks = numKeys.length - 2
  const nBlanks = Math.min(maxBlanks, Math.max(2, Math.round(numKeys.length * (1 - fixedRatio))))
  const blankSet = new Set(rng.shuffle([...numKeys]).slice(0, nBlanks))
  const tiles = [...blankSet].map(k => vals[k]).sort((a, b) => a - b)

  const grid: Cell[][] = Array.from({ length: rows }, () => Array(cols).fill(null))
  for (const [k, cell] of Object.entries(cells)) {
    const [r, c] = unK(k)
    const gr = r - minR
    const gc = c - minC
    if (cell.type === 'num') {
      const v = vals[k]
      grid[gr][gc] = blankSet.has(k) ? { t: 'B', ans: v, val: null } : { t: 'F', v }
    } else if (cell.type === 'op') {
      const si = segs.findIndex(s => s.opPos.r === r && s.opPos.c === c)
      grid[gr][gc] = { t: 'F', v: ops[si] }
    } else {
      grid[gr][gc] = { t: 'F', v: '=' }
    }
  }

  const eqLines: [number, number][][] = segs.map(s => {
    if (s.type === 'H') {
      const gr = s.r - minR
      const gcStart = s.c - minC
      return Array.from({ length: 5 }, (_, i) => [gr, gcStart + i] as [number, number])
    } else {
      const gc = s.c - minC
      const grStart = s.r - minR
      return Array.from({ length: 5 }, (_, i) => [grStart + i, gc] as [number, number])
    }
  })

  return { cols, rows, grid, tiles, eqCount: segs.length, eqLines }
}

// ── Main layout generator ─────────────────────────────────────────────────
export function generateLayout(
  numEqs: number,
  opsPool: Operator[],
  fixedRatio: number,
  maxGrid: number,
  rng: PRNG,
): Omit<LevelData, 'difficulty' | 'levelNum' | 'seed' | 'name'> | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const placement = placeSegments(numEqs, maxGrid, rng)
    if (!placement) continue
    const solution = solveConstraints(placement.cells, placement.segs, opsPool, rng)
    if (!solution) continue
    return buildGrid(placement.cells, placement.segs, solution.vals, solution.ops, fixedRatio, rng)
  }
  return null
}

export { createPRNG }
