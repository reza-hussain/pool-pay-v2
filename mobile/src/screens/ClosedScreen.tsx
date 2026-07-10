import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import type { ClosureRefund } from "../api/closureClient";
import { Screen } from "../components/Screen";
import { paiseToRupeeLabel } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

// No Member profile (name/phone) exists yet — same shortened-userId label used
// on the Reimburse screen.
function memberLabel(memberId: string, sessionUserId: string): string {
  const short = memberId.slice(-4);
  const you = memberId === sessionUserId ? " (you)" : "";
  return `Member ···${short}${you}`;
}

export function ClosedScreen({
  session,
  pool,
  refunds,
  onDone,
}: {
  session: StoredSession;
  pool: Pool;
  refunds: ClosureRefund[];
  onDone: () => void;
}) {
  const refundTotalPaise = refunds.reduce((sum, r) => sum + r.amountPaise, 0);

  return (
    <Screen backgroundColor={colors.cream}>
    <View style={styles.container}>
      <View style={styles.checkRing}>
        <Text style={styles.checkGlyph}>✓</Text>
      </View>
      <Text style={styles.title}>Pool closed</Text>
      <Text style={styles.subtitle}>
        {pool.name} · {paiseToRupeeLabel(refundTotalPaise)} refunded pro-rata
      </Text>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={refunds}
        keyExtractor={(refund) => refund.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{memberLabel(item.memberId, session.user.id)}</Text>
              <Text style={styles.rowSubtitle}>Deposited {paiseToRupeeLabel(item.contributedPaise)}</Text>
            </View>
            <Text style={styles.rowAmount}>+{paiseToRupeeLabel(item.amountPaise)}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No balance to refund</Text>}
      />

      <Pressable style={styles.doneButton} onPress={onDone}>
        <Text style={styles.doneButtonText}>Done</Text>
      </Pressable>
    </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: "center",
    padding: spacing.s6,
  },
  checkRing: {
    width: 66,
    height: 66,
    borderRadius: radii.lg,
    backgroundColor: colors.green100,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s5,
  },
  checkGlyph: {
    fontSize: 30,
    color: colors.green600,
  },
  title: {
    ...type.title,
    color: colors.ink900,
    marginTop: spacing.s4,
  },
  subtitle: {
    ...type.caption,
    marginTop: spacing.s1,
  },
  list: {
    width: "100%",
    marginTop: spacing.s5,
  },
  listContent: {
    gap: spacing.s2,
    paddingBottom: spacing.s6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.s3,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    ...type.bodyBold,
    fontSize: 13.5,
    color: colors.ink900,
  },
  rowSubtitle: {
    ...type.caption,
    marginTop: 2,
  },
  rowAmount: {
    ...type.bodyBold,
    fontSize: 14,
    color: colors.green600,
  },
  empty: {
    ...type.body,
    color: colors.ink400,
    textAlign: "center",
    marginTop: spacing.s6,
  },
  doneButton: {
    width: "100%",
    height: 48,
    backgroundColor: colors.ink900,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s4,
  },
  doneButtonText: {
    ...type.bodyBold,
    color: colors.cream,
  },
});
