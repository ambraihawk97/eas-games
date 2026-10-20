import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { validateGrid } from "@/numcross/engine/checker";
import { generateLevel } from "@/numcross/engine/difficulty";
import { computeScoreBreakdown } from "@/numcross/engine/scoring";
import type { Cell, LevelData, ScoreBreakdown, UndoEntry } from "@/numcross/engine/types";

const HINT_REFILL_EVERY = 2000;
const HINT_MAX_POOL = 3;
const HINT_INITIAL = 3;
const INITIAL_SEED = 42;
const STORE_VERSION = 1;

function nextSeed(seed: number): number {
  return (((seed * 1664525 + 1013904223) & 0x7fffffff) % 99991) + 1;
}

type NumCrossState = {
  levelNum: number;
  levelSeed: number;
  levelData: LevelData | null;
  liveGrid: Cell[][];
  tileUsed: (string | null)[];
  selRC: { r: number; c: number } | null;
  timerSec: number;
  totalScore: number;
  levelStreak: number;
  bestStreak: number;
  mistakeCount: number;
  hintsUsed: number;
  hintsPool: number;
  hintsEarnedThisLevel: number;
  undoStack: UndoEntry[];
  toast: string | null;
  winModal: boolean;
  lastBreakdown: ScoreBreakdown | null;
  initLevel: () => void;
  resetLevel: () => void;
  tickTimer: () => void;
  selectCell: (r: number, c: number) => void;
  placeTile: (tileIdx: number) => void;
  clearSelected: () => void;
  undoMove: () => void;
  useHint: () => void;
  checkSolution: () => void;
  nextLevel: () => void;
  dismissToast: () => void;
  closeWinModal: () => void;
};

