const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class MembersApiError extends Error {}

export interface Membership {
  id: string;
  poolId: string;
  userId: string;
  role: "ORGANIZER" | "MEMBER";
  joinedAt: string;
}

async function postJson<T>(path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MembersApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as T;
}

export async function joinByPoolId(token: string, poolId: string): Promise<Membership> {
  const { membership } = await postJson<{ membership: Membership }>(
    `/pools/${poolId}/join`,
    token,
  );
  return membership;
}

export async function joinByCode(token: string, code: string): Promise<Membership> {
  const { membership } = await postJson<{ membership: Membership }>(
    "/pools/join-by-code",
    token,
    { code },
  );
  return membership;
}

export async function listMembers(token: string, poolId: string): Promise<Membership[]> {
  const res = await fetch(`${API_URL}/pools/${poolId}/members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MembersApiError(data.error ?? `Request failed with status ${res.status}`);
  }
  return data.members as Membership[];
}
