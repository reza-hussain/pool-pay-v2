import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Alert, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import {
  useFonts,
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
  Onest_800ExtraBold,
} from '@expo-google-fonts/onest';
import { NavigationContainer, useNavigationContainerRef, type CompositeScreenProps } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WelcomeCarouselScreen } from './src/screens/WelcomeCarouselScreen';
import { SignupLoginScreen } from './src/screens/SignupLoginScreen';
import { ProfileSetupScreen } from './src/screens/ProfileSetupScreen';
import { PoolsHomeScreen } from './src/screens/PoolsHomeScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { AlertsScreen } from './src/screens/AlertsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { LockScreen } from './src/screens/LockScreen';
import { CreatePoolScreen } from './src/screens/CreatePoolScreen';
import { InviteScreen } from './src/screens/InviteScreen';
import { JoinPoolScreen } from './src/screens/JoinPoolScreen';
import { PoolDetailScreen } from './src/screens/PoolDetailScreen';
import { DepositScreen } from './src/screens/DepositScreen';
import { SpendScreen } from './src/screens/SpendScreen';
import { ReimburseScreen } from './src/screens/ReimburseScreen';
import { LedgerScreen } from './src/screens/LedgerScreen';
import { CloseConfirmScreen } from './src/screens/CloseConfirmScreen';
import { ClosedScreen } from './src/screens/ClosedScreen';
import { VoteScreen } from './src/screens/VoteScreen';
import { MembersScreen } from './src/screens/MembersScreen';
import { UserDetailScreen } from './src/screens/UserDetailScreen';
import { TransactionDetailScreen } from './src/screens/TransactionDetailScreen';
import { VerifyIdentityScreen } from './src/screens/VerifyIdentityScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { OrganizerControlsSheet } from './src/screens/OrganizerControlsSheet';
import { InvitationsScreen } from './src/screens/InvitationsScreen';
import { InviteByPhoneScreen } from './src/screens/InviteByPhoneScreen';
import { InvitationScreen } from './src/screens/InvitationScreen';
import { HomeTabIcon, ActivityTabIcon, AlertsTabIcon, ProfileTabIcon } from './src/components/TabBarIcons';
import { colors, fontFamily } from './src/theme/tokens';
import type { ClosureRefund } from './src/api/closureClient';
import type { LedgerEntry } from './src/api/ledgerClient';
import { getInvitationByToken, InvitationsApiError, type InvitationForInvitee } from './src/api/invitationsClient';
import {
  clearSession,
  clearStaleDataFromPriorInstall,
  hasSeenWelcome,
  isAppLockEnabled,
  loadSession,
  markWelcomeSeen,
  persistAppLockEnabled,
  saveSession,
  type StoredSession,
} from './src/api/session';
import { isBiometricAuthAvailable } from './src/lib/biometrics';
import { listPools, lockPool, type Pool } from './src/api/poolsClient';
import { joinByPoolId } from './src/api/membersClient';
import { getNotifications } from './src/api/notificationsClient';
import { parseInvitationToken, parseJoinPoolId } from './src/lib/inviteLink';

SplashScreen.preventAutoHideAsync();

function fetchUnreadAlertsCount(token: string): Promise<number> {
  return getNotifications(token).then((notifications) => notifications.filter((n) => n.readAt === null).length);
}

type AuthStackParamList = {
  SignupLogin: undefined;
};

type AppStackParamList = {
  Home: undefined;
  VerifyIdentity: undefined;
  CreatePool: undefined;
  Invite: { pool: Pool };
  JoinPool: undefined;
  PoolDetail: { pool: Pool };
  // isOrganizerShare: this Deposit is the Organizer's own first share (from
  // CreatePool's Pay Now, or the Awaiting Payment Dashboard's Pay My Share)
  // rather than a regular ongoing one — paying it unlocks the Dashboard for
  // good (CONTEXT.md), so success lands there instead of just going back to
  // wherever this screen was pushed from.
  Deposit: { pool: Pool; isOrganizerShare?: boolean };
  Spend: { pool: Pool };
  Reimburse: { pool: Pool };
  Ledger: { pool: Pool };
  CloseConfirm: { pool: Pool };
  Closed: { pool: Pool; refunds: ClosureRefund[] };
  Vote: { pool: Pool };
  Members: { pool: Pool };
  UserDetail: { pool: Pool; userId: string };
  TransactionDetail: { pool: Pool; entry: LedgerEntry };
  Analytics: undefined;
  Invitations: { pool: Pool };
  InviteByPhone: { pool: Pool };
  InvitationDetail: { invitationForInvitee: InvitationForInvitee };
};

