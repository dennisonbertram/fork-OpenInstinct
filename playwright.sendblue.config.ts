import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";
import { baseURL, port } from "./playwright.config";

const runnerEnvironment = Object.assign(
  {
    BETTER_AUTH_SECRET: "e2e-better-auth-secret-for-playwright-sendblue-tests",
    BETTER_AUTH_URL: baseURL,
    KERNEL_API_KEY: "e2e-kernel-key",
    PORT: port,
    MARKETING_PORT: readRunnerEnvironment("MARKETING_PORT") ?? "3210",
    SECRET_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    WORKSPACE_SCOPE_ENFORCEMENT: "enforce",
    DEV_PROFILE: "fixture",
    DEV_FIXTURE_SCENARIO: "sendblue-ui",
    DEV_RUN_ID:
      readRunnerEnvironment("DEV_RUN_ID") ??
      `playwright-sendblue-${randomBytes(8).toString("hex")}`,
  },
  optionalRunnerEnvironment("DEV_VERIFY_LEASE_NONCE"),
  optionalRunnerEnvironment("DEV_VERIFY_EVIDENCE_PATH")
);

function readRunnerEnvironment(name: string) {
  // oxlint-disable-next-line eslint/no-restricted-properties -- Playwright runner configuration reads only the explicit CI-owned names passed to the fixture supervisor.
  return process.env[name];
}

function optionalRunnerEnvironment(name: string) {
  const value = readRunnerEnvironment(name);
  return value === undefined ? {} : { [name]: value };
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/sendblue-otp.spec.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: "line",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "node scripts/dev.ts",
    env: runnerEnvironment,
    stdout: "pipe",
    stderr: "pipe",
    gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
    reuseExistingServer: false,
    timeout: 300_000,
    url: baseURL,
  },
});
