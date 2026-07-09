const SCHEME = "poolpay";

export function buildInviteLink(poolId: string): string {
  return `${SCHEME}://join/${poolId}`;
}

// Returns the Pool id if the URL is a join link, otherwise null.
export function parseJoinPoolId(url: string): string | null {
  const match = url.match(/^poolpay:\/\/join\/([^/?#]+)/);
  return match ? match[1] : null;
}
