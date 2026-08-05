import { Text, View } from "react-native";
import { Screen } from "../components/Screen";
import { colors, spacing, type } from "../theme/tokens";

// Placeholder tab landed with the tab bar shell (ticket #21) — the real
// Deposit/fully-funded/Locked/Refund notifications feed is its own ticket (#23).
export function AlertsScreen() {
  return (
    <Screen backgroundColor={colors.cream} edges={["top"]}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.s6 }}>
        <Text style={[type.title, { color: colors.ink900 }]}>Alerts</Text>
        <Text style={[type.body, { color: colors.ink400, marginTop: spacing.s2, textAlign: "center" }]}>
          Deposit, funding, and Lock notifications will show up here soon.
        </Text>
      </View>
    </Screen>
  );
}
