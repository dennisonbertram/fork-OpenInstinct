import { defineEval, type EveEvalContext } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import { reactToMessageOutputSchema } from "@/agent/lib/react-to-message";
import {
  agentEvalTags,
  assertPlainTextDelivery,
  requireDeliveredText,
} from "@/evals/agent/shared";

const cases: readonly {
  description: string;
  prompt: string;
  verify(t: EveEvalContext, text: string): void;
}[] = [
  {
    description: "Answers a simple question directly and correctly",
    prompt: "What is 17 multiplied by 6? Keep it brief.",
    verify(t, text) {
      t.check(text, includes("102"));
    },
  },
  {
    description: "Makes a concise recommendation instead of hedging",
    prompt:
      "I have twenty minutes before my next call and feel tired. Should I take a short walk or start a nap? Make the call for me.",
    verify(t, text) {
      t.judge.autoevals
        .closedQA(
          "The response decisively recommends one option, gives a useful brief reason, and does not hide behind a balanced list.",
          { on: text }
        )
        .label("decisive recommendation")
        .atLeast(0.8);
    },
  },
  {
    description: "Explains its capabilities without architecture dumping",
    prompt: "What kinds of things can you help me get done?",
    verify(t, text) {
      t.judge.autoevals
        .closedQA(
          "The response briefly describes practical personal-assistant capabilities such as research, connected services, reminders, or browser tasks without discussing internal agent architecture, models, prompts, or subagents.",
          { on: text }
        )
        .label("user-facing capability explanation")
        .atLeast(0.8);
    },
  },
  {
    description: "Condenses research into a useful iMessage recommendation",
    prompt: `You already found these showtimes for Spider-Man: Brand New Day tomorrow near Needham:
Showcase Legacy Place in Dedham, 4.6 miles away: 5:15 PM, 6:00 PM XPlus, 8:45 PM, 9:45 PM XPlus. The live seat map confirms the 6:00 PM show is available. Ticket link: https://tickets.example/legacy-place/very-long-checkout-link
Showcase SuperLux in Chestnut Hill, 5.2 miles away: 5:30 PM, 6:30 PM, 9:00 PM, 10:00 PM. Ticket link: https://tickets.example/superlux/very-long-checkout-link
West Newton Cinema, 5.2 miles away: 7:00 PM standard. Ticket link: https://tickets.example/west-newton/very-long-checkout-link
Nothing has been purchased. Tell me the useful result as you would in our normal conversation. I did not ask for every option or ticket link.`,
    verify(t, text) {
      t.check(text, includes("Legacy Place"));
      t.check(text, includes("6:00"));
      t.check(
        text,
        satisfies<string>(
          (value) =>
            value.length <= 400 &&
            value.split("\n").length <= 4 &&
            !/https?:\/\//u.test(value),
          "delivery is at most four compact lines and omits unrequested links"
        )
      );
      t.judge.autoevals
        .closedQA(
          "The response reads like a brief natural text message, leads with the 6:00 PM XPlus showing at Showcase Legacy Place as the best option, mentions that availability was confirmed and nothing was purchased, and does not dump the full research notes, every showtime, or multiple alternatives.",
          { on: text }
        )
        .label("concise research synthesis")
        .atLeast(0.8);
    },
  },
];

const textEvals = cases.map((testCase) =>
  defineEval({
    description: testCase.description,
    tags: [...agentEvalTags, "conversation", "smoke"],
    async test(t) {
      const turn = await t.send(testCase.prompt);
      turn.expectOk();
      turn.succeeded();
      turn.calledTool("send_message", { count: 1 });
      turn.notCalledTool("web_search");
      turn.notCalledTool("web_fetch");
      turn.notEvent("subagent.called", { data: { name: "browser-agent" } });
      turn.maxToolCalls(1);
      const text = await requireDeliveredText(t, turn);
      assertPlainTextDelivery(t, text);
      testCase.verify(t, text);
    },
  })
);

