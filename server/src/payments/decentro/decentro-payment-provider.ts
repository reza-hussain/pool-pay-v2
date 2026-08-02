import { randomUUID } from "node:crypto";
import type {
  DepositIntent,
  DepositWebhookEvent,
  PaymentProvider,
  SpendConfirmation,
  TransferConfirmation,
  VpaVerificationResult,
} from "../types.js";
import { DecentroApiError, DecentroClient, type DecentroClientConfig } from "./client.js";

export interface DecentroPaymentProviderConfig extends DecentroClientConfig {
  consumerUrn: string;
  virtualVpa: string;
}

interface DynamicQrResponse {
  decentro_txn_id: string;
  data: { dynamic_qr_image: string };
}

interface PayoutResponse {
  decentro_txn_id: string;
}

// docs.decentro.tech's VerifyPay (V3) — POST /v3/banking/verify_pay does a
// real penny-drop and can come back PENDING while the drop settles; the
// terminal result then has to be fetched from a separate status endpoint.
interface VerifyPayResponse {
  decentro_txn_id?: string;
  reference_id?: string;
  api_status: "SUCCESS" | "FAILURE" | "PENDING";
  response_key?: string;
  name_as_per_bank?: string;
}

// Best-effort shape for Decentro's server-to-server "terminal transaction
// status" callback (docs.decentro.tech's Collections v3 callback docs) —
// unverified against a real sandbox; field names follow the same
// snake_case/decentro_txn_id convention as the rest of payments-v3, but
// confirm against real traffic once sandbox access is available.
interface DepositWebhookPayload {
  decentro_txn_id?: string;
  status?: string;
  amount?: string | number;
}

// Real adapter behind the PaymentProvider seam (ticket #14, ADR 0002/0005),
// implementing the exact same interface the fake one did. See
// docs.decentro.tech for the underlying contracts:
//   - Deposits:              POST /v3/payments/upi/qr (Dynamic QR) — payments
//     module host (staging.api.decentro.tech).
//   - Spends & Reimbursements/Refunds: POST /v3/core_banking/money_transfer/initiate
//     (transfer_type: "UPI") — one unified payout endpoint serves both, since
//     both are "move money out to a UPI VPA" from Decentro's perspective; the
//     per-Spend fee (ADR 0010) is computed by SpendService, not this adapter.
//     Despite the v3 path, this lives on the "core-banking" module host
//     (in.staging.decentro.tech, same as KYC v2) — confirmed via Decentro's
//     own reference page, not assumed from the path prefix.
//   - UPI ID verification:   POST /v3/banking/verify_pay — payments module
//     host, see verifyVpa.
//   - Deposit confirmation:  server-to-server webhook, not synchronous — see
//     parseDepositWebhook and deposits/webhook-router.ts (ticket #15).
export class DecentroPaymentProvider implements PaymentProvider {
  private readonly client: DecentroClient;
  private readonly consumerUrn: string;
  private readonly virtualVpa: string;

  constructor(config: DecentroPaymentProviderConfig) {
    this.client = new DecentroClient(config);
    this.consumerUrn = config.consumerUrn;
    this.virtualVpa = config.virtualVpa;
  }

