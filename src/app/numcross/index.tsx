import { Text } from "@/components/ui/text";
import { useNumCrossStore } from "@/store/numcross";
import { useThemeColors } from "@/utils/useThemeColors";
import { View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function NumCrossMenuScreen() {
  const colors = useThemeColors();
  const { levelNum, totalScore, levelStreak, bestStreak, hintsPool, initLevel } = useNumCrossStore();

  const startPlay = () => {
    initLevel();
    router.push("/numcross/play");
  };

  return (
    <SafeAreaView style={{ flex: 1 }} className="font-sans">
      <View className="flex-1 px-5 pt-6 pb-10 justify-between">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.replace("/")}
            className="p-3 bg-surface rounded-full border border-border"
            accessibilityLabel="All games"
          >
            <Ionicons name="grid-outline" size={22} color={colors.foreground} />
          </Pressable>
          <Pressable
            onPress={() => router.navigate("/settings")}
            className="p-3 bg-surface rounded-full border border-border"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        <View className="items-center px-2">
          <Text className="text-5xl font-bold text-foreground">NumCross</Text>
          <Text className="text-lg text-muted mt-2 text-center">
            Place numbers so every equation adds up
          </Text>
          <Text className="text-xs text-muted mt-3 text-center">
            Puzzle engine adapted from NumCross (MIT)
          </Text>

          <View className="w-full mt-10 bg-surface border border-border rounded-2xl p-4 gap-3">
            <StatRow label="Level" value={String(levelNum)} />
            <StatRow label="Score" value={String(totalScore)} />
            <StatRow label="Streak" value={`${levelStreak} (best ${bestStreak})`} />
            <StatRow label="Hints" value={String(hintsPool)} />
          </View>
        </View>

        <Pressable
          onPress={startPlay}
          className="w-full items-center bg-primary py-4 rounded-xl active:opacity-80"
          accessibilityLabel="Play NumCross"
        >
          <Text className="text-background text-xl font-medium">Play</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-base text-muted">{label}</Text>
      <Text className="text-base font-semibold text-foreground">{value}</Text>
    </View>
  );
}
