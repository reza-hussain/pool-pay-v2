export interface ParsedUpiPayment {
  vpa: string;
  payeeName: string | null;
  amountRupees: string | null;
}

// NPCI's standard UPI deep-link format printed on merchant QR codes:
// upi://pay?pa=<vpa>&pn=<payee name>&am=<amount>&cu=INR&tn=<note> — only
// pa (the payee's UPI ID) is guaranteed present; everything else is
// optional, so a merchant's static QR often has no am at all.
const UPI_PAY_PATTERN = /^upi:\/{0,2}pay\?(.+)$/i;

export function parseUpiPaymentQr(raw: string): ParsedUpiPayment | null {
  const match = raw.match(UPI_PAY_PATTERN);
  if (!match) {
    return null;
  }
  const params = new URLSearchParams(match[1]);
  const vpa = params.get("pa");
  if (!vpa) {
    return null;
  }
  return {
    vpa,
    payeeName: params.get("pn"),
    amountRupees: params.get("am"),
  };
}