  async createDepositIntent(poolId: string, fixedAmountPaise: number | null): Promise<DepositIntent> {
    // Decentro's Dynamic QR always carries a fixed amount — there's no
    // "any amount" QR mode documented. For an Open Pool (fixedAmountPaise
    // null), fall back to the minimum Decentro accepts (₹5) as a nominal
    // placeholder; Members can still deposit more via a fresh QR per amount,
    // same as the Equal Split path. Worth revisiting once sandbox access
    // confirms whether an amount-less Dynamic QR variant exists.
    const amountPaise = fixedAmountPaise ?? 500;
    const referenceId = `dep_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

    const response = await this.client.post<DynamicQrResponse>("payments", "/v3/payments/upi/qr", {
      reference_id: referenceId,
      consumer_urn: this.consumerUrn,
      amount: (amountPaise / 100).toFixed(2),
      purpose_message: `Pool Pay deposit for ${poolId}`.slice(0, 50),
      expiry_time: "1440",
    });

    return {
      id: response.decentro_txn_id,
      poolId,
      vpa: this.virtualVpa,
      fixedAmountPaise,
      qrImageUrl: response.data.dynamic_qr_image,
    };
  }

  async initiateSpend(poolId: string, merchantRef: string, amountPaise: number): Promise<SpendConfirmation> {
    const response = await this.payout({
      poolId,
      toUpi: merchantRef,
      payeeName: "Merchant",
      amountPaise,
      purpose: "Pool Pay spend",
    });
    return { id: response.decentro_txn_id, poolId, merchantRef, amountPaise };
  }

  async initiateTransfer(poolId: string, vpa: string, amountPaise: number): Promise<TransferConfirmation> {
    const response = await this.payout({
      poolId,
      toUpi: vpa,
      payeeName: "Member",
      amountPaise,
      purpose: "Pool Pay reimbursement",
    });
    return { id: response.decentro_txn_id, poolId, vpa, amountPaise };
  }

  // Real bank-account lookup behind Onboarding's Registered UPI ID (ADR
  // 0012) — a penny-drop that resolves the account holder's real name, shown
  // back to the person for confirmation rather than trusted as free text.
  // Treats every non-success outcome (invalid VPA, a still-PENDING drop
  // after retrying the status check, or a Decentro-side error) the same
  // way — "couldn't verify" — since the person can't act differently on any
  // of those distinctions; they'd just retry or fix the VPA either way.
  async verifyVpa(vpa: string): Promise<VpaVerificationResult> {
    const referenceId = `vpa_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    try {
      const response = await this.client.post<VerifyPayResponse>("payments", "/v3/banking/verify_pay", {
        consumer_urn: this.consumerUrn,
        is_consent_granted: true,
        reference_id: referenceId,
        upi_vpa: vpa,
        purpose_message: "Pool Pay UPI ID verification",
      });

      const resolved =
        response.api_status === "PENDING" ? await this.pollVerificationStatus(referenceId) : response;

      if (resolved?.api_status === "SUCCESS" && resolved.response_key === "success_account_details_retrieved") {
        return { verified: true, accountHolderName: resolved.name_as_per_bank ?? null };
      }
      return { verified: false, accountHolderName: null };
    } catch (error) {
      if (error instanceof DecentroApiError) {
        return { verified: false, accountHolderName: null };
      }
      throw error;
    }
  }

  // Best-effort polling — unverified against a real sandbox exactly how long
  // a penny-drop typically takes to settle, so these numbers (3 attempts,
  // 1.5s apart) are a starting guess to revisit once sandbox access confirms
  // real-world timing, same as this file's other Decentro-timing caveats.
  private async pollVerificationStatus(referenceId: string): Promise<VerifyPayResponse | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const status = await this.client.get<VerifyPayResponse>(
        "payments",
        "/v3/banking/account_validation/status",
        { reference_id: referenceId },
      );
      if (status.api_status !== "PENDING") {
        return status;
      }
    }
    return null;
  }

  parseDepositWebhook(payload: unknown): DepositWebhookEvent | null {
    if (typeof payload !== "object" || payload === null) {
      return null;
    }
    const body = payload as DepositWebhookPayload;
    if (typeof body.decentro_txn_id !== "string") {
      return null;
    }
    const amountRupees = typeof body.amount === "string" ? Number(body.amount) : body.amount;
    if (typeof amountRupees !== "number" || !Number.isFinite(amountRupees)) {
      return null;
    }
    return {
      providerRef: body.decentro_txn_id,
      amountPaise: Math.round(amountRupees * 100),
      status: body.status === "SUCCESS" ? "SUCCESS" : "FAILED",
    };
  }

  private async payout(args: {
    poolId: string;
    toUpi: string;
    payeeName: string;
    amountPaise: number;
    purpose: string;
  }): Promise<PayoutResponse> {
    const referenceId = `txn_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    return this.client.post<PayoutResponse>("core-banking", "/v3/core_banking/money_transfer/initiate", {
      reference_id: referenceId,
      consumer_urn: this.consumerUrn,
      purpose_message: args.purpose,
      transfer_type: "UPI",
      transfer_amount: (args.amountPaise / 100).toFixed(2),
      beneficiary_details: {
        payee_name: args.payeeName,
        to_upi: args.toUpi,
      },
    });
  }
}
