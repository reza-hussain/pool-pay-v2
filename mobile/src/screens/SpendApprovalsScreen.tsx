import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import {
  approvePendingSpend,
  listPendingSpends,
  SpendApprovalsApiError,
  type SpendApprovalStatus,
} from "../api/spendApprovalsClient";
import { Screen } from "../components/Screen";
import { simpleMajority } from "../lib/majority";
import { paiseToRupeeLabel } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

// More than half of the Pool's currently active Members (ADR-0020) — no
// Organizer exclusion, unlike the emergency-refund vote (VoteScreen.tsx).
const approvalsNeeded = simpleMajority;

export function SpendApprovalsScreen({
  session,
  pool,
  onCancel,
}: {
  session: StoredSession;
  pool: Pool;
  onCancel: () => void;
}) {
  const [statuses, setStatuses] = useState<SpendApprovalStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when this viewer's own approval was the one that pushed a Spend past
  // majority (ADR-0020) — the money has actually moved, which the list
  // itself can't show since the executed entry just drops out of it.
  const [executedNotice, setExecutedNotice] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listPendingSpends(session.token, pool.id)
        .then(setStatuses)
        .catch((err) =>
          setError(err instanceof SpendApprovalsApiError ? err.message : "Something went wrong"),
        )
        .finally(() => setLoading(false));
    }, [pool.id, session.token]),
  );

  async function handleApprove(pendingSpendId: string) {
    setError(null);
    setExecutedNotice(null);
    setApprovingId(pendingSpendId);
    try {
      const result = await approvePendingSpend(session.token, pool.id, pendingSpendId);
      setStatuses((prev) =>
        // A just-executed PendingSpend drops off this list — it's no longer
        // pending (spend-approvals/router.ts listPending only returns
        // not-yet-EXECUTED ones).
        result.executedSpend
          ? prev.filter((s) => s.pendingSpend.id !== pendingSpendId)
          : prev.map((s) => (s.pendingSpend.id === pendingSpendId ? result.status : s)),
      );
      if (result.executedSpend) {
        setExecutedNotice(
          `${paiseToRupeeLabel(result.executedSpend.amountPaise)} to ${result.executedSpend.merchantRef} has executed — the money has moved.`,
        );
      }
    } catch (err) {
      setError(err instanceof SpendApprovalsApiError ? err.message : "Something went wrong");
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>
          <View style={{ width: 24 }} />
        </View>
        <Text style={styles.title}>Pending Spends</Text>
        <Text style={styles.subtitle}>{pool.name}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {executedNotice ? <Text style={styles.executedNotice}>{executedNotice}</Text> : null}

        {loading ? (
          <ActivityIndicator style={styles.loading} color={colors.ink600} />
        ) : (
          <FlatList
            data={statuses}
            keyExtractor={(s) => s.pendingSpend.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<Text style={styles.empty}>No Spends waiting on approval</Text>}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.merchantRef}>{item.pendingSpend.merchantRef}</Text>
                  <Text style={styles.amount}>{paiseToRupeeLabel(item.pendingSpend.amountPaise)}</Text>
                </View>

                <View style={styles.kvRow}>
                  <Text style={styles.kvKey}>Approvals so far</Text>
                  <Text style={styles.kvValue}>{item.approvalsCount}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.kvKey}>Needed for a majority</Text>
                  <Text style={styles.kvValue}>{approvalsNeeded(item.eligibleApproverCount)}</Text>
                </View>

                {item.hasApproved ? (
                  <Text style={styles.approvedNotice}>You've approved this Spend.</Text>
                ) : (
                  <Pressable
                    style={styles.approveButton}
                    onPress={() => handleApprove(item.pendingSpend.id)}
                    disabled={approvingId === item.pendingSpend.id}
                  >
                    {approvingId === item.pendingSpend.id ? (
                      <ActivityIndicator color={colors.cream} />
                    ) : (
                      <Text style={styles.approveButtonText}>Approve</Text>
                    )}
                  </Pressable>
                )}
              </View>
            )}
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
    marginBottom: spacing.s2,
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
  loading: {
    marginTop: spacing.s6,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginBottom: spacing.s3,
  },
  executedNotice: {
    ...type.body,
    color: colors.green600,
    marginBottom: spacing.s3,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.s3,
    paddingBottom: spacing.s8,
  },
  empty: {
    ...type.body,
    color: colors.ink400,
    textAlign: "center",
    marginTop: spacing.s6,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.s4,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.s2,
  },
  merchantRef: {
    ...type.bodyBold,
    fontSize: 14.5,
    color: colors.ink900,
  },
  amount: {
    ...type.bodyBold,
    fontSize: 14.5,
    color: colors.ink900,
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.s1,
  },
  kvKey: {
    ...type.caption,
  },
  kvValue: {
    ...type.caption,
    color: colors.ink900,
    fontFamily: type.bodyBold.fontFamily,
  },
  approvedNotice: {
    ...type.caption,
    color: colors.green600,
    marginTop: spacing.s3,
  },
  approveButton: {
    height: 40,
    backgroundColor: colors.ink900,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s3,
  },
  approveButtonText: {
    ...type.bodyBold,
    color: colors.cream,
  },
});
