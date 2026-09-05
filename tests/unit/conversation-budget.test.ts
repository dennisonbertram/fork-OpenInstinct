import {
  gateway,
  createGateway,
  generateText,
  streamText,
  tool,
  stepCountIs,
} from "ai";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  reserveRequest,
  startBudgetGateway,
} from "@/evals/conversation/budget";

const price = { inputUsdPerToken: 0.00001, outputUsdPerToken: 0.000033 };
const body = {
  prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
};

describe("paid conversation budget", () => {
  it("caps output and rejects unpriced payloads", () => {
    expect(reserveRequest(body, price, 4096).bounded.maxOutputTokens).toBe(
      4096
    );
    expect(() =>
      reserveRequest(
        { prompt: [{ content: [{ type: "image" }] }] },
        price,
        4096
      )
    ).toThrow("multimodal");
    expect(() =>
      reserveRequest(
        { ...body, tools: [{ type: "provider-defined" }] },
        price,
        4096
      )
    ).toThrow("Provider-hosted");
    expect(() =>
      reserveRequest(
        { ...body, providerOptions: { gateway: { models: ["other"] } } },
        price,
        4096
      )
    ).toThrow("provider option");
  });
  it("persists before forwarding and retains unknown charges across retries", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "jory-budget-"));
    const upstream = vi.fn<() => Promise<Response>>(async () => {
      const persisted = z
        .object({ requests: z.array(z.object({ status: z.string() })) })
        .parse(
          JSON.parse(await readFile(join(outputDir, "budget.json"), "utf8"))
        );
      expect(persisted.requests.at(-1)?.status).toBe("reserved");
      return new Response(JSON.stringify({ text: "Hello" }));
    });
    const proxy = await startBudgetGateway({
      budgetUsd: 0.25,
      outputDir,
      authHeaders: { authorization: "Bearer synthetic" },
      agentModel: "agent",
      judgeModel: "judge",
      models: { agent: price, judge: price },
      fetch: upstream,
    });
    try {
      const send = () =>
        fetch(`${proxy.url}/v4/ai/language-model`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${proxy.token}`,
            "ai-language-model-id": "agent",
          },
          body: JSON.stringify(body),
        });
      expect((await send()).status).toBe(200);
      expect((await send()).status).toBe(402);
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(proxy.snapshot().requests[0]?.status).toBe("uncertain");
      expect(proxy.snapshot().chargedOrReservedUsd).toBeLessThanOrEqual(0.25);
    } finally {
      await proxy.close();
      await rm(outputDir, { recursive: true, force: true });
    }
  });
  it("reconciles trusted gateway metadata and rejects unknown models", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "jory-budget-"));
    const upstream = vi.fn<() => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({ providerMetadata: { gateway: { cost: "0.005" } } })
        )
    );
    const proxy = await startBudgetGateway({
      budgetUsd: 0.25,
      outputDir,
      authHeaders: {},
      agentModel: "agent",
      judgeModel: "judge",
      models: { agent: price, judge: price },
      fetch: upstream,
    });
    try {
      for (const model of ["agent", "judge", "unknown"])
        // oxlint-disable-next-line eslint/no-await-in-loop -- Serial requests verify reservation reconciliation.
        await fetch(`${proxy.url}/v4/ai/language-model`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${proxy.token}`,
            "ai-language-model-id": model,
          },
          body: JSON.stringify(body),
        });
      expect(upstream).toHaveBeenCalledTimes(2);
      expect(proxy.snapshot().chargedOrReservedUsd).toBe(0.01);
    } finally {
      await proxy.close();
      await rm(outputDir, { recursive: true, force: true });
    }
  });
  it("serializes concurrent requests before reservation and labels charges", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "jory-budget-"));
    const upstream = vi.fn<() => Promise<Response>>(
      async () =>
        new Response(
          'data: {"type":"finish","providerMetadata":{"gateway":{"cost":0.01}}}\n\n',
          { headers: { "content-type": "text/event-stream" } }
        )
    );
    const proxy = await startBudgetGateway({
      budgetUsd: 0.25,
      outputDir,
      authHeaders: {},
      agentModel: "agent",
      judgeModel: "judge",
      models: { agent: price, judge: price },
      fetch: upstream,
    });
    try {
      await fetch(`${proxy.url}/__budget/context`, {
        method: "POST",
        headers: { authorization: `Bearer ${proxy.token}` },
        body: JSON.stringify({ trialKey: "core-01/trial-1", stage: "agent" }),
      });
      await Promise.all(
        [1, 2].map(() =>
          fetch(`${proxy.url}/v4/ai/language-model`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${proxy.token}`,
              "ai-language-model-id": "agent",
              "ai-language-model-streaming": "true",
            },
            body: JSON.stringify(body),
          }).then((response) => response.text())
        )
      );
      expect(upstream).toHaveBeenCalledTimes(2);
      expect(proxy.snapshot().chargedOrReservedUsd).toBe(0.02);
      expect(
        proxy
          .snapshot()
          .requests.every((row) => row.trialKey === "core-01/trial-1")
      ).toBe(true);
      await expect(
        startBudgetGateway({
          budgetUsd: 0.25,
          outputDir,
          authHeaders: {},
          agentModel: "agent",
          judgeModel: "judge",
          models: { agent: price, judge: price },
          fetch: upstream,
        })
      ).rejects.toThrow("EEXIST");
    } finally {
      await proxy.close();
      await rm(outputDir, { recursive: true, force: true });
    }
  });
  it("carries uncertain spend into a new run and rejects a concurrent supervisor", async () => {
    const root = await mkdtemp(join(tmpdir(), "jory-budget-shared-"));
    const ledgerDirectory = join(root, "ledger");
    const upstream = vi.fn<() => Promise<Response>>(
      async () => new Response("{}")
    );
    const options = {
      budgetUsd: 0.25,
      ledgerDirectory,
      authHeaders: {},
      agentModel: "agent",
      judgeModel: "judge",
      models: { agent: price, judge: price },
      fetch: upstream,
    };
    const first = await startBudgetGateway({
      ...options,
      outputDir: join(root, "first"),
    });
    await expect(
      startBudgetGateway({ ...options, outputDir: join(root, "concurrent") })
    ).rejects.toThrow("EEXIST");
    await fetch(`${first.url}/v4/ai/language-model`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${first.token}`,
        "ai-language-model-id": "agent",
      },
      body: JSON.stringify(body),
    }).then((response) => response.text());
    const reserved = first.snapshot().chargedOrReservedUsd;
    await first.close();
    const second = await startBudgetGateway({
      ...options,
      outputDir: join(root, "second"),
    });
    try {
      const response = await fetch(`${second.url}/v4/ai/language-model`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${second.token}`,
          "ai-language-model-id": "agent",
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(402);
      expect(await response.text()).toContain("budget exhausted");
      expect(second.snapshot().chargedOrReservedUsd).toBe(reserved);
      expect(upstream).toHaveBeenCalledTimes(1);
    } finally {
      await second.close();
      await rm(root, { recursive: true, force: true });
    }
  });
  it("round-trips installed SDK tool reasoning history and streaming through the budget proxy", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "jory-budget-sdk-"));
    const usage = {
      inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 4, text: 2, reasoning: 2 },
    };
    const metadata = { gateway: { cost: "0.001" } };
    let generation = 0;
    const payloads: string[] = [];
    const upstream = vi.fn<typeof fetch>(async (_input, init) => {
      payloads.push(z.string().parse(init?.body));
      const streaming =
        new Headers(init?.headers).get("ai-language-model-streaming") ===
        "true";
      if (streaming)
        return new Response(
          [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: "Done" },
            { type: "text-end", id: "text-1" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage,
              providerMetadata: metadata,
            },
          ]
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join(""),
          { headers: { "content-type": "text/event-stream" } }
        );
      generation += 1;
      return new Response(
        JSON.stringify({
          content:
            generation === 1
              ? [
                  { type: "reasoning", text: "Check sales" },
                  {
                    type: "tool-call",
                    toolCallId: "lookup-1",
                    toolName: "lookup",
                    input: "{}",
                  },
                ]
              : [{ type: "text", text: "Sales are 42" }],
          finishReason: {
            unified: generation === 1 ? "tool-calls" : "stop",
            raw: "stop",
          },
          usage,
          providerMetadata: metadata,
          warnings: [],
        })
      );
    });
    const proxy = await startBudgetGateway({
      budgetUsd: 1,
      outputDir,
      authHeaders: {},
      agentModel: "agent",
      judgeModel: "judge",
      models: { agent: price, judge: price },
      fetch: upstream,
    });
    try {
      const provider = createGateway({
        apiKey: proxy.token,
        baseURL: `${proxy.url}/v4/ai`,
      });
      const result = await generateText({
        model: provider("agent"),
        prompt: "Look up sales",
        reasoning: "low",
        maxRetries: 0,
        providerOptions: {
          openai: { reasoningEffort: "low" },
          gateway: { caching: "auto" },
        },
        tools: {
          lookup: tool({
            inputSchema: z.object({}),
            execute: () => ({ sales: 42 }),
          }),
        },
        stopWhen: stepCountIs(2),
      });
      expect(result.text).toBe("Sales are 42");
      expect(payloads[1]).toContain('"type":"reasoning"');
      expect(payloads[1]).toContain('"reasoning":"low"');
      expect(payloads[1]).toContain('"type":"tool-result"');
      const streamed = streamText({
        model: provider("agent"),
        messages: [
          { role: "user", content: "Look up sales" },
          ...result.finalStep.response.messages,
          { role: "user", content: "Thanks" },
        ],
        maxRetries: 0,
      });
      expect(await streamed.text).toBe("Done");
      expect(proxy.snapshot().requests).toHaveLength(3);
      expect(proxy.snapshot().chargedOrReservedUsd).toBeCloseTo(0.003);
    } finally {
      await proxy.close();
      await rm(outputDir, { recursive: true, force: true });
    }
  });
  it("permits Eve free catalog lookup and attributes built-in judge requests correctly", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "jory-budget-catalog-"));
    const upstream = vi.fn<typeof fetch>(
      async (input) =>
        new Response(
          z.string().parse(input).endsWith("/v1/models/catalog")
            ? JSON.stringify({ data: [] })
            : JSON.stringify({ providerMetadata: { gateway: { cost: 0.001 } } })
        )
    );
    const proxy = await startBudgetGateway({
      budgetUsd: 1,
      outputDir,
      authHeaders: {},
      agentModel: "agent",
      judgeModel: "judge",
      models: { agent: price, judge: price },
      fetch: upstream,
    });
    const headers = { authorization: `Bearer ${proxy.token}` };
    try {
      const catalog = await fetch(`${proxy.url}/v1/models/catalog`, {
        headers,
      });
      expect(catalog.status).toBe(200);
      expect(await catalog.json()).toEqual({ data: [] });
      expect(proxy.snapshot().requests).toHaveLength(0);
      await fetch(`${proxy.url}/__budget/context`, {
        method: "POST",
        headers,
        body: JSON.stringify({ trialKey: "legacy-square", stage: "agent" }),
      });
      await fetch(`${proxy.url}/v4/ai/language-model`, {
        method: "POST",
        headers: { ...headers, "ai-language-model-id": "judge" },
        body: JSON.stringify(body),
      }).then((response) => response.text());
      expect(proxy.snapshot().requests[0]).toMatchObject({
        trialKey: "legacy-square",
        stage: "judge",
      });
    } finally {
      await proxy.close();
      await rm(outputDir, { recursive: true, force: true });
    }
  });
  it("rejects the actual installed Eve Exa SDK payload before billable dispatch", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "jory-budget-exa-"));
    const upstream = vi.fn<typeof fetch>();
    const proxy = await startBudgetGateway({
      budgetUsd: 1,
      outputDir,
      authHeaders: {},
      agentModel: "agent",
      judgeModel: "judge",
      models: { agent: price, judge: price },
      fetch: upstream,
    });
    try {
      const provider = createGateway({
        apiKey: proxy.token,
        baseURL: `${proxy.url}/v4/ai`,
      });
      await expect(
        generateText({
          model: provider("agent"),
          prompt: "Hello",
          maxRetries: 0,
          tools: {
            web_search: gateway.tools.exaSearch({
              contents: { highlights: { maxCharacters: 1000 } },
              numResults: 10,
            }),
          },
        })
      ).rejects.toThrow(
        "Provider-hosted tools rejected: provider/gateway.exa_search/web_search"
      );
      expect(upstream).not.toHaveBeenCalled();
      expect(proxy.snapshot().chargedOrReservedUsd).toBe(0);
    } finally {
      await proxy.close();
      await rm(outputDir, { recursive: true, force: true });
    }
  });
  it("allows exact SDK Exa defaults behind verified native quota and halts on unknown cost", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "jory-budget-native-"));
    const payloads: string[] = [];
    const upstream = vi.fn<typeof fetch>(async (_input, init) => {
      payloads.push(z.string().parse(init?.body));
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "Hello" }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          warnings: [],
        })
      );
    });
    const native = {
      keyId: "key_test",
      limitUsd: 8,
      refreshPeriod: "none",
      verifiedAt: new Date().toISOString(),
    } as const;
    const proxy = await startBudgetGateway({
      budgetUsd: 10,
      outputDir,
      authHeaders: {},
      agentModel: "agent",
      judgeModel: "judge",
      models: { agent: price, judge: price },
      fetch: upstream,
      verifiedNativeBudget: native,
    });
    try {
      const provider = createGateway({
        apiKey: proxy.token,
        baseURL: `${proxy.url}/v4/ai`,
      });
      const result = await generateText({
        model: provider("agent"),
        prompt: "Hello",
        reasoning: "low",
        maxRetries: 0,
        tools: {
          web_search: gateway.tools.exaSearch({
            contents: { highlights: { maxCharacters: 1000 } },
            numResults: 10,
          }),
        },
      });
      expect(result.text).toBe("Hello");
      expect(payloads[0]).toContain('"id":"gateway.exa_search"');
      expect(payloads[0]).toContain('"maxCharacters":1000');
      expect(payloads[0]).not.toContain("maxToolCalls");
      expect(proxy.snapshot().requests[0]?.reservedUsd).toBeGreaterThan(2);
      expect(proxy.snapshot().poisoned).toBe(true);
      await expect(
        generateText({
          model: provider("judge"),
          prompt: "Judge",
          maxRetries: 0,
        })
      ).rejects.toThrow("budget exhausted");
      expect(upstream).toHaveBeenCalledTimes(1);
    } finally {
      await proxy.close();
      await rm(outputDir, { recursive: true, force: true });
    }
  });
  it("raises an explicitly authorized ceiling without losing previous charges", async () => {
    const root = await mkdtemp(join(tmpdir(), "jory-budget-raised-"));
    const ledgerDirectory = join(root, "ledger");
    const upstream = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({ providerMetadata: { gateway: { cost: 0.01 } } })
        )
    );
    const options = {
      ledgerDirectory,
      authHeaders: {},
      agentModel: "agent",
      judgeModel: "judge",
      models: { agent: price, judge: price },
      fetch: upstream,
    };
    const first = await startBudgetGateway({
      ...options,
      budgetUsd: 10,
      outputDir: join(root, "first"),
    });
    await fetch(`${first.url}/v4/ai/language-model`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${first.token}`,
        "ai-language-model-id": "agent",
      },
      body: JSON.stringify(body),
    }).then((response) => response.text());
    await first.close();
    await expect(
      startBudgetGateway({
        ...options,
        budgetUsd: 0.005,
        outputDir: join(root, "too-low"),
      })
    ).rejects.toThrow("below existing charged or reserved spend");
    const second = await startBudgetGateway({
      ...options,
      budgetUsd: 20,
      outputDir: join(root, "second"),
      verifiedNativeBudget: {
        keyId: "key_test",
        limitUsd: 18,
        refreshPeriod: "none",
        verifiedAt: new Date().toISOString(),
      },
    });
    try {
      expect(second.snapshot().chargedOrReservedUsd).toBe(0.01);
      await fetch(`${second.url}/v4/ai/language-model`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${second.token}`,
          "ai-language-model-id": "agent",
        },
        body: JSON.stringify(body),
      }).then((response) => response.text());
      expect(second.snapshot().budgetUsd).toBe(20);
      expect(second.snapshot().chargedOrReservedUsd).toBe(0.02);
      expect(second.snapshot().requests.map((row) => row.id)).toEqual([1, 2]);
      expect(second.snapshot().requests.map((row) => row.runId)).toEqual([
        "first",
        "second",
      ]);
      expect(upstream).toHaveBeenCalledTimes(2);
    } finally {
      await second.close();
      await rm(root, { recursive: true, force: true });
    }
  });
  it("resumes the same output only when its charge history matches the cumulative ledger", async () => {
    const root = await mkdtemp(join(tmpdir(), "jory-budget-resume-"));
    const outputDir = join(root, "run");
    const upstream = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({ providerMetadata: { gateway: { cost: 0.01 } } })
        )
    );
    const options = {
      budgetUsd: 10,
      ledgerDirectory: join(root, "ledger"),
      outputDir,
      authHeaders: {},
      agentModel: "agent",
      judgeModel: "judge",
      models: { agent: price, judge: price },
      fetch: upstream,
    };
    const first = await startBudgetGateway(options);
    await fetch(`${first.url}/v4/ai/language-model`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${first.token}`,
        "ai-language-model-id": "agent",
      },
      body: JSON.stringify(body),
    }).then((response) => response.text());
    await first.close();
    const resumed = await startBudgetGateway({
      ...options,
      budgetUsd: 20,
      resumeOutput: true,
    });
    expect(resumed.snapshot().chargedOrReservedUsd).toBe(0.01);
    expect(resumed.snapshot().requests).toHaveLength(1);
    await resumed.close();
    await writeFile(
      join(outputDir, "budget.json"),
      JSON.stringify({ requests: [] })
    );
    await expect(
      startBudgetGateway({ ...options, resumeOutput: true })
    ).rejects.toThrow("history disagrees");
    await rm(root, { recursive: true, force: true });
  });
});
