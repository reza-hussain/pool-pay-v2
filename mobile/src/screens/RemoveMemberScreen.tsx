import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { previewDeparture, removeMember, MembersApiError } from "../api/membersClient";
import { Screen } from "../components/Screen";
import { phoneSuffix } from "../lib/identity";
import { paiseToRupeeLabel, rupeesToPaise } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

// Organizer review-and-adjust step (ADR-0022): shown on every removal by
// default, not hidden behind an extra tap — the computed default refund is
// editable right here, then this same screen's danger button both confirms
// the removal and fires it (CloseConfirmScreen's destructive-confirm
// pattern), rather than adding a further "are you sure" step on top.
export function RemoveMemberScreen({
  session,
  pool,
  memberId,
  onCancel,
  onRemoved,
}: {
  session: StoredSession;
  pool: Pool;
  memberId: string;
  onCancel: () => void;
  onRemoved: () => void;
}) {
  const [defaultAmountPaise, setDefaultAmountPaise] = useState<number | null>(null);
  const [amountRupees, setAmountRupees] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    previewDeparture(session.token, pool.id, memberId)
      .then(({ amountPaise }) => {
        setDefaultAmountPaise(amountPaise);
        setAmountRupees((amountPaise / 100).toString());
      })
      .catch((err) => setError(err instanceof MembersApiError ? err.message : "Something went wrong"));
  }, [pool.id, memberId, session.token]);

  async function handleRemove() {
    setError(null);
    setLoading(true);
    try {
      await removeMember(session.token, pool.id, memberId, rupeesToPaise(amountRupees));
      onRemoved();
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
          <Text style={styles.title}>Remove Member ···{phoneSuffix(memberId)}?</Text>
          <Text style={styles.subtitle}>
            They'll no longer be able to deposit into or view {pool.name}. Review their refund
            below — you can adjust it before confirming.
          </Text>
        </View>

        {defaultAmountPaise !== null ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Refund amount (₹)</Text>
            <TextInput
              style={styles.fieldValue}
              keyboardType="decimal-pad"
              value={amountRupees}
              onChangeText={setAmountRupees}
            />
            <Text style={styles.fieldHint}>
              Computed default: {paiseToRupeeLabel(defaultAmountPaise)}
            </Text>
          </View>
        ) : (
          <ActivityIndicator style={styles.previewLoading} color={colors.ink600} />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.footer}>
          <Pressable
            style={styles.dangerButton}
            onPress={handleRemove}
            disabled={loading || defaultAmountPaise === null || !amountRupees}
          >
            {loading ? (
              <ActivityIndicator color={colors.paper} />
            ) : (
              <Text style={styles.dangerButtonText}>
                Remove & refund {amountRupees ? paiseToRupeeLabel(rupeesToPaise(amountRupees)) : ""}
              </Text>
            )}
          </Pressable>
          <Pressable style={styles.outlineButton} onPress={onCancel} disabled={loading}>
            <Text style={styles.outlineButtonText}>Cancel</Text>
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
    maxWidth: 280,
    marginTop: spacing.s2,
  },
  field: {
    backgroundColor: colors.fieldFill,
    borderRadius: radii.md,
    padding: spacing.s3,
    marginTop: spacing.s6,
  },
  fieldLabel: {
    ...type.label,
  },
  fieldValue: {
    fontSize: 24,
    fontFamily: type.title.fontFamily,
    color: colors.ink900,
    marginTop: 5,
    padding: 0,
  },
  fieldHint: {
    ...type.caption,
    marginTop: spacing.s2,
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