type AppTabParamList = {
  HomeTab: undefined;
  Activity: undefined;
  Alerts: undefined;
  Profile: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const AppTab = createBottomTabNavigator<AppTabParamList>();

// HomeRoute lives inside AppTab but still navigates to AppStack siblings
// (Deposit, Ledger, ...) — React Navigation bubbles those route names up to
// the parent Stack at runtime; this composite type is what lets `navigation`
// type-check both the Tab's own routes and the Stack's.
type HomeRouteProps = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'HomeTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

// Route wrapper components below are declared at module scope (not inside
// App()) so React Navigation sees a stable component identity per screen —
// passing an inline `children` render-prop to Stack.Screen instead re-renders
// (and can reset the local state of) every screen on each App() re-render.
// They read shared app state from context instead of via closures for the
// same reason.
const AuthContext = createContext<{
  onAuthenticated: (session: StoredSession, isNewUser: boolean) => void;
} | null>(null);

const SessionContext = createContext<{
  session: StoredSession;
  isNewUser: boolean;
  pools: Pool[];
  setPools: Dispatch<SetStateAction<Pool[]>>;
  setSession: (session: StoredSession) => void;
  onLogout: () => void;
  appLockEnabled: boolean;
  setAppLockEnabled: Dispatch<SetStateAction<boolean>>;
  unreadAlertsCount: number;
  setUnreadAlertsCount: Dispatch<SetStateAction<number>>;
} | null>(null);

function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthContext used outside its provider');
  return ctx;
}

function useSessionContext() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('SessionContext used outside its provider');
  return ctx;
}

function SignupLoginRoute() {
  const { onAuthenticated } = useAuthContext();
  return <SignupLoginScreen onAuthenticated={onAuthenticated} />;
}

function HomeRoute({ navigation }: HomeRouteProps) {
  const { session, isNewUser, pools } = useSessionContext();
  const [organizerControlsPool, setOrganizerControlsPool] = useState<Pool | null>(null);

  return (
    <>
      <PoolsHomeScreen
        session={session}
        isNewUser={isNewUser}
        pools={pools}
        onCreatePool={() =>
          navigation.navigate(session.user.isVerified ? 'CreatePool' : 'VerifyIdentity')
        }
        onJoinPool={() => navigation.navigate('JoinPool')}
        onSelectPool={(pool) => navigation.navigate('PoolDetail', { pool })}
        onOpenOrganizerControls={(pool) => setOrganizerControlsPool(pool)}
        onViewLedger={(pool) => navigation.navigate('Ledger', { pool })}
        onVoteToRefund={(pool) => navigation.navigate('Vote', { pool })}
        onOpenAnalytics={() => navigation.navigate('Analytics')}
      />
      {organizerControlsPool ? (
        <OrganizerControlsSheet
          pool={organizerControlsPool}
          onTransferOut={() => {
            navigation.navigate('Spend', { pool: organizerControlsPool });
            setOrganizerControlsPool(null);
          }}
          onReimburse={() => {
            navigation.navigate('Reimburse', { pool: organizerControlsPool });
            setOrganizerControlsPool(null);
          }}
          onAddMembers={() => {
            navigation.navigate('Invite', { pool: organizerControlsPool });
            setOrganizerControlsPool(null);
          }}
          onManageMembers={() => {
            navigation.navigate('Members', { pool: organizerControlsPool });
            setOrganizerControlsPool(null);
          }}
          onManageInvitations={
            organizerControlsPool.type === 'CUSTOM_SPLIT'
              ? () => {
                  navigation.navigate('Invitations', { pool: organizerControlsPool });
                  setOrganizerControlsPool(null);
                }
              : undefined
          }
          onClose={() => setOrganizerControlsPool(null)}
        />
      ) : null}
    </>
  );
}

