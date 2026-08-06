import * as LocalAuthentication from "expo-local-authentication";

// Both are required: a device can have a scanner (hasHardwareAsync) with
// nothing enrolled on it (isEnrolledAsync), in which case authenticateAsync
// would just fail — the toggle should read as unavailable in that case too.
export async function isBiometricAuthAvailable(): Promise<boolean> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && isEnrolled;
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock Pool Pay",
  });
  return result.success;
}
