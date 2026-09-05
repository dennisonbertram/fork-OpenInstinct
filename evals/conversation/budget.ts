/* oxlint-disable typescript/no-unsafe-argument -- Node IncomingMessage async iterator is declared any; Buffer.from normalizes bytes immediately at the HTTP boundary. */
/* oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters -- This transport is the external SDK JSON parsing boundary; every billable shape is validated here before dispatch. */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, rename, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";

interface ModelPrice {
  inputUsdPerToken: number;
  outputUsdPerToken: number;
}
interface Reservation {
  id: number;
  runId: string;
  model: string;
  reservedUsd: number;
  costUsd: number | null;
  status: "reserved" | "reconciled" | "uncertain";
  trialKey: string | null;
  stage: "agent" | "judge" | null;
}
interface VerifiedNativeBudget {
  keyId: string;
  limitUsd: 8;
  refreshPeriod: "none";
  verifiedAt: string;
}
export interface BudgetGatewayOptions {
  budgetUsd: number;
  outputDir: string;
  ledgerDirectory?: string;
  authHeaders: Record<string, string>;
  models: Record<string, ModelPrice>;
  agentModel: string;
  judgeModel: string;
  fetch?: typeof fetch;
  verifiedNativeBudget?: VerifiedNativeBudget;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function reserveRequest(
  body: unknown,
  price: ModelPrice,
  outputCap: number,
  verifiedNativeBudget?: VerifiedNativeBudget
) {
  if (!record(body) || !Array.isArray(body.prompt))
    throw new Error("Missing prompt");
  const rejectMedia = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(rejectMedia);
      return;
    }
    if (!record(value)) return;
    if (
      ["image", "file", "audio", "video", "image-data", "file-data"].includes(
        String(value.type)
      )
    )
      throw new Error("Unpriced multimodal content rejected");
    Object.values(value).forEach(rejectMedia);
  };
  rejectMedia(body.prompt);
  for (const message of body.prompt) {
    if (!record(message)) throw new Error("Invalid prompt message");
    if (typeof message.content === "string") continue;
    if (!Array.isArray(message.content)) throw new Error("Invalid content");
    for (const part of message.content) {
      if (
        !record(part) ||
        !["text", "reasoning", "tool-call", "tool-result"].includes(
          String(part.type)
        )
      ) {
        throw new Error("Unpriced multimodal content rejected");
      }
      if (
        ["text", "reasoning"].includes(String(part.type)) &&
        typeof part.text !== "string"
      )
        throw new Error("Invalid textual content");
    }
  }
  let hasWebSearch = false;
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools)) throw new Error("Invalid tools");
    for (const providerTool of body.tools) {
      if (record(providerTool) && providerTool.type === "function") continue;
      if (
        !record(providerTool) ||
        providerTool.type !== "provider" ||
        providerTool.id !== "gateway.exa_search" ||
        providerTool.name !== "web_search" ||
        !record(providerTool.args) ||
        Object.keys(providerTool.args).length !== 2 ||
        providerTool.args.numResults !== 10 ||
        !record(providerTool.args.contents) ||
        Object.keys(providerTool.args.contents).length !== 1 ||
        !record(providerTool.args.contents.highlights) ||
        Object.keys(providerTool.args.contents.highlights).length !== 1 ||
        providerTool.args.contents.highlights.maxCharacters !== 1000 ||
        verifiedNativeBudget === undefined
      ) {
        // Never copy tool descriptions, arguments, schemas or user content into errors.
        const label = record(providerTool)
          ? [providerTool.type, providerTool.id, providerTool.name]
              .map((value) =>
                typeof value === "string" &&
                /^[a-zA-Z0-9_.-]{1,100}$/u.test(value)
                  ? value
                  : "unknown"
              )
              .join("/")
          : "unknown";
        throw new Error(`Provider-hosted tools rejected: ${label}`);
      }
      hasWebSearch = true;
    }
  }
  // Overrides may select unpriced routes, search, image processing, or other fees.
  if (record(body.providerOptions)) {
    for (const [provider, options] of Object.entries(body.providerOptions)) {
      if (!record(options)) throw new Error("Invalid provider options");
      const allowed =
        provider === "gateway"
          ? ["caching"]
          : provider === "openai"
            ? [
                "reasoningEffort",
                "safetyIdentifier",
                "store",
                "textVerbosity",
                "parallelToolCalls",
              ]
            : [];
      if (Object.keys(options).some((key) => !allowed.includes(key)))
        throw new Error("Unpriced provider option rejected");
    }
  }
  const requested = body.maxOutputTokens;
  if (
    requested !== undefined &&
    (typeof requested !== "number" ||
      !Number.isInteger(requested) ||
      requested <= 0)
  )
    throw new Error("Invalid output bound");
  const maxOutputTokens = Math.min(
    typeof requested === "number" ? requested : outputCap,
    outputCap
  );
  const bounded = { ...body, maxOutputTokens };
  // UTF-8 bytes conservatively dominate text token counts; include framing allowance.
  const inputBound = Buffer.byteLength(JSON.stringify(bounded), "utf8") + 8192;
  const reservedUsd =
    inputBound * price.inputUsdPerToken +
    maxOutputTokens * price.outputUsdPerToken +
    // Operational headroom for exact Eve Exa defaults, backed by the verified native quota.
    // This is not a claim that Gateway internal tool work has a documented $2 maximum.
    (hasWebSearch ? 2 : 0);
  return { bounded, reservedUsd };
}

