import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import {
  closePool,
  getClosurePreview,
  ClosureApiError,
  type ClosurePreview,
  type ClosureResult,
} from "../api/closureClient";
import { Screen } from "../components/Screen";
import { paiseToRupeeLabel } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

export function CloseConfirmScreen({
  session,
  pool,
  onClosed,
  onCancel,
}: {
  session: StoredSession;
  pool: Pool;
  onClosed: (result: ClosureResult) => void;
  onCancel: () => void;
}) {
  const [preview, setPreview] = useState<ClosurePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getClosurePreview(session.token, pool.id)
      .then(setPreview)
      .catch((err) => setError(err instanceof ClosureApiError ? err.message : "Something went wrong"));
  }, [pool.id, session.token]);

  async function handleClose() {
    setError(null);
    setLoading(true);
    try {
      const result = await closePool(session.token, pool.id);
      onClosed(result);
    } catch (err) {
      setError(err instanceof ClosureApiError ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  // Only shown as a single figure when every Member's share is equal (the
  // common Equal Split case) — an Open Pool's uneven contributions don't
  // have one "each receives" number to show truthfully.
  const eachReceivesPaise =
    preview && preview.refunds.length > 0 && preview.refunds.every((r) => r.amountPaise === preview.refunds[0].amountPaise)
      ? preview.refunds[0].amountPaise
      : null;

  return (
    <Screen backgroundColor={colors.cream}>
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onCancel}>
          <Text style={styles.back}>{"‹"}</Text>
        </Pressable>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.centered}>
        <View style={styles.warnRing}>
          <Text style={styles.warnGlyph}>!</Text>
        </View>
        <Text style={styles.title}>Close {pool.name}?</Text>
        <Text style={styles.subtitle}>
          This ends the Pool for everyone and can't be undone. The remaining balance is refunded
          in proportion to deposits.
        </Text>
      </View>

      {preview ? (
        <View style={styles.kvCard}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Refund total</Text>
            <Text style={styles.kvValue}>{paiseToRupeeLabel(preview.refundTotalPaise)}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Members refunded</Text>
            <Text style={styles.kvValue}>{preview.refunds.length}</Text>
          </View>
          {eachReceivesPaise !== null ? (
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Each receives</Text>
              <Text style={[styles.kvValue, styles.kvValueGreen]}>
                +{paiseToRupeeLabel(eachReceivesPaise)}
              </Text>
            </View>
          ) : null}
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Arrives</Text>
            <Text style={styles.kvValue}>Within 24 hours</Text>
          </View>
        </View>
      ) : (
        <ActivityIndicator style={styles.previewLoading} color={colors.ink600} />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.footer}>
        <Pressable
          style={styles.dangerButton}
          onPress={handleClose}
          disabled={loading || !preview}
        >
          {loading ? (
            <ActivityIndicator color={colors.paper} />
          ) : (
            <Text style={styles.dangerButtonText}>
              Close & refund {preview ? paiseToRupeeLabel(preview.refundTotalPaise) : ""}
            </Text>
          )}
        </Pressable>
        <Pressable style={styles.outlineButton} onPress={onCancel} disabled={loading}>
          <Text style={styles.outlineButtonText}>Keep the Pool</Text>
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