function ProfileRoute() {
  const { session, onLogout, appLockEnabled, setAppLockEnabled } = useSessionContext();
  return (
    <ProfileScreen
      session={session}
      onLogout={onLogout}
      appLockEnabled={appLockEnabled}
      onAppLockEnabledChange={setAppLockEnabled}
    />
  );
}

// AlertsRoute lives inside AppTab but navigates to an AppStack sibling
// (InvitationDetail) when an INVITATION_RECEIVED notification is tapped —
// same composite-props reasoning as HomeRouteProps above.
type AlertsRouteProps = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Alerts'>,
  NativeStackScreenProps<AppStackParamList>
>;

function AlertsRoute({ navigation }: AlertsRouteProps) {
  const { session, setUnreadAlertsCount } = useSessionContext();
  return (
    <AlertsScreen
      session={session}
      onUnreadCountChange={setUnreadAlertsCount}
      onOpenInvitation={(invitationForInvitee) =>
        navigation.navigate('InvitationDetail', { invitationForInvitee })
      }
    />
  );
}

function ActivityRoute() {
  const { session } = useSessionContext();
  return <ActivityScreen session={session} />;
}

function AppTabs() {
  const { unreadAlertsCount } = useSessionContext();
  return (
    <AppTab.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        tabBarActiveTintColor: colors.pumpkin600,
        tabBarInactiveTintColor: colors.ink400,
        tabBarStyle: {
          backgroundColor: colors.cream,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          paddingTop: 9,
          paddingHorizontal: 8,
          // No paddingBottom here — the kit's mockup hardcodes 24px for one
          // fixed phone frame; @react-navigation/bottom-tabs already adds the
          // real device's bottom safe-area inset by default, which is the
          // correct generalization of that same value across devices.
        },
        tabBarLabelStyle: { fontSize: 10, fontFamily: fontFamily.bold },
      }}
    >
      <AppTab.Screen
        name="HomeTab"
        component={HomeRoute}
        options={{ tabBarLabel: 'Home', tabBarIcon: ({ color }) => <HomeTabIcon color={color} /> }}
      />
      <AppTab.Screen
        name="Activity"
        component={ActivityRoute}
        options={{ tabBarIcon: ({ color }) => <ActivityTabIcon color={color} /> }}
      />
      <AppTab.Screen
        name="Alerts"
        component={AlertsRoute}
        options={{
          tabBarIcon: ({ color }) => <AlertsTabIcon color={color} />,
          tabBarBadge: unreadAlertsCount > 0 ? unreadAlertsCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.pumpkin500,
            color: colors.paper,
            fontFamily: fontFamily.extrabold,
            fontSize: 9,
            minWidth: 15,
            height: 15,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: colors.cream,
          },
        }}
      />
      <AppTab.Screen
        name="Profile"
        component={ProfileRoute}
        options={{ tabBarIcon: ({ color }) => <ProfileTabIcon color={color} /> }}
      />
    </AppTab.Navigator>
  );
}

function VerifyIdentityRoute({
  navigation,
}: NativeStackScreenProps<AppStackParamList, 'VerifyIdentity'>) {
  const { session, setSession } = useSessionContext();
  return (
    <VerifyIdentityScreen
      session={session}
      onVerified={(updated) => {
        setSession(updated);
        navigation.replace('CreatePool');
      }}
      onCancel={() => navigation.goBack()}
    />
  );
}

function CreatePoolRoute({ navigation }: NativeStackScreenProps<AppStackParamList, 'CreatePool'>) {
  const { session, setPools } = useSessionContext();
  return (
    <CreatePoolScreen
      session={session}
      onCreated={(pool, payNow) => {
        setPools((prev) => [pool, ...prev]);
        // Pool creation always succeeds immediately, for both types
        // (ADR-0017). Pay Now pays the Organizer's own share inline, then
        // both paths land on 'PoolDetail' — locked (Awaiting Payment) for
        // Pay Later, unlocked for Pay Now once the Deposit resolves.
        if (payNow) {
          navigation.replace('Deposit', { pool, isOrganizerShare: true });
        } else {
          navigation.replace('PoolDetail', { pool });
        }
      }}
      onCancel={() => navigation.goBack()}
    />
  );
}

function InviteRoute({ route, navigation }: NativeStackScreenProps<AppStackParamList, 'Invite'>) {
  return <InviteScreen pool={route.params.pool} onDone={() => navigation.goBack()} />;
}

