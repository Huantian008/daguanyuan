import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // node:sqlite (used by the in-memory D1 stand-in) is still flagged experimental in Node 24.
    execArgv: ["--disable-warning=ExperimentalWarning"],
  },
});
