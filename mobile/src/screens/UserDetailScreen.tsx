import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { getLedger, isMoneyIn, LedgerApiError, type LedgerEntry } from "../api/ledgerClient";
import { entryLabel } from "./LedgerScreen";
import { Avatar } from "../components/Avatar";
import { ListRow } from "../components/ListRow";
import { Pill } from "../components/Pill";
import { Screen } from "../components/Screen";
import { phoneSuffix } from "../lib/identity";
import { paiseToRupeeLabel } from "../lib/money";
import { formatTimestamp } from "../lib/time";
import { colors, radii, spacing, type } from "../theme/tokens";

// A Member's own Deposit/Reimbursement/Refund history — Spends are excluded,
// since a Spend isn't attributable to one Member (ADR-0018).
const HISTORY_TYPES: LedgerEntry["type"][] = ["DEPOSIT", "REIMBURSEMENT", "REFUND"];

export function UserDetailScreen({
  session,
  pool,
  userId,
  onBack,
  onSelectTransaction,
  onRemoveMember,
}: {
  session: StoredSession;
  pool: Pool;
  userId: string;
  onBack: () => void;
  onSelectTransaction: (entry: LedgerEntry) => void;
  onRemoveMember: () => void;
}) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const suffix = phoneSuffix(userId);
  const isYou = userId === session.user.id;
  // Delete is organizer-only and can't target the organizer's own row — same
  // rules `removeMember` already enforces server-side, mirrored here so the
  // button doesn't appear for an action that's never actually available.
  const canDelete = pool.organizerId === session.user.id && userId !== pool.organizerId;

  useEffect(() => {
    getLedger(session.token, pool.id, { counterparty: userId, types: HISTORY_TYPES })
      .then((page) => setEntries(page.entries))
      .catch((err) => setError(err instanceof LedgerApiError ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, [pool.id, session.token, userId]);

  return (
    <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} hitSlop={8}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.header}>
          <Avatar size="lg" />
          <Text style={styles.name}>Member ···{suffix}</Text>
          <Text style={styles.idLabel}>PoolPay Unique ID ···{suffix}</Text>
          {isYou ? (
            <View style={styles.youPill}>
              <Pill label="You" variant="dark" />
            </View>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionLabel}>History</Text>

        {loading ? (
          <ActivityIndicator style={styles.loading} color={colors.ink600} />
        ) : entries.length === 0 ? (
          <Text style={styles.empty}>No activity yet</Text>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(entry) => entry.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderItem={({ item, index }) => (
              <ListRow
                title={entryLabel(item, session.user.id)}
                subtitle={formatTimestamp(item.createdAt)}
                divider={index < entries.length - 1}
                onPress={() => onSelectTransaction(item)}
                right={
                  <Text style={[styles.amount, isMoneyIn(item.type) ? styles.amountGreen : styles.amountInk]}>
                    {isMoneyIn(item.type) ? "+" : "−"}
                    {paiseToRupeeLabel(item.amountPaise)}
                  </Text>
                }
              />
            )}
          />
        )}

        {canDelete ? (
          <Pressable style={styles.dangerButton} onPress={() => onRemoveMember()}>
            <Text style={styles.dangerButtonText}>Remove Member</Text>
          </Pressable>
        ) : null}
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
    marginBottom: spacing.s2,
  },
  back: {
    fontSize: 24,
    color: colors.ink900,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.s6,
  },
  name: {
    ...type.title,
    color: colors.ink900,
    marginTop: spacing.s4,
  },
  idLabel: {
    ...type.caption,
    marginTop: spacing.s1,
  },
  youPill: {
    marginTop: spacing.s3,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginBottom: spacing.s3,
  },
  sectionLabel: {
    ...type.label,
    marginBottom: spacing.s2,
  },
  loading: {
    marginTop: spacing.s6,
  },
  empty: {
    ...type.body,
    color: colors.ink400,
    textAlign: "center",
    marginTop: spacing.s6,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.s4,
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
  dangerButton: {
    height: 48,
    backgroundColor: colors.danger600,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s4,
  },
  dangerButtonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
});
