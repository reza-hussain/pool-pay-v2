import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { listMembers, type Membership } from "../api/membersClient";
import {
  recordReimbursement,
  ReimbursementsApiError,
  type RecordReimbursementResult,
} from "../api/reimbursementsClient";
import { paiseToRupeeLabel, rupeesToPaise } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

// No Member profile (name/phone) exists on Membership yet — Members are
// identified by a shortened userId until a profile ticket adds one.
function memberLabel(membership: Membership, sessionUserId: string): string {
  const short = membership.userId.slice(-4);
  const you = membership.userId === sessionUserId ? " (you)" : "";
  return `Member ···${short}${you}`;
}

export function ReimburseScreen({
  session,
  pool,
  onDone,
  onCancel,
}: {
  session: StoredSession;
  pool: Pool;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [members, setMembers] = useState<Membership[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [vpa, setVpa] = useState("");
  const [amountRupees, setAmountRupees] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecordReimbursementResult | null>(null);

  useEffect(() => {
    listMembers(session.token, pool.id)
      .then(setMembers)
      .catch(() => {
        // Swallow: an empty member list just leaves the picker empty.
      });
  }, [pool.id, session.token]);

  async function confirmReimbursement() {
    if (!selectedMemberId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await recordReimbursement(
        session.token,
        pool.id,
        selectedMemberId,
        vpa,
        rupeesToPaise(amountRupees),
      );
      setResult(res);
    } catch (err) {
      setError(err instanceof ReimbursementsApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.checkRing}>
          <Text style={styles.checkGlyph}>✓</Text>
        </View>
        <Text style={styles.successAmount}>
          {paiseToRupeeLabel(result.reimbursement.amountPaise)} sent
        </Text>
        <Text style={styles.successSubtitle}>to {result.reimbursement.vpa}</Text>

        <View style={styles.kvCard}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>New Pool balance</Text>
            <Text style={styles.kvValue}>{paiseToRupeeLabel(result.poolBalancePaise)}</Text>
          </View>
        </View>

        <Pressable style={styles.doneButton} onPress={onDone}>
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onCancel}>
          <Text style={styles.back}>{"‹"}</Text>
        </Pressable>
        <View style={{ width: 24 }} />
      </View>
      <Text style={styles.title}>Reimburse a Member</Text>
      <Text style={styles.subtitle}>from {pool.name}</Text>

      <Text style={styles.fieldLabelStandalone}>Member</Text>
      <View style={styles.memberList}>
        {members.map((membership) => (
          <Pressable
            key={membership.id}
            style={[
              styles.memberRow,
              selectedMemberId === membership.userId && styles.memberRowSelected,
            ]}
            onPress={() => setSelectedMemberId(membership.userId)}
          >
            <Text style={styles.memberRowText}>{memberLabel(membership, session.user.id)}</Text>
            {selectedMemberId === membership.userId ? <Text style={styles.checkGlyphSmall}>✓</Text> : null}
          </Pressable>
        ))}
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Member's UPI ID</Text>
        <TextInput
          style={styles.fieldValueSmall}
          placeholder="member@upi"
          placeholderTextColor={colors.ink400}
          autoCapitalize="none"
          value={vpa}
          onChangeText={setVpa}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Amount (₹)</Text>
        <TextInput
          style={styles.fieldValue}
          placeholder="2500"
          placeholderTextColor={colors.ink400}
          keyboardType="decimal-pad"
          value={amountRupees}
          onChangeText={setAmountRupees}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={styles.primaryButton}
        onPress={confirmReimbursement}
        disabled={loading || !amountRupees || !vpa.trim() || !selectedMemberId}
      >
        {loading ? (
          <ActivityIndicator color={colors.paper} />
        ) : (
          <Text style={styles.primaryButtonText}>Reimburse ₹{amountRupees || "0"}</Text>
        )}
      </Pressable>
    </View>
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
  fieldLabelStandalone: {
    ...type.label,
    marginBottom: spacing.s2,
  },
  memberList: {
    marginBottom: spacing.s4,
    gap: spacing.s2,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.fieldFill,
    borderRadius: radii.md,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s3,
  },
  memberRowSelected: {
    backgroundColor: colors.selectedFill,
    borderWidth: 1.5,
    borderColor: colors.ink900,
  },
  memberRowText: {
    ...type.bodyBold,
    fontSize: 13.5,
    color: colors.ink900,
  },
  checkGlyphSmall: {
    ...type.bodyBold,
    color: colors.green600,
  },
  field: {
    backgroundColor: colors.fieldFill,
    borderRadius: radii.md,
    padding: spacing.s3,
    marginBottom: spacing.s4,
  },
  fieldLabel: {
    ...type.label,
  },
  fieldValue: {
    fontSize: 24,
    fontFamily: type.title.fontFamily,
    color: colors.ink900,
    marginTop: 5,
    padding: 0,
  },
  fieldValueSmall: {
    ...type.bodyBold,
    fontSize: 15,
    color: colors.ink900,
    marginTop: 5,
    padding: 0,
  },
  primaryButton: {
    height: 48,
    backgroundColor: colors.pumpkin500,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s4,
  },
  primaryButtonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s2,
  },

  successContainer: {
    flex: 1,
    backgroundColor: colors.flax300,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.s6,
  },
  checkRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.green600,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.s6,
  },
  checkGlyph: {
    fontSize: 34,
    color: colors.paper,
  },
  successAmount: {
    ...type.hero,
    color: colors.ink900,
    textAlign: "center",
  },
  successSubtitle: {
    ...type.body,
    color: colors.ink600,
    marginTop: spacing.s2,
    textAlign: "center",
  },
  kvCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.s4,
    marginTop: spacing.s6,
    width: "100%",
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.s2,
  },
  kvKey: {
    ...type.body,
    color: colors.ink600,
  },
  kvValue: {
    ...type.bodyBold,
    color: colors.ink900,
  },
  doneButton: {
    height: 48,
    backgroundColor: colors.ink900,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s6,
    marginTop: spacing.s6,
  },
  doneButtonText: {
    ...type.bodyBold,
    color: colors.cream,
  },
});
