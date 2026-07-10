import { defineConfig } from "vitest/config";

// Contract tests hit Decentro's real staging sandbox — kept separate from
// the main fast/deterministic suite (docs/spec-mvp.md's Testing Decisions).
// Run with: npm run test:contract (requires DECENTRO_* env vars; see
// lib/env.ts — tests skip themselves gracefully when credentials are unset).
export default defineConfig({
  test: {
    environment: "node",
    include: ["test-contract/**/*.contract.test.ts"],
  },
});
