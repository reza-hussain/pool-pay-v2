import { useState } from "react";
import * as Clipboard from "expo-clipboard";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { PoolsApiError, updateJoinCodeExpiry, type JoinCodeExpiryPreset, type Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { Screen } from "../components/Screen";
import { Toast } from "../components/Toast";
import { buildInviteLink } from "../lib/inviteLink";
import { colors, radii, spacing, type } from "../theme/tokens";

const EXPIRY_PRESETS: { value: JoinCodeExpiryPreset; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "7 days" },
];

// The Share screen (ticket #88, part of #83): the third Add Member action —
// share the join link as a QR code or link, and let the Organizer set an
// expiry on the code/link itself (distinct from a JoinRequest's own
// lifetime, which has no expiry — ticket #86).
export function ShareCodeScreen({
  session,
  pool,
  onDone,
}: {
  session: StoredSession;
  pool: Pool;
  onDone: () => void;
}) {
  const [joinCodeExpiresAt, setJoinCodeExpiresAt] = useState(pool.joinCodeExpiresAt);
  const [updatingPreset, setUpdatingPreset] = useState<JoinCodeExpiryPreset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const link = buildInviteLink(pool.id);

  async function copyLink() {
    await Clipboard.setStringAsync(link);
    setToastMessage("Link copied");
  }

  async function shareLink() {
    await Share.share({ message: `Join ${pool.name} on Pool Pay: ${link}` });
  }

  async function setExpiry(preset: JoinCodeExpiryPreset) {
    setError(null);
    setUpdatingPreset(preset);
    try {
      const updated = await updateJoinCodeExpiry(session.token, pool.id, preset);
      setJoinCodeExpiresAt(updated.joinCodeExpiresAt);
      setToastMessage("Expiry updated");
    } catch (err) {
      setError(err instanceof PoolsApiError ? err.message : "Something went wrong");
    } finally {
      setUpdatingPreset(null);
    }
  }

  return (
    <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onDone} hitSlop={8}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>
          <View style={{ width: 24 }} />
        </View>
        <Text style={styles.title}>Share {pool.name}</Text>
        <Text style={styles.subtitle}>
          Anyone with this link or QR code can request to join — you still approve every request.
        </Text>

        <View style={styles.qrBox}>
          <QRCode value={link} size={168} backgroundColor={colors.paper} color={colors.ink900} />
        </View>

        <Pressable style={styles.outlineButton} onPress={copyLink}>
          <Text style={styles.outlineButtonText}>Copy Link</Text>
        </Pressable>

        <Pressable style={styles.darkButton} onPress={shareLink}>
          <Text style={styles.darkButtonText}>Share Link</Text>
        </Pressable>

        <Text style={styles.fieldLabel}>Link expires in</Text>
        <Text style={styles.expiryStatus}>
          {joinCodeExpiresAt
            ? `Expires ${new Date(joinCodeExpiresAt).toLocaleString()}`
            : "No expiry — anyone with the link can join at any time"}
        </Text>
        {/* Unlike InviteByPhoneScreen's chips (a pending choice submitted
            later with the form), tapping a chip here applies immediately —
            there's no separate "send" step, this is a persistent Pool
            setting the Organizer can revisit any time. The status line
            above, not chip highlighting, reflects what's currently in
            effect, since we only know the resulting timestamp, not which
            preset produced it. */}
        <View style={styles.chipRow}>
          {EXPIRY_PRESETS.map((preset) => (
            <Pressable
              key={preset.value}
              style={styles.chip}
              onPress={() => setExpiry(preset.value)}
              disabled={updatingPreset !== null}
            >
              {updatingPreset === preset.value ? (
                <ActivityIndicator color={colors.ink900} size="small" />
              ) : (
                <Text style={styles.chipText}>{preset.label}</Text>
              )}
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <Toast message={toastMessage} onHide={() => setToastMessage(null)} />
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
    ...type.caption,
    marginBottom: spacing.s5,
  },
  qrBox: {
    width: 168,
    height: 168,
    alignSelf: "center",
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.s4,
    marginBottom: spacing.s5,
  },
  outlineButton: {
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.s3,
  },
  outlineButtonText: {
    ...type.bodyBold,
    color: colors.ink900,
  },
  darkButton: {
    height: 48,
    backgroundColor: colors.ink900,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.s6,
  },
  darkButtonText: {
    ...type.bodyBold,
    color: colors.cream,
  },
  fieldLabel: {
    ...type.label,
    marginBottom: spacing.s2,
  },
  expiryStatus: {
    ...type.caption,
    marginBottom: spacing.s3,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s2,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: spacing.s4,
    minWidth: 64,
    alignItems: "center",
  },
  chipText: {
    ...type.bodyBold,
    fontSize: 12.5,
    color: colors.ink900,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s2,
  },
});
