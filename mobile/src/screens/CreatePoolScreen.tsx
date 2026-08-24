import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { PoolsApiError, createPool, type Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { Screen } from "../components/Screen";
import { paiseToRupeeLabel, rupeesToPaise } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

type Step = "details" | "amount";
type PoolType = "EQUAL_SPLIT" | "CUSTOM_SPLIT";
// Which button triggered submission — tracked so only the pressed button
// shows its spinner instead of both going into a disabled/loading state
// indistinguishably.
type PendingAction = "payNow" | "payLater" | null;

export function CreatePoolScreen({
  session,
  onCreated,
  onCancel,
}: {
  session: StoredSession;
  // payNow tells the caller whether to route into the inline pay-your-share
  // flow (unlocked on success) or the locked Awaiting Payment Dashboard.
  onCreated: (pool: Pool, payNow: boolean) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [poolType, setPoolType] = useState<PoolType>("EQUAL_SPLIT");
  const [amountRupees, setAmountRupees] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  function handleContinue() {
    if (!name.trim()) {
      setError("Give your Pool a name");
      return;
    }
    setError(null);
    setStep("amount");
  }

  async function submit(payNow: boolean) {
    setError(null);
    setPending(payNow ? "payNow" : "payLater");
    try {
      const amountPaise = rupeesToPaise(amountRupees);
      const pool = await createPool(session.token, {
        name: name.trim(),
        type: poolType,
        ...(poolType === "EQUAL_SPLIT"
          ? { perPersonAmountPaise: amountPaise }
          : { organizerShareAmountPaise: amountPaise }),
      });
      onCreated(pool, payNow);
    } catch (err) {
      setError(err instanceof PoolsApiError ? err.message : "Something went wrong");
    } finally {
      setPending(null);
    }
  }

  if (step === "amount") {
    const amountPaise = amountRupees ? rupeesToPaise(amountRupees) : 0;
    const fieldLabel = poolType === "EQUAL_SPLIT" ? "Contribution per member (₹)" : "Your share (₹)";
    const fieldSubtitle =
      poolType === "EQUAL_SPLIT"
        ? "Every member will pay exactly this amount to join your Equal Split pool."
        : "This is your own share as Organizer. You'll assign each Member their own amount after they join.";

    return (
      <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={() => setStep("details")}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>
          <Text style={styles.eyebrow}>Step 2 of 2</Text>
          <View style={{ width: 24 }} />
        </View>
        <Text style={styles.poolNamePill}>{name}</Text>
        <Text style={styles.screenTitle}>{fieldLabel}</Text>
        <Text style={styles.screenSubtitle}>{fieldSubtitle}</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Amount (₹)</Text>
          <TextInput
            style={styles.fieldValue}
            placeholder="1000"
            placeholderTextColor={colors.ink400}
            keyboardType="decimal-pad"
            value={amountRupees}
            onChangeText={setAmountRupees}
            autoFocus
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={styles.primaryButton}
          onPress={() => submit(true)}
          disabled={pending !== null || !amountRupees}
        >
          {pending === "payNow" ? (
            <ActivityIndicator color={colors.paper} />
          ) : (
            <Text style={styles.primaryButtonText}>
              Pay {paiseToRupeeLabel(amountPaise)} to Finish
            </Text>
          )}
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => submit(false)}
          disabled={pending !== null || !amountRupees}
        >
          {pending === "payLater" ? (
            <ActivityIndicator color={colors.ink900} />
          ) : (
            <Text style={styles.secondaryButtonText}>Pay later</Text>
          )}
        </Pressable>
        <Text style={styles.payLaterHint}>
          You can't add members until you've paid your share.
        </Text>
      </View>
      </Screen>
    );
  }

  return (
    <Screen backgroundColor={colors.cream}>
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onCancel}>
          <Text style={styles.back}>{"‹"}</Text>
        </Pressable>
        <Text style={styles.eyebrow}>Step 1 of 2</Text>
        <View style={{ width: 24 }} />
      </View>
      <Text style={styles.screenTitle}>Name your Pool</Text>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Pool name</Text>
        <TextInput
          style={styles.fieldValue}
          placeholder="e.g. Goa Trip"
          placeholderTextColor={colors.ink400}
          value={name}
          onChangeText={setName}
        />
      </View>

      <Text style={styles.typeLabel}>Pool type</Text>
      <View style={styles.typeRow}>
        <Pressable
          style={[styles.typeCard, poolType === "EQUAL_SPLIT" && styles.typeCardSelected]}
          onPress={() => setPoolType("EQUAL_SPLIT")}
        >
          <Text style={styles.typeCardTitle}>Equal Split</Text>
          <Text style={styles.typeCardDescription}>Everyone pays the same fixed share.</Text>
        </Pressable>
        <Pressable
          style={[styles.typeCard, poolType === "CUSTOM_SPLIT" && styles.typeCardSelected]}
          onPress={() => setPoolType("CUSTOM_SPLIT")}
        >
          <Text style={styles.typeCardTitle}>Custom Split</Text>
          <Text style={styles.typeCardDescription}>Assign each Member their own amount.</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.primaryButton} onPress={handleContinue} disabled={pending !== null}>
        <Text style={styles.primaryButtonText}>Continue</Text>
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
  eyebrow: {
    ...type.label,
  },
  poolNamePill: {
    ...type.caption,
    marginBottom: spacing.s1,
  },
  screenTitle: {
    ...type.title,
    color: colors.ink900,
    marginBottom: spacing.s2,
  },
  screenSubtitle: {
    ...type.body,
    color: colors.ink400,
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
  typeLabel: {
    ...type.label,
    marginBottom: spacing.s2,
  },
  typeRow: {
    flexDirection: "row",
    gap: spacing.s3,
    marginBottom: spacing.s3,
  },
  typeCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    padding: spacing.s4,
  },
  typeCardSelected: {
    borderColor: colors.ink900,
    backgroundColor: colors.selectedFill,
  },
  typeCardTitle: {
    ...type.bodyBold,
    color: colors.ink900,
    marginBottom: spacing.s1,
  },
  typeCardDescription: {
    ...type.caption,
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
  secondaryButton: {
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s3,
  },
  secondaryButtonText: {
    ...type.bodyBold,
    color: colors.ink900,
  },
  payLaterHint: {
    ...type.caption,
    textAlign: "center",
    marginTop: spacing.s3,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s2,
  },
});
