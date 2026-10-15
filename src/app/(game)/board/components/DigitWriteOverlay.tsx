import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  type GestureResponderEvent,
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

const RECOGNIZE_DELAY_MS = 650;
const STROKE_WIDTH = 4.5;

function eventPoint(e: GestureResponderEvent): Point {
  const { locationX, locationY } = e.nativeEvent;
  return { x: locationX, y: locationY };
}

function strokeToSegments(stroke: Stroke, color: string, keyPrefix: string) {
  const segments: ReactNode[] = [];
  // Skip points for smoother, cheaper line rendering while still looking continuous.
  const step = Math.max(1, Math.floor(stroke.length / 80));
  for (let i = step; i < stroke.length; i += step) {
    const a = stroke[i - step];
    const b = stroke[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.8) continue;
    const angle = Math.atan2(dy, dx);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    segments.push(
      <View
        key={`${keyPrefix}-${i}`}
        pointerEvents="none"
        style={{
          position: "absolute",
          left: midX - length / 2,
          top: midY - STROKE_WIDTH / 2,
          width: length,
          height: STROKE_WIDTH,
          borderRadius: STROKE_WIDTH / 2,
          backgroundColor: color,
          transform: [{ rotate: `${angle}rad` }],
        }}
      />
    );
  }
  // Round caps at endpoints
  if (stroke.length > 0) {
    const first = stroke[0];
    const last = stroke[stroke.length - 1];
    for (const [tag, p] of [
      ["s", first],
      ["e", last],
    ] as const) {
      segments.push(
        <View
          key={`${keyPrefix}-${tag}`}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: p.x - STROKE_WIDTH / 2,
            top: p.y - STROKE_WIDTH / 2,
            width: STROKE_WIDTH,
            height: STROKE_WIDTH,
            borderRadius: STROKE_WIDTH / 2,
            backgroundColor: color,
          }}
        />
      );
    }
  }
  return segments;
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
  const [status, setStatus] = useState<string>("Write 1–9");
  const strokesRef = useRef<Stroke[]>([]);
  const liveRef = useRef<Stroke[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<number | null>(null);
  const recognizingRef = useRef(false);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const clearInk = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    strokesRef.current = [];
    liveRef.current = [];
    setStrokes([]);
    setLiveStroke([]);
    setStatus("Write 1–9");
  }, []);

  const scheduleRecognize = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (recognizingRef.current) return;
      const result = recognizeDigit(strokesRef.current);
      if (!result) {
        strokesRef.current = [];
        liveRef.current = [];
        setStrokes([]);
        setLiveStroke([]);
        setStatus("Couldn't read — try again");
        return;
      }
      recognizingRef.current = true;
      onRecognized(result.digit);
      strokesRef.current = [];
      liveRef.current = [];
      setStrokes([]);
      setLiveStroke([]);
      recognizingRef.current = false;
    }, RECOGNIZE_DELAY_MS);
  }, [onRecognized]);

  const queueLiveRender = useCallback(() => {
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setLiveStroke([...liveRef.current]);
    });
  }, []);

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
          setStatus("Write 1–9");
          const p = eventPoint(e);
          liveRef.current = [p];
          setLiveStroke([p]);
        },
        onPanResponderMove: (e: GestureResponderEvent) => {
          const p = eventPoint(e);
          const prev = liveRef.current[liveRef.current.length - 1];
          // Ignore microscopic jitter from Apple Pencil sampling.
          if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 0.6) return;
          liveRef.current = [...liveRef.current, p];
          queueLiveRender();
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
    [queueLiveRender, scheduleRecognize]
  );

  const ink = useMemo(() => {
    const all = liveStroke.length ? [...strokes, liveStroke] : strokes;
    return all.flatMap((stroke, si) => strokeToSegments(stroke, strokeColor, `s${si}`));
  }, [strokes, liveStroke, strokeColor]);

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
      <Text style={[styles.hint, { color: colors.muted }]}>{status}</Text>
      <View style={styles.canvas} {...panResponder.panHandlers}>
        {ink}
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
