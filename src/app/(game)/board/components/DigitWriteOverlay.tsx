import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, TextInput, Platform, Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/utils/useThemeColors";

type Props = {
  size: number;
  strokeColor: string;
  onRecognized: (digit: number) => void;
  onDismiss?: () => void;
};

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function parseDigitChar(text: string): number | null {
  const match = text.replace(/[^1-9]/g, "").slice(-1);
  if (!match) return null;
  return Number(match);
}

/**
 * Enlarged per-cell input pad.
 * - iPadOS Apple Pencil: write into the field (system Scribble → digit)
 * - Always: tap 1–9 below (no custom handwriting ML guesses)
 */
export default function DigitWriteOverlay({
  size,
  strokeColor,
  onRecognized,
  onDismiss,
}: Props) {
  const colors = useThemeColors();
  const [scribbleValue, setScribbleValue] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const acceptDigit = useCallback(
    (digit: number) => {
      onRecognized(digit);
      setScribbleValue("");
    },
    [onRecognized]
  );

  const clearInput = useCallback(() => {
    setScribbleValue("");
    inputRef.current?.focus();
  }, []);

  const padHeight = Math.round(size * 0.38);
  const fieldHeight = size - padHeight - 30;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          backgroundColor: colors.surface,
          borderColor: colors.primary,
          shadowColor: "#000",
        },
      ]}
    >
      <Text style={[styles.hint, { color: colors.muted }]}>
        {Platform.OS === "ios" ? "Write with Pencil or tap" : "Tap a digit"}
      </Text>

      <View style={[styles.fieldWrap, { height: fieldHeight }]}>
        <TextInput
          ref={inputRef}
          value={scribbleValue}
          onChangeText={(text) => {
            const digit = parseDigitChar(text);
            if (digit != null) {
              acceptDigit(digit);
              return;
            }
            setScribbleValue(text);
          }}
          keyboardType="number-pad"
          showSoftInputOnFocus={false}
          autoCorrect={false}
          autoCapitalize="none"
          maxLength={2}
          importantForAutofill="no"
          style={[
            styles.scribbleInput,
            {
              color: strokeColor,
              borderColor: colors.border,
              backgroundColor: colors.background,
            },
          ]}
          placeholder="1–9"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Write or enter a digit"
        />
      </View>

      <View style={[styles.digitPad, { height: padHeight, borderTopColor: colors.border }]}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.digitRow}>
            {DIGITS.slice(row * 3, row * 3 + 3).map((digit) => (
              <Pressable
                key={digit}
                onPress={() => acceptDigit(digit)}
                style={[
                  styles.digitBtn,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
                accessibilityLabel={`Enter ${digit}`}
              >
                <Text style={[styles.digitText, { color: colors.foreground }]}>{digit}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable onPress={clearInput} hitSlop={8} accessibilityLabel="Clear">
          <Text style={[styles.actionText, { color: colors.muted }]}>Clear</Text>
        </Pressable>
        {onDismiss ? (
          <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="Close writing pad">
            <Text style={[styles.actionText, { color: colors.muted }]}>Close</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 2,
    borderRadius: 14,
    overflow: "hidden",
    elevation: 10,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  hint: {
    height: 30,
    textAlign: "center",
    fontSize: 11,
    paddingTop: 8,
  },
  fieldWrap: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  scribbleInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    textAlign: "center",
    fontSize: 56,
    fontWeight: "600",
    paddingHorizontal: 8,
  },
  digitPad: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
    justifyContent: "center",
    gap: 5,
  },
  digitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 5,
  },
  digitBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  digitText: {
    fontSize: 18,
    fontWeight: "700",
  },
  actions: {
    position: "absolute",
    top: 4,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 3,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
