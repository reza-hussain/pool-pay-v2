import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { isMoneyIn, usePolledLedger, type LedgerEntry } from "../api/ledgerClient";
import { Screen } from "../components/Screen";
import { phoneSuffix } from "../lib/identity";
import { paiseToRupeeLabel } from "../lib/money";
import { formatTimestamp } from "../lib/time";
import { colors, radii, spacing, type } from "../theme/tokens";

// Exported so UserDetailScreen (ADR-0018) reuses the same wording for its
// Deposit/Reimbursement/Refund history rows.
export function entryLabel(entry: LedgerEntry, sessionUserId: string): string {
  switch (entry.type) {
    case "DEPOSIT": {
      const who = entry.counterparty === sessionUserId ? "You" : `Member ···${phoneSuffix(entry.counterparty)}`;
      return `${who} deposited`;
    }
    case "SPEND":
      return `Paid ${entry.counterparty}`;
    case "REIMBURSEMENT": {
      const who = entry.counterparty === sessionUserId ? "you" : `Member ···${phoneSuffix(entry.counterparty)}`;
      return `Reimbursed ${who}`;
    }
    case "REFUND": {
      const who = entry.counterparty === sessionUserId ? "you" : `Member ···${phoneSuffix(entry.counterparty)}`;
      return `Refunded ${who}`;
    }
  }
}

// Exported so PoolDetailScreen can render the same row for its "Recent
// activity" preview instead of rebuilding this rendering — the ticket that
// added it explicitly reuses this screen's data-fetching, and reusing the
// row markup too keeps the two surfaces visually identical.
export function EntryRow({ entry, sessionUserId }: { entry: LedgerEntry; sessionUserId: string }) {
  const isInflow = isMoneyIn(entry.type);
  return (
    <View style={styles.row}>
      <View style={[styles.iconCircle, isInflow ? styles.iconCircleGreen : styles.iconCircleInk]}>
        <Text style={styles.iconGlyph}>{isInflow ? "↓" : "↑"}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{entryLabel(entry, sessionUserId)}</Text>
        <Text style={styles.rowSubtitle}>
          {formatTimestamp(entry.createdAt)}
          {entry.type === "SPEND" && entry.feePaise
            ? ` · fee ${paiseToRupeeLabel(entry.feePaise)}`
            : ""}
        </Text>
      </View>
      <Text style={[styles.amount, isInflow ? styles.amountGreen : styles.amountInk]}>
        {isInflow ? "+" : "−"}
        {paiseToRupeeLabel(entry.amountPaise)}
      </Text>
    </View>
  );
}

export function LedgerScreen({
  session,
  pool,
  onCancel,
}: {
  session: StoredSession;
  pool: Pool;
  onCancel: () => void;
}) {
  const { entries, error } = usePolledLedger(session.token, pool.id);

  return (
    <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>
          <View style={{ width: 24 }} />
        </View>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.subtitle}>{pool.name}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {entries.length === 0 ? (
          <Text style={styles.empty}>No activity yet</Text>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(entry) => entry.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <EntryRow entry={item} sessionUserId={session.user.id} />}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    padding: spacing.s6,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.s5,
  },
  back: {
    fontSize: 24,
    color: colors.ink900,
  },
  title: {
    ...type.title,
    color: colors.ink900,
  },
  subtitle: {
    ...type.caption,
    marginBottom: spacing.s5,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginBottom: spacing.s3,
  },
  empty: {
    ...type.body,
    color: colors.ink400,
    textAlign: "center",
    marginTop: spacing.s8,
  },
  list: {
    gap: spacing.s2,
    paddingBottom: spacing.s8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.s3,
    gap: spacing.s3,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleGreen: {
    backgroundColor: colors.green100,
  },
  iconCircleInk: {
    backgroundColor: colors.ink100,
  },
  iconGlyph: {
    ...type.bodyBold,
    fontSize: 16,
    color: colors.ink900,
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
  amount: {
    ...type.bodyBold,
    fontSize: 14,
  },
  amountGreen: {
    color: colors.green600,
  },
  amountInk: {
    color: colors.ink900,
  },
});
