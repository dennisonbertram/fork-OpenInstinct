import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type * as EnvModule from "@/env";
import {
  resetDatabaseForIntegrationTest,
  setDatabaseForIntegrationTest,
} from "@/db";
import { toolContextFor } from "@/tests/helpers/tool-context";
import * as schema from "../../db/schema";
import type {
  BackgroundTaskMember,
  BackgroundTaskTerminalRecord,
} from "@/agent/lib/background-task-terminal";

// The real completion state needs the old framework projections, while the
// provider and Chat bridge remain external boundaries in this integration test.
interface FrameworkCapture {
  members: BackgroundTaskMember[];
  terminals: BackgroundTaskTerminalRecord[];
}

const framework = vi.hoisted((): FrameworkCapture => ({
  members: [],
  terminals: [],
}));
const contextState = vi.hoisted(() => {
  const resetters: (() => void)[] = [];
  return {
    defineState<T>(_name: string, initial: () => T) {
      let current = initial();
      resetters.push(() => {
        current = initial();
      });
      return {
        get: () => current,
        update: (updater: (value: T) => T) => {
          current = updater(current);
        },
      };
    },
    reset() {
      for (const reset of resetters) reset();
    },
  };
});
interface OutboundCapture {
  events: unknown;
  post: ReturnType<
    typeof vi.fn<
      (message: { readonly raw: string }) => Promise<{ readonly id: string }>
    >
  >;
  requestTurnCompletion: ReturnType<typeof vi.fn<() => void>>;
}

interface CapturedChannelConfig {
  readonly events?: { readonly "action.result"?: unknown };
}

const outbound = vi.hoisted((): OutboundCapture => ({
  events: undefined,
  post: vi.fn<
    (message: { readonly raw: string }) => Promise<{ readonly id: string }>
  >(),
  requestTurnCompletion: vi.fn<() => void>(),
}));

vi.mock("eve/context", () => ({
  defineState: (...args: Parameters<typeof contextState.defineState>) =>
    contextState.defineState(...args),
  readBackgroundTaskMembers: () => framework.members,
  readBackgroundTaskTerminals: () => framework.terminals,
  requestTurnCompletion: outbound.requestTurnCompletion,
}));
vi.mock("@/env", async (importOriginal) => ({
  ...(await importOriginal<typeof EnvModule>()),
  env: {
    DATABASE_URL: "postgres://synthetic",
    SENDBLUE_ACCOUNT_ID: "synthetic-account",
    SENDBLUE_API_KEY_ID: "synthetic-key",
    SENDBLUE_API_SECRET_KEY: "synthetic-secret",
    SENDBLUE_CONVERSATIONS: "on",
    SENDBLUE_FROM_NUMBER: "+12025550123",
    SENDBLUE_WEBHOOK_SECRET: "synthetic-webhook-secret",
  },
}));
vi.mock("@chat-adapter/state-pg", () => ({
  createPostgresState: () => ({
    acquireLock: vi.fn<() => Promise<null>>(),
    connect: vi.fn<() => Promise<void>>(),
    delete: vi.fn<() => Promise<void>>(),
    extendLock: vi.fn<() => Promise<boolean>>(),
    get: vi.fn<() => Promise<null>>(),
    releaseLock: vi.fn<() => Promise<void>>(),
    set: vi.fn<() => Promise<void>>(),
    setIfNotExists: vi.fn<() => Promise<boolean>>(),
  }),
}));
vi.mock("chat-adapter-sendblue", () => ({
  createSendblueAdapter: () => ({
    addReaction: vi.fn<() => Promise<void>>(),
    decodeThreadId: () => ({
      contactNumber: "+12025550199",
      fromNumber: "+12025550123",
    }),
    getSdk: () => ({ messages: { send: vi.fn<() => Promise<void>>() } }),
    handleWebhook: vi.fn<() => Promise<Response>>(),
    markRead: vi.fn<() => Promise<void>>(),
  }),
}));
vi.mock("eve/channels/chat-sdk", () => ({
  chatSdkChannel: (config: CapturedChannelConfig) => {
    outbound.events = config;
    return {
      bot: { onDirectMessage: vi.fn<() => void>() },
      channel: {},
      send: vi.fn<() => Promise<void>>(),
    };
  },
  messageToUserContent: (message: { readonly text: string }) => message.text,
}));
vi.mock("@/agent/lib/principal-scope", () => ({
  scopeFromPrincipal: () => ({ workspaceId }),
}));
vi.mock("@/db/services/usage", () => ({
  BudgetExceededError: class BudgetExceededError extends Error {},
  checkBudget: vi.fn<() => Promise<void>>(),
  recordUsageEvent: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/agent/lib/browser-image-artifact/delivery", () => ({
  prepareBrowserImageArtifactDelivery: vi.fn<
    (text: string) => Promise<{
      readonly failedArtifactIds: readonly string[];
      readonly files: readonly [];
      readonly text: string;
    }>
  >(async (text) => ({
    failedArtifactIds: [],
    files: [],
    text,
  })),
}));

