import { Platform, type GestureResponderEvent } from "react-native";

/**
 * Best-effort Apple Pencil detection for a touch/press event.
 * Expo/RN does not expose "Pencil is paired", but Pencil taps include
 * stylus fields (e.g. altitudeAngle) that finger taps do not.
 */
export function isApplePencilEvent(event?: GestureResponderEvent | null): boolean {
  if (Platform.OS !== "ios" || !event) return false;
  const native = event.nativeEvent as GestureResponderEvent["nativeEvent"] & {
    altitudeAngle?: number;
    azimuthAngle?: number;
    pointerType?: string;
    touchType?: string | number;
  };

  if (typeof native.altitudeAngle === "number") return true;
  if (typeof native.azimuthAngle === "number") return true;

  const pointerType = String(native.pointerType ?? "").toLowerCase();
  if (pointerType === "pen" || pointerType === "stylus") return true;

  const touchType = native.touchType;
  // UITouch.TouchType.pencil === 2 on some bridges
  if (touchType === "pencil" || touchType === "stylus" || touchType === 2) return true;

  return false;
}

/** Pencil input UI is only relevant on iPad. */
export function supportsApplePencilUi(): boolean {
  return Platform.OS === "ios" && Platform.isPad;
}