function JoinPoolRoute({ navigation }: NativeStackScreenProps<AppStackParamList, 'JoinPool'>) {
  const { session } = useSessionContext();
  return (
    <JoinPoolScreen
      session={session}
      onJoined={() => navigation.goBack()}
      onCancel={() => navigation.goBack()}
    />
  );
}

function PoolDetailRoute({
  route,
  navigation,
}: NativeStackScreenProps<AppStackParamList, 'PoolDetail'>) {
  const { session, setPools } = useSessionContext();
  const pool = route.params.pool;
  const [organizerControlsOpen, setOrganizerControlsOpen] = useState(false);

  return (
    <>
      <PoolDetailScreen
        session={session}
        pool={pool}
        onCancel={() => navigation.goBack()}
        onDeposit={() => navigation.navigate('Deposit', { pool })}
        onPayOrganizerShare={() => navigation.replace('Deposit', { pool, isOrganizerShare: true })}
        onOpenOrganizerControls={() => setOrganizerControlsOpen(true)}
        onVoteToRefund={() => navigation.navigate('Vote', { pool })}
        onViewAllMembers={() => navigation.navigate('Members', { pool })}
        onAddMembers={() => navigation.navigate('Invite', { pool })}
        onSelectTransaction={(entry) => navigation.navigate('TransactionDetail', { pool, entry })}
        onLock={async () => {
          const locked = await lockPool(session.token, pool.id);
          setPools((prev) => prev.map((p) => (p.id === locked.id ? locked : p)));
        }}
        onClosePool={() => navigation.navigate('CloseConfirm', { pool })}
      />
      {organizerControlsOpen ? (
        <OrganizerControlsSheet
          pool={pool}
          onTransferOut={() => {
            navigation.navigate('Spend', { pool });
            setOrganizerControlsOpen(false);
          }}
          onReimburse={() => {
            navigation.navigate('Reimburse', { pool });
            setOrganizerControlsOpen(false);
          }}
          onAddMembers={() => {
            navigation.navigate('Invite', { pool });
            setOrganizerControlsOpen(false);
          }}
          onManageMembers={() => {
            navigation.navigate('Members', { pool });
            setOrganizerControlsOpen(false);
          }}
          onManageInvitations={
            pool.type === 'CUSTOM_SPLIT'
              ? () => {
                  navigation.navigate('Invitations', { pool });
                  setOrganizerControlsOpen(false);
                }
              : undefined
          }
          onClose={() => setOrganizerControlsOpen(false)}
        />
      ) : null}
    </>
  );
}

function DepositRoute({ route, navigation }: NativeStackScreenProps<AppStackParamList, 'Deposit'>) {
  const { session } = useSessionContext();
  const { pool, isOrganizerShare } = route.params;
  return (
    <DepositScreen
      session={session}
      pool={pool}
      onDone={() =>
        isOrganizerShare ? navigation.replace('PoolDetail', { pool }) : navigation.goBack()
      }
      onCancel={() => navigation.goBack()}
    />
  );
}

function SpendRoute({ route, navigation }: NativeStackScreenProps<AppStackParamList, 'Spend'>) {
  const { session } = useSessionContext();
  return (
    <SpendScreen
      session={session}
      pool={route.params.pool}
      onDone={() => navigation.goBack()}
      onCancel={() => navigation.goBack()}
    />
  );
}

function ReimburseRoute({ route, navigation }: NativeStackScreenProps<AppStackParamList, 'Reimburse'>) {
  const { session } = useSessionContext();
  return (
    <ReimburseScreen
      session={session}
      pool={route.params.pool}
      onDone={() => navigation.goBack()}
      onCancel={() => navigation.goBack()}
    />
  );
}

function LedgerRoute({ route, navigation }: NativeStackScreenProps<AppStackParamList, 'Ledger'>) {
  const { session } = useSessionContext();
  return <LedgerScreen session={session} pool={route.params.pool} onCancel={() => navigation.goBack()} />;
}

