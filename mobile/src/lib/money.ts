// Money is always paise (1 INR = 100 paise) on the wire and in state — these are
// the only two places a rupee/paise conversion factor should appear.

export function rupeesToPaise(rupees: string | number): number {
  return Math.round(Number(rupees) * 100);
}

export function paiseToRupeeLabel(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
