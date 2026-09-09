import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3210";
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: skipWebServer
    ? undefined
    : {
        command: "pnpm build && pnpm exec next start -H 127.0.0.1 -p 3210",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 300_000,
      },
});
