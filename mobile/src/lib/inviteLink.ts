const SCHEME = "poolpay";

export function buildInviteLink(poolId: string): string {
  return `${SCHEME}://join/${poolId}`;
}

// Returns the Pool id if the URL is a join link, otherwise null.
export function parseJoinPoolId(url: string): string | null {
  const match = url.match(/^poolpay:\/\/join\/([^/?#]+)/);
  return match ? match[1] : null;
}

export function buildInvitationLink(token: string): string {
  return `${SCHEME}://invitation/${token}`;
}

// Returns the Invitation token if the URL is a shareable Invitation link, otherwise null.
export function parseInvitationToken(url: string): string | null {
  const match = url.match(/^poolpay:\/\/invitation\/([^/?#]+)/);
  return match ? match[1] : null;
}