function CloseConfirmRoute({
  route,
  navigation,
}: NativeStackScreenProps<AppStackParamList, 'CloseConfirm'>) {
  const { session, setPools } = useSessionContext();
  const pool = route.params.pool;
  return (
    <CloseConfirmScreen
      session={session}
      pool={pool}
      onClosed={(result) => {
        setPools((prev) => prev.map((p) => (p.id === result.pool.id ? result.pool : p)));
        navigation.replace('Closed', { pool: result.pool, refunds: result.refunds });
      }}
      onCancel={() => navigation.goBack()}
    />
  );
}

function ClosedRoute({ route, navigation }: NativeStackScreenProps<AppStackParamList, 'Closed'>) {
  const { session } = useSessionContext();
  return (
    <ClosedScreen
      session={session}
      pool={route.params.pool}
      refunds={route.params.refunds}
      onDone={() => navigation.navigate('Home')}
    />
  );
}

function VoteRoute({ route, navigation }: NativeStackScreenProps<AppStackParamList, 'Vote'>) {
  const { session, setPools } = useSessionContext();
  const pool = route.params.pool;
  return (
    <VoteScreen
      session={session}
      pool={pool}
      onCancel={() => navigation.goBack()}
      onPoolClosed={(result) => {
        setPools((prev) => prev.map((p) => (p.id === result.pool.id ? result.pool : p)));
        navigation.replace('Closed', { pool: result.pool, refunds: result.refunds });
      }}
    />
  );
}

function MembersRoute({ route, navigation }: NativeStackScreenProps<AppStackParamList, 'Members'>) {
  const { session } = useSessionContext();
  const pool = route.params.pool;
  return (
    <MembersScreen
      session={session}
      pool={pool}
      onCancel={() => navigation.goBack()}
      onSelectUser={(userId) => navigation.navigate('UserDetail', { pool, userId })}
    />
  );
}

function UserDetailRoute({
  route,
  navigation,
}: NativeStackScreenProps<AppStackParamList, 'UserDetail'>) {
  const { session } = useSessionContext();
  const { pool, userId } = route.params;
  return (
    <UserDetailScreen
      session={session}
      pool={pool}
      userId={userId}
      onBack={() => navigation.goBack()}
      onSelectTransaction={(entry) => navigation.navigate('TransactionDetail', { pool, entry })}
      onDeleted={() => navigation.goBack()}
    />
  );
}

function TransactionDetailRoute({
  route,
  navigation,
}: NativeStackScreenProps<AppStackParamList, 'TransactionDetail'>) {
  const { session } = useSessionContext();
  const { pool, entry } = route.params;
  return (
    <TransactionDetailScreen
      session={session}
      entry={entry}
      onBack={() => navigation.goBack()}
      onSelectUser={(userId) => navigation.navigate('UserDetail', { pool, userId })}
    />
  );
}

function InvitationsRoute({
  route,
  navigation,
}: NativeStackScreenProps<AppStackParamList, 'Invitations'>) {
  const { session } = useSessionContext();
  const pool = route.params.pool;
  return (
    <InvitationsScreen
      session={session}
      pool={pool}
      onInvite={() => navigation.navigate('InviteByPhone', { pool })}
      onCancel={() => navigation.goBack()}
    />
  );
}

function InviteByPhoneRoute({
  route,
  navigation,
}: NativeStackScreenProps<AppStackParamList, 'InviteByPhone'>) {
  const { session } = useSessionContext();
  return (
    <InviteByPhoneScreen
      session={session}
      pool={route.params.pool}
      onSent={() => navigation.goBack()}
      onCancel={() => navigation.goBack()}
    />
  );
}

function InvitationDetailRoute({
  route,
  navigation,
}: NativeStackScreenProps<AppStackParamList, 'InvitationDetail'>) {
  const { session } = useSessionContext();
  const invitationForInvitee = route.params.invitationForInvitee;
  return (
    <InvitationScreen
      session={session}
      invitationForInvitee={invitationForInvitee}
      onPay={() => navigation.navigate('Deposit', { pool: invitationForInvitee.pool })}
      onCancel={() => navigation.goBack()}
    />
  );
}