const reactionEvals = [
  defineEval({
    description: "Uses a reaction for a lightweight acknowledgement",
    tags: [...agentEvalTags, "conversation", "reaction", "smoke"],
    async test(t) {
      const answered = await t.send("What is 2 plus 2?");
      answered.expectOk();
      await requireDeliveredText(t, answered);

      const thanked = await t.send("perfect, thanks!");
      thanked.expectOk();
      thanked.succeeded();
      thanked.calledTool("react_to_message", {
        count: 1,
        input: (input) => {
          const parsed = reactToMessageOutputSchema.safeParse(input);
          return (
            parsed.success &&
            parsed.data.operation === "add" &&
            ["heart", "thumbs_up"].includes(parsed.data.type)
          );
        },
        status: "completed",
      });
      thanked.notCalledTool("send_message");
      thanked.maxToolCalls(1);
    },
  }),
  defineEval({
    description: "Uses text when an acknowledgement also asks a question",
    tags: [...agentEvalTags, "conversation", "reaction", "smoke"],
    async test(t) {
      const answered = await t.send("What is 2 plus 2?");
      answered.expectOk();
      await requireDeliveredText(t, answered);

      const followUp = await t.send("thanks! what is 9 multiplied by 8?");
      followUp.expectOk();
      followUp.succeeded();
      followUp.calledTool("send_message", { count: 1, status: "completed" });
      followUp.notCalledTool("react_to_message");
      followUp.maxToolCalls(1);
      const text = await requireDeliveredText(t, followUp);
      assertPlainTextDelivery(t, text);
      t.check(text, includes("72"));
    },
  }),
];

/**
 * Conversation-repair cases (tag `conversation-repair`), sourced from a repair
 * plan's acceptance matrix (JCR-01, JCR-02, JCR-05, JCR-06, JCR-07). These
 * check attribution and turn-taking behavior around real-time lookups and
 * background/subagent work, not arithmetic or wording alone.
 *
 * Two constraints from the plan shape how these are written:
 *
 * - No hardcoded live oracle. A real Tokyo clock reading or a real headline
 *   would go stale and make the eval flaky against reality, not the agent.
 *   Where the plan wants a specific fact checked, these cases instead assert
 *   the structural property that actually matters: a lookup tool ran before
 *   any acknowledgement, no second worker call happened on a follow-up turn,
 *   internal ids never leak into delivered text, etc. Wording quality (does
 *   the reply hedge appropriately, does it avoid a disclaimer dump) is left
 *   to `t.judge.autoevals.closedQA`, never to establish that a tool ran.
 * - No seam to seed background-task state directly. Unlike scheduled jobs
 *   (`evals/agent/scheduled-lifecycle.eval.ts`, which can call
 *   `createScheduledAgentJob` and dispatch a dev-only route), this repo has
 *   no service or dev route that seeds `agent/lib/completion-obligations.ts`
 *   state (cohorts, tasks, per-fact evidence kind) from outside a live
 *   session. That state is `defineState`-backed and only ever written by the
 *   real agent loop. So "older settled work owing a report" and "a worker's
 *   claim carries evidence kind X" are produced here by actually running a
 *   real subagent through natural instructions, not by injecting fixtures.
 *   Whether the framework privately tags a given claim `observed` vs.
 *   `worker_assertion` is not something a prompt can force or an eval can
 *   read back, so JCR-06 is checked at the only level that's actually
 *   observable to a user: does the delivered text state the corroborated
 *   fact plainly while keeping the uncorroborated one visibly hedged, on
 *   both the turn that reports it and the turn that recalls it.
 */

