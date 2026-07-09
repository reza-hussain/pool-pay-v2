import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
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
import { loadSession, type StoredSession } from './src/api/session';
import type { Pool } from './src/api/poolsClient';
import { colors } from './src/theme/tokens';

SplashScreen.preventAutoHideAsync();

type Route = { name: 'home' } | { name: 'createPool' };

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
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [pools, setPools] = useState<Pool[]>([]);

  useEffect(() => {
    loadSession()
      .then(setSession)
      .finally(() => setBootstrapping(false));
  }, []);

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
        <SignupLoginScreen onAuthenticated={setSession} />
      ) : route.name === 'home' ? (
        <PoolsHomeScreen pools={pools} onCreatePool={() => setRoute({ name: 'createPool' })} />
      ) : (
        <CreatePoolScreen
          session={session}
          onCreated={(pool) => {
            setPools((prev) => [pool, ...prev]);
            setRoute({ name: 'home' });
          }}
          onCancel={() => setRoute({ name: 'home' })}
        />
      )}
      <StatusBar style="dark" />
    </View>
  );
}
