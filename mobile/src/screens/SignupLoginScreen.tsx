import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AuthApiError, requestOtp, verifyOtp } from "../api/authClient";
import { saveSession, type StoredSession } from "../api/session";
import { colors, radii, spacing, type } from "../theme/tokens";

type Step = { name: "phone" } | { name: "otp"; requestId: string; phoneNumber: string };

export function SignupLoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: (session: StoredSession, isNewUser: boolean) => void;
}) {
  const [step, setStep] = useState<Step>({ name: "phone" });
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequestOtp() {
    setError(null);
    setLoading(true);
    try {
      const { requestId } = await requestOtp(phoneNumber);
      setStep({ name: "otp", requestId, phoneNumber });
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (step.name !== "otp") return;
    setError(null);
    setLoading(true);
    try {
      const result = await verifyOtp(step.requestId, code);
      const session: StoredSession = { token: result.token, user: result.user };
      await saveSession(session);
      onAuthenticated(session, result.isNewUser);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pool Pay</Text>

      {step.name === "phone" ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="+919876543210"
            placeholderTextColor={colors.ink400}
            keyboardType="phone-pad"
            autoComplete="tel"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />
          <Pressable style={styles.button} onPress={handleRequestOtp} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.cream} />
            ) : (
              <Text style={styles.buttonText}>Send code</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.subtitle}>Enter the code sent to {step.phoneNumber}</Text>
          <TextInput
            style={styles.input}
            placeholder="123456"
            placeholderTextColor={colors.ink400}
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
          />
          <Pressable style={styles.button} onPress={handleVerifyOtp} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.cream} />
            ) : (
              <Text style={styles.buttonText}>Verify</Text>
            )}
          </Pressable>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.s6,
    gap: spacing.s3,
  },
  title: {
    ...type.hero,
    color: colors.ink900,
    marginBottom: spacing.s3,
  },
  subtitle: {
    ...type.body,
    color: colors.ink600,
    marginBottom: spacing.s2,
    textAlign: "center",
  },
  input: {
    width: "100%",
    backgroundColor: colors.fieldFill,
    borderWidth: 1.5,
    borderColor: "transparent",
    borderRadius: radii.md,
    padding: spacing.s3,
    fontSize: 15,
    fontFamily: type.bodyBold.fontFamily,
    color: colors.ink900,
  },
  button: {
    width: "100%",
    height: 48,
    backgroundColor: colors.pumpkin500,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
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
});
