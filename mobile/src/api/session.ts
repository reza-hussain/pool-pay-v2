import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "pool-pay-session";

export interface StoredSession {
  token: string;
  user: { id: string; phoneNumber: string };
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as StoredSession;
}
