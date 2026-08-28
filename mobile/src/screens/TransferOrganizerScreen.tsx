import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import {
  listMembers,
  transferOrganizer,
  MembersApiError,
  type Membership,
} from "../api/membersClient";
import { Avatar } from "../components/Avatar";
import { ListRow } from "../components/ListRow";
import { Screen } from "../components/Screen";
import { phoneSuffix } from "../lib/identity";
import { colors, radii, spacing, type } from "../theme/tokens";

// Organizer Transfer (ADR-0023): unilateral, no vote — pick a successor from
// currently active Members, then a destructive-style confirm (this hands
// off lifecycle authority immediately and can't be undone from here).
export function TransferOrganizerScreen({
  session,
  pool,
  onCancel,
  onTransferred,
}: {
  session: StoredSession;
  pool: Pool;
  onCancel: () => void;
  onTransferred: (updatedPool: Pool) => void;
}) {
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [members, setMembers] = useState<Membership[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [selected, setSelected] = useState<Membership | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMembers(session.token, pool.id)
      .then(setMembers)
      .catch((err) => setError(err instanceof MembersApiError ? err.message : "Something went wrong"))
      .finally(() => setLoadingMembers(false));
  }, [pool.id, session.token]);

  // Limited to active, non-Organizer Members — can't hand off to someone
  // who's already left, and the current Organizer isn't their own target.
  const candidates = members.filter((m) => m.role !== "ORGANIZER");

  function pick(member: Membership) {
    setSelected(member);
    setStep("confirm");
  }

  async function handleConfirm() {
    if (!selected) return;
    setError(null);
    setSubmitting(true);
    try {
      const updatedPool = await transferOrganizer(session.token, pool.id, selected.userId);
      onTransferred(updatedPool);
    } catch (err) {
      setError(err instanceof MembersApiError ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (step === "confirm" && selected) {
    return (
      <Screen backgroundColor={colors.cream}>
        <View style={styles.container}>
          <View style={styles.topRow}>
            <Pressable onPress={() => setStep("pick")} hitSlop={8}>
              <Text style={styles.back}>{"‹"}</Text>
            </Pressable>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.centered}>
            <View style={styles.warnRing}>
              <Text style={styles.warnGlyph}>!</Text>
            </View>
            <Text style={styles.confirmTitle}>
              Make Member ···{phoneSuffix(selected.userId)} the Organizer?
            </Text>
            <Text style={styles.confirmSubtitle}>
              This happens immediately and can't be undone from here. You'll become an ordinary
              Member of {pool.name}.
            </Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.footer}>
            <Pressable style={styles.dangerButton} onPress={handleConfirm} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color={colors.paper} />
              ) : (
                <Text style={styles.dangerButtonText}>Transfer Organizer</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.outlineButton}
              onPress={() => setStep("pick")}
              disabled={submitting}
            >
              <Text style={styles.outlineButtonText}>Choose someone else</Text>
            </Pressable>
          </View>
        </View>
      </Screen>
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
        <Text style={styles.title}>Transfer Organizer</Text>
        <Text style={styles.subtitle}>Pick who takes over {pool.name}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loadingMembers ? (
          <ActivityIndicator style={styles.loading} color={colors.ink600} />
        ) : (
          <FlatList
            data={candidates}
            keyExtractor={(m) => m.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderItem={({ item, index }) => (
              <ListRow
                leading={<Avatar label={phoneSuffix(item.userId).charAt(0).toUpperCase()} />}
                title={`Member ···${phoneSuffix(item.userId)}`}
                divider={index < candidates.length - 1}
                onPress={() => pick(item)}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>No other active Members to hand off to</Text>
            }
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
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.s8,
  },
  empty: {
    ...type.body,
    color: colors.ink400,
    textAlign: "center",
    marginTop: spacing.s6,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginBottom: spacing.s3,
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
  confirmTitle: {
    ...type.title,
    color: colors.ink900,
    marginTop: spacing.s5,
    textAlign: "center",
  },
  confirmSubtitle: {
    ...type.body,
    color: colors.ink400,
    textAlign: "center",
    maxWidth: 280,
    marginTop: spacing.s2,
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
