import * as SecureStore from "expo-secure-store";
import type { VerifyOtpResult } from "./authClient";

const SESSION_KEY = "pool-pay-session";

export interface StoredSession {
  token: string;
  user: { id: string; phoneNumber: string };
}

export async function saveSession(session: VerifyOtpResult): Promise<void> {
  const stored: StoredSession = { token: session.token, user: session.user };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(stored));
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as StoredSession;
}
