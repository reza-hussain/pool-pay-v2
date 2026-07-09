import { StatusBar } from 'expo-status-bar';
import { SignupLoginScreen } from './src/screens/SignupLoginScreen';

export default function App() {
  return (
    <>
      <SignupLoginScreen />
      <StatusBar style="auto" />
    </>
  );
}
