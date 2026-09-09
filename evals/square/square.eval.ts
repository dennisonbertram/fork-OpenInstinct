import { z } from "zod";
import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import type { MessageStreamEvent } from "eve/client";
import type { EveEvalToolCall } from "eve/evals";
import { sendMessageInputSchema } from "@/agent/lib/send-message";
import { loadSquareFixture, squareCases } from "@/evals/square/cases";
import { bubbleGate } from "@/evals/square/shape";

const fixture = loadSquareFixture();

function calledToolNames(events: readonly MessageStreamEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === "actions.requested"
      ? event.data.actions.flatMap((action) =>
          action.kind === "tool-call" ? [action.toolName] : []
        )
      : []
  );
}

const searchOrdersActionSchema = z.object({
  body: z.object({
    location_ids: z.array(z.string()).optional(),
  }),
});
type DeliveredMessageTexts = readonly string[];

function searchOrderLocationScopes(
  events: readonly MessageStreamEvent[]
): readonly (readonly string[] | undefined)[] {
  return events.flatMap((event) =>
    event.type === "actions.requested"
      ? event.data.actions.flatMap((action) => {
          if (
            action.kind !== "tool-call" ||
            action.toolName !== "square__SearchOrders"
          )
            return [];
          const parsed = searchOrdersActionSchema.safeParse(action.input);
          return parsed.success ? [parsed.data.body.location_ids] : [undefined];
        })
      : []
  );
}

const searchOrdersInputSchema = z.object({
  body: z.object({
    cursor: z.string().optional(),
  }),
});

const searchOrdersOutputSchema = z.object({
  cursor: z.string().optional(),
  body: z.object({ cursor: z.string().optional() }).optional(),
});

function cursorInOutput(value: EveEvalToolCall["output"]): string | undefined {
  const parsed = searchOrdersOutputSchema.safeParse(value);
  if (!parsed.success) return undefined;
  return parsed.data.cursor ?? parsed.data.body?.cursor;
}

function searchOrdersDrainCursor(calls: readonly EveEvalToolCall[]): boolean {
  const searchCalls = calls.filter(
    (call) => call.name === "square__SearchOrders"
  );
  return searchCalls.every((call, index) => {
    const nextCursor = cursorInOutput(call.output);
    if (!nextCursor) return true;
    return searchCalls.slice(index + 1).some((nextCall) => {
      const parsed = searchOrdersInputSchema.safeParse(nextCall.input);
      return parsed.success && parsed.data.body.cursor === nextCursor;
    });
  });
}

/**
 * The agent answers through `send_message` (one call = one iMessage bubble)
 * and ends its turn with the `DELIVERY_COMPLETE` marker, so grade the
 * delivered bubbles rather than the final assistant text.
 */
const reactionInputSchema = z.object({
  operation: z.literal("add"),
  type: z.string(),
});

export function deliveredText(calls: readonly EveEvalToolCall[]): string {
  return calls
    .flatMap((call) => {
      const parsed = sendMessageInputSchema.safeParse(call.input);
      if (!parsed.success || parsed.data.kind !== "message") return [];
      return parsed.data.text ? [parsed.data.text] : [];
    })
    .join("\n\n");
}

export default squareCases.map((squareCase) =>
  defineEval({
    description: squareCase.prompt,
    tags: ["square"],
    async test(t) {
      const turn = await t.send(squareCase.prompt);
      t.succeeded();

      for (const group of squareCase.expectTools) {
        t.eventsSatisfy(
          `at least one of [${group.join(", ")}] was called`,
          (events) =>
            calledToolNames(events).some((name) => group.includes(name))
        );
      }
      t.eventsSatisfy(
        `no tool call matches ${squareCase.forbidTools.source}`,
        (events) =>
          !calledToolNames(events).some((name) =>
            squareCase.forbidTools.test(name)
          )
      );

      const deliveries = turn.toolCalls.filter(
        (call) => call.name === "send_message"
      );
      const deliveredMessages = deliveries.flatMap((call) => {
        const parsed = sendMessageInputSchema.safeParse(call.input);
        return parsed.success &&
          parsed.data.kind === "message" &&
          parsed.data.text
          ? [parsed.data.text]
          : [];
      });
      t.check(
        deliveredMessages,
        satisfies(
          (messages: DeliveredMessageTexts) =>
            new Set(messages).size === messages.length,
          "does not repeat identical delivered message text"
        )
      );
      if (squareCase.sales) {
        const locationId = /\(([^()]+)\)$/u.exec(
          squareCase.sales.location
        )?.[1];
        if (locationId) {
          t.eventsSatisfy(
            "every SearchOrders page retains the selected location",
            (events) =>
              searchOrderLocationScopes(events).every(
                (locations) => locations?.includes(locationId) ?? false
              )
          );
        }
      }
      if (squareCase.requiresSearchOrderCursorDrain) {
        t.check(
          turn.toolCalls,
          satisfies(
            searchOrdersDrainCursor,
            "continues every SearchOrders cursor until exhausted"
          )
        );
      }
      // A Tapback (react_to_message) is a complete iMessage reply on its own,
      // for example a heart in answer to "Thanks!".
      const reactions = turn.toolCalls.flatMap((call) => {
        if (call.name !== "react_to_message") return [];
        const parsed = reactionInputSchema.safeParse(call.input);
        return parsed.success ? [`reacted with a ${parsed.data.type}`] : [];
      });
      // A non-Linq fixture answers in the assistant text instead.
      const delivered =
        deliveries.length > 0
          ? deliveredText(deliveries)
          : reactions.length > 0
            ? reactions.join("\n\n")
            : (t.reply ?? "");
      const bubbles = Math.max(deliveries.length, 1);

      await t.require(
        delivered,
        satisfies(
          (value): boolean => String(value).trim().length > 0,
          "the agent delivered text"
        )
      );
      // Models emit curly apostrophes ("can’t"); facts are typed straight.
      const text = delivered.replaceAll(/[‘’]/gu, "'");

      const facts = squareCase.facts(fixture);
      if (squareCase.factsMode === "any") {
        t.check(
          text,
          satisfies(
            (value) =>
              facts.some((fact) =>
                String(value).toLowerCase().includes(fact.toLowerCase())
              ),
            `includes one of: ${facts.join(", ")}`
          )
        );
      } else {
        for (const fact of facts) {
          t.check(text, includes(fact));
        }
      }

      const gate = bubbleGate(bubbles, text, squareCase.layout);
      t.log(
        `bubbles=${String(gate.bubbles)}${gate.note ? ` (${gate.note})` : ""}`
      );
      t.check(
        gate.bubbles,
        satisfies(() => gate.ok, gate.note ?? "shape ok")
      );

      t.judge.autoevals.closedQA(squareCase.tone, { on: text }).atLeast(0.7);
    },
  })
);
