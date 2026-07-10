import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { verifyIdentity, AuthApiError } from "../api/authClient";
import type { StoredSession } from "../api/session";
import { Screen } from "../components/Screen";
import { colors, radii, spacing, type } from "../theme/tokens";

// Becoming an Organizer requires full identity verification; joining as a
// Member only ever needed the phone verification already done at signup
// (ADR 0007). This is a stub — it passes instantly, no real KYC flow yet
// (that's ticket #14, the real BaaS/UPI partner integration).
export function VerifyIdentityScreen({
  session,
  onVerified,
  onCancel,
}: {
  session: StoredSession;
  onVerified: (session: StoredSession) => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    setError(null);
    setLoading(true);
    try {
      const { user } = await verifyIdentity(session.token);
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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.button} onPress={handleVerify} disabled={loading}>
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
  buttonText: {
    ...type.bodyBold,
    color: colors.cream,
  },
});
