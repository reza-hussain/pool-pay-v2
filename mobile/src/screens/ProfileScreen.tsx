import { Text, View } from "react-native";
import { Screen } from "../components/Screen";
import { colors, spacing, type } from "../theme/tokens";

// Placeholder tab landed with the tab bar shell (ticket #21) — the real
// UPI ID / Help centre / Log out / Face ID lock screen is its own ticket (#24).
export function ProfileScreen() {
  return (
    <Screen backgroundColor={colors.cream} edges={["top"]}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.s6 }}>
        <Text style={[type.title, { color: colors.ink900 }]}>Profile</Text>
        <Text style={[type.body, { color: colors.ink400, marginTop: spacing.s2, textAlign: "center" }]}>
          Your account and settings will show up here soon.
        </Text>
      </View>
    </Screen>
  );
}
