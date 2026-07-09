import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { paiseToRupeeLabel } from "../lib/money";
import { colors, radii, spacing, type } from "../theme/tokens";

// No "list pools" endpoint exists yet — this only shows Pools created during
// this app session, not fetched from the server. Will be replaced once a
// list-pools ticket exists.
export function PoolsHomeScreen({
  session,
  isNewUser,
  pools,
  onCreatePool,
  onJoinPool,
  onSelectPool,
  onOpenOrganizerControls,
  onViewLedger,
}: {
  session: StoredSession;
  isNewUser: boolean;
  pools: Pool[];
  onCreatePool: () => void;
  onJoinPool: () => void;
  onSelectPool: (pool: Pool) => void;
  onOpenOrganizerControls: (pool: Pool) => void;
  onViewLedger: (pool: Pool) => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>
        {isNewUser ? "Welcome to Pool Pay" : `Hey, ${session.user.phoneNumber}`}
      </Text>
      {pools.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No Pools yet</Text>
          <Text style={styles.emptySubtitle}>
            Create one for your next trip, or join a friend's with their code.
          </Text>
          <Pressable style={styles.button} onPress={onCreatePool}>
            <Text style={styles.buttonText}>Create a Pool</Text>
          </Pressable>
          <Pressable onPress={onJoinPool}>
            <Text style={styles.link}>Join with a code</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            data={pools}
            keyExtractor={(pool) => pool.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <PoolCard
                pool={item}
                isOrganizer={item.organizerId === session.user.id}
                onPress={() => onSelectPool(item)}
                onOpenOrganizerControls={() => onOpenOrganizerControls(item)}
                onViewLedger={() => onViewLedger(item)}
              />
            )}
          />
          <Pressable style={[styles.button, styles.fab]} onPress={onCreatePool}>
            <Text style={styles.buttonText}>Create a Pool</Text>
          </Pressable>
          <Pressable onPress={onJoinPool}>
            <Text style={styles.link}>Join with a code</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function PoolCard({
  pool,
  isOrganizer,
  onPress,
  onOpenOrganizerControls,
  onViewLedger,
}: {
  pool: Pool;
  isOrganizer: boolean;
  onPress: () => void;
  onOpenOrganizerControls: () => void;
  onViewLedger: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTopRow}>
        <Text style={styles.cardTitle}>{pool.name}</Text>
        <View style={styles.cardTopRowRight}>
          {pool.state === "LOCKED" ? (
            <View style={styles.lockedPill}>
              <Text style={styles.lockedPillText}>Locked</Text>
            </View>
          ) : null}
          {isOrganizer ? (
            <Pressable
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation();
                onOpenOrganizerControls();
              }}
            >
              <Text style={styles.moreGlyph}>{"⋯"}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={styles.cardBottomRow}>
        <Text style={styles.cardType}>
          {pool.type === "EQUAL_SPLIT"
            ? `Equal Split · ${paiseToRupeeLabel(pool.perPersonAmountPaise ?? 0)} / person`
            : "Open Pool"}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            onViewLedger();
          }}
        >
          <Text style={styles.activityLink}>Activity</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    padding: spacing.s6,
  },
  greeting: {
    ...type.body,
    color: colors.ink600,
    marginBottom: spacing.s4,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.s2,
  },
  emptyTitle: {
    ...type.title,
    color: colors.ink900,
  },
  emptySubtitle: {
    ...type.body,
    color: colors.ink400,
    textAlign: "center",
    maxWidth: 220,
    marginBottom: spacing.s4,
  },
  list: {
    gap: spacing.s3,
    paddingBottom: spacing.s8,
  },
  card: {
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.ink100,
    borderRadius: radii.lg,
    padding: spacing.s4,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  cardTopRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s2,
  },
  cardTitle: {
    ...type.bodyBold,
    fontSize: 14.5,
    color: colors.ink900,
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 3,
  },
  cardType: {
    ...type.caption,
  },
  activityLink: {
    ...type.label,
    color: colors.ink600,
  },
  lockedPill: {
    backgroundColor: colors.ink100,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: spacing.s2,
  },
  lockedPillText: {
    ...type.label,
    color: colors.ink600,
  },
  moreGlyph: {
    fontSize: 20,
    fontFamily: type.title.fontFamily,
    color: colors.ink400,
    paddingHorizontal: spacing.s1,
  },
  button: {
    height: 48,
    backgroundColor: colors.pumpkin500,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s5,
  },
  buttonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
  fab: {
    marginTop: spacing.s3,
  },
  link: {
    ...type.bodyBold,
    color: colors.ink600,
    textAlign: "center",
    marginTop: spacing.s3,
  },
});
