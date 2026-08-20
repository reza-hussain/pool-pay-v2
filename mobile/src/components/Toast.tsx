import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, fontFamily } from "../theme/tokens";

const AUTO_DISMISS_MS = 2400;

// Floats 104pt above the bottom edge and auto-dismisses after 2.4s, per the
// .toast.float spec in docs/design/poolpay-ui-kit.html.
export function Toast({ message, onHide }: { message: string | null; onHide: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onHide, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message, onHide]);

  if (!message) return null;

  return (
    <View style={styles.float} pointerEvents="none">
      <View style={styles.toast}>
        <Svg width={15} height={15} viewBox="0 0 24 24" stroke={colors.flax500} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M5 13l4 4L19 7" />
        </Svg>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  float: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 104,
    alignItems: "center",
    zIndex: 30,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.ink900,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    shadowColor: "rgba(23,20,12,0.45)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 6,
  },
  text: {
    color: colors.cream,
    fontSize: 13,
    fontFamily: fontFamily.semibold,
  },
});
