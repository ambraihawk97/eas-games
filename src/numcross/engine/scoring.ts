import { getDiff } from './difficulty'
import type { ScoreBreakdown } from './types'

export function computeScoreBreakdown(
  levelNum: number,
  timerSec: number,
  mistakeCount: number,
  hintsUsed: number,
  levelStreak: number,
): ScoreBreakdown {
  const p = getDiff(levelNum)
  const diffMult: Record<string, number> = { Easy: 1, Medium: 1.5, Hard: 2, Expert: 3 }
  const base = Math.round(levelNum * 10 * (diffMult[p.label] ?? 1))

  // Time bonus: full 100 pts within first 30s, halves every 60s after
  const elapsedAfterFree = Math.max(0, timerSec - 30)
  const timeBonus = Math.round(100 * Math.pow(0.5, elapsedAfterFree / 60))

  // Streak: +25% per consecutive solve, capped at +150%
  const streakPct = Math.min(6, levelStreak) * 25
  const streakBonus = streakPct > 0 ? Math.round((base + timeBonus) * streakPct / 100) : 0

  const mistakePen = mistakeCount * 10
  const hintPen = hintsUsed * 20

  const total = Math.max(0, base + timeBonus + streakBonus - mistakePen - hintPen)
  return { base, timeBonus, streakBonus, streakPct, mistakePen, hintPen, total }
}


export function formatTime(sec: number): string {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}
