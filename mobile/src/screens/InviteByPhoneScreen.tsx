import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import {
  InvitationsApiError,
  sendInvitation,
  type InvitationExpiryPreset,
} from "../api/invitationsClient";
import { NATIONAL_NUMBER_PATTERN, PhoneNumberField } from "../components/PhoneNumberField";
import { Screen } from "../components/Screen";
import { rupeesToPaise } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

const EXPIRY_PRESETS: { value: InvitationExpiryPreset; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "7 days" },
];

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
  const [expiryPreset, setExpiryPreset] = useState<InvitationExpiryPreset>("7d");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = NATIONAL_NUMBER_PATTERN.test(nationalNumber) && Number(shareRupees) > 0;

  async function submit() {
    if (!canSend) return;
    setError(null);
    setLoading(true);
    try {
      await sendInvitation(
        session.token,
        pool.id,
        `+91${nationalNumber}`,
        rupeesToPaise(shareRupees),
        expiryPreset,
      );
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

        <PhoneNumberField value={nationalNumber} onChangeValue={setNationalNumber} />

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

        <Text style={styles.fieldLabel}>Expires in</Text>
        <View style={styles.chipRow}>
          {EXPIRY_PRESETS.map((preset) => (
            <Pressable
              key={preset.value}
              style={[styles.chip, preset.value === expiryPreset && styles.chipSelected]}
              onPress={() => setExpiryPreset(preset.value)}
            >
              <Text
                style={[styles.chipText, preset.value === expiryPreset && styles.chipTextSelected]}
              >
                {preset.label}
              </Text>
            </Pressable>
          ))}
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
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s2,
    marginTop: spacing.s2,
    marginBottom: spacing.s3,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: spacing.s4,
  },
  chipSelected: {
    backgroundColor: colors.ink900,
    borderColor: colors.ink900,
  },
  chipText: {
    ...type.bodyBold,
    fontSize: 12.5,
    color: colors.ink900,
  },
  chipTextSelected: {
    color: colors.cream,
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
