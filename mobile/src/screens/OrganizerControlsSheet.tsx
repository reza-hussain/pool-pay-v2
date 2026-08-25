import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import { colors, radii, spacing, type } from "../theme/tokens";

// Lock Pool and Close Pool & Refund moved to direct, organizer-only buttons
// on PoolDetailScreen (ADR-0018) — this sheet keeps its other five actions.
export function OrganizerControlsSheet({
  pool,
  onTransferOut,
  onReimburse,
  onAddMembers,
  onManageMembers,
  onManageInvitations,
  onClose,
}: {
  pool: Pool;
  onTransferOut: () => void;
  onReimburse: () => void;
  // Invite Link/Pool Code only exists for Equal Split (CONTEXT.md — Custom
  // Split doesn't use this mechanism), so this row only ever renders then.
  onAddMembers: () => void;
  onManageMembers: () => void;
  // Custom Split Pool only (ticket #60) — undefined for every other type,
  // which hides the row rather than wiring it to a no-op.
  onManageInvitations?: () => void;
  onClose: () => void;
}) {
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

            {pool.type === "EQUAL_SPLIT" ? (
              <Pressable style={styles.row} onPress={onAddMembers}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>Add Members</Text>
                  <Text style={styles.rowDescription}>Share the Pool Code or an invite link</Text>
                </View>
              </Pressable>
            ) : null}

            <Pressable style={styles.row} onPress={onManageMembers}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Manage Members</Text>
                <Text style={styles.rowDescription}>View or remove Members from this Pool</Text>
              </View>
            </Pressable>

            {pool.type === "CUSTOM_SPLIT" && onManageInvitations ? (
              <Pressable style={styles.row} onPress={onManageInvitations}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>Invitations</Text>
                  <Text style={styles.rowDescription}>Invite Members and see who's paid</Text>
                </View>
              </Pressable>
            ) : null}
          </>
        )}

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
  closedNotice: {
    ...type.body,
    color: colors.ink400,
    paddingVertical: spacing.s4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
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
