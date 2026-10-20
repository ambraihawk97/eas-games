export type Operator = '+' | '−' | '×' | '÷'

export function applyOp(a: number, op: Operator, b: number): number | null {
  if (op === '+') return a + b
  if (op === '−') return a - b
  if (op === '×') return a * b
  if (op === '÷') return b !== 0 && a % b === 0 ? a / b : null
  return null
}
