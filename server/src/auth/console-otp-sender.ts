import type { OtpSender } from "./types.js";

/**
 * Placeholder OtpSender that logs the code instead of sending a real SMS.
 * No SMS vendor has been chosen yet — swap this for a real implementation
 * behind the same interface once one is, same pattern as the Payment Provider seam.
 */
export class ConsoleOtpSender implements OtpSender {
  async send(phoneNumber: string, code: string): Promise<void> {
    console.log(`[otp] ${phoneNumber} -> ${code}`);
  }
}
