import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";
import { baseURL, port } from "./playwright.config";

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
    env: {
      BETTER_AUTH_SECRET:
        "e2e-better-auth-secret-for-playwright-sendblue-tests",
      BETTER_AUTH_URL: baseURL,
      KERNEL_API_KEY: "e2e-kernel-key",
      PORT: port,
      PHONE_OTP_PROVIDER: "sendblue",
      SENDBLUE_API_KEY_ID: "e2e-sendblue-key-id",
      SENDBLUE_API_SECRET_KEY: "e2e-sendblue-secret-key",
      SENDBLUE_FROM_NUMBER: "+12025550199",
      SECRET_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      VERCEL_ENV: "preview",
      WORKSPACE_SCOPE_ENFORCEMENT: "enforce",
    },
    gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
    reuseExistingServer: false,
    timeout: 300_000,
    url: baseURL,
  },
});
