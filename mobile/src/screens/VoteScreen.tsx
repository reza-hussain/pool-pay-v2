import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import {
  castRefundVote,
  getVoteStatus,
  VotesApiError,
  type CastVoteResult,
  type VoteStatus,
} from "../api/votesClient";
import { Screen } from "../components/Screen";
import { colors, radii, spacing, type } from "../theme/tokens";

// Votes needed for a simple majority of non-Organizer Members (ADR 0009) —
// more than half, so 3 eligible voters need 2, 4 need 3, etc.
function votesNeeded(eligibleVoterCount: number): number {
  return Math.floor(eligibleVoterCount / 2) + 1;
}

export function VoteScreen({
  session,
  pool,
  onCancel,
  onPoolClosed,
}: {
  session: StoredSession;
  pool: Pool;
  onCancel: () => void;
  onPoolClosed: (result: NonNullable<CastVoteResult["closure"]>) => void;
}) {
  const [status, setStatus] = useState<VoteStatus | null>(null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getVoteStatus(session.token, pool.id)
      .then(setStatus)
      .catch((err) => setError(err instanceof VotesApiError ? err.message : "Something went wrong"));
  }, [pool.id, session.token]);

  async function handleVote() {
    setError(null);
    setVoting(true);
    try {
      const result = await castRefundVote(session.token, pool.id);
      if (result.closure) {
        onPoolClosed(result.closure);
        return;
      }
      setStatus(result.status);
    } catch (err) {
      setError(err instanceof VotesApiError ? err.message : "Something went wrong");
    } finally {
      setVoting(false);
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

        <Text style={styles.title}>Force a refund?</Text>
        <Text style={styles.subtitle}>
          If you no longer trust the Organizer of {pool.name}, you and the other Members can vote
          to immediately close this Pool and refund whatever balance remains. A simple majority of
          Members (not counting the Organizer) is needed. Money already spent or reimbursed can't
          be recovered.
        </Text>

        {status ? (
          <View style={styles.kvCard}>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Votes so far</Text>
              <Text style={styles.kvValue}>{status.votesCast}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Needed for a majority</Text>
              <Text style={styles.kvValue}>{votesNeeded(status.eligibleVoterCount)}</Text>
            </View>
          </View>
        ) : (
          <ActivityIndicator style={styles.loading} color={colors.ink600} />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {status?.hasVoted ? (
          <Text style={styles.votedNotice}>You've voted. Waiting on the rest of the Pool.</Text>
        ) : (
          <Pressable
            style={styles.voteButton}
            onPress={handleVote}
            disabled={voting || !status}
          >
            {voting ? (
              <ActivityIndicator color={colors.cream} />
            ) : (
              <Text style={styles.voteButtonText}>Vote to force a refund</Text>
            )}
          </Pressable>
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
    marginBottom: spacing.s5,
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
  loading: {
    marginTop: spacing.s6,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s3,
  },
  votedNotice: {
    ...type.body,
    color: colors.ink600,
    textAlign: "center",
    marginTop: spacing.s6,
  },
  voteButton: {
    height: 48,
    backgroundColor: colors.ink900,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s6,
  },
  voteButtonText: {
    ...type.bodyBold,
    color: colors.cream,
  },
});
