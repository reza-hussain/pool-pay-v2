import { Text, View } from "react-native";
import { Screen } from "../components/Screen";
import { colors, spacing, type } from "../theme/tokens";

// Placeholder tab landed with the tab bar shell (ticket #21) — the real
// cross-Pool Deposit/Refund feed is its own ticket (#22).
export function ActivityScreen() {
  return (
    <Screen backgroundColor={colors.cream} edges={["top"]}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.s6 }}>
        <Text style={[type.title, { color: colors.ink900 }]}>Activity</Text>
        <Text style={[type.body, { color: colors.ink400, marginTop: spacing.s2, textAlign: "center" }]}>
          Your Deposits and Refunds across every Pool will show up here soon.
        </Text>
      </View>
    </Screen>
  );
}
