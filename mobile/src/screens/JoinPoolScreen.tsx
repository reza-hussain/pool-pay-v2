import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MembersApiError, joinByCode, type Membership } from "../api/membersClient";
import type { StoredSession } from "../api/session";
import { Screen } from "../components/Screen";
import { colors, radii, spacing, type } from "../theme/tokens";

export function JoinPoolScreen({
  session,
  onJoined,
  onCancel,
}: {
  session: StoredSession;
  onJoined: (membership: Membership) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Equal Split joining is approval-gated (ticket #86): a successful join
  // call may resolve to a pending JoinRequest rather than a Membership —
  // this shows a "request sent" confirmation in place of onJoined's usual
  // navigate-into-the-Pool behavior.
  const [requestSent, setRequestSent] = useState(false);

  async function handleJoin() {
    setError(null);
    setLoading(true);
    try {
      const result = await joinByCode(session.token, code);
      if (result.kind === "MEMBERSHIP") {
        onJoined(result.membership);
      } else {
        setRequestSent(true);
      }
    } catch (err) {
      setError(err instanceof MembersApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (requestSent) {
    return (
      <Screen backgroundColor={colors.cream}>
        <View style={styles.confirmContainer}>
          <View style={styles.waitRing}>
            <Text style={styles.waitGlyph}>⏳</Text>
          </View>
          <Text style={styles.confirmTitle}>Request sent</Text>
          <Text style={styles.confirmSubtitle}>
            Waiting for the Organizer to approve your request to join. You'll be notified once
            they do.
          </Text>
          <Pressable style={styles.doneButton} onPress={onCancel}>
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </View>
      </Screen>
    );
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
      <Text style={styles.title}>Join a Pool</Text>
      <Text style={styles.subtitle}>Enter the six-digit Pool Code your Organizer shared.</Text>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Pool Code</Text>
        <TextInput
          style={styles.fieldValue}
          placeholder="123456"
          placeholderTextColor={colors.ink400}
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
          autoFocus
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={handleJoin} disabled={loading || !code}>
        {loading ? (
          <ActivityIndicator color={colors.paper} />
        ) : (
          <Text style={styles.buttonText}>Join</Text>
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
    marginBottom: spacing.s2,
  },
  subtitle: {
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
    letterSpacing: 4,
  },
  button: {
    height: 48,
    backgroundColor: colors.pumpkin500,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s4,
  },
  buttonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s2,
  },
  confirmContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.s6,
  },
  waitRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.ink100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.s6,
  },
  waitGlyph: {
    fontSize: 34,
  },
  confirmTitle: {
    ...type.hero,
    color: colors.ink900,
    textAlign: "center",
  },
  confirmSubtitle: {
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
