import { randomUUID } from "node:crypto";
import { CashfreeClient, type CashfreeClientConfig } from "../payments/cashfree/client.js";
import {
  InvalidPanNumberError,
  type IdentityVerificationProvider,
  type IdentityVerificationResult,
} from "./identity-provider.js";

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// docs.cashfree.com's PAN Verification (Verification Suite) — a direct
// PAN-registry check, unlike Decentro's CKYC-registry search. There's no
// single kycStatus field the way Decentro's response had one; verified is
// derived from valid && pan_status === "VALID" instead.
interface PanVerificationResponse {
  valid?: boolean;
  pan_status?: "VALID" | "INVALID" | "DELETED" | "DEACTIVATED";
  registered_name?: string;
}

// Real full-KYC check, replacing DecentroIdentityProvider (ADR 0013 — the
// switch to Cashfree). See docs.cashfree.com/docs/api-reference/vrs/v2/pan/verify-pan-sync.
export class CashfreeIdentityProvider implements IdentityVerificationProvider {
  private readonly client: CashfreeClient;

  constructor(config: Pick<CashfreeClientConfig, "clientId" | "clientSecret" | "env">) {
    this.client = new CashfreeClient({ product: "verification", ...config });
  }

  async verifyFullIdentity(userId: string, panNumber: string): Promise<IdentityVerificationResult> {
    if (!PAN_PATTERN.test(panNumber)) {
      throw new InvalidPanNumberError();
    }

    const verificationId = `kyc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const response = await this.client.post<PanVerificationResponse>("/pan", {
      verification_id: verificationId,
      pan: panNumber,
    });

    return {
      verified: response.valid === true && response.pan_status === "VALID",
      providerRef: verificationId,
    };
  }
}
