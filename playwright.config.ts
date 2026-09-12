import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";

// oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- A caller-selected port keeps isolated E2E runs from attaching to an unrelated local server.
export const port = process.env.PLAYWRIGHT_PORT ?? "3000";
export const baseURL = `http://127.0.0.1:${port}`;
const storageState = "playwright/.auth/user.json";
const runnerEnvironment = Object.assign(
  {
    BETTER_AUTH_SECRET: "e2e-better-auth-secret-for-playwright-tests",
    BETTER_AUTH_URL: baseURL,
    KERNEL_API_KEY: "e2e-kernel-key",
    PORT: port,
    MARKETING_PORT: readRunnerEnvironment("MARKETING_PORT") ?? "3210",
    ADMIN_PHONE_NUMBERS: "+12025550123",
    SECRET_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    WORKSPACE_SCOPE_ENFORCEMENT: "enforce",
    EVAL_CONTRACT_FIXTURE: "1",
    DEV_PROFILE: "fixture",
    DEV_RUN_ID:
      readRunnerEnvironment("DEV_RUN_ID") ??
      `playwright-web-${randomBytes(8).toString("hex")}`,
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
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  // oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- Playwright owns this CI-only runner setting outside the application runtime.
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: [/.*\.setup\.ts/, "**/sendblue-otp.spec.ts"],
      use: {
        browserName: "chromium",
        storageState,
      },
    },
  ],
  webServer: {
    command: "node scripts/dev.ts",
    env: runnerEnvironment,
    gracefulShutdown: {
      signal: "SIGTERM",
      timeout: 30_000,
    },
    // The chat suite must never attach to a paid-model or non-synthetic server.
    reuseExistingServer: false,
    timeout: 300_000,
    url: baseURL,
  },
});