export const useNumCrossStore = create<NumCrossState>()(
  persist(
    (set, get) => ({
      levelNum: 1,
      levelSeed: INITIAL_SEED,
      levelData: null,
      liveGrid: [],
      tileUsed: [],
      selRC: null,
      timerSec: 0,
      totalScore: 0,
      levelStreak: 0,
      bestStreak: 0,
      mistakeCount: 0,
      hintsUsed: 0,
      hintsPool: HINT_INITIAL,
      hintsEarnedThisLevel: 0,
      undoStack: [],
      toast: null,
      winModal: false,
      lastBreakdown: null,

      initLevel: () => {
        const { levelNum, levelSeed } = get();
        const levelData = generateLevel(levelNum, levelSeed);
        if (!levelData) return;
        set({
          levelData,
          liveGrid: levelData.grid.map((row) => row.map((c) => (c ? { ...c } : null))),
          tileUsed: levelData.tiles.map(() => null),
          selRC: null,
          timerSec: 0,
          mistakeCount: 0,
          hintsUsed: 0,
          hintsEarnedThisLevel: 0,
          undoStack: [],
          winModal: false,
          lastBreakdown: null,
          toast: null,
        });
      },

      resetLevel: () => {
        const { levelData, liveGrid } = get();
        if (!levelData || liveGrid.length === 0) {
          get().initLevel();
          return;
        }
        const tileUsed: (string | null)[] = levelData.tiles.map(() => null);
        const grid = liveGrid.map((row, r) =>
          row.map((cell, c) => {
            if (!cell || cell.t !== "B") return cell;
            if (!cell.hint) return { t: "B" as const, ans: cell.ans, val: null };
            const idx = levelData.tiles.findIndex((v, i) => v === cell.val && tileUsed[i] === null);
            if (idx >= 0) tileUsed[idx] = `${r},${c}`;
            return { t: "B" as const, ans: cell.ans, val: cell.val, hint: true as const };
          })
        );
        set({
          liveGrid: grid,
          tileUsed,
          selRC: null,
          timerSec: 0,
          mistakeCount: 0,
          undoStack: [],
          winModal: false,
          lastBreakdown: null,
        });
      },

      tickTimer: () => set((s) => ({ timerSec: s.timerSec + 1 })),

      selectCell: (r, c) => {
        const { liveGrid, selRC } = get();
        const cell = liveGrid[r]?.[c];
        if (!cell || cell.t !== "B" || cell.hint) return;
        const same = selRC?.r === r && selRC?.c === c;
        set({ selRC: same ? null : { r, c } });
      },

      placeTile: (tileIdx) => {
        const { selRC, liveGrid, tileUsed, levelData, undoStack } = get();
        if (!levelData || tileUsed[tileIdx] !== null) return;
        if (!selRC) {
          set({ toast: "Tap a blank cell first" });
          return;
        }
        const { r, c } = selRC;
        const cell = liveGrid[r][c];
        if (!cell || cell.t !== "B" || cell.hint) return;

        const prevVal = cell.val;
        const prevTileIdx = prevVal !== null ? tileUsed.indexOf(`${r},${c}`) : -1;
        const newGrid = liveGrid.map((row) => row.map((cl) => (cl ? { ...cl } : null)));
        const newUsed = [...tileUsed];
        if (prevVal !== null) {
          const prev = newUsed.indexOf(`${r},${c}`);
          if (prev >= 0) newUsed[prev] = null;
        }
        const target = newGrid[r][c] as Extract<Cell, { t: "B" }>;
        target.val = levelData.tiles[tileIdx];
        delete target.status;
        newUsed[tileIdx] = `${r},${c}`;
        set({
          liveGrid: newGrid,
          tileUsed: newUsed,
          undoStack: [...undoStack, { r, c, prevVal, prevTileIdx }].slice(-50),
          selRC: null,
        });
      },

      clearSelected: () => {
        const { selRC, liveGrid, tileUsed, undoStack } = get();
        if (!selRC) return;
        const { r, c } = selRC;
        const cell = liveGrid[r][c];
        if (!cell || cell.t !== "B" || cell.val === null || cell.hint) return;
        const prevTileIdx = tileUsed.indexOf(`${r},${c}`);
        const newGrid = liveGrid.map((row) => row.map((cl) => (cl ? { ...cl } : null)));
        const newUsed = [...tileUsed];
        if (prevTileIdx >= 0) newUsed[prevTileIdx] = null;
        const target = newGrid[r][c] as Extract<Cell, { t: "B" }>;
        const prevVal = target.val;
        target.val = null;
        delete target.status;
        set({
          liveGrid: newGrid,
          tileUsed: newUsed,
          undoStack: [...undoStack, { r, c, prevVal, prevTileIdx }].slice(-50),
          selRC: null,
        });
      },

      undoMove: () => {
        const { undoStack, liveGrid, tileUsed } = get();
        if (!undoStack.length) {
          set({ toast: "Nothing to undo" });
          return;
        }
        const { r, c, prevVal, prevTileIdx } = undoStack[undoStack.length - 1];
        const newGrid = liveGrid.map((row) => row.map((cl) => (cl ? { ...cl } : null)));
        const newUsed = [...tileUsed];
        const cur = newUsed.indexOf(`${r},${c}`);
        if (cur >= 0) newUsed[cur] = null;
        const target = newGrid[r][c] as Extract<Cell, { t: "B" }>;
        target.val = prevVal;
        delete target.status;
        if (prevVal !== null && prevTileIdx >= 0) newUsed[prevTileIdx] = `${r},${c}`;
        set({
          liveGrid: newGrid,
          tileUsed: newUsed,
          undoStack: undoStack.slice(0, -1),
          selRC: null,
        });
      },

      useHint: () => {
        const { levelData, liveGrid, tileUsed, hintsUsed, hintsPool } = get();
        if (!levelData) return;
        if (hintsPool <= 0) {
          set({ toast: "No hints left" });
          return;
        }
        const empties: { r: number; c: number; ans: number }[] = [];
        liveGrid.forEach((row, r) =>
          row.forEach((cell, c) => {
            if (cell && cell.t === "B" && cell.val === null) empties.push({ r, c, ans: cell.ans });
          })
        );
        if (!empties.length) {
          set({ toast: "No empty cells left" });
          return;
        }
        const target = empties[Math.floor(Math.random() * empties.length)];
        const tileIdx = levelData.tiles.findIndex((v, i) => v === target.ans && tileUsed[i] === null);
        if (tileIdx === -1) {
          set({ toast: "Tile already placed" });
          return;
        }
        const newGrid = liveGrid.map((row) => row.map((cl) => (cl ? { ...cl } : null)));
        const newUsed = [...tileUsed];
        const cell = newGrid[target.r][target.c] as Extract<Cell, { t: "B" }>;
        cell.val = target.ans;
        cell.hint = true;
        newUsed[tileIdx] = `${target.r},${target.c}`;
        set({
          liveGrid: newGrid,
          tileUsed: newUsed,
          hintsUsed: hintsUsed + 1,
          hintsPool: hintsPool - 1,
          selRC: null,
        });
      },

      checkSolution: () => {
        const {
          levelData,
          liveGrid,
          timerSec,
          mistakeCount,
          hintsUsed,
          hintsPool,
          levelStreak,
          totalScore,
          levelNum,
          bestStreak,
        } = get();
        if (!levelData) return;
        const wrong = validateGrid(liveGrid, levelData);
        if (wrong === null) {
          set({ toast: "Fill all blank cells first" });
          return;
        }
        const newGrid = liveGrid.map((row, r) =>
          row.map((cell, c) => {
            if (!cell || cell.t !== "B") return cell;
            return { ...cell, status: wrong.has(`${r},${c}`) ? ("bad" as const) : ("ok" as const) };
          })
        );
        if (wrong.size === 0) {
          const bd = computeScoreBreakdown(levelNum, timerSec, mistakeCount, hintsUsed, levelStreak);
          const newStreak = levelStreak + 1;
          const newTotalScore = totalScore + bd.total;
          const hintsEarned =
            Math.floor(newTotalScore / HINT_REFILL_EVERY) - Math.floor(totalScore / HINT_REFILL_EVERY);
          const newHintsPool = Math.min(HINT_MAX_POOL, hintsPool + hintsEarned);
          set({
            liveGrid: newGrid,
            winModal: true,
            lastBreakdown: bd,
            totalScore: newTotalScore,
            levelStreak: newStreak,
            bestStreak: Math.max(bestStreak, newStreak),
            hintsPool: newHintsPool,
            hintsEarnedThisLevel: newHintsPool - hintsPool,
          });
        } else {
          set({
            liveGrid: newGrid,
            mistakeCount: mistakeCount + 1,
            levelStreak: 0,
            toast: "Something doesn't add up",
          });
          setTimeout(() => {
            set((s) => ({
              liveGrid: s.liveGrid.map((row) =>
                row.map((cell) => {
                  if (!cell || cell.t !== "B") return cell;
                  const { status: _s, ...rest } = cell;
                  return rest as Cell;
                })
              ),
            }));
          }, 1600);
        }
      },

      nextLevel: () => {
        const { levelNum, levelSeed } = get();
        set({ levelNum: levelNum + 1, levelSeed: nextSeed(levelSeed), winModal: false });
        get().initLevel();
      },

      dismissToast: () => set({ toast: null }),
      closeWinModal: () => set({ winModal: false }),
    }),
    {
      name: "numcross-save",
      version: STORE_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        levelNum: state.levelNum,
        levelSeed: state.levelSeed,
        totalScore: state.totalScore,
        levelStreak: state.levelStreak,
        bestStreak: state.bestStreak,
        hintsPool: state.hintsPool,
      }),
    }
  )
);
