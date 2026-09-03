import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import type { MessageStreamEvent } from "eve/client";
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

export default squareCases.map((squareCase) =>
  defineEval({
    description: squareCase.prompt,
    tags: ["square"],
    async test(t) {
      await t.send(squareCase.prompt);
      t.succeeded();

      for (const tool of squareCase.expectTools) {
        t.calledTool(tool);
      }
      t.eventsSatisfy(
        `no tool call matches ${squareCase.forbidTools.source}`,
        (events) =>
          !calledToolNames(events).some((name) =>
            squareCase.forbidTools.test(name)
          )
      );

      const reply = await t.require(
        t.reply,
        satisfies(
          (value): boolean => value !== null,
          "the agent produced a reply"
        )
      );
      const text = reply ?? "";

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

      const gate = bubbleGate(text, squareCase.layout);
      t.log(
        `bubbles=${String(gate.bubbles)}${gate.note ? ` (${gate.note})` : ""}`
      );
      t.check(
        gate.bubbles,
        satisfies(() => gate.ok, gate.note ?? "shape ok")
      );

      t.judge.autoevals.closedQA(squareCase.tone).atLeast(0.7);
    },
  })
);
