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
import { colors, radii, spacing, type } from "../theme/tokens";

type PoolType = "EQUAL_SPLIT" | "OPEN";
type Step = "details" | "share";

export function CreatePoolScreen({
  session,
  onCreated,
  onCancel,
}: {
  session: StoredSession;
  onCreated: (pool: Pool) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [poolType, setPoolType] = useState<PoolType>("EQUAL_SPLIT");
  const [shareRupees, setShareRupees] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleContinue() {
    if (!name.trim()) {
      setError("Give your Pool a name");
      return;
    }
    setError(null);
    if (poolType === "EQUAL_SPLIT") {
      setStep("share");
    } else {
      void submit();
    }
  }

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const perPersonAmountPaise =
        poolType === "EQUAL_SPLIT" ? Math.round(Number(shareRupees) * 100) : undefined;
      const pool = await createPool(session.token, {
        name: name.trim(),
        type: poolType,
        perPersonAmountPaise,
      });
      onCreated(pool);
    } catch (err) {
      setError(err instanceof PoolsApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (step === "share") {
    return (
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={() => setStep("details")}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>
          <Text style={styles.eyebrow}>Step 2 of 2</Text>
          <View style={{ width: 24 }} />
        </View>
        <Text style={styles.screenTitle}>Set the share</Text>
        <Text style={styles.screenSubtitle}>Every Member deposits exactly this to join in.</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Per-person share (₹)</Text>
          <TextInput
            style={styles.fieldValue}
            placeholder="1000"
            placeholderTextColor={colors.ink400}
            keyboardType="decimal-pad"
            value={shareRupees}
            onChangeText={setShareRupees}
            autoFocus
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={styles.primaryButton}
          onPress={submit}
          disabled={loading || !shareRupees}
        >
          {loading ? (
            <ActivityIndicator color={colors.paper} />
          ) : (
            <Text style={styles.primaryButtonText}>Create Pool</Text>
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
        <Text style={styles.eyebrow}>Step 1 of {poolType === "EQUAL_SPLIT" ? 2 : 1}</Text>
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

      <Text style={styles.formLabel}>Pool type</Text>
      <TypeCard
        title="Equal Split Pool"
        description="Set one amount. Everyone deposits the same share."
        selected={poolType === "EQUAL_SPLIT"}
        onPress={() => setPoolType("EQUAL_SPLIT")}
      />
      <TypeCard
        title="Open Pool"
        description="No fixed amount — contribute whatever, whenever."
        selected={poolType === "OPEN"}
        onPress={() => setPoolType("OPEN")}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.primaryButton} onPress={handleContinue} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={colors.paper} />
        ) : (
          <Text style={styles.primaryButtonText}>
            {poolType === "EQUAL_SPLIT" ? "Continue" : "Create Pool"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function TypeCard({
  title,
  description,
  selected,
  onPress,
}: {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.typeCard, selected && styles.typeCardSelected]}
      onPress={onPress}
    >
      <Text style={styles.typeCardTitle}>{title}</Text>
      <Text style={styles.typeCardDescription}>{description}</Text>
    </Pressable>
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
    backgroundColor: "rgba(23,20,12,0.045)",
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
  formLabel: {
    ...type.label,
    marginTop: spacing.s4,
    marginBottom: spacing.s3,
  },
  typeCard: {
    borderWidth: 1.5,
    borderColor: "rgba(23,20,12,0.2)",
    borderRadius: radii.md,
    padding: spacing.s3,
    marginBottom: spacing.s3,
  },
  typeCardSelected: {
    borderColor: colors.ink900,
    borderWidth: 2,
    backgroundColor: "rgba(23,20,12,0.03)",
  },
  typeCardTitle: {
    ...type.bodyBold,
    fontSize: 14,
    color: colors.ink900,
  },
  typeCardDescription: {
    ...type.caption,
    marginTop: 3,
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
