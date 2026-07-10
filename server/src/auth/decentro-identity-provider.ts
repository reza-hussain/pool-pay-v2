import { randomUUID } from "node:crypto";
import { DecentroClient, type DecentroClientConfig } from "../payments/decentro/client.js";
import {
  InvalidPanNumberError,
  type IdentityVerificationProvider,
  type IdentityVerificationResult,
} from "./identity-provider.js";

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

interface CkycSearchResponse {
  decentroTxnId: string;
  status: "SUCCESS" | "FAILURE";
  data: { kycStatus: "SUCCESS" | "FAILURE" | "UNKNOWN" };
}

// Real full-KYC check (ticket #12's gate, wired to a real vendor by ticket
// #14): CKYC registry search by PAN — the simplest of Decentro's identity
// flows that doesn't need an interactive OTP/biometric step from the user.
// See docs.decentro.tech/reference/kyc-and-onboarding-api-reference-identities-ckyc-services-search.
//
// Note this endpoint's response uses camelCase (decentroTxnId, kycStatus) —
// unlike the payments-v3 endpoints, which use snake_case. That's a real,
// documented inconsistency between Decentro's v2 KYC module and v3 payments
// module, not a typo here.
export class DecentroIdentityProvider implements IdentityVerificationProvider {
  private readonly client: DecentroClient;

  constructor(config: DecentroClientConfig) {
    this.client = new DecentroClient(config);
  }

  async verifyFullIdentity(userId: string, panNumber: string): Promise<IdentityVerificationResult> {
    if (!PAN_PATTERN.test(panNumber)) {
      throw new InvalidPanNumberError();
    }

    const referenceId = `kyc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const response = await this.client.post<CkycSearchResponse>("kyc", "/v2/kyc/ckyc/search", {
      reference_id: referenceId,
      document_type: "PAN",
      id_number: panNumber,
      consent: true,
      consent_purpose: `Verifying identity for Pool Pay Organizer ${userId}`,
    });

    return {
      verified: response.data.kycStatus === "SUCCESS",
      providerRef: response.decentroTxnId,
    };
  }
}
