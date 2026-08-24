import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import {
  cancelInvitation,
  InvitationsApiError,
  listSentInvitations,
  type SentInvitation,
} from "../api/invitationsClient";
import { Screen } from "../components/Screen";
import { paiseToRupeeLabel } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

const STATUS_LABEL: Record<SentInvitation["invitation"]["state"], string> = {
  PENDING: "Pending",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

const STATUS_STYLE: Record<SentInvitation["invitation"]["state"], { bg: string; text: string }> = {
  PENDING: { bg: colors.ink100, text: colors.ink600 },
  PAID: { bg: colors.green100, text: colors.green600 },
  CANCELLED: { bg: colors.ink100, text: colors.ink600 },
  EXPIRED: { bg: colors.danger100, text: colors.danger600 },
};

function StatusPill({ state }: { state: SentInvitation["invitation"]["state"] }) {
  const style = STATUS_STYLE[state];
  return (
    <View style={[styles.statusPill, { backgroundColor: style.bg }]}>
      <Text style={[styles.statusPillText, { color: style.text }]}>{STATUS_LABEL[state]}</Text>
    </View>
  );
}

function InvitationRow({
  sent,
  onCancel,
  cancelling,
}: {
  sent: SentInvitation;
  onCancel?: () => void;
  cancelling: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{sent.inviteeName ?? sent.inviteePhoneNumber}</Text>
        {sent.inviteeName ? <Text style={styles.rowPhone}>{sent.inviteePhoneNumber}</Text> : null}
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.rowAmount}>{paiseToRupeeLabel(sent.invitation.assignedAmountPaise)}</Text>
        <StatusPill state={sent.invitation.state} />
        {onCancel ? (
          <Pressable style={styles.cancelButton} onPress={onCancel} disabled={cancelling}>
            {cancelling ? (
              <ActivityIndicator color={colors.danger600} />
            ) : (
              <Text style={styles.cancelButtonText}>Cancel</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function InvitationsScreen({
  session,
  pool,
  onInvite,
  onCancel,
}: {
  session: StoredSession;
  pool: Pool;
  onInvite: () => void;
  onCancel: () => void;
}) {
  const [invitations, setInvitations] = useState<SentInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listSentInvitations(session.token, pool.id)
        .then(setInvitations)
        .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"));
    }, [session.token, pool.id]),
  );

  function confirmCancel(sent: SentInvitation) {
    Alert.alert(
      "Cancel this Invitation?",
      `${sent.inviteeName ?? sent.inviteePhoneNumber} will no longer be able to pay their share.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel Invitation",
          style: "destructive",
          onPress: async () => {
            setError(null);
            setCancellingId(sent.invitation.id);
            try {
              await cancelInvitation(session.token, pool.id, sent.invitation.id);
              setInvitations((prev) =>
                prev.map((i) =>
                  i.invitation.id === sent.invitation.id
                    ? { ...i, invitation: { ...i.invitation, state: "CANCELLED" } }
                    : i,
                ),
              );
            } catch (err) {
              setError(err instanceof InvitationsApiError ? err.message : "Something went wrong");
            } finally {
              setCancellingId(null);
            }
          },
        },
      ],
    );
  }

  const pending = invitations.filter((i) => i.invitation.state === "PENDING");
  const resolved = invitations.filter((i) => i.invitation.state !== "PENDING");

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
        <Text style={styles.subtitle}>Invitations</Text>

        <Pressable style={styles.inviteButton} onPress={onInvite}>
          <Text style={styles.inviteButtonText}>+ Invite</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {pending.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Pending</Text>
              <View style={styles.card}>
                {pending.map((sent, i) => (
                  <View key={sent.invitation.id}>
                    {i > 0 ? <View style={styles.divider} /> : null}
                    <InvitationRow
                      sent={sent}
                      onCancel={() => confirmCancel(sent)}
                      cancelling={cancellingId === sent.invitation.id}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {resolved.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Resolved</Text>
              <View style={styles.card}>
                {resolved.map((sent, i) => (
                  <View key={sent.invitation.id}>
                    {i > 0 ? <View style={styles.divider} /> : null}
                    <InvitationRow sent={sent} cancelling={false} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {invitations.length === 0 ? (
            <Text style={styles.empty}>No Invitations sent yet</Text>
          ) : null}
        </ScrollView>
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
  inviteButton: {
    height: 44,
    backgroundColor: colors.pumpkin500,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.s5,
  },
  inviteButtonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
  scrollContent: {
    paddingBottom: spacing.s8,
  },
  section: {
    marginBottom: spacing.s5,
  },
  sectionLabel: {
    ...type.label,
    marginBottom: spacing.s2,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: spacing.s4,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    ...type.body,
    color: colors.ink900,
  },
  rowPhone: {
    ...type.caption,
    marginTop: 2,
  },
  rowEnd: {
    alignItems: "flex-end",
    gap: spacing.s1,
  },
  rowAmount: {
    ...type.bodyBold,
    color: colors.ink900,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  statusPillText: {
    ...type.label,
    marginBottom: 0,
  },
  cancelButton: {
    height: 30,
    borderWidth: 1.5,
    borderColor: colors.danger600,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s3,
    marginTop: spacing.s1,
  },
  cancelButtonText: {
    ...type.label,
    color: colors.danger600,
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
});