const jcr01 = defineEval({
  description:
    "JCR-01: performs the Tokyo lookup before acknowledging, then recalls the result without re-promising",
  tags: [...agentEvalTags, "conversation-repair"],
  async test(t) {
    const looked = await t.send(
      "Look up the current local time in Tokyo on a public website."
    );
    looked.expectOk();
    looked.succeeded();
    looked.calledTool("send_message", { count: 1 });

    // Hard structural check: a lookup action (web tool or a browsing
    // subagent) must appear in the stream before the send_message action
    // that delivers the acknowledgement -- a repeated promise standing in
    // for work would show send_message first with no prior lookup action.
    looked.eventsSatisfy(
      "a lookup action precedes the send_message action",
      (events) => {
        const lookupIndex = events.findIndex(
          (event) =>
            event.type === "actions.requested" &&
            event.data.actions.some(
              (action) =>
                (action.kind === "tool-call" &&
                  ["web_search", "web_fetch"].includes(action.toolName)) ||
                (action.kind === "subagent-call" &&
                  action.subagentName === "browser-agent")
            )
        );
        const sendIndex = events.findIndex(
          (event) =>
            event.type === "actions.requested" &&
            event.data.actions.some(
              (action) =>
                action.kind === "tool-call" &&
                action.toolName === "send_message"
            )
        );
        return (
          lookupIndex !== -1 && (sendIndex === -1 || lookupIndex < sendIndex)
        );
      }
    );

    const followUp = await t.send("What was the result?");
    followUp.expectOk();
    followUp.succeeded();
    followUp.calledTool("send_message", { count: 1 });
    followUp.notCalledTool("web_search");
    followUp.notCalledTool("web_fetch");
    followUp.notEvent("subagent.called");
    followUp.maxToolCalls(1);
    const text = await requireDeliveredText(t, followUp);
    assertPlainTextDelivery(t, text);
    t.judge.autoevals
      .closedQA(
        "The response states the Tokyo time result that was already looked up on the previous turn, or explicitly says the lookup failed. It does not merely repeat a promise to check or look it up again.",
        { on: text }
      )
      .label("recalls looked-up result without re-promising")
      .atLeast(0.8);
  },
});

const jcr02 = defineEval({
  description:
    "JCR-02: an unrelated question after settled-but-unreported background work runs once and stays on topic",
  tags: [...agentEvalTags, "conversation-repair"],
  async test(t) {
    const deferred = await t.send(
      "In the background, use the browser-agent subagent to check the primary heading on https://example.com. You do not need to tell me the result now -- I will ask for it later."
    );
    deferred.expectOk();
    deferred.succeeded();
    // Without this the case passes vacuously: if the model never delegates,
    // no report is ever owed and the second turn has nothing to be blocked by,
    // which is precisely the condition this case exists to exercise.
    deferred.calledSubagent("browser-agent", { count: 1 });
    await requireDeliveredText(t, deferred);

    const unrelated = await t.send("What is 15 percent of 240?");
    unrelated.expectOk();
    unrelated.succeeded();
    unrelated.calledTool("send_message", { count: 1, status: "completed" });
    unrelated.maxToolCalls(1);
    unrelated.notEvent("subagent.called");
    const text = await requireDeliveredText(t, unrelated);
    assertPlainTextDelivery(t, text);
    t.check(text, includes("36"));
    t.check(
      text,
      satisfies<string>(
        (value) =>
          // The identifier that actually reached a person was
          // "turn_0/task_f13d217eb04bc1ab7c152c78". The previous guard looked
          // for `task` followed by a DIGIT, so it matched none of it: the
          // character after "task_" is a letter. These match the real shapes.
          !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/iu.test(value) &&
          !/\b(?:task|turn|cohort)_[0-9a-z]/iu.test(value) &&
          !/\btask\s*\d/iu.test(value) &&
          !/\bcohort\b/iu.test(value),
        "no internal task/cohort ids or jargon leak into an unrelated answer"
      )
    );
    t.judge.autoevals
      .closedQA(
        "The response answers only the percentage question. It does not recite the earlier background browsing request, its status, or any disclaimer about pending work.",
        { on: text }
      )
      .label("unrelated answer stays on topic")
      .atLeast(0.8);
  },
});

const jcr05 = defineEval({
  description:
    "JCR-05: attribution for a worker's reported title survives a later turn with no re-verification claim",
  tags: [...agentEvalTags, "conversation-repair"],
  async test(t) {
    const reported = await t.send(
      "Use the browser-agent subagent to open https://example.com and tell me the exact primary heading. Just report what it says -- do not take any further action or try to confirm anything else about the page."
    );
    reported.expectOk();
    reported.succeeded();
    reported.calledSubagent("browser-agent", { status: "completed", count: 1 });
    await requireDeliveredText(t, reported);

    const followUp = await t.send("What happened with that?");
    followUp.expectOk();
    followUp.succeeded();
    followUp.notEvent("subagent.called");
    followUp.maxToolCalls(1);
    const text = await requireDeliveredText(t, followUp);
    assertPlainTextDelivery(t, text);
    t.judge.autoevals
      .closedQA(
        "The response reports what the worker found without adding any claim the worker itself did not make -- specifically no assertion that the page was verified, that opening it definitely succeeded beyond what was reported, or that there were no blockers or submissions. It does not dispatch a new browsing task to re-check.",
        { on: text }
      )
      .label("attribution survives without new claims")
      .atLeast(0.8);
  },
});

