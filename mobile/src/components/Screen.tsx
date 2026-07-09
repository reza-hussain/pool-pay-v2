import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/tokens";

type Edge = "top" | "bottom";

// Every screen previously padded its content with a flat spacing.s6 and
// nothing else, so the back button / title sat under the status bar clock on
// devices with a notch/Dynamic Island. This wraps a screen's existing root
// View without touching its internal layout — it just pushes the whole thing
// down (and up off the home indicator) by the device's real safe-area insets.
export function Screen({
  children,
  backgroundColor = colors.cream,
  edges = ["top", "bottom"],
  style,
}: {
  children: ReactNode;
  backgroundColor?: string;
  edges?: Edge[];
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        { flex: 1, backgroundColor },
        edges.includes("top") && { paddingTop: insets.top },
        edges.includes("bottom") && { paddingBottom: insets.bottom },
        style,
      ]}
    >
      {children}
    </View>
  );
}
