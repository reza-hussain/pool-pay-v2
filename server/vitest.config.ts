import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Contract tests (ticket #14) hit Decentro's real sandbox and are run
    // separately via `npm run test:contract` — kept out of this fast suite
    // per docs/spec-mvp.md's Testing Decisions.
    exclude: ["**/node_modules/**", "**/test-contract/**"],
  },
});
