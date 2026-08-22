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
// derived from valid && pan_status === "VALID" && a close-enough
// name_match_result instead.
export interface PanVerificationResponse {
  valid?: boolean;
  pan_status?: "VALID" | "INVALID" | "DELETED" | "DEACTIVATED";
  registered_name?: string;
  // Confirmed via docs.cashfree.com's PAN verification reference — the only
  // five values the schema defines, ordered best to worst match.
  name_match_result?: "DIRECT_MATCH" | "GOOD_PARTIAL_MATCH" | "MODERATE_PARTIAL_MATCH" | "POOR_PARTIAL_MATCH" | "NO_MATCH";
}

// Match tiers accepted as "close enough" — real people's PAN records
// sometimes differ from their profile name (missing middle name, minor
// spelling), so this stops short of requiring DIRECT_MATCH alone, but a
// MODERATE/POOR/NO match is rejected as not the same person.
const ACCEPTABLE_NAME_MATCHES = new Set(["DIRECT_MATCH", "GOOD_PARTIAL_MATCH"]);

// Pure decision logic, pulled out of verifyFullIdentity so it's testable
// without a live Cashfree call.
//
// name_match_result is documented as always present alongside a valid PAN +
// provided name, but live sandbox calls against this account never include
// it (confirmed against every documented test PAN) — so its absence is
// treated as "no match signal available" rather than a rejection, and only
// an explicit bad match (present but not in ACCEPTABLE_NAME_MATCHES) blocks
// verification.
export function isVerifiedPanResponse(response: PanVerificationResponse): boolean {
  if (response.valid !== true || response.pan_status !== "VALID") {
    return false;
  }
  return response.name_match_result === undefined || ACCEPTABLE_NAME_MATCHES.has(response.name_match_result);
}

// Real full-KYC check, replacing DecentroIdentityProvider (ADR 0013 — the
// switch to Cashfree). See docs.cashfree.com/docs/api-reference/vrs/v2/pan/verify-pan-sync.
export class CashfreeIdentityProvider implements IdentityVerificationProvider {
  private readonly client: CashfreeClient;

  constructor(config: Pick<CashfreeClientConfig, "clientId" | "clientSecret" | "env" | "publicKey">) {
    this.client = new CashfreeClient({ product: "verification", ...config });
  }

  async verifyFullIdentity(userId: string, panNumber: string, name: string): Promise<IdentityVerificationResult> {
    if (!PAN_PATTERN.test(panNumber)) {
      throw new InvalidPanNumberError();
    }

    const verificationId = `kyc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const response = await this.client.post<PanVerificationResponse>("/pan", {
      verification_id: verificationId,
      pan: panNumber,
      name,
    });

    return { verified: isVerifiedPanResponse(response), providerRef: verificationId };
  }
}
