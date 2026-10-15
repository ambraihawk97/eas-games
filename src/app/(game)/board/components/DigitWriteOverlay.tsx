import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
  Pressable,
} from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/utils/useThemeColors";
import { recognizeDigit, type Point, type Stroke } from "@/utils/digit-recognizer";

type Props = {
  size: number;
  strokeColor: string;
  onRecognized: (digit: number) => void;
  onDismiss?: () => void;
};

const RECOGNIZE_DELAY_MS = 480;
const INK_RADIUS = 2.2;

function eventPoint(e: GestureResponderEvent): Point {
  const { locationX, locationY } = e.nativeEvent;
  return { x: locationX, y: locationY };
}

export default function DigitWriteOverlay({
  size,
  strokeColor,
  onRecognized,
  onDismiss,
}: Props) {
  const colors = useThemeColors();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [liveStroke, setLiveStroke] = useState<Stroke>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const liveRef = useRef<Stroke>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognizingRef = useRef(false);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const clearInk = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    strokesRef.current = [];
    liveRef.current = [];
    setStrokes([]);
    setLiveStroke([]);
  }, []);

  const scheduleRecognize = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (recognizingRef.current) return;
      const result = recognizeDigit(strokesRef.current);
      if (!result) return;
      recognizingRef.current = true;
      onRecognized(result.digit);
      strokesRef.current = [];
      liveRef.current = [];
      setStrokes([]);
      setLiveStroke([]);
      recognizingRef.current = false;
    }, RECOGNIZE_DELAY_MS);
  }, [onRecognized]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          if (timerRef.current) clearTimeout(timerRef.current);
          const p = eventPoint(e);
          liveRef.current = [p];
          setLiveStroke([p]);
        },
        onPanResponderMove: (e: GestureResponderEvent, _g: PanResponderGestureState) => {
          const p = eventPoint(e);
          const next = [...liveRef.current, p];
          liveRef.current = next;
          setLiveStroke(next);
        },
        onPanResponderRelease: () => {
          const finished = liveRef.current;
          liveRef.current = [];
          setLiveStroke([]);
          if (finished.length > 0) {
            const next = [...strokesRef.current, finished];
            strokesRef.current = next;
            setStrokes(next);
            scheduleRecognize();
          }
        },
        onPanResponderTerminate: () => {
          const finished = liveRef.current;
          liveRef.current = [];
          setLiveStroke([]);
          if (finished.length > 0) {
            const next = [...strokesRef.current, finished];
            strokesRef.current = next;
            setStrokes(next);
            scheduleRecognize();
          }
        },
      }),
    [scheduleRecognize]
  );

  const inkDots = useMemo(() => {
    const all = liveStroke.length ? [...strokes, liveStroke] : strokes;
    const dots: { key: string; x: number; y: number }[] = [];
    all.forEach((stroke, si) => {
      // Downsample for performance while keeping the glyph readable.
      const step = Math.max(1, Math.floor(stroke.length / 48));
      for (let i = 0; i < stroke.length; i += step) {
        const p = stroke[i];
        dots.push({ key: `${si}-${i}`, x: p.x, y: p.y });
      }
    });
    return dots;
  }, [strokes, liveStroke]);

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
      <Text style={[styles.hint, { color: colors.muted }]}>Write 1–9</Text>
      <View style={styles.canvas} {...panResponder.panHandlers}>
        {inkDots.map((d) => (
          <View
            key={d.key}
            pointerEvents="none"
            style={[
              styles.ink,
              {
                left: d.x - INK_RADIUS,
                top: d.y - INK_RADIUS,
                backgroundColor: strokeColor,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable onPress={clearInk} hitSlop={8} accessibilityLabel="Clear writing">
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
    position: "absolute",
    top: 6,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 11,
    zIndex: 2,
  },
  canvas: {
    flex: 1,
  },
  ink: {
    position: "absolute",
    width: INK_RADIUS * 2,
    height: INK_RADIUS * 2,
    borderRadius: INK_RADIUS,
  },
  actions: {
    position: "absolute",
    bottom: 4,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 2,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
