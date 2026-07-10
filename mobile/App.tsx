import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
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
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SignupLoginScreen } from './src/screens/SignupLoginScreen';
import { PoolsHomeScreen } from './src/screens/PoolsHomeScreen';
import { CreatePoolScreen } from './src/screens/CreatePoolScreen';
import { InviteScreen } from './src/screens/InviteScreen';
import { JoinPoolScreen } from './src/screens/JoinPoolScreen';
import { DepositScreen } from './src/screens/DepositScreen';
import { SpendScreen } from './src/screens/SpendScreen';
import { ReimburseScreen } from './src/screens/ReimburseScreen';
import { LedgerScreen } from './src/screens/LedgerScreen';
import { CloseConfirmScreen } from './src/screens/CloseConfirmScreen';
import { ClosedScreen } from './src/screens/ClosedScreen';
import { VoteScreen } from './src/screens/VoteScreen';
import { MembersScreen } from './src/screens/MembersScreen';
import { OrganizerControlsSheet } from './src/screens/OrganizerControlsSheet';
import type { ClosureRefund } from './src/api/closureClient';
import { loadSession, type StoredSession } from './src/api/session';
import { lockPool, type Pool } from './src/api/poolsClient';
import { joinByPoolId } from './src/api/membersClient';
import { parseJoinPoolId } from './src/lib/inviteLink';

SplashScreen.preventAutoHideAsync();

type AuthStackParamList = {
  SignupLogin: undefined;
};

type AppStackParamList = {
  Home: undefined;
  CreatePool: undefined;
  Invite: { pool: Pool };
  JoinPool: undefined;
  Deposit: { pool: Pool };
  Spend: { pool: Pool };
  Reimburse: { pool: Pool };
  Ledger: { pool: Pool };
  CloseConfirm: { pool: Pool };
  Closed: { pool: Pool; refunds: ClosureRefund[] };
  Vote: { pool: Pool };
  Members: { pool: Pool };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

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

function HomeRoute({ navigation }: NativeStackScreenProps<AppStackParamList, 'Home'>) {
  const { session, isNewUser, pools, setPools } = useSessionContext();
  const [organizerControlsPool, setOrganizerControlsPool] = useState<Pool | null>(null);

  return (
    <>
      <PoolsHomeScreen
        session={session}
        isNewUser={isNewUser}
        pools={pools}
        onCreatePool={() => navigation.navigate('CreatePool')}
        onJoinPool={() => navigation.navigate('JoinPool')}
        onSelectPool={(pool) => navigation.navigate('Deposit', { pool })}
        onOpenOrganizerControls={(pool) => setOrganizerControlsPool(pool)}
        onViewLedger={(pool) => navigation.navigate('Ledger', { pool })}
        onVoteToRefund={(pool) => navigation.navigate('Vote', { pool })}
      />
      {organizerControlsPool ? (
        <OrganizerControlsSheet
          pool={organizerControlsPool}
          onLock={async () => {
            const locked = await lockPool(session.token, organizerControlsPool.id);
            setPools((prev) => prev.map((p) => (p.id === locked.id ? locked : p)));
            setOrganizerControlsPool(null);
          }}
          onTransferOut={() => {
            navigation.navigate('Spend', { pool: organizerControlsPool });
            setOrganizerControlsPool(null);
          }}
          onReimburse={() => {
            navigation.navigate('Reimburse', { pool: organizerControlsPool });
            setOrganizerControlsPool(null);
          }}
          onManageMembers={() => {
            navigation.navigate('Members', { pool: organizerControlsPool });
            setOrganizerControlsPool(null);
          }}
          onClosePool={() => {
            navigation.navigate('CloseConfirm', { pool: organizerControlsPool });
            setOrganizerControlsPool(null);
          }}
          onClose={() => setOrganizerControlsPool(null)}
        />
      ) : null}
    </>
  );
}

function CreatePoolRoute({ navigation }: NativeStackScreenProps<AppStackParamList, 'CreatePool'>) {
  const { session, setPools } = useSessionContext();
  return (
    <CreatePoolScreen
      session={session}
      onCreated={(pool) => {
        setPools((prev) => [pool, ...prev]);
        navigation.replace('Invite', { pool });
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

function DepositRoute({ route, navigation }: NativeStackScreenProps<AppStackParamList, 'Deposit'>) {
  const { session } = useSessionContext();
  return (
    <DepositScreen
      session={session}
      pool={route.params.pool}
      onDone={() => navigation.goBack()}
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
  return (
    <MembersScreen session={session} pool={route.params.pool} onCancel={() => navigation.goBack()} />
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
  const navigationRef = useNavigationContainerRef<AppStackParamList>();

  useEffect(() => {
    loadSession()
      .then(setSession)
      .finally(() => setBootstrapping(false));
  }, []);

  // Invite links (poolpay://join/<poolId>) auto-join while logged in. If the
  // app is opened by a link before login, the link is dropped — completing a
  // deferred join after signup is out of scope for this ticket.
  useEffect(() => {
    if (!session) return;

    function handleUrl(url: string) {
      const poolId = parseJoinPoolId(url);
      if (!poolId || !session) return;
      joinByPoolId(session.token, poolId)
        .then(() => navigationRef.current?.navigate('Home'))
        .catch(() => {
          // Swallow: an invalid/expired join link shouldn't crash the app.
        });
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
          <AuthContext.Provider
            value={{
              onAuthenticated: (newSession, newUser) => {
                setSession(newSession);
                setIsNewUser(newUser);
              },
            }}
          >
            <AuthStack.Navigator screenOptions={{ headerShown: false }}>
              <AuthStack.Screen name="SignupLogin" component={SignupLoginRoute} />
            </AuthStack.Navigator>
          </AuthContext.Provider>
        ) : (
          <SessionContext.Provider value={{ session, isNewUser, pools, setPools }}>
            <AppStack.Navigator screenOptions={{ headerShown: false }}>
              <AppStack.Screen name="Home" component={HomeRoute} />
              <AppStack.Screen name="CreatePool" component={CreatePoolRoute} />
              <AppStack.Screen name="Invite" component={InviteRoute} options={{ gestureEnabled: false }} />
              <AppStack.Screen name="JoinPool" component={JoinPoolRoute} />
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
            </AppStack.Navigator>
          </SessionContext.Provider>
        )}
      </NavigationContainer>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
