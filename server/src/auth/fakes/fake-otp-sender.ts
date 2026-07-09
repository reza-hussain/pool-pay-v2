import type { OtpSender } from "../types.js";

export class FakeOtpSender implements OtpSender {
  sent: Array<{ phoneNumber: string; code: string }> = [];

  async send(phoneNumber: string, code: string): Promise<void> {
    this.sent.push({ phoneNumber, code });
  }

  lastCodeSentTo(phoneNumber: string): string | undefined {
    return [...this.sent].reverse().find((s) => s.phoneNumber === phoneNumber)?.code;
  }
}
