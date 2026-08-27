import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { poolTypeLabel, type Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { listMembers } from "../api/membersClient";
import {
  getLedger,
  getPoolBalance,
  isMoneyIn,
  LedgerApiError,
  type LedgerEntry,
} from "../api/ledgerClient";
import { entryLabel } from "./LedgerScreen";
import { AwaitingPaymentScreen } from "./AwaitingPaymentScreen";
import { AvatarStack } from "../components/Avatar";
import { ListRow } from "../components/ListRow";
import { Pill } from "../components/Pill";
import { Screen } from "../components/Screen";
import { phoneSuffix } from "../lib/identity";
import { paiseToRupeeLabel } from "../lib/money";
import { formatTimestamp } from "../lib/time";
import { colors, radii, spacing, type } from "../theme/tokens";

// Whether this viewer is the one the Organizer-payment gate applies to at
// all — not whether they've actually paid yet (see the members check below).
// A Pool never returns to Awaiting Payment once unlocked (CONTEXT.md), and
// the gate only ever applies to Equal Split/Custom Split, and only to the
// Organizer (ADR-0016/0017).
function poolStateLabel(state: Pool["state"]): string {
  switch (state) {
    case "LOCKED":
      return "Locked";
    case "CLOSED":
      return "Closed";
    case "EXPIRED":
      return "Expired";
    case "ACTIVE":
      return "Active";
  }
}

function isOrganizerPaymentGated(pool: Pool, sessionUserId: string): boolean {
  return (
    pool.organizerId === sessionUserId &&
    (pool.type === "EQUAL_SPLIT" || pool.type === "CUSTOM_SPLIT")
  );
}

type FilterPreset = "ALL" | "TODAY" | "WEEK" | "MONTH" | "CUSTOM";

const FILTERS: { key: FilterPreset; label: string }[] = [
  { key: "ALL", label: "All Time" },
  { key: "TODAY", label: "Today" },
  { key: "WEEK", label: "This Week" },
  { key: "MONTH", label: "This Month" },
  { key: "CUSTOM", label: "Custom" },
];

const PAGE_SIZE = 20;
// No websocket/SSE infra exists in this codebase (see ledgerClient's
// usePolledLedger) — same polling approach, scoped to just this screen's
// first page (ADR-0018).
const POLL_INTERVAL_MS = 4000;

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// This Week starts Monday (ADR-0018 acceptance criteria).
function startOfWeekMonday(): Date {
  const today = startOfToday();
  const diffToMonday = (today.getDay() + 6) % 7;
  today.setDate(today.getDate() - diffToMonday);
  return today;
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function parseDateInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  const date = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveRange(
  preset: FilterPreset,
  customFrom: string,
  customTo: string,
): { from?: string; to?: string } {
  switch (preset) {
    case "ALL":
      return {};
    case "TODAY":
      return { from: startOfToday().toISOString() };
    case "WEEK":
      return { from: startOfWeekMonday().toISOString() };
    case "MONTH":
      return { from: startOfMonth().toISOString() };
    case "CUSTOM": {
      const from = parseDateInput(customFrom);
      const to = parseDateInput(customTo);
      return {
        from: from ? from.toISOString() : undefined,
        to: to ? endOfDay(to).toISOString() : undefined,
      };
    }
  }
}

export function PoolDetailScreen({
  session,
  pool,
  onCancel,
  onDeposit,
  onPayOrganizerShare,
  onOpenOrganizerControls,
  onVoteToRefund,
  onViewAllMembers,
  onAddMembers,
  onSelectTransaction,
  onLock,
  onClosePool,
}: {
  session: StoredSession;
  pool: Pool;
  onCancel: () => void;
  onDeposit: () => void;
  // Only relevant while this Pool is gated Awaiting Payment (see below) — the
  // Organizer's own pay-your-share action, distinct from a regular Deposit.
  onPayOrganizerShare: () => void;
  onOpenOrganizerControls: () => void;
  onVoteToRefund: () => void;
  onViewAllMembers: () => void;
  // Invite Link/Pool Code flow — only ever offered for Equal Split, same
  // condition OrganizerControlsSheet already used for its own Add Members row.
  onAddMembers: () => void;
  onSelectTransaction: (entry: LedgerEntry) => void;
  onLock: () => Promise<void>;
  onClosePool: () => void;
}) {
  const isOrganizer = pool.organizerId === session.user.id;
  const isGated = isOrganizerPaymentGated(pool, session.user.id);
  // Membership presence is the single source of truth for whether the
  // Organizer has paid their own share (ADR-0016/0017) — null while the
  // first fetch is still in flight, so a gateable Pool never briefly flashes
  // its normal Dashboard before the check resolves. Also backs the avatar
  // strip once past the gate.
  const [members, setMembers] = useState<Awaited<ReturnType<typeof listMembers>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMembers(session.token, pool.id)
      .then((fetched) => {
        if (!cancelled) setMembers(fetched);
      })
      .catch(() => {
        // Non-critical for the normal dashboard (it just renders without a
        // member count) — but see the gateable-and-still-null case below.
      });
    return () => {
      cancelled = true;
    };
  }, [pool.id, session.token]);

  const [balancePaise, setBalancePaise] = useState<number | null>(null);
  const [filterPreset, setFilterPreset] = useState<FilterPreset>("ALL");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingFirstPage, setLoadingFirstPage] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Once the user has scrolled past the first page, background polling stops
  // so it doesn't disturb their scroll position (ADR-0018) — pull-to-refresh
  // is the way back to a fresh page one.
  const [hasLoadedMore, setHasLoadedMore] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const fetchFirstPage = useCallback(
    (showSpinner: boolean) => {
      const range = resolveRange(filterPreset, customFrom, customTo);
      if (showSpinner) setLoadingFirstPage(true);
      return Promise.all([
        getLedger(session.token, pool.id, {
          ...range,
          search: debouncedSearch || undefined,
          limit: PAGE_SIZE,
        }),
        getPoolBalance(session.token, pool.id),
      ])
        .then(([page, balance]) => {
          setEntries(page.entries);
          setNextCursor(page.nextCursor);
          setBalancePaise(balance);
          setHasLoadedMore(false);
          setLedgerError(null);
        })
        .catch((err) => {
          setLedgerError(err instanceof LedgerApiError ? err.message : "Something went wrong");
        })
        .finally(() => {
          setLoadingFirstPage(false);
          setRefreshing(false);
        });
    },
    [session.token, pool.id, filterPreset, customFrom, customTo, debouncedSearch],
  );

  useEffect(() => {
    fetchFirstPage(true);
  }, [fetchFirstPage]);

  useEffect(() => {
    if (hasLoadedMore) return;
    const interval = setInterval(() => fetchFirstPage(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchFirstPage, hasLoadedMore]);

  function loadMore() {
    if (!nextCursor || loadingMore || loadingFirstPage) return;
    setLoadingMore(true);
    const range = resolveRange(filterPreset, customFrom, customTo);
    getLedger(session.token, pool.id, {
      ...range,
      search: debouncedSearch || undefined,
      limit: PAGE_SIZE,
      cursor: nextCursor,
    })
      .then((page) => {
        setEntries((prev) => [...prev, ...page.entries]);
        setNextCursor(page.nextCursor);
        setHasLoadedMore(true);
      })
      .catch((err) => {
        setLedgerError(err instanceof LedgerApiError ? err.message : "Something went wrong");
      })
      .finally(() => setLoadingMore(false));
  }

  function onRefresh() {
    setRefreshing(true);
    fetchFirstPage(false);
  }

  if (isGated) {
    if (members === null) {
      return (
        <Screen backgroundColor={colors.cream}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.ink600} />
          </View>
        </Screen>
      );
    }
    if (!members.some((m) => m.userId === pool.organizerId)) {
      return (
        <AwaitingPaymentScreen
          session={session}
          pool={pool}
          onPayShare={onPayOrganizerShare}
          onCancel={onCancel}
        />
      );
    }
  }

  const memberInitials = (members ?? []).map((m) => phoneSuffix(m.userId).charAt(0).toUpperCase());
  // Add Members reuses the Invite Link/Pool Code flow, which only exists for
  // Equal Split — same gate OrganizerControlsSheet already applies.
  const canAddMembers = isOrganizer && pool.type === "EQUAL_SPLIT";
  // Same conditional visibility the sheet used before these moved here:
  // Lock hides once Locked, both hide once Closed.
  const canLock = isOrganizer && pool.state !== "LOCKED" && pool.state !== "CLOSED";
  const canClosePool = isOrganizer && pool.state !== "CLOSED";

  const header = (
    <>
      <View style={styles.topRow}>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={styles.back}>{"‹"}</Text>
        </Pressable>
        {isOrganizer ? (
          <Pressable onPress={onOpenOrganizerControls} hitSlop={8}>
            <Text style={styles.moreGlyph}>{"⋯"}</Text>
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title}>{pool.name}</Text>
        {pool.state !== "ACTIVE" ? (
          <Pill label={poolStateLabel(pool.state)} variant="outline" />
        ) : null}
      </View>
      <Text style={styles.subtitle}>
        {poolTypeLabel(pool.type)}
        {" · "}
        {isOrganizer ? "You're the Organizer" : "Member"}
      </Text>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Total Balance</Text>
        <Text style={styles.balanceAmount}>
          {balancePaise === null ? "···" : paiseToRupeeLabel(balancePaise)}
        </Text>
        <View style={styles.balanceMeta}>
          <Text style={styles.balanceMetaText}>
            {members === null ? "···" : `${members.length} member${members.length === 1 ? "" : "s"}`}
          </Text>
          {pool.type === "EQUAL_SPLIT" ? (
            <Text style={styles.balanceMetaText}>
              {paiseToRupeeLabel(pool.perPersonAmountPaise ?? 0)} / person
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.avatarStripRow}>
        <AvatarStack labels={memberInitials} max={5} />
        <View style={styles.avatarStripActions}>
          {canAddMembers ? (
            <Pressable style={styles.addMemberButton} onPress={onAddMembers} hitSlop={8}>
              <Text style={styles.addMemberButtonText}>+</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onViewAllMembers} hitSlop={8}>
            <Text style={styles.viewAllLink}>View all</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.actionsRow}>
        {/* A Custom Split Member's one Deposit is already spoken for by
            their Invitation — there's never a further Deposit to make
            (ADR 0016), so this button doesn't apply to that Pool type. */}
        {pool.type !== "CUSTOM_SPLIT" ? (
          <Pressable style={styles.depositButton} onPress={onDeposit}>
            <Text style={styles.depositButtonText}>Deposit</Text>
          </Pressable>
        ) : null}
      </View>

      {canLock || canClosePool ? (
        <View style={styles.organizerActionsRow}>
          {canLock ? (
            <Pressable style={styles.lockButton} onPress={onLock}>
              <Text style={styles.lockButtonText}>Lock Pool</Text>
            </Pressable>
          ) : null}
          {canClosePool ? (
            <Pressable style={styles.closeButton} onPress={onClosePool}>
              <Text style={styles.closeButtonText}>Close Pool & Refund</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!isOrganizer && pool.state !== "CLOSED" ? (
        <Pressable onPress={onVoteToRefund} hitSlop={8}>
          <Text style={styles.voteLink}>Vote to refund</Text>
        </Pressable>
      ) : null}

      <View style={styles.filterRow}>
        <FlatList
          data={FILTERS}
          horizontal
          keyExtractor={(f) => f.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.chip, filterPreset === item.key && styles.chipSelected]}
              onPress={() => setFilterPreset(item.key)}
            >
              <Text style={[styles.chipText, filterPreset === item.key && styles.chipTextSelected]}>
                {item.label}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {filterPreset === "CUSTOM" ? (
        <View style={styles.customRangeRow}>
          <TextInput
            style={styles.customRangeInput}
            placeholder="From YYYY-MM-DD"
            placeholderTextColor={colors.ink400}
            value={customFrom}
            onChangeText={setCustomFrom}
          />
          <TextInput
            style={styles.customRangeInput}
            placeholder="To YYYY-MM-DD"
            placeholderTextColor={colors.ink400}
            value={customTo}
            onChangeText={setCustomTo}
          />
        </View>
      ) : null}

      <TextInput
        style={styles.searchField}
        placeholder="Search members or spends"
        placeholderTextColor={colors.ink400}
        value={searchInput}
        onChangeText={setSearchInput}
        autoCapitalize="none"
      />

      {ledgerError ? <Text style={styles.error}>{ledgerError}</Text> : null}

      <Text style={styles.listHeadLabel}>Transactions</Text>
    </>
  );

  return (
    <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <FlatList
          data={entries}
          keyExtractor={(entry) => entry.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footerLoading} color={colors.ink600} /> : null
          }
          ListEmptyComponent={
            loadingFirstPage ? (
              <ActivityIndicator style={styles.loading} color={colors.ink600} />
            ) : (
              <Text style={styles.empty}>No activity yet</Text>
            )
          }
          renderItem={({ item, index }) => (
            <ListRow
              title={entryLabel(item, session.user.id)}
              subtitle={formatTimestamp(item.createdAt)}
              divider={index < entries.length - 1}
              onPress={() => onSelectTransaction(item)}
              right={
                <Text style={[styles.amount, isMoneyIn(item.type) ? styles.amountGreen : styles.amountInk]}>
                  {isMoneyIn(item.type) ? "+" : "−"}
                  {paiseToRupeeLabel(item.amountPaise)}
                </Text>
              }
            />
          )}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  listContent: {
    padding: spacing.s6,
    paddingBottom: spacing.s8,
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
  moreGlyph: {
    fontSize: 20,
    fontFamily: type.title.fontFamily,
    color: colors.ink400,
    paddingHorizontal: spacing.s1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s2,
  },
  title: {
    ...type.title,
    color: colors.ink900,
  },
  subtitle: {
    ...type.caption,
    marginBottom: spacing.s5,
  },
  balanceCard: {
    backgroundColor: colors.ink900,
    borderRadius: radii.xl,
    padding: spacing.s5,
  },
  balanceLabel: {
    ...type.label,
    color: colors.ink200,
  },
  balanceAmount: {
    ...type.balance,
    color: colors.cream,
    marginTop: spacing.s2,
  },
  balanceMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.s4,
  },
  balanceMetaText: {
    ...type.caption,
    color: colors.ink200,
  },
  avatarStripRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.s4,
  },
  avatarStripActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s4,
  },
  addMemberButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  addMemberButtonText: {
    ...type.bodyBold,
    fontSize: 16,
    color: colors.ink900,
  },
  viewAllLink: {
    ...type.label,
    color: colors.ink600,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.s3,
    marginTop: spacing.s4,
  },
  depositButton: {
    flex: 1,
    height: 48,
    backgroundColor: colors.pumpkin500,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  depositButtonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
  organizerActionsRow: {
    flexDirection: "row",
    gap: spacing.s3,
    marginTop: spacing.s3,
  },
  lockButton: {
    flex: 1,
    height: 44,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  lockButtonText: {
    ...type.bodyBold,
    fontSize: 12.5,
    color: colors.ink900,
  },
  closeButton: {
    flex: 1,
    height: 44,
    borderWidth: 1.5,
    borderColor: colors.danger600,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    ...type.bodyBold,
    fontSize: 12.5,
    color: colors.danger600,
  },
  voteLink: {
    ...type.label,
    color: colors.danger600,
    marginTop: spacing.s4,
  },
  filterRow: {
    marginTop: spacing.s5,
  },
  chipRow: {
    gap: spacing.s2,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: spacing.s4,
  },
  chipSelected: {
    backgroundColor: colors.ink900,
    borderColor: colors.ink900,
  },
  chipText: {
    ...type.bodyBold,
    fontSize: 12.5,
    color: colors.ink900,
  },
  chipTextSelected: {
    color: colors.cream,
  },
  customRangeRow: {
    flexDirection: "row",
    gap: spacing.s3,
    marginTop: spacing.s3,
  },
  customRangeInput: {
    flex: 1,
    backgroundColor: colors.fieldFill,
    borderRadius: radii.md,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s3,
    ...type.body,
    color: colors.ink900,
  },
  searchField: {
    backgroundColor: colors.fieldFill,
    borderRadius: radii.md,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    marginTop: spacing.s3,
    ...type.body,
    color: colors.ink900,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s3,
  },
  listHeadLabel: {
    ...type.label,
    marginTop: spacing.s5,
    marginBottom: spacing.s1,
  },
  loading: {
    marginTop: spacing.s6,
  },
  footerLoading: {
    marginVertical: spacing.s4,
  },
  empty: {
    ...type.body,
    color: colors.ink400,
    textAlign: "center",
    marginTop: spacing.s6,
  },
  amount: {
    ...type.bodyBold,
    fontSize: 14,
  },
  amountGreen: {
    color: colors.green600,
  },
  amountInk: {
    color: colors.ink900,
  },
});
