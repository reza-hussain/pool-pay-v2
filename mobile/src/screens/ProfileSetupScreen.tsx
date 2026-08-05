import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { AuthApiError, completeProfile, verifyUpiId } from "../api/authClient";
import { saveSession, type StoredSession } from "../api/session";
import { Screen } from "../components/Screen";
import { colors, radii, spacing, type } from "../theme/tokens";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A real bank-account lookup (ADR 0012), not just a format check — status
// tracks the outcome for whichever UPI ID string was last checked; editing
// the field afterward resets this back to "idle" since the check no longer
// applies to the new text.
type UpiVerificationStatus =
  | { status: "idle" }
  | { status: "verifying" }
  | { status: "verified"; accountHolderName: string | null }
  | { status: "failed" };

// Auto-inserts the dashes as the person types digits, so "20000101" becomes
// "2000-01-01" without them having to type the separators themselves.
function formatDateInput(raw: string, previous: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (raw.length < previous.length) return raw; // let backspace remove dashes too
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

// Onboarding's profile-setup step (CONTEXT.md, ADR 0012) — mandatory,
// one-time, blocks reaching Home. Every field but the photo is required; the
// photo picker itself is a visual placeholder only (real photo capture/
// upload is out of scope here — avatarUrl stays null until that's built).
export function ProfileSetupScreen({
  session,
  onCompleted,
}: {
  session: StoredSession;
  onCompleted: (session: StoredSession) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [upiId, setUpiId] = useState("");
  const [upiVerification, setUpiVerification] = useState<UpiVerificationStatus>({ status: "idle" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canFinish =
    name.trim().length > 0 &&
    EMAIL_PATTERN.test(email) &&
    DATE_PATTERN.test(dateOfBirth) &&
    upiVerification.status === "verified";

  function handleChangeUpiId(value: string) {
    setUpiId(value);
    // Any edit invalidates a prior verification — it was for different text.
    if (upiVerification.status !== "idle") {
      setUpiVerification({ status: "idle" });
    }
  }

  async function handleVerifyUpiId() {
    const value = upiId.trim();
    if (!value || upiVerification.status === "verifying") return;
    setUpiVerification({ status: "verifying" });
    try {
      const result = await verifyUpiId(session.token, value);
      setUpiVerification(
        result.verified
          ? { status: "verified", accountHolderName: result.accountHolderName }
          : { status: "failed" },
      );
    } catch {
      setUpiVerification({ status: "failed" });
    }
  }

  async function handleFinish() {
    setError(null);
    setLoading(true);
    try {
      const { user } = await completeProfile(session.token, {
        name: name.trim(),
        email: email.trim(),
        dateOfBirth,
        upiId: upiId.trim(),
      });
      const updated: StoredSession = { ...session, user };
      await saveSession(updated);
      onCompleted(updated);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen backgroundColor={colors.cream}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View>
              <Text style={styles.title}>Complete your profile</Text>
              <Text style={styles.subtitle}>Just a few details before you start pooling.</Text>

              <View style={styles.avatarWrap}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarGlyph}>{"☺"}</Text>
                </View>
                <View style={styles.avatarBadge}>
                  <Text style={styles.avatarBadgeGlyph}>{"📷"}</Text>
                </View>
              </View>
              <Text style={styles.avatarCaption}>Optional</Text>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Full name</Text>
                <TextInput
                  style={styles.fieldValue}
                  placeholder="Asha Rao"
                  placeholderTextColor={colors.ink400}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  style={styles.fieldValue}
                  placeholder="asha@example.com"
                  placeholderTextColor={colors.ink400}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Date of birth</Text>
                <TextInput
                  style={styles.fieldValue}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.ink400}
                  keyboardType="number-pad"
                  maxLength={10}
                  value={dateOfBirth}
                  onChangeText={(value) => setDateOfBirth(formatDateInput(value, dateOfBirth))}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Registered UPI ID</Text>
                <TextInput
                  style={styles.fieldValue}
                  placeholder="asha@upi"
                  placeholderTextColor={colors.ink400}
                  autoCapitalize="none"
                  value={upiId}
                  onChangeText={handleChangeUpiId}
                  onBlur={handleVerifyUpiId}
                />
                {upiVerification.status === "verifying" ? (
                  <View style={styles.upiStatusRow}>
                    <ActivityIndicator size="small" color={colors.ink400} />
                    <Text style={styles.fieldHelper}>Verifying…</Text>
                  </View>
                ) : upiVerification.status === "verified" ? (
                  <Text style={[styles.fieldHelper, styles.upiVerified]}>
                    {upiVerification.accountHolderName
                      ? `✓ Paying to ${upiVerification.accountHolderName}`
                      : "✓ Verified"}
                  </Text>
                ) : upiVerification.status === "failed" ? (
                  <View style={styles.upiStatusRow}>
                    <Text style={[styles.fieldHelper, styles.upiFailed]}>Couldn't verify this UPI ID.</Text>
                    <Pressable onPress={handleVerifyUpiId}>
                      <Text style={[styles.fieldHelper, styles.upiRetry]}>Retry</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.fieldHelper}>Where we'll send refunds and reimbursements.</Text>
                )}
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.button, !canFinish && styles.buttonDisabled]}
                onPress={handleFinish}
                disabled={loading || !canFinish}
              >
                {loading ? (
                  <ActivityIndicator color={colors.paper} />
                ) : (
                  <Text style={styles.buttonText}>Finish</Text>
                )}
              </Pressable>
            </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    backgroundColor: colors.cream,
    padding: spacing.s6,
    paddingBottom: spacing.s8,
  },
  title: {
    ...type.title,
    color: colors.ink900,
  },
  subtitle: {
    ...type.body,
    color: colors.ink600,
    marginTop: spacing.s2,
    marginBottom: spacing.s6,
  },
  avatarWrap: {
    alignSelf: "center",
    width: 84,
    height: 84,
  },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.ink100,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarGlyph: {
    fontSize: 36,
    color: colors.ink400,
  },
  avatarBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.pumpkin500,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadgeGlyph: {
    fontSize: 13,
  },
  avatarCaption: {
    ...type.caption,
    textAlign: "center",
    marginTop: spacing.s2,
    marginBottom: spacing.s6,
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
  fieldHelper: {
    ...type.caption,
    marginTop: spacing.s2,
  },
  upiStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s2,
    marginTop: spacing.s2,
  },
  upiVerified: {
    color: colors.green600,
    marginTop: spacing.s2,
  },
  upiFailed: {
    color: colors.danger600,
    marginTop: 0,
  },
  upiRetry: {
    color: colors.ink900,
    fontFamily: type.bodyBold.fontFamily,
    marginTop: 0,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s2,
  },
  button: {
    height: 48,
    backgroundColor: colors.pumpkin500,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s4,
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  buttonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
});
