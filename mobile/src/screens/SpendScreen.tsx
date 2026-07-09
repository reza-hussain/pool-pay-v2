import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { recordSpend, SpendsApiError, type RecordSpendResult } from "../api/spendsClient";
import { paiseToRupeeLabel, rupeesToPaise } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

export function SpendScreen({
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
  const [merchantRef, setMerchantRef] = useState("");
  const [amountRupees, setAmountRupees] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecordSpendResult | null>(null);

  async function confirmSpend() {
    setError(null);
    setLoading(true);
    try {
      const res = await recordSpend(session.token, pool.id, merchantRef, rupeesToPaise(amountRupees));
      setResult(res);
    } catch (err) {
      setError(err instanceof SpendsApiError ? err.message : "Something went wrong");
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
          {paiseToRupeeLabel(result.spend.amountPaise)} paid
        </Text>
        <Text style={styles.successSubtitle}>to {result.spend.merchantRef}</Text>

        <View style={styles.kvCard}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Fee</Text>
            <Text style={styles.kvValue}>{paiseToRupeeLabel(result.spend.feePaise)}</Text>
          </View>
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
      <Text style={styles.title}>Pay a merchant</Text>
      <Text style={styles.subtitle}>from {pool.name}</Text>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Merchant UPI reference</Text>
        <TextInput
          style={styles.fieldValueSmall}
          placeholder="merchant@upi"
          placeholderTextColor={colors.ink400}
          autoCapitalize="none"
          value={merchantRef}
          onChangeText={setMerchantRef}
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
        onPress={confirmSpend}
        disabled={loading || !amountRupees || !merchantRef.trim()}
      >
        {loading ? (
          <ActivityIndicator color={colors.paper} />
        ) : (
          <Text style={styles.primaryButtonText}>Pay ₹{amountRupees || "0"}</Text>
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
