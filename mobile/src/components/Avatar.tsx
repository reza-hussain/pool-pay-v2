import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors, fontFamily } from "../theme/tokens";

// Design kit section 01 (.avatar / .avatar.lg / .avatar-stack .a) — docs/design/poolpay-ui-kit.html.

export type AvatarSize = "default" | "lg";

// Omitting `label` renders a generic placeholder glyph instead of an initial —
// User Detail's header uses this (ADR-0018: "placeholder avatar, no initials",
// since there's no real name to take an initial from).
export function Avatar({ label, size = "default" }: { label?: string; size?: AvatarSize }) {
  const isLg = size === "lg";
  const glyphSize = isLg ? 32 : 18;
  return (
    <View style={[styles.circle, styles.base, isLg ? styles.lg : styles.default]}>
      {label ? (
        <Text style={isLg ? styles.letterLg : styles.letterDefault}>{label}</Text>
      ) : (
        <Svg
          width={glyphSize}
          height={glyphSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.ink900}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Circle cx={12} cy={8} r={4} />
          <Path d="M4 21c1.6-4 5-5 8-5s6.4 1 8 5" />
        </Svg>
      )}
    </View>
  );
}

// Member-group avatar stack, most recent first — overlapping circles with a "+N" overflow avatar.
export function AvatarStack({ labels, max = 3 }: { labels: string[]; max?: number }) {
  const shown = labels.slice(0, max);
  const overflow = labels.length - shown.length;
  return (
    <View style={styles.stack}>
      {shown.map((label, i) => (
        <View key={i} style={[styles.circle, styles.stackItem, i > 0 && styles.stackItemOverlap]}>
          <Text style={styles.stackLetter}>{label}</Text>
        </View>
      ))}
      {overflow > 0 ? (
        <View style={[styles.circle, styles.stackItem, styles.stackItemOverlap]}>
          <Text style={styles.stackLetter}>{`+${overflow}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.flax300,
  },
  base: {
    flexShrink: 0,
    borderColor: colors.ink900,
  },
  default: {
    width: 36,
    height: 36,
    borderWidth: 1.5,
  },
  lg: {
    width: 64,
    height: 64,
    borderWidth: 2,
  },
  letterDefault: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.ink900,
  },
  letterLg: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.ink900,
  },
  stack: {
    flexDirection: "row",
  },
  stackItem: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.paper,
  },
  stackItemOverlap: {
    marginLeft: -8,
  },
  stackLetter: {
    fontFamily: fontFamily.extrabold,
    fontSize: 9.5,
    color: colors.ink900,
  },
});
