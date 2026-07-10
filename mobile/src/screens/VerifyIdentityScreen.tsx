import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { verifyIdentity, AuthApiError } from "../api/authClient";
import type { StoredSession } from "../api/session";
import { Screen } from "../components/Screen";
import { colors, radii, spacing, type } from "../theme/tokens";

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// Becoming an Organizer requires full identity verification; joining as a
// Member only ever needed the phone verification already done at signup
// (ADR 0007). Runs against the real Decentro CKYC lookup when the server has
// Decentro credentials configured, and the fake (always passes) otherwise
// (ticket #14).
export function VerifyIdentityScreen({
  session,
  onVerified,
  onCancel,
}: {
  session: StoredSession;
  onVerified: (session: StoredSession) => void;
  onCancel: () => void;
}) {
  const [panNumber, setPanNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panValid = PAN_PATTERN.test(panNumber);

  async function handleVerify() {
    setError(null);
    setLoading(true);
    try {
      const { user } = await verifyIdentity(session.token, panNumber);
      onVerified({ ...session, user });
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onCancel}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>
          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.title}>Verify your identity</Text>
        <Text style={styles.subtitle}>
          Organizing a Pool means holding and directing everyone's money, so it requires full
          identity verification — beyond the phone check you did to sign up. Joining a Pool as a
          Member never requires this.
        </Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>PAN number</Text>
          <TextInput
            style={styles.fieldValue}
            placeholder="ABCDE1234A"
            placeholderTextColor={colors.ink400}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
            value={panNumber}
            onChangeText={(text) => setPanNumber(text.toUpperCase())}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, !panValid && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading || !panValid}
        >
          {loading ? (
            <ActivityIndicator color={colors.paper} />
          ) : (
            <Text style={styles.buttonText}>Verify identity</Text>
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
    ...type.body,
    color: colors.ink400,
    marginTop: spacing.s2,
  },
  field: {
    backgroundColor: colors.fieldFill,
    borderRadius: radii.md,
    padding: spacing.s3,
    marginTop: spacing.s6,
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
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s4,
  },
  button: {
    height: 48,
    backgroundColor: colors.ink900,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s6,
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  buttonText: {
    ...type.bodyBold,
    color: colors.cream,
  },
});