function AnalyticsRoute({ navigation }: NativeStackScreenProps<AppStackParamList, 'Analytics'>) {
  const { session, setSession } = useSessionContext();
  return (
    <AnalyticsScreen
      session={session}
      onSubscribed={setSession}
      onCancel={() => navigation.goBack()}
    />
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
    Onest_800ExtraBold,
  });
  const [bootstrapping, setBootstrapping] = useState(true);
  const [session, setSession] = useState<StoredSession | null>(null);
  // A rehydrated session (app relaunch) is never a fresh signup.
  const [isNewUser, setIsNewUser] = useState(false);
  const [pools, setPools] = useState<Pool[]>([]);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [welcomeSeen, setWelcomeSeen] = useState(false);
  // Device-level security preference (ticket #24) — survives Log out on
  // purpose (see session.ts), so it's read once at bootstrap regardless of
  // which account ends up signed in.
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  // Gates the entire authenticated tree behind LockScreen. Derived directly
  // in the bootstrap/foreground handlers below (never via a reactive effect
  // keyed off appLockEnabled) so there's never a frame where protected
  // content renders before the lock state is known.
  const [locked, setLocked] = useState(false);
  const navigationRef = useNavigationContainerRef<AppStackParamList>();

  useEffect(() => {
    clearStaleDataFromPriorInstall()
      .then(() => Promise.all([loadSession(), hasSeenWelcome(), isAppLockEnabled()]))
      .then(async ([storedSession, seenWelcome, appLockOn]) => {
        setSession(storedSession);
        setWelcomeSeen(seenWelcome);
        // A device can lose biometric enrollment after app lock was turned
        // on (Face ID reset, hardware issue) — without this check the user
        // would be locked out with no way back in, since LockScreen's "Log
        // out instead" doesn't clear this preference and re-login just hits
        // the same unsatisfiable lock on the next foreground. Treat it the
        // same way the Profile toggle already does: biometrics unavailable
        // means app lock can't be honored, so turn it off instead.
        const canLock = appLockOn && (await isBiometricAuthAvailable());
        if (appLockOn && !canLock) {
          setAppLockEnabled(false);
          void persistAppLockEnabled(false);
        } else {
          setAppLockEnabled(appLockOn);
        }
        setLocked(Boolean(storedSession) && canLock);
        if (storedSession) {
          // Populates Home from real membership state on every app restart —
          // previously `pools` only ever grew via in-session create/join calls.
          listPools(storedSession.token).then(setPools).catch(() => {});
          fetchUnreadAlertsCount(storedSession.token).then(setUnreadAlertsCount).catch(() => {});
        }
      })
      .finally(() => setBootstrapping(false));
  }, []);

  // Re-locks every time the app comes back to the foreground, per ticket
  // #24 ("authenticateAsync() is required on every app foreground/launch").
  // The initial launch case is covered by the bootstrap effect above, not
  // here — this only fires on a background→active transition.
  const previousAppState = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      // Only a genuine background→active transition means the user left and
      // came back. Presenting the native Face ID/Touch ID sheet itself takes
      // the app to 'inactive' (not 'background') and back to 'active' — if
      // that transition also relocked, a successful unlock would immediately
      // get clobbered by this listener re-setting locked=true, and LockScreen's
      // auto-prompt-on-mount would fire again, looping the prompt forever (#42).
      const cameFromBackground = previousAppState.current === 'background';
      previousAppState.current = nextState;
      if (nextState === 'active' && cameFromBackground && session && appLockEnabled) {
        isBiometricAuthAvailable().then((available) => {
          if (available) {
            setLocked(true);
          } else {
            // Same self-healing as the bootstrap check above — biometrics
            // went away since the preference was last saved.
            setAppLockEnabled(false);
            void persistAppLockEnabled(false);
          }
        });
      }
    });
    return () => subscription.remove();
  }, [session, appLockEnabled]);

  const updateSession = useCallback((updated: StoredSession) => {
    setSession(updated);
    void saveSession(updated);
  }, []);

  const handleLogout = useCallback(() => {
    void clearSession();
    setSession(null);
    setPools([]);
    setLocked(false);
  }, []);

  // Invite links (poolpay://join/<poolId>) auto-join while logged in, and
  // Invitation links (poolpay://invitation/<token>, ticket #61) open the pay
  // screen for the invitee they name. If the app is opened by a link before
  // login, the link is dropped — completing a deferred join/invitation after
  // signup is out of scope for this ticket.
  useEffect(() => {
    if (!session) return;

    function handleUrl(url: string) {
      if (!session) return;

      const poolId = parseJoinPoolId(url);
      if (poolId) {
        joinByPoolId(session.token, poolId)
          .then(() => navigationRef.current?.navigate('Home'))
          .catch(() => {
            // Swallow: an invalid/expired join link shouldn't crash the app.
          });
        return;
      }

      const invitationToken = parseInvitationToken(url);
      if (invitationToken) {
        getInvitationByToken(session.token, invitationToken)
          .then((invitationForInvitee) => {
            navigationRef.current?.navigate('InvitationDetail', { invitationForInvitee });
          })
          .catch((err) => {
            // Unlike a join link, a phone-bound Invitation link must surface
            // its failure (wrong account, unknown/cancelled token) rather
            // than fail silently — see CONTEXT.md's Invitation entry.
            Alert.alert(
              "Can't open this Invitation",
              err instanceof InvitationsApiError ? err.message : 'Something went wrong',
            );
          });
      }
    }

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, [session]);

  const ready = fontsLoaded && !bootstrapping;

  const onLayout = useCallback(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <SafeAreaProvider onLayout={onLayout}>
      <NavigationContainer ref={navigationRef}>
        {!session ? (
          !welcomeSeen ? (
            <WelcomeCarouselScreen
              onGetStarted={() => {
                void markWelcomeSeen();
                setWelcomeSeen(true);
              }}
            />
          ) : (
            <AuthContext.Provider
              value={{
                onAuthenticated: (newSession, newUser) => {
                  setSession(newSession);
                  setIsNewUser(newUser);
                  listPools(newSession.token).then(setPools).catch(() => {});
                  fetchUnreadAlertsCount(newSession.token).then(setUnreadAlertsCount).catch(() => {});
                },
              }}
            >
              <AuthStack.Navigator screenOptions={{ headerShown: false }}>
                <AuthStack.Screen name="SignupLogin" component={SignupLoginRoute} />
              </AuthStack.Navigator>
            </AuthContext.Provider>
          )
        ) : !session.user.isOnboarded ? (
          <ProfileSetupScreen session={session} onCompleted={setSession} />
        ) : locked ? (
          <LockScreen onUnlocked={() => setLocked(false)} onLogout={handleLogout} />
        ) : (
          <SessionContext.Provider
            value={{
              session,
              isNewUser,
              pools,
              setPools,
              setSession: updateSession,
              onLogout: handleLogout,
              appLockEnabled,
              setAppLockEnabled,
              unreadAlertsCount,
              setUnreadAlertsCount,
            }}
          >
            <AppStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
              <AppStack.Screen name="Home" component={AppTabs} />
              <AppStack.Screen name="VerifyIdentity" component={VerifyIdentityRoute} />
              <AppStack.Screen name="CreatePool" component={CreatePoolRoute} />
              <AppStack.Screen name="Invite" component={InviteRoute} options={{ gestureEnabled: false }} />
              <AppStack.Screen name="JoinPool" component={JoinPoolRoute} />
              <AppStack.Screen name="PoolDetail" component={PoolDetailRoute} />
              <AppStack.Screen name="Deposit" component={DepositRoute} />
              <AppStack.Screen name="Spend" component={SpendRoute} />
              <AppStack.Screen name="Reimburse" component={ReimburseRoute} />
              <AppStack.Screen name="Ledger" component={LedgerRoute} />
              <AppStack.Screen name="CloseConfirm" component={CloseConfirmRoute} />
              <AppStack.Screen
                name="Closed"
                component={ClosedRoute}
                options={{ gestureEnabled: false }}
              />
              <AppStack.Screen name="Vote" component={VoteRoute} />
              <AppStack.Screen name="Members" component={MembersRoute} />
              <AppStack.Screen name="UserDetail" component={UserDetailRoute} />
              <AppStack.Screen name="TransactionDetail" component={TransactionDetailRoute} />
              <AppStack.Screen name="Analytics" component={AnalyticsRoute} />
              <AppStack.Screen name="Invitations" component={InvitationsRoute} />
              <AppStack.Screen name="InviteByPhone" component={InviteByPhoneRoute} />
              <AppStack.Screen name="InvitationDetail" component={InvitationDetailRoute} />
            </AppStack.Navigator>
          </SessionContext.Provider>
        )}
      </NavigationContainer>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
