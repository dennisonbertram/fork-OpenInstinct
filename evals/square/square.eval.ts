import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import type { MessageStreamEvent } from "eve/client";
import type { EveEvalToolCall } from "eve/evals";
import { sendMessageOutputSchema } from "@/agent/lib/send-message";
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

/**
 * The agent answers through `send_message` (one call = one iMessage bubble)
 * and ends its turn with the `DELIVERY_COMPLETE` marker, so grade the
 * delivered bubbles rather than the final assistant text.
 */
export function deliveredText(calls: readonly EveEvalToolCall[]): string {
  return calls
    .flatMap((call) => {
      const parsed = sendMessageOutputSchema.safeParse(call.input);
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
      // A non-Linq fixture answers in the assistant text instead.
      const delivered =
        deliveries.length > 0 ? deliveredText(deliveries) : (t.reply ?? "");
      const bubbles = deliveries.length > 0 ? deliveries.length : 1;

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
