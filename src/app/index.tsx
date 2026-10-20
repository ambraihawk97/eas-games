import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/utils/useThemeColors";
import { Image, View, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

type GameOption = {
  id: string;
  title: string;
  tagline: string;
  href: Href;
  icon: number;
  available: boolean;
};

const GAMES: GameOption[] = [
  {
    id: "solve9",
    title: "Solve9",
    tagline: "Classic sudoku — think in grid",
    href: "/solve9",
    icon: require("../../assets/icon.png"),
    available: true,
  },
  {
    id: "numcross",
    title: "NumCross",
    tagline: "Arithmetic crossword — make every equation true",
    href: "/numcross",
    icon: require("../../assets/icon.png"),
    available: true,
  },
];

export default function GamesLandingScreen() {
  const colors = useThemeColors();

  return (
    <SafeAreaView style={{ flex: 1 }} className="font-sans">
      <View className="flex-1 px-5 pt-6 pb-8">
        <View className="flex-row items-center justify-between mb-8">
          <View>
            <Text className="text-4xl font-bold text-foreground">Games</Text>
            <Text className="text-base text-muted mt-1">Pick something to play</Text>
          </View>
          <Pressable
            onPress={() => router.navigate("/settings")}
            className="p-3 bg-surface rounded-full border border-border"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ gap: 14, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {GAMES.map((game) => {
            const disabled = !game.available;
            return (
              <Pressable
                key={game.id}
                disabled={disabled}
                onPress={() => {
                  if (!disabled) router.push(game.href);
                }}
                className={`flex-row items-center bg-surface border border-border rounded-2xl px-4 py-4 ${
                  disabled ? "opacity-45" : "active:opacity-80"
                }`}
                accessibilityLabel={
                  disabled ? `${game.title}, coming soon` : `Play ${game.title}`
                }
                accessibilityState={{ disabled }}
              >
                <Image source={game.icon} style={{ width: 64, height: 64 }} />
                <View className="flex-1 ml-4">
                  <Text className="text-2xl font-bold text-foreground">{game.title}</Text>
                  <Text className="text-sm text-muted mt-1">{game.tagline}</Text>
                  {!game.available ? (
                    <Text className="text-xs font-semibold text-primary mt-2 uppercase tracking-wide">
                      Coming soon
                    </Text>
                  ) : null}
                </View>
                {game.available ? (
                  <Ionicons name="chevron-forward" size={22} color={colors.muted} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
