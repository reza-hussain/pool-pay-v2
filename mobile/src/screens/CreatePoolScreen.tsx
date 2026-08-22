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
import { rupeesToPaise } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

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
  const [shareRupees, setShareRupees] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleContinue() {
    if (!name.trim()) {
      setError("Give your Pool a name");
      return;
    }
    setError(null);
    setStep("share");
  }

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const pool = await createPool(session.token, {
        name: name.trim(),
        type: "EQUAL_SPLIT",
        perPersonAmountPaise: rupeesToPaise(shareRupees),
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
      <Screen backgroundColor={colors.cream}>
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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.primaryButton} onPress={handleContinue} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={colors.paper} />
        ) : (
          <Text style={styles.primaryButtonText}>Continue</Text>
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
