// Thin fetch wrapper for Decentro's REST APIs (docs.decentro.tech). Two
// separate base URLs are real, documented Decentro behavior, not a mistake —
// confirmed against docs.decentro.tech's per-endpoint OpenAPI reference
// (2026-07-11), not just the prose docs:
//   staging.api.decentro.tech / api.decentro.tech — v3 payments-module calls:
//     Dynamic QR (/v3/payments/upi/qr), VerifyPay (/v3/banking/verify_pay)
//     and its status poll (/v3/banking/account_validation/status).
//   in.staging.decentro.tech  / in.decentro.tech  — the v2 KYC module
//     (/v2/kyc/...) AND, despite the "/v3/core_banking/..." path implying
//     otherwise, the core-banking money-transfer endpoint too
//     (/v3/core_banking/money_transfer/initiate) — confirmed via Decentro's
//     own reference page for that endpoint, which documents this exact host
//     despite the v3 path prefix. Previously mistagged "payments" here,
//     which would have sent every real Spend/Reimbursement/Refund payout to
//     the wrong host.
export type DecentroModule = "payments" | "kyc" | "core-banking";

export interface DecentroClientConfig {
  clientId: string;
  clientSecret: string;
  env: "staging" | "production";
}

export class DecentroApiError extends Error {
  constructor(
    message: string,
    public readonly responseCode?: string,
  ) {
    super(message);
    this.name = "DecentroApiError";
  }
}

function baseUrl(module: DecentroModule, env: "staging" | "production"): string {
  if (module === "payments") {
    return env === "production" ? "https://api.decentro.tech" : "https://staging.api.decentro.tech";
  }
  // "kyc" and "core-banking" are genuinely the same host — see the module
  // comment above for why core-banking isn't grouped with "payments" despite
  // both being v3 APIs.
  return env === "production" ? "https://in.decentro.tech" : "https://in.staging.decentro.tech";
}

export class DecentroClient {
  constructor(private readonly config: DecentroClientConfig) {}

  async post<T>(module: DecentroModule, path: string, body: unknown): Promise<T> {
    const res = await fetch(`${baseUrl(module, this.config.env)}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      },
      body: JSON.stringify(body),
    });

    return this.parseResponse<T>(res);
  }

  async get<T>(module: DecentroModule, path: string, query: Record<string, string>): Promise<T> {
    const url = new URL(`${baseUrl(module, this.config.env)}${path}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url, {
      method: "GET",
      headers: {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      },
    });

    return this.parseResponse<T>(res);
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      responseCode?: string;
      api_status?: string;
      status?: string;
    };
    if (!res.ok || data.api_status === "FAILURE" || data.status === "FAILURE") {
      throw new DecentroApiError(data.message ?? `Decentro request failed with status ${res.status}`, data.responseCode);
    }
    return data as T;
  }
}
