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
import { loadSession, type StoredSession } from './src/api/session';
import type { Pool } from './src/api/poolsClient';
import { joinByPoolId } from './src/api/membersClient';
import { parseJoinPoolId } from './src/lib/inviteLink';
import { colors } from './src/theme/tokens';

SplashScreen.preventAutoHideAsync();

type Route =
  | { name: 'home' }
  | { name: 'createPool' }
  | { name: 'invite'; pool: Pool }
  | { name: 'joinPool' };

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
      ) : (
        <JoinPoolScreen
          session={session}
          onJoined={() => setRoute({ name: 'home' })}
          onCancel={() => setRoute({ name: 'home' })}
        />
      )}
      <StatusBar style="dark" />
    </View>
  );
}
