import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isVerifiedRunOwner,
  processStartTime,
  type DevRunRecord,
} from "../../scripts/local/run-record";

const children: ReturnType<typeof spawn>[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill("SIGTERM");
});

describe("local lifecycle ownership", () => {
  it("does not treat a matching PID and start time alone as a run owner", async () => {
    const child = spawn("/bin/sleep", ["10"], { stdio: "ignore" });
    children.push(child);
    if (child.pid === undefined) throw new Error("sleep did not start");
    const startTime = await processStartTime(child.pid);
    if (startTime === undefined)
      throw new Error("sleep start time unavailable");

    const forged = {
      schemaVersion: 1,
      runId: "forged-run",
      nonce: "a".repeat(48),
      leaseNonce: "b".repeat(48),
      profile: "connected",
      cwd: process.cwd(),
      baseSha: "0".repeat(40),
      startedAt: new Date().toISOString(),
      owner: {
        pid: child.pid,
        processStartTime: startTime,
        processGroup: child.pid,
      },
      composeProject: "forged-project",
      volume: "forged-volume",
      ports: { app: 3000, marketing: 3210 },
      origins: {
        app: "http://127.0.0.1:3000",
        marketing: "http://127.0.0.1:3210",
      },
      children: {},
      readiness: {},
    } satisfies DevRunRecord;

    await expect(isVerifiedRunOwner(forged, process.cwd())).resolves.toBe(
      false
    );
  });

  it("stops a service group when its declared supervisor is absent", async () => {
    const wrapper = new URL(
      "../../scripts/local/service-supervisor.mjs",
      import.meta.url
    ).pathname;
    const child = spawn(
      process.execPath,
      [
        wrapper,
        "--repository-root",
        process.cwd(),
        "--parent-pid",
        "999999",
        "--run-nonce",
        "a".repeat(48),
        "--",
        "/bin/sleep",
        "10",
      ],
      { stdio: "ignore" }
    );
    children.push(child);

    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });

    expect(code).toBe(143);
  });

  it("force-stops a TERM-ignoring detached service group after the supervisor grace period", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "open-instinct-service-supervisor-")
    );
    const marker = join(directory, "service.pid");
    const wrapper = new URL(
      "../../scripts/local/service-supervisor.mjs",
      import.meta.url
    ).pathname;
    const child = spawn(
      process.execPath,
      [
        wrapper,
        "--repository-root",
        process.cwd(),
        "--parent-pid",
        String(process.pid),
        "--run-nonce",
        "a".repeat(48),
        "--",
        "/bin/sh",
        "-c",
        'trap "" TERM; echo $$ > "$SERVICE_PID_PATH"; while :; do sleep 0.1; done',
      ],
      {
        detached: true,
        // oxlint-disable-next-line eslint/no-restricted-properties -- The process test retains PATH and passes only its temporary PID marker.
        env: { ...process.env, SERVICE_PID_PATH: marker },
        stdio: "ignore",
      }
    );
    children.push(child);
    if (child.pid === undefined)
      throw new Error("service supervisor did not start");
    try {
      await waitFor(
        async () => (await readFile(marker, "utf8")).trim().length > 0
      );
      process.kill(-child.pid, "SIGTERM");
      const servicePid = Number((await readFile(marker, "utf8")).trim());
      await new Promise((resolve) => setTimeout(resolve, 5_600));
      expect(await processStartTime(servicePid)).toBeUndefined();
    } finally {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* The wrapper already exited. */
      }
      await rm(directory, { force: true, recursive: true });
    }
  }, 10_000);

  it("blocks external fetch, sockets, TLS, and HTTP before a fixture can resolve a host", () => {
    const guard = new URL(
      "../../scripts/local/fixture-network-guard.mjs",
      import.meta.url
    ).pathname;
    const result = spawnSync(
      process.execPath,
      [
        `--import=${guard}`,
        "-e",
        `
          const net = require("node:net"); const tls = require("node:tls");
          const http = require("node:http"); const https = require("node:https");
          const messages = [];
          for (const request of [
            () => fetch("http://example.invalid"),
            () => net.connect({ host: "example.invalid", port: 9 }),
            () => net.createConnection(9, "example.invalid"),
            () => tls.connect({ host: "example.invalid", port: 443 }),
            () => http.request("http://example.invalid"),
            () => https.request("https://example.invalid"),
          ]) { try { request(); } catch (error) { messages.push(error.message); } }
          if (messages.length !== 6 || messages.some((message) => !message.includes("blocked external network access"))) process.exit(1);
        `,
      ],
      {
        cwd: process.cwd(),
        // oxlint-disable-next-line eslint/no-restricted-properties -- The subprocess retains the test runner PATH and adds only the fixture repository root.
        env: { ...process.env, DEV_FIXTURE_REPOSITORY_ROOT: process.cwd() },
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(0);
  });

  it("allows fixture traffic to a real loopback service", () => {
    const guard = new URL(
      "../../scripts/local/fixture-network-guard.mjs",
      import.meta.url
    ).pathname;
    const result = spawnSync(
      process.execPath,
      [
        `--import=${guard}`,
        "-e",
        `
          const http = require("node:http"); const net = require("node:net");
          const server = http.createServer((_, response) => response.end("ok"));
          server.listen(0, "127.0.0.1", async () => {
            const port = server.address().port;
            try {
              const response = await fetch("http://127.0.0.1:" + port);
              await response.text();
              await new Promise((resolve, reject) => { const socket = net.connect({ host: "127.0.0.1", port }, () => { socket.end(); resolve(); }); socket.once("error", reject); });
              server.close(() => process.exit(0));
            } catch (error) { server.close(() => process.exit(1)); }
          });
        `,
      ],
      {
        cwd: process.cwd(),
        // oxlint-disable-next-line eslint/no-restricted-properties -- The subprocess retains the test runner PATH and adds only the fixture repository root.
        env: { ...process.env, DEV_FIXTURE_REPOSITORY_ROOT: process.cwd() },
        encoding: "utf8",
        timeout: 5_000,
      }
    );

    expect(result.status).toBe(0);
  });
});

async function waitFor(check: () => Promise<boolean>) {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- Polls must wait for the prior filesystem observation before retrying.
    if (await check().catch(() => false)) return;
    // oxlint-disable-next-line no-await-in-loop -- The bounded polling delay prevents a busy loop.
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for the service child.");
}
