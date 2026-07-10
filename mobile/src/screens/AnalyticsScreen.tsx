import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { subscribe, AuthApiError } from "../api/authClient";
import { getCrossPoolAnalytics, AnalyticsApiError, type CrossPoolAnalytics } from "../api/analyticsClient";
import type { StoredSession } from "../api/session";
import { Screen } from "../components/Screen";
import { paiseToRupeeLabel } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

// Freemium subscription (ticket #13, ADR 0011): waives the per-Spend fee,
// lifts the 3-Pool free-tier cap, and unlocks this cross-Pool analytics view.
// Stubbed — subscribing passes instantly, no real billing flow yet.
export function AnalyticsScreen({
  session,
  onSubscribed,
  onCancel,
}: {
  session: StoredSession;
  onSubscribed: (session: StoredSession) => void;
  onCancel: () => void;
}) {
  const [analytics, setAnalytics] = useState<CrossPoolAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.user.isSubscribed) return;
    getCrossPoolAnalytics(session.token)
      .then(setAnalytics)
      .catch((err) => setError(err instanceof AnalyticsApiError ? err.message : "Something went wrong"));
  }, [session.token, session.user.isSubscribed]);

  async function handleSubscribe() {
    setError(null);
    setLoading(true);
    try {
      const { user } = await subscribe(session.token);
      onSubscribed({ ...session, user });
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onCancel}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>
          <View style={{ width: 24 }} />
        </View>

        {session.user.isSubscribed ? (
          <>
            <Text style={styles.title}>Analytics</Text>
            <Text style={styles.subtitle}>Aggregate spend across every Pool you organize</Text>

            {analytics ? (
              <>
                <View style={styles.kvCard}>
                  <View style={styles.kvRow}>
                    <Text style={styles.kvKey}>Pools organized</Text>
                    <Text style={styles.kvValue}>{analytics.poolCount}</Text>
                  </View>
                  <View style={styles.kvRow}>
                    <Text style={styles.kvKey}>Total spent</Text>
                    <Text style={styles.kvValue}>{paiseToRupeeLabel(analytics.totalSpendPaise)}</Text>
                  </View>
                </View>

                <Text style={styles.listHeading}>By merchant</Text>
                <FlatList
                  data={analytics.byMerchant}
                  keyExtractor={(entry) => entry.merchantRef}
                  contentContainerStyle={styles.list}
                  renderItem={({ item }) => (
                    <View style={styles.row}>
                      <Text style={styles.rowTitle}>{item.merchantRef}</Text>
                      <Text style={styles.rowAmount}>{paiseToRupeeLabel(item.amountPaise)}</Text>
                    </View>
                  )}
                  ListEmptyComponent={<Text style={styles.empty}>No Spends yet</Text>}
                />
              </>
            ) : (
              <ActivityIndicator style={styles.loading} color={colors.ink600} />
            )}
          </>
        ) : (
          <>
            <Text style={styles.title}>Go further with Pool Pay</Text>
            <Text style={styles.subtitle}>
              Subscribe to waive the per-Spend fee, run unlimited concurrent Pools (free accounts
              are capped at 3), and unlock this cross-Pool analytics view.
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={styles.button} onPress={handleSubscribe} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={colors.paper} />
              ) : (
                <Text style={styles.buttonText}>Subscribe</Text>
              )}
            </Pressable>
          </>
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
    ...type.body,
    color: colors.ink400,
    marginTop: spacing.s2,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s4,
  },
  button: {
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
  loading: {
    marginTop: spacing.s6,
  },
  kvCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.s4,
    marginTop: spacing.s5,
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
  listHeading: {
    ...type.label,
    marginTop: spacing.s5,
    marginBottom: spacing.s2,
  },
  list: {
    gap: spacing.s2,
    paddingBottom: spacing.s8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.s3,
  },
  rowTitle: {
    ...type.bodyBold,
    fontSize: 13.5,
    color: colors.ink900,
  },
  rowAmount: {
    ...type.bodyBold,
    fontSize: 14,
    color: colors.ink900,
  },
  empty: {
    ...type.body,
    color: colors.ink400,
    textAlign: "center",
    marginTop: spacing.s6,
  },
});
