import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Screen } from "../components/Screen";
import type { StoredSession } from "../api/session";
import { persistAppLockEnabled } from "../api/session";
import { isBiometricAuthAvailable } from "../lib/biometrics";
import { colors, radii, spacing, type } from "../theme/tokens";

function SettingsIcon({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <View style={[styles.sicon, danger && styles.siconDanger]}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={danger ? colors.danger600 : colors.ink900} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </Svg>
    </View>
  );
}

function Chevron() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.ink400} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

function Toggle({ on, disabled, onToggle }: { on: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={[styles.toggle, on && styles.toggleOn, disabled && styles.toggleDisabled]}
    >
      <View style={[styles.toggleKnob, on && styles.toggleKnobOn]} />
    </Pressable>
  );
}

export function ProfileScreen({
  session,
  onLogout,
  appLockEnabled,
  onAppLockEnabledChange,
}: {
  session: StoredSession;
  onLogout: () => void;
  appLockEnabled: boolean;
  onAppLockEnabledChange: (enabled: boolean) => void;
}) {
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);

  useEffect(() => {
    isBiometricAuthAvailable().then(setBiometricsAvailable);
  }, []);

  async function handleToggleAppLock() {
    const next = !appLockEnabled;
    await persistAppLockEnabled(next);
    onAppLockEnabledChange(next);
  }

  function handleHelpCentre() {
    Linking.openURL("mailto:support@poolpay.app").catch(() => {});
  }

  const { user } = session;

  return (
    <Screen backgroundColor={colors.cream} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>{(user.name ?? user.phoneNumber).charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.name}>{user.name ?? user.phoneNumber}</Text>
            <Text style={styles.subName}>{user.phoneNumber}</Text>
          </View>
        </View>

        <View style={styles.group}>
          <View style={styles.row}>
            <SettingsIcon>
              <Rect x={3} y={6} width={18} height={14} rx={3} />
              <Path d="M15 13h3" />
            </SettingsIcon>
            <Text style={styles.rowLabel}>Linked UPI ID</Text>
            <Text style={styles.rowValue}>{user.upiId ?? "Not set"}</Text>
          </View>
        </View>

        <View style={styles.group}>
          <View style={styles.row}>
            <SettingsIcon>
              <Path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
              <Path d="M9 12l2 2 4-4" />
            </SettingsIcon>
            <Text style={styles.rowLabel}>Face ID app lock</Text>
            <Toggle on={appLockEnabled} disabled={!biometricsAvailable} onToggle={handleToggleAppLock} />
          </View>
          {!biometricsAvailable ? (
            <Text style={styles.caption}>
              Face ID or fingerprint isn't set up on this device, so app lock isn't available.
            </Text>
          ) : null}
        </View>

        <View style={styles.group}>
          <Pressable style={[styles.row, styles.rowDivider]} onPress={handleHelpCentre}>
            <SettingsIcon>
              <Circle cx={12} cy={12} r={9} />
              <Path d="M9.8 9.3a2.3 2.3 0 113.9 1.7c-.8.7-1.6 1.1-1.6 2.2" />
            </SettingsIcon>
            <Text style={styles.rowLabel}>Help centre</Text>
            <Chevron />
          </Pressable>
          <Pressable style={styles.row} onPress={onLogout}>
            <SettingsIcon danger>
              <Path d="M15 12H5M9 8l-4 4 4 4" />
              <Path d="M12 4h6a1 1 0 011 1v14a1 1 0 01-1 1h-6" />
            </SettingsIcon>
            <Text style={[styles.rowLabel, styles.rowLabelDanger]}>Log out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.s6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s4,
    marginBottom: spacing.s5,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink100,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    ...type.title,
    color: colors.ink900,
  },
  name: {
    ...type.title,
    color: colors.ink900,
  },
  subName: {
    ...type.caption,
    marginTop: 2,
  },
  group: {
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.s4,
    marginBottom: spacing.s3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s3,
    paddingVertical: spacing.s3,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sicon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.settingsIconFill,
    alignItems: "center",
    justifyContent: "center",
  },
  siconDanger: {
    backgroundColor: colors.danger100,
  },
  rowLabel: {
    ...type.bodyBold,
    color: colors.ink900,
    flex: 1,
  },
  rowLabelDanger: {
    color: colors.danger600,
  },
  rowValue: {
    ...type.caption,
  },
  caption: {
    ...type.caption,
    paddingBottom: spacing.s3,
    marginTop: -spacing.s2,
  },
  toggle: {
    width: 46,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.toggleTrackOff,
    padding: 3,
    justifyContent: "center",
  },
  toggleOn: {
    backgroundColor: colors.ink900,
  },
  toggleDisabled: {
    opacity: 0.4,
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.paper,
  },
  toggleKnobOn: {
    marginLeft: 18,
  },
});
