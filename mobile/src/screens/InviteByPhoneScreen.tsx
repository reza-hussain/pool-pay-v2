import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { InvitationsApiError, sendInvitation } from "../api/invitationsClient";
import { Screen } from "../components/Screen";
import { rupeesToPaise } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

// India-only v1 (ADR 0003) — Indian mobile numbers are 10 digits starting with 6-9.
const NATIONAL_NUMBER_PATTERN = /^[6-9]\d{9}$/;

export function InviteByPhoneScreen({
  session,
  pool,
  onSent,
  onCancel,
}: {
  session: StoredSession;
  pool: Pool;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [nationalNumber, setNationalNumber] = useState("");
  const [shareRupees, setShareRupees] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = NATIONAL_NUMBER_PATTERN.test(nationalNumber) && Number(shareRupees) > 0;

  async function submit() {
    if (!canSend) return;
    setError(null);
    setLoading(true);
    try {
      await sendInvitation(session.token, pool.id, `+91${nationalNumber}`, rupeesToPaise(shareRupees));
      onSent();
    } catch (err) {
      setError(err instanceof InvitationsApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
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
        <Text style={styles.title}>Invite to {pool.name}</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Phone number</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.phonePrefix}>+91</Text>
            <View style={styles.phoneDivider} />
            <TextInput
              style={styles.phoneInput}
              placeholder="98765 43210"
              placeholderTextColor={colors.ink400}
              keyboardType="number-pad"
              maxLength={10}
              value={nationalNumber}
              onChangeText={(value) => setNationalNumber(value.replace(/\D/g, ""))}
            />
          </View>
          <Text style={styles.hint}>They must already have a Pool Pay account.</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Assigned share (₹)</Text>
          <TextInput
            style={styles.fieldValue}
            placeholder="2500"
            placeholderTextColor={colors.ink400}
            keyboardType="decimal-pad"
            value={shareRupees}
            onChangeText={setShareRupees}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.primaryButton} onPress={submit} disabled={loading || !canSend}>
          {loading ? (
            <ActivityIndicator color={colors.paper} />
          ) : (
            <Text style={styles.primaryButtonText}>Send Invitation</Text>
          )}
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
    marginBottom: spacing.s5,
  },
  back: {
    fontSize: 24,
    color: colors.ink900,
  },
  title: {
    ...type.title,
    color: colors.ink900,
    marginBottom: spacing.s5,
  },
  field: {
    backgroundColor: colors.fieldFill,
    borderRadius: radii.md,
    padding: spacing.s3,
    marginBottom: spacing.s3,
  },
  fieldLabel: {
    ...type.label,
  },
  fieldValue: {
    fontSize: 15,
    fontFamily: type.bodyBold.fontFamily,
    color: colors.ink900,
    marginTop: 5,
    padding: 0,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },
  phonePrefix: {
    fontSize: 15,
    fontFamily: type.bodyBold.fontFamily,
    color: colors.ink400,
  },
  phoneDivider: {
    width: 1,
    height: 18,
    backgroundColor: colors.lineStrong,
    marginHorizontal: spacing.s2,
  },
  phoneInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: type.bodyBold.fontFamily,
    color: colors.ink900,
    padding: 0,
  },
  hint: {
    ...type.caption,
    marginTop: spacing.s2,
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
});
