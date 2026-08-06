import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Screen } from "../components/Screen";
import type { StoredSession } from "../api/session";
import { getActivity, type ActivityEntry } from "../api/activityClient";
import { paiseToRupeeLabel } from "../lib/money";
import { formatTimestamp } from "../lib/time";
import { colors, radii, spacing, type } from "../theme/tokens";

type Filter = "ALL" | "DEPOSIT" | "REFUND";
type DateGroup = "Today" | "This week" | "Earlier";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "DEPOSIT", label: "Deposits" },
  { key: "REFUND", label: "Refunds" },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateGroupFor(iso: string, now: Date): DateGroup {
  const date = new Date(iso);
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return "Today";

  const daysAgo = Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY);
  return daysAgo < 7 ? "This week" : "Earlier";
}

function entryTitle(entry: ActivityEntry): string {
  return entry.type === "DEPOSIT" ? `${entry.counterpartyName} deposited` : "Refund received";
}

function groupEntries(entries: ActivityEntry[]): { group: DateGroup; entries: ActivityEntry[] }[] {
  const now = new Date();
  const groups: { group: DateGroup; entries: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const group = dateGroupFor(entry.createdAt, now);
    const last = groups[groups.length - 1];
    if (last && last.group === group) {
      last.entries.push(entry);
    } else {
      groups.push({ group, entries: [entry] });
    }
  }
  return groups;
}

function EntryRow({ entry }: { entry: ActivityEntry }) {
  const isDeposit = entry.type === "DEPOSIT";
  return (
    <View style={styles.row}>
      <View style={[styles.iconCircle, isDeposit ? styles.iconCircleGreen : styles.iconCircleInk]}>
        <Text style={styles.iconGlyph}>{isDeposit ? "↑" : "↓"}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{entryTitle(entry)}</Text>
        <Text style={styles.rowSubtitle}>
          {entry.poolName} · {formatTimestamp(entry.createdAt)}
        </Text>
      </View>
      <Text style={styles.amount}>{`+${paiseToRupeeLabel(entry.amountPaise)}`}</Text>
    </View>
  );
}

export function ActivityScreen({ session }: { session: StoredSession }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");

  useEffect(() => {
    let cancelled = false;
    getActivity(session.token)
      .then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong");
      });
    return () => {
      cancelled = true;
    };
  }, [session.token]);

  const filtered = useMemo(
    () => (filter === "ALL" ? entries : entries.filter((entry) => entry.type === filter)),
    [entries, filter],
  );
  const groups = useMemo(() => groupEntries(filtered), [filtered]);

  return (
    <Screen backgroundColor={colors.cream} edges={["top"]}>
      <View style={styles.container}>
        <Text style={styles.title}>Activity</Text>

        <View style={styles.segment}>
          {FILTERS.map((option) => (
            <Pressable
              key={option.key}
              style={[styles.seg, filter === option.key && styles.segActive]}
              onPress={() => setFilter(option.key)}
            >
              <Text style={[styles.segLabel, filter === option.key && styles.segLabelActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {filtered.length === 0 ? (
          <Text style={styles.empty}>
            {entries.length === 0
              ? "Your Deposits and Refunds across every Pool will show up here soon."
              : "Nothing to show for this filter yet."}
          </Text>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {groups.map(({ group, entries: groupItems }) => (
              <View key={group}>
                <Text style={styles.groupLabel}>{group}</Text>
                <View style={styles.list}>
                  {groupItems.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} />
                  ))}
                </View>
              </View>
            ))}
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
  title: {
    ...type.title,
    color: colors.ink900,
    marginBottom: spacing.s4,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.segmentFill,
    borderRadius: radii.md,
    padding: 4,
    gap: 4,
    marginBottom: spacing.s5,
  },
  seg: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: radii.sm,
  },
  segActive: {
    backgroundColor: colors.ink900,
  },
  segLabel: {
    ...type.body,
    color: colors.ink400,
  },
  segLabelActive: {
    color: colors.cream,
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
    backgroundColor: colors.flax300,
  },
  iconGlyph: {
    ...type.bodyBold,
    fontSize: 16,
    color: colors.ink900,
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
  amount: {
    ...type.bodyBold,
    fontSize: 14,
    color: colors.green600,
  },
});
