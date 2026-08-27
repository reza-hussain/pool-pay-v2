import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import {
  listMembers,
  removeMember,
  MembersApiError,
  type Membership,
} from "../api/membersClient";
import {
  listPendingJoinRequests,
  approveJoinRequest,
  declineJoinRequest,
  JoinRequestsApiError,
  type JoinRequestForOrganizer,
} from "../api/joinRequestsClient";
import { Screen } from "../components/Screen";
import { colors, radii, spacing, type } from "../theme/tokens";

// No Member profile (name/phone) exists yet — same shortened-userId label
// used on the Reimburse/Closed screens.
function memberLabel(membership: Membership, sessionUserId: string): string {
  const short = membership.userId.slice(-4);
  const you = membership.userId === sessionUserId ? " (you)" : "";
  return `Member ···${short}${you}`;
}

function requesterLabel(request: JoinRequestForOrganizer): string {
  if (request.requesterName) return request.requesterName;
  return `Requester ···${request.joinRequest.requesterUserId.slice(-4)}`;
}

export function MembersScreen({
  session,
  pool,
  onCancel,
}: {
  session: StoredSession;
  pool: Pool;
  onCancel: () => void;
}) {
  const [members, setMembers] = useState<Membership[]>([]);
  const [pendingRequests, setPendingRequests] = useState<JoinRequestForOrganizer[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOrganizer = pool.organizerId === session.user.id;

  const fetchMembers = useCallback(() => {
    listMembers(session.token, pool.id)
      .then(setMembers)
      .catch((err) => setError(err instanceof MembersApiError ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, [pool.id, session.token]);

  const fetchPendingRequests = useCallback(() => {
    if (!isOrganizer) return;
    listPendingJoinRequests(session.token, pool.id)
      .then(setPendingRequests)
      .catch((err) => setError(err instanceof JoinRequestsApiError ? err.message : "Something went wrong"));
  }, [isOrganizer, pool.id, session.token]);

  useEffect(() => {
    fetchMembers();
    fetchPendingRequests();
  }, [fetchMembers, fetchPendingRequests]);

  function confirmRemove(membership: Membership) {
    Alert.alert(
      "Remove this Member?",
      `They'll no longer be able to deposit into or view ${pool.name}. Their prior deposits are still refunded pro-rata when the Pool closes.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setError(null);
            setRemovingId(membership.userId);
            try {
              await removeMember(session.token, pool.id, membership.userId);
              setMembers((prev) => prev.filter((m) => m.userId !== membership.userId));
            } catch (err) {
              setError(err instanceof MembersApiError ? err.message : "Something went wrong");
            } finally {
              setRemovingId(null);
            }
          },
        },
      ],
    );
  }

  async function handleApprove(request: JoinRequestForOrganizer) {
    setError(null);
    setDecidingId(request.joinRequest.id);
    try {
      await approveJoinRequest(session.token, pool.id, request.joinRequest.id);
      setPendingRequests((prev) => prev.filter((r) => r.joinRequest.id !== request.joinRequest.id));
      fetchMembers();
    } catch (err) {
      setError(err instanceof JoinRequestsApiError ? err.message : "Something went wrong");
    } finally {
      setDecidingId(null);
    }
  }

  function confirmDecline(request: JoinRequestForOrganizer) {
    Alert.alert(
      "Decline this request?",
      `${requesterLabel(request)} won't be able to request to join ${pool.name} again with the same Pool Code or link.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            setError(null);
            setDecidingId(request.joinRequest.id);
            try {
              await declineJoinRequest(session.token, pool.id, request.joinRequest.id);
              setPendingRequests((prev) => prev.filter((r) => r.joinRequest.id !== request.joinRequest.id));
            } catch (err) {
              setError(err instanceof JoinRequestsApiError ? err.message : "Something went wrong");
            } finally {
              setDecidingId(null);
            }
          },
        },
      ],
    );
  }

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
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              isOrganizer && pendingRequests.length > 0 ? (
                <View style={styles.pendingSection}>
                  <Text style={styles.sectionLabel}>Pending requests</Text>
                  {pendingRequests.map((request) => (
                    <View key={request.joinRequest.id} style={styles.row}>
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle}>{requesterLabel(request)}</Text>
                        <Text style={styles.rowSubtitle}>Wants to join</Text>
                      </View>
                      <View style={styles.pendingActions}>
                        <Pressable
                          style={styles.declineButton}
                          onPress={() => confirmDecline(request)}
                          disabled={decidingId === request.joinRequest.id}
                        >
                          <Text style={styles.declineButtonText}>Decline</Text>
                        </Pressable>
                        <Pressable
                          style={styles.approveButton}
                          onPress={() => handleApprove(request)}
                          disabled={decidingId === request.joinRequest.id}
                        >
                          {decidingId === request.joinRequest.id ? (
                            <ActivityIndicator color={colors.paper} />
                          ) : (
                            <Text style={styles.approveButtonText}>Approve</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  <Text style={[styles.sectionLabel, styles.membersLabel]}>Members</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{memberLabel(item, session.user.id)}</Text>
                  <Text style={styles.rowSubtitle}>
                    {item.role === "ORGANIZER" ? "Organizer" : "Member"}
                  </Text>
                </View>
                {isOrganizer && item.role !== "ORGANIZER" ? (
                  <Pressable
                    style={styles.removeButton}
                    onPress={() => confirmRemove(item)}
                    disabled={removingId === item.userId}
                  >
                    {removingId === item.userId ? (
                      <ActivityIndicator color={colors.danger600} />
                    ) : (
                      <Text style={styles.removeButtonText}>Remove</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            )}
          />
        )}
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
    gap: spacing.s2,
    paddingBottom: spacing.s8,
  },
  pendingSection: {
    gap: spacing.s2,
    marginBottom: spacing.s2,
  },
  sectionLabel: {
    ...type.label,
    color: colors.ink400,
  },
  membersLabel: {
    marginTop: spacing.s2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.s3,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    ...type.bodyBold,
    fontSize: 13.5,
    color: colors.ink900,
  },
  rowSubtitle: {
    ...type.caption,
    marginTop: 2,
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
  pendingActions: {
    flexDirection: "row",
    gap: spacing.s2,
  },
  declineButton: {
    height: 34,
    borderWidth: 1.5,
    borderColor: colors.danger600,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s3,
  },
  declineButtonText: {
    ...type.label,
    color: colors.danger600,
  },
  approveButton: {
    height: 34,
    backgroundColor: colors.ink900,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s3,
  },
  approveButtonText: {
    ...type.label,
    color: colors.paper,
  },
});
