import { publicEncrypt, constants } from "node:crypto";

// Thin fetch wrapper for Cashfree's REST APIs (docs.cashfree.com). Unlike
// Decentro (one client_id/secret pair shared across modules), Cashfree issues
// a separate client-id/secret pair per product — Payment Gateway (pg),
// Payouts (payout), and Verification Suite (verification) are independent
// dashboard apps — so each CashfreeClient instance is bound to exactly one
// product's credentials, not a module param passed per-call.
export type CashfreeProduct = "pg" | "payout" | "verification";

// Cashfree pins request/response shape to a specific version per product via
// x-api-version — confirmed current values as of the 2026-07 docs research;
// bump per-product independently if Cashfree deprecates one of these.
const API_VERSION: Record<CashfreeProduct, string> = {
  pg: "2026-01-01",
  payout: "2024-01-01",
  verification: "2024-12-01",
};

export interface CashfreeClientConfig {
  product: CashfreeProduct;
  clientId: string;
  clientSecret: string;
  env: "sandbox" | "production";
  // Secure ID's alternative to IP whitelisting as a request-level 2FA method
  // (docs.cashfree.com/secure-id) — only meaningful for the "verification"
  // product, whose dashboard is the one offering the choice between the two.
  // PEM contents of the public key downloaded from Secure ID's dashboard
  // (Developers → Two-Factor Authentication → Public Key). When set, every
  // request additionally proves possession of that key instead of relying on
  // the caller's source IP being whitelisted.
  publicKey?: string;
}

export class CashfreeApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "CashfreeApiError";
  }
}

function baseUrl(product: CashfreeProduct, env: "sandbox" | "production"): string {
  return `https://${env === "production" ? "api" : "sandbox"}.cashfree.com/${product}`;
}

// docs.cashfree.com/secure-id's Public Key 2FA scheme: clientId + "." +
// current Unix timestamp (seconds), RSA-OAEP(SHA-1) encrypted with the
// public key Secure ID's dashboard issued, base64-encoded. Cashfree holds
// the matching private key, so only someone who received that exact key
// file can produce a signature their server accepts — proof of possession,
// not proof of identity (x-client-id/x-client-secret already cover that).
// Valid 5 minutes per Cashfree's docs; generated fresh per request here
// rather than cached, since Secure ID calls in this codebase are low-volume
// (penny-drop only) and freshness matters more than the extra CPU cost.
function signCfRequest(clientId: string, publicKeyPem: string): string {
  const payload = `${clientId}.${Math.floor(Date.now() / 1000)}`;
  return publicEncrypt(
    { key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha1" },
    Buffer.from(payload),
  ).toString("base64");
}

export class CashfreeClient {
  private readonly base: string;

  constructor(private readonly config: CashfreeClientConfig) {
    this.base = baseUrl(config.product, config.env);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(body),
    });
    return this.parseResponse<T>(res);
  }

  async get<T>(path: string, query: Record<string, string>): Promise<T> {
    const url = new URL(`${this.base}${path}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    const res = await fetch(url, { headers: this.authHeaders() });
    return this.parseResponse<T>(res);
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "x-client-id": this.config.clientId,
      "x-client-secret": this.config.clientSecret,
      "x-api-version": API_VERSION[this.config.product],
    };
    if (this.config.publicKey) {
      headers["x-cf-signature"] = signCfRequest(this.config.clientId, this.config.publicKey);
    }
    return headers;
  }

  // The headless "Order Pay" call (POST /orders/sessions) is the one Cashfree
  // endpoint in this adapter that is deliberately unauthenticated — per
  // docs.cashfree.com, payment_session_id itself is the credential (it's
  // designed to be callable straight from a browser), and it instead requires
  // client-context headers (device/OS/browser) in place of client-id/secret.
  async postUnauthenticated<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": API_VERSION[this.config.product],
        "x-client-device": "mobile",
        "x-client-os": "android",
        "x-client-browser": "PoolPayServer",
      },
      body: JSON.stringify(body),
    });
    return this.parseResponse<T>(res);
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    const data = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
    if (!res.ok) {
      throw new CashfreeApiError(data.message ?? `Cashfree request failed with status ${res.status}`, data.code);
    }
    return data as T;
  }
}
