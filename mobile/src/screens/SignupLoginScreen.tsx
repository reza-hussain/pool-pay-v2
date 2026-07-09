import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AuthApiError, requestOtp, verifyOtp } from "../api/authClient";
import { loadSession, saveSession, type StoredSession } from "../api/session";

type Step = { name: "phone" } | { name: "otp"; requestId: string; phoneNumber: string };

export function SignupLoginScreen() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [step, setStep] = useState<Step>({ name: "phone" });
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [justSignedUp, setJustSignedUp] = useState(false);

  useEffect(() => {
    loadSession()
      .then(setSession)
      .finally(() => setBootstrapping(false));
  }, []);

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
      await saveSession(result);
      setJustSignedUp(result.isNewUser);
      setSession({ token: result.token, user: result.user });
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (bootstrapping) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (session) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{justSignedUp ? "Welcome to Pool Pay" : "Welcome back"}</Text>
        <Text>{session.user.phoneNumber}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pool Pay</Text>

      {step.name === "phone" ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="+919876543210"
            keyboardType="phone-pad"
            autoComplete="tel"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />
          <Pressable style={styles.button} onPress={handleRequestOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send code</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.subtitle}>Enter the code sent to {step.phoneNumber}</Text>
          <TextInput
            style={styles.input}
            placeholder="123456"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
          />
          <Pressable style={styles.button} onPress={handleVerifyOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
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
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 12,
  },
  subtitle: {
    marginBottom: 8,
    textAlign: "center",
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    width: "100%",
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  error: {
    color: "#c00",
    marginTop: 8,
  },
});
