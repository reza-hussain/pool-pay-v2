import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, spacing, type } from "../theme/tokens";

// Design kit section 01 (.list-item) — docs/design/poolpay-ui-kit.html.
// Shared row shape for transaction rows, member rows, and key-value rows —
// `leading` is omitted for key-value rows, which have no avatar.
export function ListRow({
  leading,
  title,
  subtitle,
  right,
  onPress,
  divider = true,
  style,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <>
      {leading}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </>
  );

  const rowStyle = [styles.row, divider && styles.divider, style];

  if (onPress) {
    return (
      <Pressable style={rowStyle} onPress={onPress}>
        {content}
      </Pressable>
    );
  }
  return <View style={rowStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s3,
    paddingVertical: spacing.s3,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  text: {
    flex: 1,
  },
  title: {
    ...type.bodyBold,
    color: colors.ink900,
  },
  subtitle: {
    ...type.caption,
    marginTop: 2,
  },
  right: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
});
