import { View, useWindowDimensions, Platform } from "react-native";
import { useState, useMemo, useCallback, useEffect } from "react";
import SudokuCell from "./SudokuCell";
import NumberRow from "./number-row";
import Toolbar from "./tool-bar";
import InfoBar from "./info-bar";
import DigitWriteOverlay from "./DigitWriteOverlay";
import { useMenuStore } from "@/store/menu";
import { useThemeColors } from "@/utils/useThemeColors";

const GRID_SIZE = 9;
const BOX_SIZE = 3;
const MAX_PER_NUMBER = 9;
const WRITE_OVERLAY_SCALE = 4.5;
const GRID_BORDER = 2;

const Grid = () => {
    /* -------------------- STORE -------------------- */
    const { board, fixed, solution, notes, moves, handleInput, isPaused, isPencilMode } =
        useMenuStore();
    const colors = useThemeColors();

    /* -------------------- DIMENSIONS -------------------- */
    const { width: screenWidth } = useWindowDimensions();
    // Leave horizontal padding (48px each side) and a little breathing room
    const gridSize = Math.min(screenWidth - 32, 380);
    const cellSize = Math.floor(gridSize / GRID_SIZE);
    const actualGridSize = cellSize * GRID_SIZE;
    const overlaySize = Math.max(180, Math.round(cellSize * WRITE_OVERLAY_SCALE));

    /* -------------------- STATE -------------------- */
    const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);

    const isFixedCell = useCallback(
        (row: number, col: number) => fixed?.[row]?.[col] !== null,
        [fixed]
    );

    /* -------------------- DERIVED DATA -------------------- */
    const numberCounts = useMemo(() => {
        const counts = Array.from({ length: GRID_SIZE + 1 }, () => 0);
        for (let r = 0; r < GRID_SIZE; r++)
            for (let c = 0; c < GRID_SIZE; c++) {
                const v = board?.[r][c] ?? null;
                if (v !== null) counts[v]++;
            }
        return counts;
    }, [board]);

    const remaining = useCallback(
        (num: number) => Math.max(0, MAX_PER_NUMBER - numberCounts[num]),
        [numberCounts]
    );

    /* -------------------- HANDLERS -------------------- */
    const handleCellSelect = useCallback(
        (row: number, col: number) => {
            if (!isPaused) setSelected({ row, col });
        },
        [isPaused]
    );

    const handleErase = useCallback(() => {
        if (selected && !isPaused) handleInput(selected.row, selected.col, null);
    }, [selected, handleInput, isPaused]);

    // Web-only keyboard support for the selected cell.
    useEffect(() => {
        if (Platform.OS !== "web") return;

        const onKeyDown = (event: any) => {
            if (!selected || isPaused) return;

            const activeElement = (globalThis as any).document?.activeElement;
            const tagName = activeElement?.tagName?.toLowerCase?.();
            if (tagName === "input" || tagName === "textarea" || activeElement?.isContentEditable) {
                return;
            }

            const key = event?.key;

            if (key >= "1" && key <= "9") {
                handleInput(selected.row, selected.col, Number(key));
                event.preventDefault?.();
                return;
            }

            if (key === "Backspace" || key === "Delete" || key === "0") {
                handleInput(selected.row, selected.col, null);
                event.preventDefault?.();
                return;
            }

            if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
                const deltaRow = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
                const deltaCol = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
                const nextRow = Math.max(0, Math.min(8, selected.row + deltaRow));
                const nextCol = Math.max(0, Math.min(8, selected.col + deltaCol));
                setSelected({ row: nextRow, col: nextCol });
                event.preventDefault?.();
            }
        };

        (globalThis as any).window?.addEventListener?.("keydown", onKeyDown);
        return () => {
            (globalThis as any).window?.removeEventListener?.("keydown", onKeyDown);
        };
    }, [selected, isPaused, handleInput]);

    /* -------------------- HELPERS -------------------- */
    const isSameBox = (r: number, c: number) => {
        if (!selected) return false;
        return (
            Math.floor(r / BOX_SIZE) === Math.floor(selected.row / BOX_SIZE) &&
            Math.floor(c / BOX_SIZE) === Math.floor(selected.col / BOX_SIZE)
        );
    };

    const isSameNumber = (_r: number, _c: number) => false;

    const isError = (r: number, c: number) => {
        const cv = board?.[r][c];
        return cv !== null && cv !== solution?.[r][c];
    };

    // A cell is "locked" when the user correctly entered the right number (not original-fixed)
    const isLockedCell = useCallback(
        (row: number, col: number) => {
            if (!board || !solution) return false;
            const val = board[row][col];
            if (val === null) return false;
            if (fixed?.[row][col] !== null) return false; // original fixed cell, not locked
            return val === solution[row][col];
        },
        [board, solution, fixed]
    );

    const canWriteSelected =
        !!selected &&
        !isPaused &&
        !isPencilMode &&
        !isFixedCell(selected.row, selected.col) &&
        !isLockedCell(selected.row, selected.col);

    const writeOverlayPosition = useMemo(() => {
        if (!selected) return null;
        const gridBox = actualGridSize + GRID_BORDER * 2;
        const cellCenterX = GRID_BORDER + selected.col * cellSize + cellSize / 2;
        const cellCenterY = GRID_BORDER + selected.row * cellSize + cellSize / 2;
        const left = Math.max(
            -overlaySize * 0.2,
            Math.min(cellCenterX - overlaySize / 2, gridBox - overlaySize * 0.8)
        );
        const top = Math.max(
            -overlaySize * 0.2,
            Math.min(cellCenterY - overlaySize / 2, gridBox - overlaySize * 0.8)
        );
        return { left, top };
    }, [selected, actualGridSize, cellSize, overlaySize]);

    const handleHandwriting = useCallback(
        (digit: number) => {
            if (!selected) return;
            handleInput(selected.row, selected.col, digit);
        },
        [selected, handleInput]
    );

    /* -------------------- RENDER -------------------- */
    return (
        <View className="w-full items-center justify-center py-3">
            <InfoBar />

            <View className="mt-2" style={{ position: "relative" }}>
                {/* Outer grid wrapper */}
                <View
                    className="border-2 border-primary bg-surface rounded-xl overflow-hidden"
                    style={{
                        width: actualGridSize + 4,
                        height: actualGridSize + 4,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.18,
                        shadowRadius: 10,
                        elevation: 6,
                    }}
                >
                    <View className="flex-col" style={{ width: actualGridSize, height: actualGridSize }}>
                        {/* 3×3 boxes */}
                        {[0, 1, 2].map((boxRow) => (
                            <View key={boxRow} className="flex-row">
                                {[0, 1, 2].map((boxCol) => (
                                    <View
                                        key={boxCol}
                                        className={[
                                            "flex-col overflow-hidden",
                                            boxCol < 2 ? "border-r-2 border-primary" : "",
                                            boxRow < 2 ? "border-b-2 border-primary" : "",
                                        ].join(" ")}
                                        style={{ width: cellSize * 3, height: cellSize * 3 }}
                                    >
                                        {[0, 1, 2].map((cellRow) => {
                                            const r = boxRow * BOX_SIZE + cellRow;
                                            return (
                                                <View key={cellRow} className="flex-row">
                                                    {[0, 1, 2].map((cellCol) => {
                                                        const c = boxCol * BOX_SIZE + cellCol;
                                                        return (
                                                            <View
                                                                key={cellCol}
                                                                className={[
                                                                    cellCol < 2 ? "border-r border-border" : "",
                                                                    cellRow < 2 ? "border-b border-border" : "",
                                                                ].join(" ")}
                                                                style={{ width: cellSize, height: cellSize }}
                                                            >
                                                                <SudokuCell
                                                                    value={board?.[r][c] ?? null}
                                                                    isSelected={
                                                                        selected?.row === r && selected?.col === c
                                                                    }
                                                                    isRelated={
                                                                        selected?.row === r ||
                                                                        selected?.col === c ||
                                                                        isSameBox(r, c)
                                                                    }
                                                                    isSameNumber={isSameNumber(r, c)}
                                                                    isFixed={isFixedCell(r, c)}
                                                                    isLocked={isLockedCell(r, c)}
                                                                    isError={isError(r, c)}
                                                                    notes={notes?.[r][c] || new Set()}
                                                                    onPress={() => handleCellSelect(r, c)}
                                                                    cellSize={cellSize}
                                                                />
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            );
                                        })}
                                    </View>
                                ))}
                            </View>
                        ))}
                    </View>
                </View>

                {canWriteSelected && writeOverlayPosition ? (
                    <View
                        pointerEvents="box-none"
                        style={{
                            position: "absolute",
                            left: writeOverlayPosition.left,
                            top: writeOverlayPosition.top,
                            zIndex: 30,
                            elevation: 30,
                        }}
                    >
                        <DigitWriteOverlay
                            key={`${selected!.row}-${selected!.col}`}
                            size={overlaySize}
                            strokeColor={colors.foreground}
                            onRecognized={handleHandwriting}
                            onDismiss={() => setSelected(null)}
                        />
                    </View>
                ) : null}
            </View>

            <Toolbar onErase={handleErase} selected={selected} />
            <NumberRow
                onNumberPress={(num) =>
                    handleInput(selected?.row ?? -1, selected?.col ?? -1, num)
                }
                remaining={remaining}
            />
        </View>
    );
};

export default Grid;
