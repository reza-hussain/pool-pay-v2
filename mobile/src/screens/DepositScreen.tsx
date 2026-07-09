import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import {
  DepositsApiError,
  getDepositIntent,
  recordDeposit,
  type DepositIntent,
  type RecordDepositResult,
} from "../api/depositsClient";
import { paiseToRupeeLabel, rupeesToPaise } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

const QUICK_AMOUNTS_RUPEES = [500, 1000, 2500, 5000];

export function DepositScreen({
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
  const [intent, setIntent] = useState<DepositIntent | null>(null);
  const [amountRupees, setAmountRupees] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecordDepositResult | null>(null);

  useEffect(() => {
    getDepositIntent(session.token, pool.id)
      .then(setIntent)
      .catch((err) => setError(err instanceof DepositsApiError ? err.message : "Something went wrong"));
  }, [pool.id, session.token]);

  async function confirmDeposit(amountPaise: number) {
    setError(null);
    setLoading(true);
    try {
      const res = await recordDeposit(session.token, pool.id, amountPaise);
      setResult(res);
    } catch (err) {
      setError(err instanceof DepositsApiError ? err.message : "Something went wrong");
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
          {paiseToRupeeLabel(result.deposit.amountPaise)} deposited
        </Text>
        <Text style={styles.successSubtitle}>
          to {pool.name} · balance {paiseToRupeeLabel(result.poolBalancePaise)}
        </Text>
        <Pressable style={styles.doneButton} onPress={onDone}>
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  if (pool.type === "EQUAL_SPLIT") {
    return (
      <View style={styles.darkContainer}>
        <Pressable onPress={onCancel} style={styles.darkBack}>
          <Text style={styles.darkBackGlyph}>{"‹"}</Text>
        </Pressable>
        <Text style={styles.darkEyebrow}>Depositing into</Text>
        <Text style={styles.darkTitle}>{pool.name}</Text>

        <View style={styles.vpaBox}>
          <Text style={styles.vpaLabel}>Pay to UPI ID</Text>
          <Text style={styles.vpaValue}>{intent?.vpa ?? "…"}</Text>
        </View>

        <Text style={styles.lockedCaption}>Amount locked for this Pool</Text>
        <Text style={styles.lockedAmount}>{paiseToRupeeLabel(pool.perPersonAmountPaise ?? 0)}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={styles.primaryButton}
          onPress={() => confirmDeposit(pool.perPersonAmountPaise ?? 0)}
          disabled={loading || !intent}
        >
          {loading ? (
            <ActivityIndicator color={colors.paper} />
          ) : (
            <Text style={styles.primaryButtonText}>Confirm deposit</Text>
          )}
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
      <Text style={styles.title}>Contribute</Text>
      <Text style={styles.subtitle}>{pool.name}</Text>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Amount (₹)</Text>
        <TextInput
          style={styles.fieldValue}
          placeholder="2500"
          placeholderTextColor={colors.ink400}
          keyboardType="decimal-pad"
          value={amountRupees}
          onChangeText={setAmountRupees}
          autoFocus
        />
      </View>

      <View style={styles.chipRow}>
        {QUICK_AMOUNTS_RUPEES.map((amount) => (
          <Pressable
            key={amount}
            style={[styles.chip, String(amount) === amountRupees && styles.chipSelected]}
            onPress={() => setAmountRupees(String(amount))}
          >
            <Text
              style={[
                styles.chipText,
                String(amount) === amountRupees && styles.chipTextSelected,
              ]}
            >
              ₹{amount.toLocaleString("en-IN")}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={styles.primaryButton}
        onPress={() => confirmDeposit(rupeesToPaise(amountRupees))}
        disabled={loading || !amountRupees}
      >
        {loading ? (
          <ActivityIndicator color={colors.paper} />
        ) : (
          <Text style={styles.primaryButtonText}>Contribute ₹{amountRupees || "0"}</Text>
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
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s2,
    marginBottom: spacing.s4,
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

  darkContainer: {
    flex: 1,
    backgroundColor: colors.ink900,
    alignItems: "center",
    padding: spacing.s6,
    paddingTop: spacing.s8,
  },
  darkBack: {
    alignSelf: "flex-start",
  },
  darkBackGlyph: {
    fontSize: 24,
    color: colors.cream,
  },
  darkEyebrow: {
    ...type.label,
    color: colors.ink200,
    marginTop: spacing.s4,
  },
  darkTitle: {
    ...type.title,
    color: colors.cream,
    marginTop: spacing.s1,
    marginBottom: spacing.s6,
  },
  vpaBox: {
    alignItems: "center",
    marginBottom: spacing.s5,
  },
  vpaLabel: {
    ...type.caption,
    color: colors.ink200,
  },
  vpaValue: {
    ...type.bodyBold,
    color: colors.cream,
    marginTop: spacing.s1,
  },
  lockedCaption: {
    ...type.caption,
    color: colors.ink200,
  },
  lockedAmount: {
    ...type.figure,
    color: colors.cream,
    marginTop: spacing.s2,
    marginBottom: spacing.s6,
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
