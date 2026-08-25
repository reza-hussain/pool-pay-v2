import { Pressable, StyleSheet, Text, View } from "react-native";
import type { StoredSession } from "../api/session";
import { isMoneyIn, type LedgerEntry } from "../api/ledgerClient";
import { ListRow } from "../components/ListRow";
import { Pill } from "../components/Pill";
import { Screen } from "../components/Screen";
import { whoLabel } from "../lib/identity";
import { paiseToRupeeLabel } from "../lib/money";
import { formatTimestamp } from "../lib/time";
import { colors, radii, spacing, type } from "../theme/tokens";

const TYPE_LABEL: Record<LedgerEntry["type"], string> = {
  DEPOSIT: "Deposit",
  SPEND: "Spend",
  REIMBURSEMENT: "Reimbursement",
  REFUND: "Refund",
};

// One unified view for any transaction row, of any type — no nested history,
// just who/date/amount/description (ADR-0018). A SPEND's "who" is the
// Transfer-out actor (`spendActorUserId`), not the merchant in `counterparty`.
export function TransactionDetailScreen({
  session,
  entry,
  onBack,
  onSelectUser,
}: {
  session: StoredSession;
  entry: LedgerEntry;
  onBack: () => void;
  onSelectUser: (userId: string) => void;
}) {
  const isInflow = isMoneyIn(entry.type);
  const whoUserId = entry.type === "SPEND" ? entry.spendActorUserId : entry.counterparty;
  const description = entry.type === "SPEND" ? entry.counterparty : TYPE_LABEL[entry.type];

  return (
    <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} hitSlop={8}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Transaction</Text>
          <Pill label={TYPE_LABEL[entry.type]} variant={isInflow ? "green" : "outline"} />
        </View>

        <View style={styles.card}>
          <ListRow
            title="Who"
            divider
            right={
              whoUserId ? (
                <Pressable onPress={() => onSelectUser(whoUserId)}>
                  <Text style={styles.link}>{whoLabel(whoUserId, session.user.id)}</Text>
                </Pressable>
              ) : (
                <Text style={styles.value}>Unknown</Text>
              )
            }
          />
          <ListRow
            title="Date"
            divider
            right={<Text style={styles.value}>{formatTimestamp(entry.createdAt)}</Text>}
          />
          <ListRow
            title="Amount"
            divider
            right={
              <Text style={[styles.value, isInflow ? styles.amountGreen : styles.amountInk]}>
                {isInflow ? "+" : "−"}
                {paiseToRupeeLabel(entry.amountPaise)}
              </Text>
            }
          />
          <ListRow
            title="Description"
            divider={false}
            right={<Text style={styles.value} numberOfLines={1}>{description}</Text>}
          />
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.s5,
  },
  title: {
    ...type.title,
    color: colors.ink900,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.s4,
  },
  value: {
    ...type.bodyBold,
    color: colors.ink900,
  },
  link: {
    ...type.bodyBold,
    color: colors.ink900,
    textDecorationLine: "underline",
  },
  amountGreen: {
    color: colors.green600,
  },
  amountInk: {
    color: colors.ink900,
  },
});
