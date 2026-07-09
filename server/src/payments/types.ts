export interface DepositIntent {
  id: string;
  poolId: string;
  // Fake UPI VPA the QR/reference encodes.
  vpa: string;
  // Locked for Equal Split Pools, null (freely entered) for Open Pools.
  fixedAmountPaise: number | null;
}

// The one boundary between Pool Pay's own logic and the external UPI/BaaS
// partner (see docs/spec-mvp.md's Implementation Decisions — "Payment
// Provider interface"). No real provider exists yet; only the fake below,
// used everywhere until a later ticket wires up a real one behind this
// same interface.
export interface PaymentProvider {
  createDepositIntent(poolId: string, fixedAmountPaise: number | null): Promise<DepositIntent>;
}
