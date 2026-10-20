import { Text } from "@/components/ui/text";
import { useNumCrossStore } from "@/store/numcross";
import { formatTime } from "@/numcross/engine/scoring";
import { useThemeColors } from "@/utils/useThemeColors";
import { useEffect } from "react";
import {
  View,
  Pressable,
  Modal,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Cell } from "@/numcross/engine/types";

export default function NumCrossPlayScreen() {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const {
    levelData,
    liveGrid,
    tileUsed,
    selRC,
    timerSec,
    totalScore,
    hintsPool,
    winModal,
    lastBreakdown,
    toast,
    initLevel,
    tickTimer,
    selectCell,
    placeTile,
    clearSelected,
    undoMove,
    useHint,
    checkSolution,
    nextLevel,
    resetLevel,
    dismissToast,
    closeWinModal,
  } = useNumCrossStore();

  useEffect(() => {
    if (!levelData) initLevel();
  }, [levelData, initLevel]);

  useEffect(() => {
    if (winModal) return;
    const id = setInterval(tickTimer, 1000);
    return () => clearInterval(id);
  }, [tickTimer, winModal]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(dismissToast, 1800);
    return () => clearTimeout(id);
  }, [toast, dismissToast]);

  if (!levelData || liveGrid.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1 }} className="items-center justify-center bg-background">
        <Text className="text-foreground">Generating puzzle…</Text>
      </SafeAreaView>
    );
  }

  const cols = levelData.cols;
  const cellSize = Math.max(28, Math.min(44, Math.floor((width - 40) / Math.max(cols, 1))));

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background font-sans">
      <View className="flex-1 px-3 pt-2 pb-4">
        <View className="flex-row items-center justify-between mb-3">
          <Pressable
            onPress={() => router.back()}
            className="p-2"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View className="items-center">
            <Text className="text-lg font-bold text-foreground">
              Level {levelData.levelNum} · {levelData.difficulty}
            </Text>
            <Text className="text-xs text-muted">{levelData.name}</Text>
          </View>
          <View className="items-end min-w-[56px]">
            <Text className="text-sm font-semibold text-foreground">{formatTime(timerSec)}</Text>
            <Text className="text-xs text-muted">{totalScore} pts</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ alignItems: "center", paddingBottom: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            className="bg-surface border-2 border-primary rounded-xl overflow-hidden p-1"
            style={{ width: cellSize * cols + 8 }}
          >
            {liveGrid.map((row, r) => (
              <View key={r} className="flex-row">
                {row.map((cell, c) => (
                  <NumCrossCell
                    key={`${r}-${c}`}
                    cell={cell}
                    size={cellSize}
                    selected={selRC?.r === r && selRC?.c === c}
                    onPress={() => selectCell(r, c)}
                    colors={colors}
                  />
                ))}
              </View>
            ))}
          </View>

          <Text className="text-sm text-muted mt-4 mb-2">Number tiles</Text>
          <View className="flex-row flex-wrap justify-center gap-2 px-2">
            {levelData.tiles.map((tile, idx) => {
              const used = tileUsed[idx] !== null;
              return (
                <Pressable
                  key={`${tile}-${idx}`}
                  disabled={used}
                  onPress={() => placeTile(idx)}
                  className={`min-w-[44px] h-11 px-3 rounded-xl border items-center justify-center ${
                    used ? "opacity-30 border-border bg-surface" : "border-primary bg-primary/15"
                  }`}
                  accessibilityLabel={`Place ${tile}`}
                >
                  <Text className="text-lg font-bold text-foreground">{tile}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View className="flex-row flex-wrap justify-center gap-2 mt-2">
          <ToolButton label="Clear" onPress={clearSelected} colors={colors} />
          <ToolButton label="Undo" onPress={undoMove} colors={colors} />
          <ToolButton label={`Hint (${hintsPool})`} onPress={useHint} colors={colors} />
          <ToolButton label="Reset" onPress={resetLevel} colors={colors} />
          <Pressable
            onPress={checkSolution}
            className="px-4 py-2.5 rounded-xl bg-primary active:opacity-80"
          >
            <Text className="text-background font-semibold">Check</Text>
          </Pressable>
        </View>

        {toast ? (
          <View className="absolute bottom-24 left-4 right-4 bg-foreground/90 rounded-xl px-4 py-3">
            <Text className="text-background text-center">{toast}</Text>
          </View>
        ) : null}
      </View>

      <Modal visible={winModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="bg-background rounded-2xl p-6 w-full max-w-md">
            <Text className="text-3xl font-bold text-foreground text-center">Solved!</Text>
            <Text className="text-muted text-center mt-2">
              {levelData.name} · {formatTime(timerSec)}
            </Text>
            {lastBreakdown ? (
              <View className="bg-surface rounded-xl p-4 mt-4 gap-2">
                <ScoreLine label="Base" value={lastBreakdown.base} />
                <ScoreLine label="Time bonus" value={lastBreakdown.timeBonus} />
                <ScoreLine label="Streak" value={lastBreakdown.streakBonus} />
                <ScoreLine label="Total" value={lastBreakdown.total} bold />
              </View>
            ) : null}
            <Pressable
              onPress={nextLevel}
              className="bg-primary py-4 rounded-xl items-center mt-5 active:opacity-80"
            >
              <Text className="text-background text-lg font-medium">Next level</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                closeWinModal();
                router.back();
              }}
              className="bg-surface border border-border py-3 rounded-xl items-center mt-3"
            >
              <Text className="text-foreground font-medium">Back to menu</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function NumCrossCell({
  cell,
  size,
  selected,
  onPress,
  colors,
}: {
  cell: Cell;
  size: number;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  if (!cell) {
    return <View style={{ width: size, height: size }} />;
  }

  if (cell.t === "F") {
    const isOp = typeof cell.v === "string";
    return (
      <View
        style={{ width: size, height: size }}
        className="items-center justify-center"
      >
        <Text
          className={isOp ? "text-muted font-semibold" : "text-foreground font-bold"}
          style={{ fontSize: isOp ? size * 0.42 : size * 0.45 }}
        >
          {String(cell.v)}
        </Text>
      </View>
    );
  }

  const statusBg =
    cell.status === "ok"
      ? "bg-primary/25"
      : cell.status === "bad"
        ? "bg-error-bg"
        : selected
          ? "bg-cell-selected/40"
          : "bg-background";

  return (
    <Pressable
      onPress={onPress}
      disabled={!!cell.hint}
      style={{ width: size, height: size }}
      className={`items-center justify-center border border-border m-px rounded-md ${statusBg}`}
      accessibilityLabel={
        cell.val != null ? `Cell value ${cell.val}` : "Empty cell"
      }
    >
      <Text
        style={{
          fontSize: size * 0.45,
          color: cell.hint ? colors.primary : colors.foreground,
          fontWeight: "700",
        }}
      >
        {cell.val ?? ""}
      </Text>
    </Pressable>
  );
}

function ToolButton({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="px-3 py-2.5 rounded-xl border border-border bg-surface active:opacity-80"
    >
      <Text style={{ color: colors.foreground }} className="font-medium text-sm">
        {label}
      </Text>
    </Pressable>
  );
}

function ScoreLine({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <View className="flex-row justify-between">
      <Text className={`text-muted ${bold ? "font-bold text-foreground" : ""}`}>{label}</Text>
      <Text className={`text-foreground ${bold ? "font-bold" : ""}`}>{value}</Text>
    </View>
  );
}
