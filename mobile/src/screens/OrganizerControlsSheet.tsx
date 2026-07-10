import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import { colors, radii, spacing, type } from "../theme/tokens";

export function OrganizerControlsSheet({
  pool,
  onLock,
  onTransferOut,
  onReimburse,
  onManageMembers,
  onClosePool,
  onClose,
}: {
  pool: Pool;
  onLock: () => Promise<void>;
  onTransferOut: () => void;
  onReimburse: () => void;
  onManageMembers: () => void;
  onClosePool: () => void;
  onClose: () => void;
}) {
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLock() {
    setError(null);
    setLocking(true);
    try {
      await onLock();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLocking(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title}>{pool.name}</Text>
        <Text style={styles.subtitle}>Organizer controls</Text>

        {pool.state === "CLOSED" ? (
          <Text style={styles.closedNotice}>This Pool is closed — nothing left to do.</Text>
        ) : (
          <>
            {pool.state !== "LOCKED" ? (
              <Pressable style={styles.row} onPress={handleLock} disabled={locking}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>Lock Pool</Text>
                  <Text style={styles.rowDescription}>Stop new deposits — balance stays as is</Text>
                </View>
                {locking ? <ActivityIndicator color={colors.ink600} /> : null}
              </Pressable>
            ) : null}

            <Pressable style={styles.row} onPress={onTransferOut}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Transfer out</Text>
                <Text style={styles.rowDescription}>Move funds out to pay for the trip</Text>
              </View>
            </Pressable>

            <Pressable style={styles.row} onPress={onReimburse}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Reimburse a Member</Text>
                <Text style={styles.rowDescription}>Pay back a Member who spent out of pocket</Text>
              </View>
            </Pressable>

            <Pressable style={styles.row} onPress={onManageMembers}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Manage Members</Text>
                <Text style={styles.rowDescription}>View or remove Members from this Pool</Text>
              </View>
            </Pressable>

            <Pressable style={styles.row} onPress={onClosePool}>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, styles.dangerText]}>Close Pool & refund</Text>
                <Text style={styles.rowDescription}>Ends the Pool, refunds leftover pro-rata</Text>
              </View>
            </Pressable>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.cancelButton} onPress={onClose}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(23,20,12,0.4)",
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.s5,
    paddingBottom: spacing.s7,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink200,
    marginBottom: spacing.s4,
  },
  title: {
    ...type.title,
    color: colors.ink900,
  },
  subtitle: {
    ...type.caption,
    marginBottom: spacing.s3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.s4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    ...type.bodyBold,
    fontSize: 14.5,
    color: colors.ink900,
  },
  rowDescription: {
    ...type.caption,
    marginTop: 2,
  },
  dangerText: {
    color: colors.danger600,
  },
  closedNotice: {
    ...type.body,
    color: colors.ink400,
    paddingVertical: spacing.s4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s2,
  },
  cancelButton: {
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s4,
  },
  cancelButtonText: {
    ...type.bodyBold,
    color: colors.ink900,
  },
});
