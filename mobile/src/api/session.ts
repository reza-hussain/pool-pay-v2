import * as SecureStore from "expo-secure-store";
import { File, Paths } from "expo-file-system";

const SESSION_KEY = "pool-pay-session";
const WELCOME_SEEN_KEY = "pool-pay-welcome-seen";
const APP_LOCK_ENABLED_KEY = "pool-pay-app-lock-enabled";

export interface StoredSession {
  token: string;
  user: {
    id: string;
    phoneNumber: string;
    isVerified: boolean;
    isSubscribed: boolean;
    name: string | null;
    email: string | null;
    dateOfBirth: string | null;
    upiId: string | null;
    avatarUrl: string | null;
    isOnboarded: boolean;
  };
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as StoredSession;
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

// The Face ID / app-lock preference is a device-level security setting, not
// part of the account session — it's read at bootstrap regardless of which
// account is currently signed in, and survives Log out on purpose (ticket #24).
export async function isAppLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(APP_LOCK_ENABLED_KEY)) === "true";
}

export async function persistAppLockEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(APP_LOCK_ENABLED_KEY, enabled ? "true" : "false");
}

// The welcome carousel (CONTEXT.md's "Onboarding") is a first-run marketing
// pitch shown once per install, independent of login state — logging out
// later shouldn't bring it back.
export async function hasSeenWelcome(): Promise<boolean> {
  return (await SecureStore.getItemAsync(WELCOME_SEEN_KEY)) === "true";
}

export async function markWelcomeSeen(): Promise<void> {
  await SecureStore.setItemAsync(WELCOME_SEEN_KEY, "true");
}

// SecureStore is backed by the iOS Keychain, which — unlike the rest of an
// app's storage — is NOT wiped on uninstall. Without this, a reinstalled app
// would silently resume a stale session and skip the welcome carousel. The
// app's document directory IS wiped on uninstall, so a marker file there is
// a reliable "is this actually a fresh install" signal: if the marker is
// missing but Keychain data exists, the Keychain data is stale and left over
// from a previous install.
const FRESH_INSTALL_MARKER = new File(Paths.document, ".pool-pay-installed");

export async function clearStaleDataFromPriorInstall(): Promise<void> {
  if (FRESH_INSTALL_MARKER.exists) return;

  // allSettled, not all — deleteItemAsync's behavior on an already-absent key
  // (the common case for a genuinely fresh install) isn't documented, so one
  // key being missing shouldn't stop the other from being cleared.
  await Promise.allSettled([
    SecureStore.deleteItemAsync(SESSION_KEY),
    SecureStore.deleteItemAsync(WELCOME_SEEN_KEY),
  ]);
  FRESH_INSTALL_MARKER.create();
}
