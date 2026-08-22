import { randomUUID, createHash, createHmac, timingSafeEqual } from "node:crypto";
import type {
  DepositIntent,
  DepositWebhookEvent,
  PaymentProvider,
  SpendConfirmation,
  TransferConfirmation,
  VpaVerificationResult,
} from "../types.js";
import { CashfreeApiError, CashfreeClient, type CashfreeClientConfig } from "./client.js";

export interface CashfreePaymentProviderConfig {
  env: "sandbox" | "production";
  pg: Pick<CashfreeClientConfig, "clientId" | "clientSecret">;
  payout: Pick<CashfreeClientConfig, "clientId" | "clientSecret">;
  verification: Pick<CashfreeClientConfig, "clientId" | "clientSecret" | "publicKey">;
  // Merchant's own registered UPI ID, shown as a fallback "Pay to UPI ID" text
  // alongside the QR — same role DecentroPaymentProviderConfig.virtualVpa
  // played; Cashfree's Orders API doesn't expose a single stable merchant VPA
  // either, so this stays a configured constant, not something read back
  // from a Cashfree response.
  virtualVpa: string;
}

interface CreateOrderResponse {
  order_id: string;
  cf_order_id?: string;
  payment_session_id: string;
}

// docs.cashfree.com's headless Order Pay call (POST /orders/sessions) — for
// a UPI QR request the QR image comes back base64-encoded in data.payload.
interface OrderSessionQrResponse {
  data: { payload: string; content_type?: string };
}

interface StandardTransferResponse {
  transfer_id?: string;
}

// docs.cashfree.com's UPI penny-drop (POST /verification/upi/penny-drop) —
// synchronous, unlike Decentro's VerifyPay which could come back PENDING and
// need a status poll. Confirmed against a live sandbox call: success looks
// like { status: "VALID", name_at_bank: "TEST USER", ... }, not the
// account_exists field this was originally guessed against (the research
// pass found the endpoint and request shape but not a full response
// example) — that guess meant every response was silently treated as
// unverified regardless of what Cashfree actually returned.
interface UpiPennyDropResponse {
  status?: string;
  name_at_bank?: string;
}

interface PaymentSuccessWebhookPayload {
  type?: string;
  data?: {
    order?: { order_id?: string; order_amount?: number | string };
    payment?: { payment_status?: string };
  };
}

// Real adapter behind the PaymentProvider seam, replacing DecentroPaymentProvider
// (Decentro never provisioned us a consumer_urn — see ADR 0013). See
// docs.cashfree.com for the underlying contracts:
//   - Deposits: POST /pg/orders (create order) then the unauthenticated
//     headless POST /pg/orders/sessions with payment_method.upi.channel
//     "qrcode" to get a base64 QR image — two calls where Decentro's Dynamic
//     QR was one, since Cashfree's Orders API only creates the order and
//     doesn't return a scannable QR itself.
//   - Payouts: Cashfree Payouts is beneficiary-based, not a single inline
//     call like Decentro's money_transfer/initiate — add-or-reuse a
//     beneficiary for the target VPA, then a Standard Transfer against that
//     beneficiary. Both calls hidden behind initiateSpend/initiateTransfer so
//     the two-step shape doesn't leak past this adapter.
//   - UPI ID verification: POST /verification/upi/penny-drop.
//   - Deposit confirmation: server-to-server webhook (PAYMENT_SUCCESS_WEBHOOK),
//     authenticated via a real HMAC-SHA256 signature (x-webhook-signature/
//     x-webhook-timestamp) rather than Decentro's placeholder shared-secret
//     header — see verifyWebhookSignature.
export class CashfreePaymentProvider implements PaymentProvider {
  private readonly pgClient: CashfreeClient;
  private readonly payoutClient: CashfreeClient;
  private readonly verificationClient: CashfreeClient;
  private readonly pgClientSecret: string;
  private readonly virtualVpa: string;

  constructor(config: CashfreePaymentProviderConfig) {
    this.pgClient = new CashfreeClient({ product: "pg", env: config.env, ...config.pg });
    this.payoutClient = new CashfreeClient({ product: "payout", env: config.env, ...config.payout });
    this.verificationClient = new CashfreeClient({ product: "verification", env: config.env, ...config.verification });
    this.pgClientSecret = config.pg.clientSecret;
    this.virtualVpa = config.virtualVpa;
  }

