import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { Screen } from "../components/Screen";
import type { StoredSession } from "../api/session";
import {
  getNotifications,
  markAllNotificationsRead,
  type Notification,
  type NotificationType,
} from "../api/notificationsClient";
import { listMyInvitations, type InvitationForInvitee } from "../api/invitationsClient";
import { listPools, type Pool } from "../api/poolsClient";
import { formatTimestamp } from "../lib/time";
import { colors, radii, spacing, type } from "../theme/tokens";

function TypeIcon({ type: notifType }: { type: NotificationType }) {
  const isMoneyIn = notifType === "DEPOSIT_RECEIVED";
  return (
    <View style={[styles.iconCircle, isMoneyIn ? styles.iconCircleGreen : styles.iconCircleInk]}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.ink900} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        {notifType === "DEPOSIT_RECEIVED" ? (
          <Path d="M12 19V6M6 12l6-6 6 6" />
        ) : notifType === "POOL_FULLY_FUNDED" ? (
          <Path d="M5 13l4 4L19 7" />
        ) : notifType === "REFUND_PROCESSED" ? (
          <Path d="M12 5v13M6 12l6 6 6-6" />
        ) : (
          <>
            <Rect x={5} y={11} width={14} height={9} rx={2} />
            <Path d="M8 11V8a4 4 0 018 0v3" />
          </>
        )}
      </Svg>
    </View>
  );
}

function NotificationRow({ notification, onPress }: { notification: Notification; onPress?: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress}>
      <TypeIcon type={notification.type} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{notification.message}</Text>
        <Text style={styles.rowSubtitle}>{formatTimestamp(notification.createdAt)}</Text>
      </View>
      {notification.readAt === null ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

export function AlertsScreen({
  session,
  onUnreadCountChange,
  onOpenInvitation,
  onOpenJoinRequests,
  onOpenApprovedPool,
}: {
  session: StoredSession;
  onUnreadCountChange: (count: number) => void;
  // Called once the tapped INVITATION_RECEIVED notification is resolved to
  // its live Invitation — resolution happens here (not in the caller) since
  // the notification only carries a poolId, not an invitation id.
  onOpenInvitation: (invitationForInvitee: InvitationForInvitee) => void;
  // Tapping a JOIN_REQUEST_RECEIVED notification (the Organizer's own) —
  // navigates to All Members' Pending requests section for that Pool.
  onOpenJoinRequests: (pool: Pool) => void;
  // Tapping a JOIN_REQUEST_APPROVED notification (the requester's own) —
  // navigates into the Pool they were just approved into.
  onOpenApprovedPool: (pool: Pool) => void;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getNotifications(session.token)
      .then((result) => {
        setNotifications(result);
        onUnreadCountChange(result.filter((n) => n.readAt === null).length);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"));
  }, [session.token, onUnreadCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const unread = notifications.filter((n) => n.readAt === null);
  const read = notifications.filter((n) => n.readAt !== null);

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead(session.token);
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      onUnreadCountChange(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleNotificationPress(notification: Notification) {
    if (notification.type === "INVITATION_RECEIVED") {
      try {
        const invitations = await listMyInvitations(session.token);
        const match = invitations.find((i) => i.invitation.poolId === notification.poolId);
        if (match) {
          onOpenInvitation(match);
        } else {
          // Already paid/voided/expired since the notification fired.
          setError("This invitation is no longer available.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
      return;
    }

    if (notification.type === "JOIN_REQUEST_RECEIVED" || notification.type === "JOIN_REQUEST_APPROVED") {
      try {
        const pools = await listPools(session.token);
        const pool = pools.find((p) => p.id === notification.poolId);
        if (!pool) {
          setError("This Pool is no longer available.");
          return;
        }
        if (notification.type === "JOIN_REQUEST_RECEIVED") {
          onOpenJoinRequests(pool);
        } else {
          onOpenApprovedPool(pool);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    }
  }

  function isTappable(notification: Notification): boolean {
    return (
      notification.type === "INVITATION_RECEIVED" ||
      notification.type === "JOIN_REQUEST_RECEIVED" ||
      notification.type === "JOIN_REQUEST_APPROVED"
    );
  }

  return (
    <Screen backgroundColor={colors.cream} edges={["top"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Alerts</Text>
          {unread.length > 0 ? (
            <Pressable onPress={handleMarkAllRead}>
              <Text style={styles.markAllRead}>Mark all read</Text>
            </Pressable>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {notifications.length === 0 ? (
          <Text style={styles.empty}>
            Deposit, funding, Lock, and Refund notifications will show up here soon.
          </Text>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {unread.length > 0 ? (
              <View>
                <Text style={styles.groupLabel}>New</Text>
                <View style={styles.list}>
                  {unread.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      onPress={
                        isTappable(notification)
                          ? () => handleNotificationPress(notification)
                          : undefined
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {read.length > 0 ? (
              <View>
                <Text style={styles.groupLabel}>Earlier</Text>
                <View style={styles.list}>
                  {read.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      onPress={
                        isTappable(notification)
                          ? () => handleNotificationPress(notification)
                          : undefined
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.s6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.s4,
  },
  title: {
    ...type.title,
    color: colors.ink900,
  },
  markAllRead: {
    ...type.bodyBold,
    color: colors.pumpkin600,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginBottom: spacing.s3,
  },
  empty: {
    ...type.body,
    color: colors.ink400,
    textAlign: "center",
    marginTop: spacing.s8,
  },
  groupLabel: {
    ...type.label,
    marginBottom: spacing.s2,
    marginTop: spacing.s2,
  },
  scrollContent: {
    paddingBottom: spacing.s8,
  },
  list: {
    gap: spacing.s2,
    marginBottom: spacing.s4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.s3,
    gap: spacing.s3,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleGreen: {
    backgroundColor: colors.green100,
  },
  iconCircleInk: {
    backgroundColor: colors.ink100,
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
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.pumpkin500,
    marginLeft: spacing.s2,
  },
});
