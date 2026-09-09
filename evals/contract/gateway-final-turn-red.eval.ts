import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { z } from "zod";
import { contractEvalTags, deliveredMessages } from "./shared";

const artifactPath = resolve(
  process.cwd(),
  ".eve/evals/gateway-final-turn-red-events.jsonl"
);

const eventSchema = z.object({
  type: z.string().optional(),
  turnId: z.string().optional(),
  stepIndex: z.number().optional(),
  sequence: z.number().optional(),
  meta: z
    .object({ id: z.string().optional(), at: z.string().optional() })
    .optional(),
  data: z
    .object({
      status: z.string().optional(),
      turnId: z.string().optional(),
      stepIndex: z.number().optional(),
      sequence: z.number().optional(),
      result: z.object({ callId: z.string().optional() }).optional(),
    })
    .optional(),
});

export default defineEval({
  description:
    "Accepted final delivery must settle the turn before a later model failure.",
  tags: contractEvalTags,
  async test(t) {
    const first = await t.send("final-timeout");
    writeSafeEvents("first", first.events);

    first.succeeded().label("accepted final delivery completes the first turn");
    first.calledTool("send_message", { count: 1, status: "completed" });
    first.notEvent("turn.failed");
    first.eventOrder([
      { type: "action.result" },
      { type: "turn.completed" },
      { type: "session.waiting" },
    ]);
    t.check(
      deliveredMessages(first).map((message) => message.text),
      equals(["fixture final timeout"])
    );

    const second = await t.send("final-normal");
    writeSafeEvents("second", second.events);
    second.succeeded().label("a normal final delivery completes the next turn");
    second.calledTool("send_message", { count: 1, status: "completed" });
    second.notEvent("turn.failed");
    second.eventOrder([
      { type: "action.result" },
      { type: "turn.completed" },
      { type: "session.waiting" },
    ]);
    t.check(first.sessionId === second.sessionId, equals(true));
    t.check(distinctTurnAndCallIds(first.events, second.events), equals(true));
  },
});

function writeSafeEvents(turn: string, events: readonly unknown[]) {
  const safe = events.map((event, index) => {
    const value = eventSchema.safeParse(event).data;
    const meta = value?.meta;
    const data = value?.data;
    return {
      index,
      turn,
      type: value?.type,
      id: meta?.id,
      at: meta?.at,
      turnId: value?.turnId ?? data?.turnId,
      stepIndex: value?.stepIndex ?? data?.stepIndex,
      sequence: value?.sequence ?? data?.sequence,
      actionStatus: data?.status,
      callId: data?.result?.callId,
    };
  });
  const line = `${JSON.stringify({ turn, events: safe })}\n`;
  mkdirSync(resolve(artifactPath, ".."), { recursive: true });
  if (turn === "first") writeFileSync(artifactPath, line);
  else appendFileSync(artifactPath, line);
}

function distinctTurnAndCallIds(
  firstEvents: readonly unknown[],
  secondEvents: readonly unknown[]
) {
  const first = idsFrom(firstEvents);
  const second = idsFrom(secondEvents);
  return first.turnId !== second.turnId && first.callId !== second.callId;
}

function idsFrom(events: readonly unknown[]) {
  for (const event of events) {
    const value = eventSchema.safeParse(event).data;
    const data = value?.data;
    const result = data?.result;
    if (value?.type !== "action.result" || !data || !result) continue;
    const turnId = data.turnId;
    const callId = result.callId;
    if (turnId && callId) return { callId, turnId };
  }
  return {};
}
