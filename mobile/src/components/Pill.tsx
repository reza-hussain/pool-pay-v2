import { StyleSheet, Text, View } from "react-native";
import { colors, fontFamily, spacing } from "../theme/tokens";

// Design kit section 01 (.pill / .pill-*) — docs/design/poolpay-ui-kit.html.
export type PillVariant = "dark" | "outline" | "green" | "danger" | "flax" | "pumpkin";

const variants: Record<PillVariant, { container: object; text: object }> = {
  dark: {
    container: { backgroundColor: colors.ink900 },
    text: { color: colors.cream },
  },
  outline: {
    container: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.lineStrong },
    text: { color: colors.ink900 },
  },
  green: {
    container: { backgroundColor: colors.green100 },
    text: { color: colors.green600 },
  },
  danger: {
    container: { backgroundColor: colors.danger100 },
    text: { color: colors.danger600 },
  },
  flax: {
    container: { backgroundColor: colors.flax500 },
    text: { color: colors.ink900 },
  },
  pumpkin: {
    container: { backgroundColor: colors.pumpkin500 },
    text: { color: colors.paper },
  },
};

export function Pill({ label, variant = "outline" }: { label: string; variant?: PillVariant }) {
  const v = variants[variant];
  return (
    <View style={[styles.base, v.container]}>
      <Text style={[styles.label, v.text]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: spacing.s3,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  label: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    lineHeight: 14.3,
  },
});