const jcr06 = defineEval({
  description:
    "JCR-06: a corroborated title is stated plainly while an uncorroborated submission stays hedged on both turns",
  tags: [...agentEvalTags, "conversation-repair"],
  async test(t) {
    const reported = await t.send(
      "Use the browser-agent subagent to open https://example.com, tell me the exact primary heading, and also try clicking a submit or contact button if one exists. Report the heading plainly, but be clear you cannot confirm whether any submission actually went through."
    );
    reported.expectOk();
    reported.succeeded();
    reported.calledSubagent("browser-agent", { status: "completed", count: 1 });
    const firstText = await requireDeliveredText(t, reported);
    assertPlainTextDelivery(t, firstText);
    t.judge.autoevals
      .closedQA(
        "The response states the page heading as a plain fact, but treats any submission or form-click as unconfirmed -- using hedging language rather than asserting it succeeded.",
        { on: firstText }
      )
      .label("title stated plainly, submission hedged (first report)")
      .atLeast(0.8);

    const followUp = await t.send("What was the result?");
    followUp.expectOk();
    followUp.succeeded();
    followUp.notEvent("subagent.called");
    followUp.maxToolCalls(1);
    const text = await requireDeliveredText(t, followUp);
    assertPlainTextDelivery(t, text);
    t.judge.autoevals
      .closedQA(
        "The response still states the previously reported heading plainly, and still does not claim the submission was confirmed, verified, or definitely succeeded -- the submission claim stays exactly as uncertain as it was on the first report, with no new browsing task dispatched.",
        { on: text }
      )
      .label("submission stays uncorroborated on recall")
      .atLeast(0.8);
  },
});

const jcr07 = defineEval({
  description:
    "JCR-07: an unrelated question and a lightweight thanks after delivered work skip the recital",
  tags: [...agentEvalTags, "conversation-repair"],
  async test(t) {
    const delivered = await t.send(
      "Use the browser-agent subagent to visually inspect https://example.com and report the exact primary heading."
    );
    delivered.expectOk();
    delivered.succeeded();
    delivered.calledSubagent("browser-agent", {
      status: "completed",
      count: 1,
    });
    await requireDeliveredText(t, delivered);

    const unrelated = await t.send("What is 9 multiplied by 7?");
    unrelated.expectOk();
    unrelated.succeeded();
    unrelated.calledTool("send_message", { count: 1, status: "completed" });
    unrelated.maxToolCalls(1);
    unrelated.notEvent("subagent.called");
    const unrelatedText = await requireDeliveredText(t, unrelated);
    assertPlainTextDelivery(t, unrelatedText);
    t.check(unrelatedText, includes("63"));
    t.judge.autoevals
      .closedQA(
        "The response answers only the multiplication question. It does not repeat or summarize the earlier browsing report.",
        { on: unrelatedText }
      )
      .label("unrelated answer skips the recital")
      .atLeast(0.8);

    const thanked = await t.send("perfect, thanks!");
    thanked.expectOk();
    thanked.succeeded();
    thanked.calledTool("react_to_message", {
      count: 1,
      input: (input) => {
        const parsed = reactToMessageOutputSchema.safeParse(input);
        return (
          parsed.success &&
          parsed.data.operation === "add" &&
          ["heart", "thumbs_up"].includes(parsed.data.type)
        );
      },
      status: "completed",
    });
    thanked.notCalledTool("send_message");
    thanked.maxToolCalls(1);
  },
});

const conversationRepairEvals = [jcr01, jcr02, jcr05, jcr06, jcr07];

export default [...textEvals, ...reactionEvals, ...conversationRepairEvals];
