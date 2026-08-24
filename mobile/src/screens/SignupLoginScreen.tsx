import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { AuthApiError, requestOtp, verifyOtp } from "../api/authClient";
import { saveSession, type StoredSession } from "../api/session";
import { Screen } from "../components/Screen";
import { colors, radii, spacing, type } from "../theme/tokens";

type Step = { name: "phone" } | { name: "otp"; requestId: string; phoneNumber: string };

// Neither number-pad keyboard shows a "Done" key, so without this the
// keyboard has no dismiss affordance and can permanently cover the button
// pinned below the field (KeyboardAvoidingView pushes it back into view;
// tapping anywhere else also dismisses the keyboard directly).
function KeyboardDismissingView({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1 }}>{children}</View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

export function SignupLoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: (session: StoredSession, isNewUser: boolean) => void;
}) {
  const [step, setStep] = useState<Step>({ name: "phone" });
  const [nationalNumber, setNationalNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequestOtp() {
    setError(null);
    setLoading(true);
    try {
      const phoneNumber = `+91${nationalNumber}`;
      const { requestId } = await requestOtp(phoneNumber);
      setStep({ name: "otp", requestId, phoneNumber });
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (step.name === "phone") {
    return (
      <PhoneEntryStep
        nationalNumber={nationalNumber}
        onChangeNationalNumber={setNationalNumber}
        loading={loading}
        error={error}
        onContinue={handleRequestOtp}
      />
    );
  }

  return (
    <OtpStep
      phoneNumber={step.phoneNumber}
      onBack={() => {
        setError(null);
        setStep({ name: "phone" });
      }}
      onResend={handleRequestOtp}
      onVerified={async (code) => {
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
      }}
      loading={loading}
      error={error}
    />
  );
}

function PhoneEntryStep({
  nationalNumber,
  onChangeNationalNumber,
  loading,
  error,
  onContinue,
}: {
  nationalNumber: string;
  onChangeNationalNumber: (value: string) => void;
  loading: boolean;
  error: string | null;
  onContinue: () => void;
}) {
  // India-only v1 (ADR 0003) — Indian mobile numbers are 10 digits starting with 6-9.
  const canContinue = /^[6-9]\d{9}$/.test(nationalNumber);

  return (
    <Screen backgroundColor={colors.cream}>
      <KeyboardDismissingView>
        <View style={styles.container}>
          <Text style={styles.title}>What's your number?</Text>
          <Text style={styles.subtitle}>We'll text you a code to verify it's you.</Text>

          <View style={styles.phoneField}>
            <Text style={styles.phonePrefix}>+91</Text>
            <TextInput
              style={styles.phoneInput}
              placeholder="98765 43210"
              placeholderTextColor={colors.ink400}
              keyboardType="number-pad"
              autoComplete="tel"
              maxLength={10}
              value={nationalNumber}
              onChangeText={(text) => onChangeNationalNumber(text.replace(/\D/g, "").slice(0, 10))}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.spacer} />

          <Pressable
            style={[styles.button, !canContinue && styles.buttonDisabled]}
            onPress={onContinue}
            disabled={loading || !canContinue}
          >
            {loading ? (
              <ActivityIndicator color={colors.paper} />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </Pressable>
        </View>
      </KeyboardDismissingView>
    </Screen>
  );
}

function OtpStep({
  phoneNumber,
  onBack,
  onResend,
  onVerified,
  loading,
  error,
}: {
  phoneNumber: string;
  onBack: () => void;
  onResend: () => void;
  onVerified: (code: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function handleChangeDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    const code = next.join("");
    if (code.length === OTP_LENGTH) {
      onVerified(code);
    }
  }

  function handleKeyPress(index: number, key: string) {
    if (key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handleResend() {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setDigits(Array(OTP_LENGTH).fill(""));
    onResend();
  }

  return (
    <Screen backgroundColor={colors.cream}>
      <KeyboardDismissingView>
        <View style={styles.container}>
          <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>

          <Text style={styles.title}>Enter the code</Text>
          <Text style={styles.subtitle}>We sent a 6-digit code to {phoneNumber}</Text>

          <View style={styles.otpRow}>
            {digits.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => {
                  inputRefs.current[index] = ref;
                }}
                style={[styles.otpBox, digit && styles.otpBoxFilled]}
                keyboardType="number-pad"
                maxLength={1}
                value={digit}
                onChangeText={(value) => handleChangeDigit(index, value)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
                editable={!loading}
              />
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {loading ? <ActivityIndicator color={colors.ink900} style={styles.verifyingSpinner} /> : null}

          <View style={styles.spacer} />

          <Pressable onPress={handleResend} disabled={cooldown > 0}>
            <Text style={[styles.resendText, cooldown <= 0 && styles.resendTextActive]}>
              {cooldown > 0
                ? `Didn't get it? Resend code in 0:${String(cooldown).padStart(2, "0")}`
                : "Resend code"}
            </Text>
          </Pressable>
        </View>
      </KeyboardDismissingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    padding: spacing.s6,
  },
  backButton: {
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
    ...type.body,
    color: colors.ink600,
    marginTop: spacing.s2,
  },
  phoneField: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.fieldFill,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s4,
    marginTop: spacing.s6,
    height: 64,
  },
  phonePrefix: {
    ...type.title,
    color: colors.ink900,
    marginRight: spacing.s3,
  },
  phoneInput: {
    flex: 1,
    ...type.title,
    color: colors.ink900,
    padding: 0,
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.s6,
  },
  otpBox: {
    width: 44,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: colors.fieldFill,
    textAlign: "center",
    ...type.title,
    color: colors.ink900,
  },
  otpBoxFilled: {
    borderWidth: 1.5,
    borderColor: colors.ink900,
  },
  resendText: {
    ...type.caption,
    color: colors.ink400,
    textAlign: "center",
  },
  resendTextActive: {
    color: colors.ink900,
    fontFamily: type.bodyBold.fontFamily,
  },
  verifyingSpinner: {
    marginTop: spacing.s4,
  },
  spacer: {
    flex: 1,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s4,
  },
  button: {
    height: 48,
    backgroundColor: colors.pumpkin500,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  buttonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
});
