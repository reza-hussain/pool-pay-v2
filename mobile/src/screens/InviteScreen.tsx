import * as Clipboard from "expo-clipboard";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import { buildInviteLink } from "../lib/inviteLink";
import { colors, radii, spacing, type } from "../theme/tokens";

export function InviteScreen({ pool, onDone }: { pool: Pool; onDone: () => void }) {
  async function copyCode() {
    await Clipboard.setStringAsync(pool.joinCode);
  }

  async function shareLink() {
    await Share.share({
      message: `Join ${pool.name} on Pool Pay: ${buildInviteLink(pool.id)}`,
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Invite members to</Text>
      <Text style={styles.title}>{pool.name}</Text>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Pool Code</Text>
        <View style={styles.codeDisplay}>
          {pool.joinCode.split("").map((digit: string, i: number) => (
            <View key={i} style={styles.digitBox}>
              <Text style={styles.digitText}>{digit}</Text>
            </View>
          ))}
        </View>
        <Pressable onPress={copyCode}>
          <Text style={styles.hint}>Tap to copy</Text>
        </Pressable>
      </View>

      <Pressable style={styles.button} onPress={shareLink}>
        <Text style={styles.buttonText}>Share invite link</Text>
      </Pressable>
      <Pressable onPress={onDone}>
        <Text style={styles.doneLink}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.flax300,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.s6,
    gap: spacing.s2,
  },
  eyebrow: {
    ...type.label,
    color: colors.ink600,
  },
  title: {
    ...type.title,
    color: colors.ink900,
    marginBottom: spacing.s6,
  },
  codeCard: {
    width: "100%",
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    padding: spacing.s5,
    alignItems: "center",
  },
  codeLabel: {
    ...type.label,
    marginBottom: spacing.s3,
  },
  codeDisplay: {
    flexDirection: "row",
    gap: spacing.s2,
  },
  digitBox: {
    width: 34,
    height: 46,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  digitText: {
    ...type.title,
    fontSize: 20,
  },
  hint: {
    ...type.caption,
    marginTop: spacing.s3,
  },
  button: {
    width: "100%",
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
  doneLink: {
    ...type.body,
    color: colors.ink600,
    marginTop: spacing.s3,
  },
});