const workspaceId = "workspace:sendblue-recovery";
const rootSessionId = "root-session-old-framework";
const oldCohorts = Array.from(
  { length: 7 },
  (_, index) => `turn-old-${String(index + 1)}`
);
const databases: PGlite[] = [];
const [firstOldCohort] = oldCohorts;
if (!firstOldCohort) throw new Error("Expected synthetic old cohorts.");

const { allCohorts, reconcileBackgroundTasks } =
  await import("@/agent/lib/completion-obligations");
const { reportPolicyForTurn } =
  await import("@/agent/lib/completion-report-policy");
const { sendMessageOutputSchema } = await import("@/agent/lib/send-message");
const { finalDeliveryStatus } = await import("@/agent/lib/message-delivery");
const { claimCompletionReportPart, markAccepted, markProviderAttempted } =
  await import("@/db/services/completion-report-attempts");
const messaging = (await import("@/agent/tools/messaging")).default;
await import("@/agent/channels/sendblue");

interface SendblueActionResultEvent {
  readonly result: {
    readonly callId: string;
    readonly kind: "tool-result";
    readonly output: unknown;
    readonly toolName: "send_message";
  };
  readonly sequence: number;
  readonly status: "completed";
  readonly stepIndex: number;
  readonly turnId: string;
}

interface SendblueHandlerContext {
  readonly thread: typeof thread;
}

interface SendblueHandlerSession {
  readonly session: {
    readonly auth: {
      readonly current: {
        readonly attributes: { readonly workspaceId: string };
        readonly authenticator: string;
        readonly principalId: string;
        readonly principalType: string;
      };
      readonly initiator: null;
    };
    readonly id: string;
    readonly turn: { readonly id: string; readonly sequence: number };
  };
}

interface CapturedActionResultHandler {
  invoke(
    event: SendblueActionResultEvent,
    context: SendblueHandlerContext,
    session: SendblueHandlerSession
  ): Promise<void>;
}

const capturedActionResultSchema = z.object({
  events: z.object({
    "action.result": z.function({
      input: [z.unknown(), z.unknown(), z.unknown()],
      output: z.promise(z.void()),
    }),
  }),
});

function capturedActionResultHandler(): CapturedActionResultHandler {
  const parsed = capturedActionResultSchema.safeParse(outbound.events);
  if (!parsed.success)
    throw new Error("Missing SendBlue action.result handler.");
  const actionResult = parsed.data.events["action.result"];
  return {
    async invoke(event, context, session) {
      await Promise.resolve(actionResult(event, context, session));
    },
  };
}

const handleActionResult = capturedActionResultHandler();

