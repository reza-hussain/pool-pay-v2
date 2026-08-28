import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import {
  getMyBalance,
  leaveSelf,
  MembersApiError,
  type DepartureRefund,
} from "../api/membersClient";
import { Screen } from "../components/Screen";
import { paiseToRupeeLabel } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

export function LeaveConfirmScreen({
  session,
  pool,
  onCancel,
  onLeft,
}: {
  session: StoredSession;
  pool: Pool;
  onCancel: () => void;
  onLeft: (refund: DepartureRefund | null) => void;
}) {
  const [balancePaise, setBalancePaise] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyBalance(session.token, pool.id)
      .then(setBalancePaise)
      .catch((err) => setError(err instanceof MembersApiError ? err.message : "Something went wrong"));
  }, [pool.id, session.token]);

  // Floored at zero (membership-service.ts payDepartureAndRemove) — a
  // Member who has overspent their own Deposits gets nothing back, never a
  // negative "refund".
  const receivesPaise = balancePaise === null ? null : Math.max(0, balancePaise);

  async function handleLeave() {
    setError(null);
    setLoading(true);
    try {
      const refund = await leaveSelf(session.token, pool.id);
      onLeft(refund);
    } catch (err) {
      setError(err instanceof MembersApiError ? err.message : "Something went wrong");
      setLoading(false);
    }
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

        <View style={styles.centered}>
          <View style={styles.warnRing}>
            <Text style={styles.warnGlyph}>!</Text>
          </View>
          <Text style={styles.title}>Leave {pool.name}?</Text>
          <Text style={styles.subtitle}>
            You'll no longer be able to deposit into or view this Pool. This can't be undone.
          </Text>
        </View>

        {receivesPaise !== null ? (
          <View style={styles.kvCard}>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>You'll receive</Text>
              <Text style={[styles.kvValue, styles.kvValueGreen]}>
                +{paiseToRupeeLabel(receivesPaise)}
              </Text>
            </View>
          </View>
        ) : (
          <ActivityIndicator style={styles.previewLoading} color={colors.ink600} />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.footer}>
          <Pressable
            style={styles.dangerButton}
            onPress={handleLeave}
            disabled={loading || receivesPaise === null}
          >
            {loading ? (
              <ActivityIndicator color={colors.paper} />
            ) : (
              <Text style={styles.dangerButtonText}>Leave the Pool</Text>
            )}
          </Pressable>
          <Pressable style={styles.outlineButton} onPress={onCancel} disabled={loading}>
            <Text style={styles.outlineButtonText}>Stay in the Pool</Text>
          </Pressable>
        </View>
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
  centered: {
    alignItems: "center",
    textAlign: "center",
  },
  warnRing: {
    width: 66,
    height: 66,
    borderRadius: radii.lg,
    backgroundColor: colors.danger100,
    alignItems: "center",
    justifyContent: "center",
  },
  warnGlyph: {
    fontSize: 30,
    fontFamily: type.title.fontFamily,
    color: colors.danger600,
  },
  title: {
    ...type.title,
    color: colors.ink900,
    marginTop: spacing.s5,
    textAlign: "center",
  },
  subtitle: {
    ...type.body,
    color: colors.ink400,
    textAlign: "center",
    maxWidth: 260,
    marginTop: spacing.s2,
  },
  kvCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.s4,
    marginTop: spacing.s6,
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.s2,
  },
  kvKey: {
    ...type.body,
    color: colors.ink600,
  },
  kvValue: {
    ...type.bodyBold,
    color: colors.ink900,
  },
  kvValueGreen: {
    color: colors.green600,
  },
  previewLoading: {
    marginTop: spacing.s6,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s3,
    textAlign: "center",
  },
  footer: {
    marginTop: "auto",
    gap: spacing.s3,
  },
  dangerButton: {
    height: 48,
    backgroundColor: colors.danger600,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerButtonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
  outlineButton: {
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineButtonText: {
    ...type.bodyBold,
    color: colors.ink900,
  },
});
