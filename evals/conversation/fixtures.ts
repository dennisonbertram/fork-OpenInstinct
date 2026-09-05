import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { loadFixture, startFakeSquare } from "../square/fake/server";

const configurationSchema = z.object({
  mode: z.enum([
    "base",
    "ambiguous",
    "disconnected",
    "revoked",
    "slow",
    "failed",
  ]),
  caseId: z.string(),
  turn: z.number().int().min(1),
});
export type ConversationFixtureConfiguration = z.infer<
  typeof configurationSchema
>;
interface ConversationFixtureRequest {
  method: string;
  path: string;
  status: number;
  startedAt: string;
  elapsedMs: number;
  caseId: string;
  turn: number;
}
async function body(req: IncomingMessage) {
  const parts: Buffer[] = [];
  let length = 0;
  for await (const part of req) {
    const chunk = z.instanceof(Buffer).parse(part);
    length += chunk.length;
    if (length > 1024 * 1024) throw new Error("Fixture request exceeds 1 MiB.");
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

/** Synthetic HTTP boundaries only: the agent retains its normal Square/auth code. */
export async function startConversationFixtures() {
  const ambiguous = loadFixture();
  ambiguous.customers.push({
    id: "CUST_ADA_TESTCASE",
    given_name: "Ada",
    family_name: "Testcase",
    email_address: "ada.testcase@example.invalid",
    created_at: "2026-01-01T00:00:00Z",
  });
  const base = await startFakeSquare();
  const alternate = await startFakeSquare({ fixture: ambiguous });
  const token = randomUUID();
  const requests: ConversationFixtureRequest[] = [];
  let configuration: ConversationFixtureConfiguration = {
    mode: "base",
    caseId: "setup",
    turn: 1,
  };
  const configure = (next: ConversationFixtureConfiguration) => {
    configuration = configurationSchema.parse(next);
  };
  const snapshotRequests = () => requests.map((request) => ({ ...request }));
  const server = createServer((req, res) => {
    const config = { ...configuration };
    const started = Date.now();
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const method = req.method ?? "GET";
    const send = (
      status: number,
      value: z.infer<ReturnType<typeof z.json>>
    ) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (!path.startsWith("/__conversation/"))
      res.on("finish", () =>
        requests.push({
          method,
          path,
          status: res.statusCode,
          startedAt: new Date(started).toISOString(),
          elapsedMs: Date.now() - started,
          caseId: config.caseId,
          turn: config.turn,
        })
      );
    void (async () => {
      if (path.startsWith("/__conversation/")) {
        if (req.headers.authorization !== `Bearer ${token}`) {
          send(401, { error: "Unauthorized fixture control." });
          return;
        }
        if (path === "/__conversation/configure" && method === "POST") {
          configure(
            configurationSchema.parse(JSON.parse((await body(req)).toString()))
          );
          send(200, { ok: true });
          return;
        }
        if (path === "/__conversation/requests" && method === "GET") {
          send(200, z.json().parse(snapshotRequests()));
          return;
        }
        send(404, { error: "Unknown fixture control." });
        return;
      }
      // Contracts read from installed @vercel/connect/dist/token.js and authorization.d.ts.
      if (path.startsWith("/v1/connect/")) {
        if (
          config.mode === "disconnected" &&
          method === "POST" &&
          path.startsWith("/v1/connect/token/")
        ) {
          send(403, {
            error: {
              code: "user_authorization_required",
              message: "Connect your Square account to continue.",
            },
          });
          return;
        }
        if (
          config.mode === "disconnected" &&
          method === "POST" &&
          path.startsWith("/v1/connect/authorize/")
        ) {
          send(200, {
            request: "synthetic-authorization-request",
            verifier: "synthetic-verifier",
            url: "https://example.invalid/square/authorize",
          });
          return;
        }
        send(403, {
          error: {
            code: "fixture_connect_forbidden",
            message: "Unexpected Connect operation in isolated eval.",
          },
        });
        return;
      }
      if (config.mode === "disconnected" || config.mode === "revoked") {
        send(401, {
          errors: [
            {
              category: "AUTHENTICATION_ERROR",
              code: "UNAUTHORIZED",
              detail: "Synthetic account is not connected.",
            },
          ],
        });
        return;
      }
      const read =
        method === "GET" ||
        (method === "POST" &&
          [
            "/v2/customers/search",
            "/v2/orders/search",
            "/v2/catalog/search",
            "/v2/catalog/search-catalog-items",
            "/v2/inventory/counts/batch-retrieve",
          ].includes(path));
      if (read) {
        if (
          config.mode === "slow" ||
          (config.mode === "failed" &&
            config.caseId === "SQ-08" &&
            config.turn <= 2)
        )
          await delay(1500);
        if (
          config.mode === "failed" &&
          config.turn <= (config.caseId === "SQ-08" ? 2 : 1)
        ) {
          send(503, {
            errors: [
              {
                category: "API_ERROR",
                code: "SERVICE_UNAVAILABLE",
                detail: "Synthetic temporary lookup failure.",
              },
            ],
          });
          return;
        }
      }
      const payload = await body(req);
      const headers = new Headers({ "Content-Type": "application/json" });
      if (req.headers.authorization)
        headers.set("Authorization", req.headers.authorization);
      if (req.headers["square-version"])
        headers.set("Square-Version", String(req.headers["square-version"]));
      const options: RequestInit = { method, headers };
      if (method !== "GET" && method !== "HEAD") options.body = payload;
      const upstream = await fetch(
        `${config.mode === "ambiguous" ? alternate.url : base.url}${req.url ?? "/"}`,
        options
      );
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(await upstream.text());
    })().catch(() => {
      if (!res.headersSent) send(400, { error: "Invalid fixture request." });
      else res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  // net.Server.address has a documented AddressInfo/string/null union.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof
  if (!address || typeof address === "string")
    throw new Error("Fixture server did not bind TCP.");
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    token,
    configure,
    snapshotRequests,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        })
      );
      await Promise.all([base.close(), alternate.close()]);
    },
  };
}
