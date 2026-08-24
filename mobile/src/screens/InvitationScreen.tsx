import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { InvitationForInvitee } from "../api/invitationsClient";
import type { StoredSession } from "../api/session";
import { listMembers } from "../api/membersClient";
import { Screen } from "../components/Screen";
import { paiseToRupeeLabel } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

function expiryLabel(expiresAtIso: string): string {
  const msLeft = new Date(expiresAtIso).getTime() - Date.now();
  if (msLeft <= 0) return "Expired";
  const hoursLeft = Math.ceil(msLeft / (60 * 60 * 1000));
  if (hoursLeft < 24) return `Expires in ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}`;
  const daysLeft = Math.ceil(hoursLeft / 24);
  return `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
}

export function InvitationScreen({
  session,
  invitationForInvitee,
  onPay,
  onCancel,
}: {
  session: StoredSession;
  invitationForInvitee: InvitationForInvitee;
  onPay: () => void;
  onCancel: () => void;
}) {
  const { invitation, pool, organizerName } = invitationForInvitee;
  const [memberCount, setMemberCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMembers(session.token, pool.id)
      .then((members) => {
        if (!cancelled) setMemberCount(members.length);
      })
      .catch(() => {
        // Non-critical — the rest of the screen still renders without a count.
      });
    return () => {
      cancelled = true;
    };
  }, [pool.id, session.token]);

  return (
    <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Invitation</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.context}>
          <View style={styles.eyebrowPill}>
            <Text style={styles.eyebrowText}>Custom Split Pool</Text>
          </View>
          <Text style={styles.poolName}>{pool.name}</Text>
          <View style={styles.invitedByChip}>
            <Text style={styles.invitedByText}>Invited by {organizerName ?? "the Organizer"}</Text>
          </View>
        </View>

        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Your assigned share</Text>
          <Text style={styles.amountValue}>{paiseToRupeeLabel(invitation.assignedAmountPaise)}</Text>
          <View style={styles.expiryPill}>
            <Text style={styles.expiryText}>{expiryLabel(invitation.expiresAt)}</Text>
          </View>
        </View>

        {memberCount !== null && memberCount > 0 ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>
              Join {memberCount} other member{memberCount === 1 ? "" : "s"}
            </Text>
            <Text style={styles.infoSubtitle}>They have already paid their share.</Text>
          </View>
        ) : null}

        <View style={styles.spacer} />

        <Pressable style={styles.payButton} onPress={onPay}>
          <Text style={styles.payButtonText}>
            Pay {paiseToRupeeLabel(invitation.assignedAmountPaise)} to Join
          </Text>
        </Pressable>
        <Text style={styles.payCaption}>
          Paying this exact amount makes you a Member automatically — no separate join step.
        </Text>
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
    marginBottom: spacing.s4,
  },
  back: {
    fontSize: 24,
    color: colors.ink900,
  },
  headerTitle: {
    ...type.title,
    color: colors.ink900,
  },
  context: {
    alignItems: "center",
    marginBottom: spacing.s6,
  },
  eyebrowPill: {
    backgroundColor: colors.flax100,
    borderRadius: 999,
    paddingHorizontal: spacing.s3,
    paddingVertical: 4,
    marginBottom: spacing.s3,
  },
  eyebrowText: {
    ...type.label,
    color: colors.ink600,
  },
  poolName: {
    ...type.balance,
    color: colors.ink900,
    textAlign: "center",
    marginBottom: spacing.s3,
  },
  invitedByChip: {
    backgroundColor: colors.paper,
    borderRadius: 999,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  invitedByText: {
    ...type.caption,
  },
  amountCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.s6,
    alignItems: "center",
    marginBottom: spacing.s4,
  },
  amountLabel: {
    ...type.label,
    marginBottom: spacing.s2,
  },
  amountValue: {
    ...type.figure,
    color: colors.ink900,
  },
  expiryPill: {
    flexDirection: "row",
    backgroundColor: colors.danger100,
    borderRadius: 999,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
    marginTop: spacing.s4,
  },
  expiryText: {
    ...type.label,
    color: colors.danger600,
    marginBottom: 0,
  },
  infoCard: {
    flexDirection: "row",
    backgroundColor: colors.flax100,
    borderRadius: radii.lg,
    padding: spacing.s4,
    gap: spacing.s3,
  },
  infoTitle: {
    ...type.body,
    color: colors.ink900,
  },
  infoSubtitle: {
    ...type.caption,
    marginTop: 2,
  },
  spacer: {
    flex: 1,
  },
  payButton: {
    height: 52,
    backgroundColor: colors.pumpkin600,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  payButtonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
  payCaption: {
    ...type.caption,
    textAlign: "center",
    marginTop: spacing.s3,
    paddingHorizontal: spacing.s4,
  },
});
