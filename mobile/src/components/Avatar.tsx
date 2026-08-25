import { StyleSheet, Text, View } from "react-native";
import { colors, fontFamily } from "../theme/tokens";

// Design kit section 01 (.avatar / .avatar.lg / .avatar-stack .a) — docs/design/poolpay-ui-kit.html.

export type AvatarSize = "default" | "lg";

export function Avatar({ label, size = "default" }: { label: string; size?: AvatarSize }) {
  const isLg = size === "lg";
  return (
    <View style={[styles.circle, styles.base, isLg ? styles.lg : styles.default]}>
      <Text style={isLg ? styles.letterLg : styles.letterDefault}>{label}</Text>
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
