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

export class CashfreeClient {
  private readonly base: string;

  constructor(private readonly config: CashfreeClientConfig) {
    this.base = baseUrl(config.product, config.env);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": this.config.clientId,
        "x-client-secret": this.config.clientSecret,
        "x-api-version": API_VERSION[this.config.product],
      },
      body: JSON.stringify(body),
    });
    return this.parseResponse<T>(res);
  }

  async get<T>(path: string, query: Record<string, string>): Promise<T> {
    const url = new URL(`${this.base}${path}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    const res = await fetch(url, {
      headers: {
        "x-client-id": this.config.clientId,
        "x-client-secret": this.config.clientSecret,
        "x-api-version": API_VERSION[this.config.product],
      },
    });
    return this.parseResponse<T>(res);
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
