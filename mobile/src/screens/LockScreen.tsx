import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { Screen } from "../components/Screen";
import { authenticateWithBiometrics } from "../lib/biometrics";
import { colors, radii, spacing, type } from "../theme/tokens";

// Shown whenever the app-lock preference (ticket #24) is on and the app has
// just launched or come back to the foreground — gates every other screen
// until authenticateAsync succeeds, so it deliberately renders in place of
// the whole authenticated tree rather than as an overlay.
export function LockScreen({
  onUnlocked,
  onLogout,
}: {
  onUnlocked: () => void;
  // Escape hatch for when biometrics can never succeed again on this device
  // (enrollment removed after the toggle was turned on, hardware trouble,
  // etc.) — without this, turning app lock on would be a one-way door.
  onLogout: () => void;
}) {
  const [failed, setFailed] = useState(false);

  async function attempt() {
    setFailed(false);
    const success = await authenticateWithBiometrics();
    if (success) {
      onUnlocked();
    } else {
      setFailed(true);
    }
  }

  useEffect(() => {
    void attempt();
    // Only the very first mount should auto-prompt — every retry after that
    // is the person tapping "Unlock" themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={colors.ink900} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Rect x={5} y={11} width={14} height={9} rx={2} />
            <Path d="M8 11V8a4 4 0 018 0v3" />
          </Svg>
        </View>
        <Text style={styles.title}>Pool Pay is locked</Text>
        <Text style={styles.subtitle}>
          {failed ? "That didn't work — try again." : "Unlock with Face ID to see your Pools."}
        </Text>
        <Pressable style={styles.button} onPress={() => void attempt()}>
          <Text style={styles.buttonText}>Unlock</Text>
        </Pressable>
        <Pressable style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutButtonText}>Log out instead</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.s6,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.ink100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.s5,
  },
  title: {
    ...type.title,
    color: colors.ink900,
  },
  subtitle: {
    ...type.body,
    color: colors.ink400,
    marginTop: spacing.s2,
    textAlign: "center",
  },
  button: {
    height: 48,
    minWidth: 160,
    backgroundColor: colors.ink900,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s7,
  },
  buttonText: {
    ...type.bodyBold,
    color: colors.cream,
  },
  logoutButton: {
    marginTop: spacing.s5,
  },
  logoutButtonText: {
    ...type.bodyBold,
    color: colors.danger600,
  },
});
