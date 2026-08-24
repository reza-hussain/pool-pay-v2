import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { listMembers } from "../api/membersClient";
import { usePolledLedger } from "../api/ledgerClient";
import { EntryRow } from "./LedgerScreen";
import { AwaitingPaymentScreen } from "./AwaitingPaymentScreen";
import { Screen } from "../components/Screen";
import { paiseToRupeeLabel } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

// A Pool never returns to Awaiting Payment once unlocked (CONTEXT.md) — the
// gate only ever applies to Equal Split/Custom Split, and only to the
// Organizer, and only until they have a Membership (ADR-0016/0017).
function organizerAwaitsOwnPayment(pool: Pool, sessionUserId: string): boolean {
  return (
    pool.organizerId === sessionUserId &&
    (pool.type === "EQUAL_SPLIT" || pool.type === "CUSTOM_SPLIT")
  );
}

// Only the most recent entries are previewed here — "See all" hands off to
// the full (already-built) LedgerScreen for the complete, scrollable log.
const RECENT_ENTRIES_LIMIT = 5;

export function PoolDetailScreen({
  session,
  pool,
  onCancel,
  onDeposit,
  onPayOrganizerShare,
  onViewLedger,
  onOpenOrganizerControls,
  onVoteToRefund,
}: {
  session: StoredSession;
  pool: Pool;
  onCancel: () => void;
  onDeposit: () => void;
  // Only relevant while this Pool is gated Awaiting Payment (see below) — the
  // Organizer's own pay-your-share action, distinct from a regular Deposit.
  onPayOrganizerShare: () => void;
  onViewLedger: () => void;
  onOpenOrganizerControls: () => void;
  onVoteToRefund: () => void;
}) {
  const isOrganizer = pool.organizerId === session.user.id;
  const gateable = organizerAwaitsOwnPayment(pool, session.user.id);
  // Membership presence is the single source of truth for whether the
  // Organizer has paid their own share (ADR-0016/0017) — null while the
  // first fetch is still in flight, so a gateable Pool never briefly flashes
  // its normal Dashboard before the check resolves.
  const [members, setMembers] = useState<Awaited<ReturnType<typeof listMembers>> | null>(null);
  const { entries, error: ledgerError } = usePolledLedger(session.token, pool.id);

  useEffect(() => {
    let cancelled = false;
    listMembers(session.token, pool.id)
      .then((fetched) => {
        if (!cancelled) setMembers(fetched);
      })
      .catch(() => {
        // Non-critical for the normal dashboard (it just renders without a
        // member count) — but see the gateable-and-still-null case below.
      });
    return () => {
      cancelled = true;
    };
  }, [pool.id, session.token]);

  if (gateable && members === null) {
    return (
      <Screen backgroundColor={colors.cream}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.ink600} />
        </View>
      </Screen>
    );
  }

  if (gateable && !members!.some((m) => m.userId === pool.organizerId)) {
    return (
      <AwaitingPaymentScreen
        session={session}
        pool={pool}
        onPayShare={onPayOrganizerShare}
        onCancel={onCancel}
      />
    );
  }

  const memberCount = members?.length ?? null;
  const recentEntries = entries.slice(0, RECENT_ENTRIES_LIMIT);

  return (
    <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>
          {isOrganizer ? (
            <Pressable onPress={onOpenOrganizerControls} hitSlop={8}>
              <Text style={styles.moreGlyph}>{"⋯"}</Text>
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>

        <Text style={styles.title}>{pool.name}</Text>
        <Text style={styles.subtitle}>
          {pool.type === "EQUAL_SPLIT" ? "Equal Split" : pool.type === "CUSTOM_SPLIT" ? "Custom Split" : "Open Pool"}
          {" · "}
          {isOrganizer ? "You're the Organizer" : "Member"}
          {pool.state === "LOCKED" ? " · Locked" : ""}
          {pool.state === "CLOSED" ? " · Closed" : ""}
          {pool.state === "EXPIRED" ? " · Expired" : ""}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Members</Text>
            <Text style={styles.statValue}>{memberCount ?? "···"}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{pool.type === "EQUAL_SPLIT" ? "Per person" : "Type"}</Text>
            <Text style={styles.statValue}>
              {pool.type === "EQUAL_SPLIT"
                ? paiseToRupeeLabel(pool.perPersonAmountPaise ?? 0)
                : pool.type === "CUSTOM_SPLIT"
                  ? "Custom"
                  : "Open"}
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Pressable style={styles.depositButton} onPress={onDeposit}>
            <Text style={styles.depositButtonText}>Deposit</Text>
          </Pressable>
          <Pressable style={styles.ledgerButton} onPress={onViewLedger}>
            <Text style={styles.ledgerButtonText}>View Ledger</Text>
          </Pressable>
        </View>

        {!isOrganizer && pool.state !== "CLOSED" ? (
          <Pressable onPress={onVoteToRefund} hitSlop={8}>
            <Text style={styles.voteLink}>Vote to refund</Text>
          </Pressable>
        ) : null}

        <View style={styles.listHead}>
          <Text style={styles.listHeadLabel}>Recent activity</Text>
          <Pressable onPress={onViewLedger} hitSlop={8}>
            <Text style={styles.listHeadAction}>See all</Text>
          </Pressable>
        </View>

        {ledgerError ? <Text style={styles.error}>{ledgerError}</Text> : null}

        {recentEntries.length === 0 ? (
          <Text style={styles.empty}>No activity yet</Text>
        ) : (
          <View style={styles.list}>
            {recentEntries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} sessionUserId={session.user.id} />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
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
  moreGlyph: {
    fontSize: 20,
    fontFamily: type.title.fontFamily,
    color: colors.ink400,
    paddingHorizontal: spacing.s1,
  },
  title: {
    ...type.title,
    color: colors.ink900,
  },
  subtitle: {
    ...type.caption,
    marginBottom: spacing.s5,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.s3,
    marginBottom: spacing.s5,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.s4,
  },
  statLabel: {
    ...type.label,
  },
  statValue: {
    ...type.balance,
    fontSize: 22,
    color: colors.ink900,
    marginTop: spacing.s1,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.s3,
    marginBottom: spacing.s4,
  },
  depositButton: {
    flex: 1,
    height: 48,
    backgroundColor: colors.pumpkin500,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  depositButtonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
  ledgerButton: {
    flex: 1,
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerButtonText: {
    ...type.bodyBold,
    color: colors.ink900,
  },
  voteLink: {
    ...type.label,
    color: colors.danger600,
    marginBottom: spacing.s5,
  },
  listHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.s3,
    marginBottom: spacing.s3,
  },
  listHeadLabel: {
    ...type.label,
  },
  listHeadAction: {
    ...type.label,
    color: colors.ink600,
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
    marginTop: spacing.s6,
  },
  list: {
    gap: spacing.s2,
    paddingBottom: spacing.s4,
  },
});
