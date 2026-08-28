import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { listMembers, MembersApiError, type Membership } from "../api/membersClient";
import { Avatar } from "../components/Avatar";
import { ListRow } from "../components/ListRow";
import { Pill } from "../components/Pill";
import { Screen } from "../components/Screen";
import { phoneSuffix } from "../lib/identity";
import { colors, radii, spacing, type } from "../theme/tokens";

function memberLabel(membership: Membership, sessionUserId: string): string {
  const you = membership.userId === sessionUserId ? " (you)" : "";
  return `Member ···${phoneSuffix(membership.userId)}${you}`;
}

export function MembersScreen({
  session,
  pool,
  onCancel,
  onSelectUser,
  onRemoveMember,
  onLeavePool,
}: {
  session: StoredSession;
  pool: Pool;
  onCancel: () => void;
  onSelectUser: (userId: string) => void;
  onRemoveMember: (memberId: string) => void;
  onLeavePool: () => void;
}) {
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isOrganizer = pool.organizerId === session.user.id;

  // Re-fetches on every focus (not just mount) so returning from
  // RemoveMemberScreen shows the updated list without a manual refresh.
  useFocusEffect(
    useCallback(() => {
      listMembers(session.token, pool.id)
        .then(setMembers)
        .catch((err) => setError(err instanceof MembersApiError ? err.message : "Something went wrong"))
        .finally(() => setLoading(false));
    }, [pool.id, session.token]),
  );

  return (
    <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>
          <View style={{ width: 24 }} />
        </View>
        <Text style={styles.title}>Members</Text>
        <Text style={styles.subtitle}>{pool.name}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator style={styles.loading} color={colors.ink600} />
        ) : (
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderItem={({ item, index }) => (
              <ListRow
                leading={<Avatar label={phoneSuffix(item.userId).charAt(0).toUpperCase()} />}
                title={memberLabel(item, session.user.id)}
                subtitle={item.role === "ORGANIZER" ? undefined : "Member"}
                divider={index < members.length - 1}
                onPress={() => onSelectUser(item.userId)}
                right={
                  item.role === "ORGANIZER" ? (
                    <Pill label="Organizer" variant="dark" />
                  ) : isOrganizer ? (
                    <Pressable
                      style={styles.removeButton}
                      onPress={() => onRemoveMember(item.userId)}
                    >
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </Pressable>
                  ) : undefined
                }
              />
            )}
          />
        )}

        {!isOrganizer && pool.state !== "CLOSED" ? (
          <Pressable style={styles.leaveButton} onPress={onLeavePool}>
            <Text style={styles.leaveButtonText}>Leave Pool</Text>
          </Pressable>
        ) : null}
      </View>
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
    marginBottom: spacing.s2,
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
    ...type.caption,
    marginBottom: spacing.s5,
  },
  loading: {
    marginTop: spacing.s6,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginBottom: spacing.s3,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.s8,
  },
  removeButton: {
    height: 34,
    borderWidth: 1.5,
    borderColor: colors.danger600,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s3,
  },
  removeButtonText: {
    ...type.label,
    color: colors.danger600,
  },
  leaveButton: {
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.danger600,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s4,
  },
  leaveButtonText: {
    ...type.bodyBold,
    color: colors.danger600,
  },
});