function responseCost(text: string, streaming: boolean): number | null {
  let result: unknown;
  try {
    if (streaming) {
      const finishes = text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .flatMap((line) => {
          try {
            const value: unknown = JSON.parse(line.slice(5));
            return record(value) && value.type === "finish" ? [value] : [];
          } catch {
            return [];
          }
        });
      if (finishes.length !== 1) return null;
      [result] = finishes;
    } else result = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !record(result) ||
    !record(result.providerMetadata) ||
    !record(result.providerMetadata.gateway)
  )
    return null;
  const raw = result.providerMetadata.gateway.cost;
  const cost = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0
    ? cost
    : null;
}

export async function startBudgetGateway(options: BudgetGatewayOptions) {
  if (!(options.budgetUsd > 0 && options.budgetUsd <= 10))
    throw new Error("Budget must be positive and at most $10");
  const nativeBudget = options.verifiedNativeBudget;
  if (
    nativeBudget &&
    (options.budgetUsd !== 10 ||
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Validate the supervisor contract at the runtime boundary, including JavaScript callers.
      nativeBudget.limitUsd !== 8 ||
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Validate the supervisor contract at the runtime boundary, including JavaScript callers.
      nativeBudget.refreshPeriod !== "none" ||
      !/^[a-zA-Z0-9_-]{1,128}$/u.test(nativeBudget.keyId) ||
      !Number.isFinite(Date.parse(nativeBudget.verifiedAt)) ||
      Date.parse(nativeBudget.verifiedAt) > Date.now())
  )
    throw new Error("Invalid verified native budget metadata");
  for (const model of [options.agentModel, options.judgeModel]) {
    const price = options.models[model];
    if (
      !price ||
      !Number.isFinite(price.inputUsdPerToken) ||
      price.inputUsdPerToken <= 0 ||
      !Number.isFinite(price.outputUsdPerToken) ||
      price.outputUsdPerToken <= 0
    )
      throw new Error("Missing authoritative positive model prices");
  }
  await mkdir(options.outputDir, { recursive: true });
  const token = randomBytes(32).toString("hex");
  const ledgerDirectory = options.ledgerDirectory ?? options.outputDir;
  await mkdir(ledgerDirectory, { recursive: true });
  const lock = join(ledgerDirectory, "budget.lock");
  await mkdir(lock); // Existing lock requires explicit owner/process inspection, never automatic reuse.
  const ledgerPath = join(ledgerDirectory, "budget.json");
  const ledger: Reservation[] = [];
  let poisoned = false;
  if (options.ledgerDirectory) {
    try {
      const previous: unknown = JSON.parse(await readFile(ledgerPath, "utf8"));
      if (
        !record(previous) ||
        previous.budgetUsd !== options.budgetUsd ||
        typeof previous.poisoned !== "boolean" ||
        !Array.isArray(previous.requests)
      )
        throw new Error("Invalid existing budget ledger");
      for (const row of previous.requests) {
        if (
          !record(row) ||
          typeof row.id !== "number" ||
          typeof row.runId !== "string" ||
          typeof row.model !== "string" ||
          typeof row.reservedUsd !== "number" ||
          !Number.isFinite(row.reservedUsd) ||
          row.reservedUsd < 0 ||
          !(
            row.costUsd === null ||
            (typeof row.costUsd === "number" &&
              Number.isFinite(row.costUsd) &&
              row.costUsd >= 0)
          ) ||
          !["reserved", "reconciled", "uncertain"].includes(
            String(row.status)
          ) ||
          !(row.trialKey === null || typeof row.trialKey === "string") ||
          !(
            row.stage === null ||
            row.stage === "agent" ||
            row.stage === "judge"
          )
        )
          throw new Error("Invalid existing budget reservation");
        ledger.push({
          id: row.id,
          runId: row.runId,
          model: row.model,
          reservedUsd: row.reservedUsd,
          costUsd: row.costUsd,
          status: row.status === "reconciled" ? "reconciled" : "uncertain",
          trialKey: row.trialKey,
          stage:
            row.stage === "agent"
              ? "agent"
              : row.stage === "judge"
                ? "judge"
                : null,
        });
      }
      poisoned = previous.poisoned;
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      ) {
        await rm(lock, { recursive: true });
        throw error;
      }
    }
  }
  let context: Pick<Reservation, "trialKey" | "stage"> = {
    trialKey: null,
    stage: null,
  };
  const snapshot = () => ({
    budgetUsd: options.budgetUsd,
    verifiedNativeBudget: nativeBudget ?? null,
    searchHeadroomUsd: nativeBudget ? 2 : null,
    chargedOrReservedUsd: ledger.reduce(
      (sum, row) => sum + (row.costUsd ?? row.reservedUsd),
      0
    ),
    poisoned,
    requests: ledger.map((row) => ({ ...row })),
  });
  const persist = async () => {
    const path = ledgerPath;
    await writeFile(`${path}.tmp`, JSON.stringify(snapshot(), null, 2), {
      mode: 0o600,
    });
    await rename(`${path}.tmp`, path);
    if (ledgerDirectory !== options.outputDir)
      await writeFile(
        join(options.outputDir, "budget.json"),
        JSON.stringify(snapshot(), null, 2),
        { mode: 0o600 }
      );
  };
  // Refuse to overwrite an earlier run's report; cumulative state lives separately.
  try {
    await writeFile(
      join(options.outputDir, "budget.json"),
      JSON.stringify(snapshot(), null, 2),
      { mode: 0o600, flag: "wx" }
    );
  } catch (error) {
    await rm(lock, { recursive: true });
    throw error;
  }
  if (options.ledgerDirectory) await persist();
  let queue = Promise.resolve();
  const server = createServer((request, response) => {
    const execute = async () => {
      if (request.headers.authorization !== `Bearer ${token}`) {
        response.writeHead(401).end();
        return;
      }
      if (
        request.method === "GET" &&
        [
          "/v4/ai/config",
          "/v1/models",
          "/v1/models/catalog",
          "/v1/credits",
        ].includes(request.url ?? "")
      ) {
        const upstream = await (options.fetch ?? fetch)(
          `https://ai-gateway.vercel.sh${String(request.url)}`,
          {
            headers: options.authHeaders,
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
          }
        );
        response.writeHead(upstream.status, {
          "content-type": "application/json",
        });
        response.end(await upstream.text());
        return;
      }
      if (request.method === "POST" && request.url === "/__budget/context") {
        const parts: Buffer[] = [];
        let length = 0;
        for await (const part of request) {
          // IncomingMessage supplies byte buffers for this undecoded stream.
          const buffer = Buffer.from(part);
          length += buffer.length;
          if (length > 4096) throw new Error("Context too large");
          parts.push(buffer);
        }
        const next: unknown = JSON.parse(Buffer.concat(parts).toString());
        if (
          !record(next) ||
          typeof next.trialKey !== "string" ||
          next.trialKey.length > 200 ||
          !["agent", "judge"].includes(String(next.stage))
        )
          throw new Error("Invalid budget context");
        context = {
          trialKey: next.trialKey,
          stage: next.stage === "agent" ? "agent" : "judge",
        };
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ ok: true }));
        return;
      }
      if (
        request.method !== "POST" ||
        request.url !== "/v4/ai/language-model"
      ) {
        response.writeHead(403).end();
        return;
      }
      const model = request.headers["ai-language-model-id"];
      if (
        typeof model !== "string" ||
        ![options.agentModel, options.judgeModel].includes(model)
      )
        throw new Error("Unpriced model rejected");
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > 2_000_000) throw new Error("Request too large");
        chunks.push(buffer);
      }
      const price = options.models[model];
      if (!price) throw new Error("Unpriced model");
      const { bounded, reservedUsd } = reserveRequest(
        JSON.parse(Buffer.concat(chunks).toString()),
        price,
        model === options.agentModel ? 4096 : 2048,
        nativeBudget
      );
      if (
        poisoned ||
        (nativeBudget !== undefined &&
          snapshot().chargedOrReservedUsd >= nativeBudget.limitUsd) ||
        snapshot().chargedOrReservedUsd + reservedUsd > options.budgetUsd
      )
        throw new Error(
          "Paid evaluation budget exhausted; no request dispatched"
        );
      const reservation: Reservation = {
        id: ledger.length + 1,
        runId: basename(options.outputDir),
        model,
        reservedUsd,
        costUsd: null,
        status: "reserved",
        ...context,
        stage: model === options.judgeModel ? "judge" : context.stage,
      };
      ledger.push(reservation);
      await persist();
      try {
        const headers = new Headers(options.authHeaders);
        headers.set("content-type", "application/json");
        headers.set("ai-language-model-id", model);
        const streaming =
          request.headers["ai-language-model-streaming"] === "true";
        headers.set(
          "ai-language-model-streaming",
          streaming ? "true" : "false"
        );
        const upstream = await (options.fetch ?? fetch)(
          "https://ai-gateway.vercel.sh/v4/ai/language-model",
          {
            method: "POST",
            headers,
            body: JSON.stringify(bounded),
            redirect: "error",
            signal: AbortSignal.timeout(180_000),
          }
        );
        response.writeHead(upstream.status, {
          "content-type":
            upstream.headers.get("content-type") ?? "application/json",
        });
        const output: Buffer[] = [];
        let outputSize = 0;
        if (upstream.body)
          for await (const chunk of upstream.body) {
            outputSize += chunk.length;
            if (outputSize > 16_000_000)
              throw new Error("Response exceeded accounting bound");
            output.push(Buffer.from(chunk));
            if (!response.destroyed) response.write(chunk);
          }
        const cost = upstream.ok
          ? responseCost(Buffer.concat(output).toString(), streaming)
          : null;
        if (cost !== null) {
          reservation.costUsd = cost;
          reservation.status = "reconciled";
          if (cost > reservedUsd) poisoned = true;
        } else reservation.status = "uncertain";
      } catch {
        reservation.status = "uncertain";
      } finally {
        if (nativeBudget && reservation.status === "uncertain") poisoned = true;
        await persist();
        response.end();
      }
    };
    queue = queue.then(execute).catch((error: unknown) => {
      const safeMessages = [
        "Missing prompt",
        "Invalid prompt message",
        "Invalid content",
        "Unpriced multimodal content rejected",
        "Provider-hosted tools rejected",
        "Invalid provider options",
        "Unpriced provider option rejected",
        "Invalid output bound",
        "Unpriced model rejected",
        "Request too large",
        "Paid evaluation budget exhausted; no request dispatched",
      ];
      const reason =
        error instanceof Error &&
        (safeMessages.includes(error.message) ||
          /^Provider-hosted tools rejected: [a-zA-Z0-9_./-]+$/u.test(
            error.message
          ))
          ? error.message
          : "Evaluation transport rejected invalid request or failed accounting";
      if (!response.headersSent)
        response.writeHead(402, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: {
            message: reason,
            type: "budget_error",
          },
        })
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing budget gateway address");
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    token,
    snapshot,
    async close() {
      await queue;
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        })
      );
      await rm(lock, { recursive: true });
    },
  };
}
