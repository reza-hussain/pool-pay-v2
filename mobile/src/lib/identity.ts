// Shared `···1234` phone-suffix placeholder used everywhere a Member's real
// name would go — no real name/profile system exists yet (ADR-0018).
export function phoneSuffix(userId: string): string {
  return userId.slice(-4);
}

export function whoLabel(userId: string, sessionUserId: string): string {
  return userId === sessionUserId ? "You" : `Member ···${phoneSuffix(userId)}`;
}
