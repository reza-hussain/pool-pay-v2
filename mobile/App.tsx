import { useCallback, useEffect, useState } from 'react';
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
import { View } from 'react-native';
import { SignupLoginScreen } from './src/screens/SignupLoginScreen';
import { PoolsHomeScreen } from './src/screens/PoolsHomeScreen';
import { CreatePoolScreen } from './src/screens/CreatePoolScreen';
import { InviteScreen } from './src/screens/InviteScreen';
import { JoinPoolScreen } from './src/screens/JoinPoolScreen';
import { DepositScreen } from './src/screens/DepositScreen';
import { SpendScreen } from './src/screens/SpendScreen';
import { ReimburseScreen } from './src/screens/ReimburseScreen';
import { LedgerScreen } from './src/screens/LedgerScreen';
import { OrganizerControlsSheet } from './src/screens/OrganizerControlsSheet';
import { loadSession, type StoredSession } from './src/api/session';
import { lockPool, type Pool } from './src/api/poolsClient';
import { joinByPoolId } from './src/api/membersClient';
import { parseJoinPoolId } from './src/lib/inviteLink';
import { colors } from './src/theme/tokens';

SplashScreen.preventAutoHideAsync();

type Route =
  | { name: 'home' }
  | { name: 'createPool' }
  | { name: 'invite'; pool: Pool }
  | { name: 'joinPool' }
  | { name: 'deposit'; pool: Pool }
  | { name: 'spend'; pool: Pool }
  | { name: 'reimburse'; pool: Pool }
  | { name: 'ledger'; pool: Pool };

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
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [pools, setPools] = useState<Pool[]>([]);
  const [organizerControlsPool, setOrganizerControlsPool] = useState<Pool | null>(null);

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
        .then(() => setRoute({ name: 'home' }))
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
    <View style={{ flex: 1, backgroundColor: colors.cream }} onLayout={onLayout}>
      {!session ? (
        <SignupLoginScreen
          onAuthenticated={(newSession, newUser) => {
            setSession(newSession);
            setIsNewUser(newUser);
          }}
        />
      ) : route.name === 'home' ? (
        <PoolsHomeScreen
          session={session}
          isNewUser={isNewUser}
          pools={pools}
          onCreatePool={() => setRoute({ name: 'createPool' })}
          onJoinPool={() => setRoute({ name: 'joinPool' })}
          onSelectPool={(pool) => setRoute({ name: 'deposit', pool })}
          onOpenOrganizerControls={(pool) => setOrganizerControlsPool(pool)}
          onViewLedger={(pool) => setRoute({ name: 'ledger', pool })}
        />
      ) : route.name === 'createPool' ? (
        <CreatePoolScreen
          session={session}
          onCreated={(pool) => {
            setPools((prev) => [pool, ...prev]);
            setRoute({ name: 'invite', pool });
          }}
          onCancel={() => setRoute({ name: 'home' })}
        />
      ) : route.name === 'invite' ? (
        <InviteScreen pool={route.pool} onDone={() => setRoute({ name: 'home' })} />
      ) : route.name === 'joinPool' ? (
        <JoinPoolScreen
          session={session}
          onJoined={() => setRoute({ name: 'home' })}
          onCancel={() => setRoute({ name: 'home' })}
        />
      ) : route.name === 'deposit' ? (
        <DepositScreen
          session={session}
          pool={route.pool}
          onDone={() => setRoute({ name: 'home' })}
          onCancel={() => setRoute({ name: 'home' })}
        />
      ) : route.name === 'spend' ? (
        <SpendScreen
          session={session}
          pool={route.pool}
          onDone={() => setRoute({ name: 'home' })}
          onCancel={() => setRoute({ name: 'home' })}
        />
      ) : route.name === 'reimburse' ? (
        <ReimburseScreen
          session={session}
          pool={route.pool}
          onDone={() => setRoute({ name: 'home' })}
          onCancel={() => setRoute({ name: 'home' })}
        />
      ) : (
        <LedgerScreen session={session} pool={route.pool} onCancel={() => setRoute({ name: 'home' })} />
      )}
      {organizerControlsPool && session ? (
        <OrganizerControlsSheet
          pool={organizerControlsPool}
          onLock={async () => {
            const locked = await lockPool(session.token, organizerControlsPool.id);
            setPools((prev) => prev.map((p) => (p.id === locked.id ? locked : p)));
            setOrganizerControlsPool(null);
          }}
          onTransferOut={() => {
            setRoute({ name: 'spend', pool: organizerControlsPool });
            setOrganizerControlsPool(null);
          }}
          onReimburse={() => {
            setRoute({ name: 'reimburse', pool: organizerControlsPool });
            setOrganizerControlsPool(null);
          }}
          onClose={() => setOrganizerControlsPool(null)}
        />
      ) : null}
      <StatusBar style="dark" />
    </View>
  );
}
