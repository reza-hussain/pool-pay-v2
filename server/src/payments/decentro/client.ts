// Thin fetch wrapper for Decentro's REST APIs (docs.decentro.tech). Two
// separate base URLs are real, documented Decentro behavior, not a mistake —
// the payments-v3 module and the KYC module are hosted on different hosts:
//   Payments v3:  staging.api.decentro.tech / api.decentro.tech
//   KYC v2:       in.staging.decentro.tech  / in.decentro.tech
export type DecentroModule = "payments" | "kyc";

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
