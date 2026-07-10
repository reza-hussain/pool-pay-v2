import { randomUUID } from "node:crypto";
import type {
  DepositIntent,
  DepositWebhookEvent,
  PaymentProvider,
  SpendConfirmation,
  TransferConfirmation,
} from "../types.js";
import { DecentroClient, type DecentroClientConfig } from "./client.js";

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
//   - Deposits:              POST /v3/payments/upi/qr (Dynamic QR)
//   - Spends & Reimbursements/Refunds: POST /v3/core_banking/money_transfer/initiate
//     (transfer_type: "UPI") — one unified payout endpoint serves both, since
//     both are "move money out to a UPI VPA" from Decentro's perspective; the
//     per-Spend fee (ADR 0010) is computed by SpendService, not this adapter.
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
    return this.client.post<PayoutResponse>("payments", "/v3/core_banking/money_transfer/initiate", {
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