  async createDepositIntent(
    poolId: string,
    fixedAmountPaise: number | null,
    customerPhone: string,
  ): Promise<DepositIntent> {
    // Same ₹5-minimum placeholder rationale the original adapter carried for
    // Open Pools (no fixed amount): Cashfree's Orders API requires a
    // positive order_amount, there's no "any amount" order mode.
    const amountPaise = fixedAmountPaise ?? 500;
    const orderId = `dep_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

    const order = await this.pgClient.post<CreateOrderResponse>("/orders", {
      order_id: orderId,
      order_amount: amountPaise / 100,
      order_currency: "INR",
      // Cashfree's Orders API is customer-centric and requires a phone
      // number per order — customerPhone is the requesting Member's own
      // phone (Pool Pay accounts are phone/OTP-based), not a Pool-level
      // identity, since the order itself is created per deposit attempt.
      customer_details: { customer_id: poolId, customer_phone: customerPhone },
      order_meta: { payment_methods: "upi" },
    });

    const qr = await this.pgClient.postUnauthenticated<OrderSessionQrResponse>("/orders/sessions", {
      payment_session_id: order.payment_session_id,
      payment_method: { upi: { channel: "qrcode" } },
    });

    return {
      id: order.cf_order_id ?? order.order_id,
      poolId,
      vpa: this.virtualVpa,
      fixedAmountPaise,
      qrImageUrl: `data:image/png;base64,${qr.data.payload}`,
    };
  }

  async initiateSpend(poolId: string, merchantRef: string, amountPaise: number): Promise<SpendConfirmation> {
    const response = await this.payout({ toUpi: merchantRef, payeeName: "Merchant", amountPaise });
    return { id: response.id, poolId, merchantRef, amountPaise };
  }

  async initiateTransfer(poolId: string, vpa: string, amountPaise: number): Promise<TransferConfirmation> {
    const response = await this.payout({ toUpi: vpa, payeeName: "Member", amountPaise });
    return { id: response.id, poolId, vpa, amountPaise };
  }

  async verifyVpa(vpa: string): Promise<VpaVerificationResult> {
    const verificationId = `vpa_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    try {
      const response = await this.verificationClient.post<UpiPennyDropResponse>("/upi/penny-drop", {
        verification_id: verificationId,
        vpa,
        user_consent: {
          obtained: true,
          type: "EXPLICIT",
          timestamp: new Date().toISOString(),
          purpose: "Pool Pay UPI ID verification",
        },
      });

      if (response.status === "VALID") {
        return { verified: true, accountHolderName: response.name_at_bank ?? null };
      }
      return { verified: false, accountHolderName: null };
    } catch (error) {
      if (error instanceof CashfreeApiError) {
        return { verified: false, accountHolderName: null };
      }
      throw error;
    }
  }

  parseDepositWebhook(payload: unknown): DepositWebhookEvent | null {
    if (typeof payload !== "object" || payload === null) {
      return null;
    }
    const body = payload as PaymentSuccessWebhookPayload;
    const orderId = body.data?.order?.order_id;
    if (typeof orderId !== "string") {
      return null;
    }
    const rawAmount = body.data?.order?.order_amount;
    const amountRupees = typeof rawAmount === "string" ? Number(rawAmount) : rawAmount;
    if (typeof amountRupees !== "number" || !Number.isFinite(amountRupees)) {
      return null;
    }
    return {
      providerRef: orderId,
      amountPaise: Math.round(amountRupees * 100),
      status: body.data?.payment?.payment_status === "SUCCESS" ? "SUCCESS" : "FAILED",
    };
  }

  // Real HMAC-SHA256 signature check per docs.cashfree.com's webhook-signature
  // scheme: base64(HMAC-SHA256(clientSecret, timestamp + rawBody)), compared
  // to the x-webhook-signature header. Confirmed against Cashfree's
  // Verification Suite signature doc; assumed (not directly confirmed) that
  // Payment Gateway webhooks use the identical scheme — same header names
  // showed up under both product searches, but verify against real PG
  // traffic before depending on this for anything beyond this MVP.
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | undefined>): boolean {
    const signature = headers["x-webhook-signature"];
    const timestamp = headers["x-webhook-timestamp"];
    if (!signature || !timestamp) {
      return false;
    }
    const expected = createHmac("sha256", this.pgClientSecret)
      .update(timestamp + rawBody.toString())
      .digest("base64");
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);
    return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
  }

  // Cashfree Payouts is beneficiary-based: a transfer targets a previously
  // registered beneficiary_id, unlike Decentro's single inline payout call.
  // beneficiary_id is deterministic per-VPA so repeat payouts to the same
  // Member/merchant reuse the same beneficiary instead of registering a new
  // one every time.
  private async payout(args: { toUpi: string; payeeName: string; amountPaise: number }): Promise<{ id: string }> {
    const beneficiaryId = `ben_${createHash("sha256").update(args.toUpi).digest("hex").slice(0, 32)}`;
    await this.ensureBeneficiary(beneficiaryId, args.payeeName, args.toUpi);

    const transferId = `txn_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const response = await this.payoutClient.post<StandardTransferResponse>("/transfers", {
      transfer_id: transferId,
      transfer_amount: args.amountPaise / 100,
      transfer_currency: "INR",
      transfer_mode: "upi",
      beneficiary_details: { beneficiary_id: beneficiaryId },
    });
    return { id: response.transfer_id ?? transferId };
  }

  // Only swallows the specific "already registered" failure so repeat
  // payouts to the same VPA don't error — per docs.cashfree.com's
  // beneficiary-v2 create reference, a duplicate beneficiary_id comes back
  // as HTTP 409 with code "beneficiary_id_already_exists". Any other failure
  // (bad VPA, suspended account, etc.) is a real problem and should stop the
  // payout here with a clear error, rather than silently proceeding to a
  // transfer call against a beneficiary that was never actually created.
  private async ensureBeneficiary(beneficiaryId: string, name: string, vpa: string): Promise<void> {
    try {
      await this.payoutClient.post("/beneficiary", {
        beneficiary_id: beneficiaryId,
        beneficiary_name: name,
        beneficiary_instrument_details: { vpa },
      });
    } catch (error) {
      if (error instanceof CashfreeApiError && error.code === "beneficiary_id_already_exists") {
        return;
      }
      throw error;
    }
  }
}
