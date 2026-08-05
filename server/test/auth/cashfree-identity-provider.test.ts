import { describe, expect, it } from "vitest";
import { isVerifiedPanResponse } from "../../src/auth/cashfree-identity-provider.js";

describe("isVerifiedPanResponse", () => {
  it("accepts a valid PAN with a direct name match", () => {
    expect(
      isVerifiedPanResponse({ valid: true, pan_status: "VALID", name_match_result: "DIRECT_MATCH" }),
    ).toBe(true);
  });

  it("accepts a valid PAN with a good partial name match", () => {
    expect(
      isVerifiedPanResponse({ valid: true, pan_status: "VALID", name_match_result: "GOOD_PARTIAL_MATCH" }),
    ).toBe(true);
  });

  it("rejects a moderate, poor, or no name match even when the PAN itself is valid", () => {
    for (const name_match_result of ["MODERATE_PARTIAL_MATCH", "POOR_PARTIAL_MATCH", "NO_MATCH"] as const) {
      expect(isVerifiedPanResponse({ valid: true, pan_status: "VALID", name_match_result })).toBe(false);
    }
  });

  it("rejects when the PAN itself isn't valid, even with a direct name match", () => {
    expect(
      isVerifiedPanResponse({ valid: false, pan_status: "INVALID", name_match_result: "DIRECT_MATCH" }),
    ).toBe(false);
  });

  it("rejects when pan_status isn't VALID (deleted/deactivated PAN)", () => {
    expect(
      isVerifiedPanResponse({ valid: true, pan_status: "DEACTIVATED", name_match_result: "DIRECT_MATCH" }),
    ).toBe(false);
  });

  it("rejects when name_match_result is missing", () => {
    expect(isVerifiedPanResponse({ valid: true, pan_status: "VALID" })).toBe(false);
  });
});