beforeEach(() => {
  contextState.reset();
  framework.members = oldCohorts.map((parentTurnId) => ({
    parentTurnId,
    settled: true,
    taskId: `task-${parentTurnId}`,
    workerName: "worker",
  }));
  framework.terminals = oldCohorts.map((parentTurnId) => ({
    childSessionId: `child-${parentTurnId}`,
    parentTurnId,
    status: "completed",
    taskId: `task-${parentTurnId}`,
    terminalTaskId: `task-${parentTurnId}`,
    workerName: "worker",
  }));
  outbound.post.mockReset();
  outbound.post.mockResolvedValue({ id: "synthetic-sendblue-handle" });
  outbound.requestTurnCompletion.mockReset();
});

afterEach(async () => {
  resetDatabaseForIntegrationTest();
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("SendBlue recovery after lost completion state", () => {
  it("keeps one historically accepted report delivered, treats the other six as unconfirmed, and sends only the fresh final reply", async () => {
    const database = new PGlite();
    databases.push(database);
    await applyAllMigrations(database);
    setDatabaseForIntegrationTest(drizzle(database, { schema }));
    await database.exec(
      `INSERT INTO workspaces (id, lifecycle_state) VALUES ('${workspaceId}', 'active')`
    );

    const legacy = await claimCompletionReportPart({
      channel: "sendblue",
      contentDigest: "legacy-first-text",
      conversationId: "sendblue:legacy",
      id: "legacy-accepted-text",
      key: {
        cohortId: firstOldCohort,
        part: "text",
        reportRevision: 0,
        rootSessionId,
        workspaceId,
      },
      leaseExpiresAt: new Date(Date.now() + 60_000),
      leaseOwner: "old-framework",
    });
    if (legacy.kind !== "claimed") throw new Error("Expected legacy claim.");
    const attempted = await markProviderAttempted({
      id: legacy.claim.id,
      leaseOwner: legacy.claim.leaseOwner,
      version: legacy.claim.version,
    });
    if (!attempted) throw new Error("Expected legacy attempt.");
    await expect(
      markAccepted({
        id: attempted.id,
        leaseOwner: attempted.leaseOwner,
        providerHandle: "legacy-provider-handle",
        version: attempted.version,
      })
    ).resolves.toBeDefined();

    // This is the real recovery entry point. On the immutable pre-fix source it
    // reconstructs all seven as reportable; the fixed source consults the real
    // accepted report part and makes the other reconstructed cohorts unconfirmed.
    await reconcileBackgroundTasks({ rootSessionId, workspaceId });

    const resolveMessaging = messaging.events["step.started"];
    if (!resolveMessaging) throw new Error("Missing messaging resolver.");
    const tools = await resolveMessaging(
      { data: { stepIndex: 0, turnId: "turn-fresh" } },
      {
        channel: { kind: "channel:sendblue" },
        messages: [{ content: "Please handle my new request.", role: "user" }],
        session: {
          auth: {
            current: {
              attributes: { workspaceId },
              authenticator: "sendblue-message",
              principalId: "better-auth:synthetic-user",
              principalType: "user",
            },
            initiator: null,
          },
          id: rootSessionId,
        },
      }
    );
    if (!tools) throw new Error("Messaging resolver returned no tools.");
    const toolContext = toolContextFor({
      callId: "call-fresh",
      sessionId: rootSessionId,
    });
    const delivered = sendMessageOutputSchema.parse(
      await tools.send_message.execute(
        { final: true, kind: "message", text: "Fresh reply only." },
        {
          ...toolContext,
          session: {
            ...toolContext.session,
            turn: { ...toolContext.session.turn, id: "turn-fresh" },
          },
        }
      )
    );
    const actionEvent = {
      result: {
        callId: "call-fresh",
        kind: "tool-result" as const,
        output: delivered,
        toolName: "send_message" as const,
      },
      status: "completed" as const,
      sequence: 0,
      stepIndex: 0,
      turnId: "turn-fresh",
    };
    const handlerContext = {
      bot: {},
      state: { thread: null },
      streaming: false,
      streamingEditIntervalMs: 0,
      thread,
    };
    const sessionContext = toolContextFor({ sessionId: rootSessionId });
    const handlerSession = {
      ...sessionContext,
      session: {
        ...sessionContext.session,
        auth: {
          current: {
            attributes: { workspaceId },
            authenticator: "sendblue-message",
            principalId: "better-auth:synthetic-user",
            principalType: "user",
          },
          initiator: null,
        },
        id: rootSessionId,
        turn: { id: "turn-fresh", sequence: 1 },
      },
    };
    await handleActionResult.invoke(
      actionEvent,
      handlerContext,
      handlerSession
    );

    expect(outbound.post).toHaveBeenCalledTimes(1);
    expect(outbound.post).toHaveBeenCalledWith({ raw: "Fresh reply only." });
    const cohortsAfterFirstDelivery = allCohorts();
    await handleActionResult.invoke(
      actionEvent,
      handlerContext,
      handlerSession
    );
    expect(outbound.post).toHaveBeenCalledTimes(1);
    expect(finalDeliveryStatus("turn-fresh")).toBe("completed");
    expect(allCohorts()).toEqual(cohortsAfterFirstDelivery);

    const uncertainContext = toolContextFor({
      callId: "call-uncertain",
      sessionId: rootSessionId,
    });
    const uncertainOutput = sendMessageOutputSchema.parse(
      await tools.send_message.execute(
        { final: true, kind: "message", text: "A later final reply." },
        {
          ...uncertainContext,
          session: {
            ...uncertainContext.session,
            turn: { ...uncertainContext.session.turn, id: "turn-uncertain" },
          },
        }
      )
    );
    const uncertainEvent = {
      ...actionEvent,
      result: {
        ...actionEvent.result,
        callId: "call-uncertain",
        output: uncertainOutput,
      },
      turnId: "turn-uncertain",
    };
    outbound.post.mockRejectedValueOnce(new Error("synthetic timeout"));
    await expect(
      handleActionResult.invoke(uncertainEvent, handlerContext, handlerSession)
    ).rejects.toThrow("synthetic timeout");
    expect(outbound.post).toHaveBeenCalledTimes(2);
    await handleActionResult.invoke(
      uncertainEvent,
      handlerContext,
      handlerSession
    );
    expect(outbound.post).toHaveBeenCalledTimes(2);
    expect(finalDeliveryStatus("turn-uncertain")).toBe("unconfirmed");

    await handleActionResult.invoke(
      {
        ...actionEvent,
        result: { ...actionEvent.result, callId: "progress-call" },
        turnId: "turn-next",
      },
      handlerContext,
      handlerSession
    );
    expect(outbound.post).toHaveBeenCalledTimes(3);
    expect(reportPolicyForTurn()).toEqual({ kind: "none" });
    expect(
      allCohorts()
        .filter((cohort) => oldCohorts.includes(cohort.cohortId))
        .map(({ cohortId, phase }) => ({ cohortId, phase }))
    ).toEqual(
      expect.arrayContaining([
        { cohortId: firstOldCohort, phase: "delivered" },
        ...oldCohorts.slice(1).map((cohortId) => ({
          cohortId,
          phase: "unconfirmed",
        })),
      ])
    );
  });
});

const thread = {
  id: "sendblue:KzEyMDI1NTUwMTIz:KzEyMDI1NTUwMTk5",
  post: outbound.post,
  toJSON: () => ({ currentMessage: { id: "inbound-synthetic" } }),
};

async function applyAllMigrations(database: PGlite) {
  const names = (
    await readdir(new URL("../../db/migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .toSorted();
  const migrations = await Promise.all(
    names.map((name) =>
      readFile(new URL(`../../db/migrations/${name}`, import.meta.url), "utf8")
    )
  );
  await migrations.reduce<Promise<void>>(
    (previous, migration) =>
      previous.then(async () => {
        return migration
          .split("--> statement-breakpoint")
          .filter((statement) => statement.trim())
          .reduce<Promise<void>>(
            (statementPrevious, statement) =>
              statementPrevious.then(async () => {
                await database.exec(statement);
                return undefined;
              }),
            Promise.resolve()
          );
      }),
    Promise.resolve()
  );
}
