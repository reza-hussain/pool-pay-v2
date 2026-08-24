import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { getDepositIntent } from "../api/depositsClient";
import { Screen } from "../components/Screen";
import { paiseToRupeeLabel } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

// Mirrors ORGANIZER_INVITATION_EXPIRY_MS in server/src/pools/pool-service.ts
// (ADR-0017) — used only to render an Expired Pool distinctly on this screen
// before the server has lazily flipped Pool.state itself (which only happens
// the next time something actually touches the Pool). The server remains the
// only authority on whether a payment is actually still accepted.
const ORGANIZER_INVITATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function AwaitingPaymentScreen({
  session,
  pool,
  onPayShare,
  onCancel,
}: {
  session: StoredSession;
  pool: Pool;
  onPayShare: () => void;
  onCancel: () => void;
}) {
  // Custom Split's own share amount lives on the Organizer's self-Invitation,
  // not on the Pool — fetched only for display here; Deposit screen looks it
  // up again itself when the Member actually pays.
  const [customShareAmountPaise, setCustomShareAmountPaise] = useState<number | null>(null);

  useEffect(() => {
    if (pool.type !== "CUSTOM_SPLIT") return;
    let cancelled = false;
    getDepositIntent(session.token, pool.id)
      .then((intent) => {
        if (!cancelled) setCustomShareAmountPaise(intent.fixedAmountPaise);
      })
      .catch(() => {
        // Non-critical — the button just shows without an amount; Deposit
        // screen surfaces the real error if the Pool actually expired.
      });
    return () => {
      cancelled = true;
    };
  }, [pool.id, pool.type, session.token]);

  const shareAmountPaise = pool.type === "EQUAL_SPLIT" ? pool.perPersonAmountPaise : customShareAmountPaise;
  const isExpired =
    pool.state === "EXPIRED" ||
    (pool.state === "ACTIVE" && Date.now() - new Date(pool.createdAt).getTime() >= ORGANIZER_INVITATION_EXPIRY_MS);

  if (isExpired) {
    return (
      <Screen backgroundColor={colors.cream}>
        <View style={styles.container}>
          <View style={styles.topRow}>
            <Pressable onPress={onCancel} hitSlop={8}>
              <Text style={styles.back}>{"‹"}</Text>
            </Pressable>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.expiredBlock}>
            <Text style={styles.expiredTitle}>{pool.name} expired</Text>
            <Text style={styles.expiredBody}>
              No one paid the Organizer's share within 24 hours, so this Pool never started. Nothing was
              collected — create a new Pool to try again.
            </Text>
          </View>
        </View>
      </Screen>
    );
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
        <Text style={styles.title}>{pool.name}</Text>
        <Text style={styles.subtitle}>
          {pool.type === "EQUAL_SPLIT" ? "Equal Split" : "Custom Split"} · Awaiting Payment
        </Text>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Pool Balance</Text>
          <Text style={styles.balanceValue}>{paiseToRupeeLabel(0)}</Text>
        </View>

        <Text style={styles.sectionLabel}>Members</Text>
        <View style={styles.memberRow}>
          <View>
            <Text style={styles.memberName}>{session.user.name ?? "You"}</Text>
            <Text style={styles.memberRole}>Organizer</Text>
          </View>
          <View style={styles.pendingPill}>
            <Text style={styles.pendingPillText}>Pending</Text>
          </View>
        </View>

        <View style={styles.lockedRow}>
          <Text style={styles.lockedRowIcon}>🔒</Text>
          <Text style={styles.lockedRowText}>Add Members</Text>
        </View>
        <Text style={styles.lockedHint}>Pay your share to unlock inviting members.</Text>

        <Pressable
          style={styles.primaryButton}
          onPress={onPayShare}
          disabled={pool.type === "CUSTOM_SPLIT" && shareAmountPaise === null}
        >
          <Text style={styles.primaryButtonText}>
            {shareAmountPaise !== null ? `Pay My Share (${paiseToRupeeLabel(shareAmountPaise)})` : "Pay My Share"}
          </Text>
        </Pressable>
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
  balanceCard: {
    backgroundColor: colors.ink900,
    borderRadius: radii.xl,
    padding: spacing.s5,
    marginBottom: spacing.s6,
  },
  balanceLabel: {
    ...type.label,
    color: colors.ink200,
  },
  balanceValue: {
    ...type.balance,
    color: colors.cream,
    marginTop: spacing.s2,
  },
  sectionLabel: {
    ...type.label,
    marginBottom: spacing.s2,
  },
  memberRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.s4,
    marginBottom: spacing.s5,
  },
  memberName: {
    ...type.bodyBold,
    fontSize: 14.5,
    color: colors.ink900,
  },
  memberRole: {
    ...type.caption,
    marginTop: 2,
  },
  pendingPill: {
    backgroundColor: colors.flax100,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: spacing.s3,
  },
  pendingPillText: {
    ...type.label,
    color: colors.ink600,
  },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s2,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: spacing.s4,
    opacity: 0.5,
  },
  lockedRowIcon: {
    fontSize: 15,
  },
  lockedRowText: {
    ...type.bodyBold,
    color: colors.ink900,
  },
  lockedHint: {
    ...type.caption,
    marginTop: spacing.s2,
    marginBottom: spacing.s6,
  },
  primaryButton: {
    height: 48,
    backgroundColor: colors.pumpkin500,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: "auto",
  },
  primaryButtonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
  expiredBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.s3,
  },
  expiredTitle: {
    ...type.title,
    color: colors.ink900,
    textAlign: "center",
  },
  expiredBody: {
    ...type.body,
    color: colors.ink400,
    textAlign: "center",
    maxWidth: 280,
  },
});
