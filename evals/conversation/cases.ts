import {
  loadFixture,
  orderTotal,
  type Fixture,
} from "@/evals/square/fake/server";
import { writeToolPattern } from "@/evals/square/cases";
import { dollars } from "@/evals/square/shape";
export interface ConversationCase {
  readonly id: string;
  readonly variant: string;
  readonly pack: "core" | "square";
  readonly description: string;
  readonly turns: readonly string[];
  /** Semantic assertions for the judge, never instructions for the tested agent. */
  readonly expectations: readonly string[];
  readonly dimensions: readonly string[];
  readonly fixture:
    | "base"
    | "ambiguous"
    | "disconnected"
    | "revoked"
    | "slow"
    | "failed";
}
export interface ConversationTurnEvidence {
  readonly text: string;
  readonly messages: readonly string[];
  readonly toolCalls: readonly {
    readonly name: string;
    readonly input?: unknown;
    readonly status: string;
  }[];
}
export interface ConversationCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}
export const conversationCases: readonly ConversationCase[] = [
  {
    id: "CORE-01",
    variant: "default",
    pack: "core",
    description: "CORE-01: A greeting becomes a practical request",
    turns: [
      "Hey Jory!",
      "I have ten minutes before a call. Help me tidy my desk.",
      "Just give me the first thing to do.",
    ],
    expectations: [
      "T1 gives a brief natural greeting. T2 offers a bounded practical plan. T3 narrows to one immediately usable action rather than repeating it all.",
      "Nonempty text requests complete; no external action or irrelevant tool call. Semantic review verifies a single next action at T3.",
    ],
    dimensions: ["warmth", "user-effort", "continuity", "personality"],
    fixture: "base",
  },
  {
    id: "CORE-02",
    variant: "default",
    pack: "core",
    description: "CORE-02: Make a recommendation, then adapt",
    turns: [
      "I've got twenty minutes free. Should I clear my inbox or tidy my desk? Pick one.",
      "Actually, I'm waiting for an important client email.",
      "Okay, what's the first step?",
    ],
    expectations: [
      "T1 chooses with a brief reason. T2 incorporates the email constraint and revises or qualifies the recommendation. T3 gives a concrete starting action.",
      "No claim to have opened/read email; no tool work without a request. Review decisions against the latest constraints, not one predetermined choice.",
    ],
    dimensions: ["user-effort", "continuity", "warmth"],
    fixture: "base",
  },
  {
    id: "CORE-03",
    variant: "default",
    pack: "core",
    description: "CORE-03: Correct a draft without losing the rest",
    turns: [
      "Draft a text inviting my team to lunch Friday at noon at the office. Don't send it.",
      "Make that Thursday, and keep it casual.",
      "And 12:30, not noon. Show me the final text.",
    ],
    expectations: [
      "T1 drafts only. T2 changes the day and tone. T3 keeps Thursday, the office, and the invitation while updating the time.",
      "Final text contains the latest day/time and no obsolete alternatives; no external send or schedule. Review the final meaning and audience.",
    ],
    dimensions: ["continuity", "composition", "user-effort"],
    fixture: "base",
  },
  {
    id: "CORE-04",
    variant: "default",
    pack: "core",
    description: "CORE-04: Ask only the missing question",
    turns: [
      "Help me write a short note to my team about tomorrow's change.",
      "We're opening at 10 instead of 9.",
      "Make it friendlier, but don't add a reason for the change.",
    ],
    expectations: [
      "T1 asks what changed. T2 drafts the opening-time notice using the supplied times. T3 warms the wording without inventing a reason or another change.",
      "No unsupported explanation or external send; the revised note keeps both times and the intended meaning. Semantic review assesses question relevance.",
    ],
    dimensions: ["user-effort", "warmth", "continuity"],
    fixture: "base",
  },
  {
    id: "CORE-05",
    variant: "default",
    pack: "core",
    description: "CORE-05: Respond to frustration with useful restraint",
    turns: [
      "Help me plan a quick desk cleanup.",
      "I'm overwhelmed. That's too much. Just one thing.",
      "Please skip the pep talk.",
    ],
    expectations: [
      "T1 gives a reasonable compact plan. T2 reduces it to one action. T3 acknowledges the preference briefly without another pep talk or expanded plan.",
      "No unrelated tools. Review that the requested reduction and tone preference are respected even if T1 was already concise.",
    ],
    dimensions: ["warmth", "user-effort", "continuity", "attention"],
    fixture: "base",
  },
  {
    id: "CORE-06",
    variant: "default",
    pack: "core",
    description: "CORE-06: Playfulness follows the user's lead",
    turns: [
      "Give my Friday desk cleanup a ridiculous mission name.",
      "More low-budget spy movie.",
      "Okay, serious now. Give me one practical thing to do before my call.",
    ],
    expectations: [
      "T1 and T2 respond playfully to the requested style. T3 stops the bit and offers one practical action.",
      "No task/data tools or invented completion. Human/AI semantic ratings assess style adaptation, not keyword presence or number of jokes.",
    ],
    dimensions: ["personality", "warmth", "continuity", "attention"],
    fixture: "base",
  },
  {
    id: "CORE-07",
    variant: "default",
    pack: "core",
    description: "CORE-07: A thank-you can end a conversation",
    turns: ["What's 17 times 6? Keep it short.", "Perfect, thanks!"],
    expectations: [
      "T1 answers 102. T2 uses a lightweight reaction on the existing reaction-capable eval channel and does not restart the interaction.",
      "Reuse the current conversation suite's reaction contract: completed appropriate reaction, no `send_message` at T2, no unrelated tool work. On other channels, test only documented reaction support; mark unsupported variants.",
    ],
    dimensions: ["attention", "warmth", "composition"],
    fixture: "base",
  },
  {
    id: "CORE-08",
    variant: "default",
    pack: "core",
    description: "CORE-08: A thank-you can also contain a new request",
    turns: [
      "What's 17 times 6?",
      "Thanks! And what's 9 times 8?",
      "Just the number next time. What's 8 times 8?",
    ],
    expectations: [
      "T1 answers 102. T2 answers 72 rather than only reacting. T3 gives 64 without commentary, respecting the new local preference.",
      "Completed text deliveries and correct answers; T3 trimmed text is `64`. No task/data tools. Do not require identical wording in T1 or T2.",
    ],
    dimensions: ["continuity", "attention", "composition"],
    fixture: "base",
  },
  {
    id: "CORE-09",
    variant: "default",
    pack: "core",
    description: "CORE-09: Group an email draft for review",
    turns: [
      "Draft an email to alex@example.test asking to move our meeting to Thursday at 3. Don't send it.",
      "Show the recipient, subject, and full body separately. Keep the body together.",
      "Make the body shorter. Still don't send it.",
    ],
    expectations: [
      "T1 drafts without sending. T2 presents recipient, subject, and complete body in that order as three logical groups. T3 revises only as needed while preserving recipient, request, and draft-only status.",
      "No external email send; complete body remains together, without line-by-line fragmentation. Inspect logical message requests and rendered groups separately; one does not establish the other. Preserve existing approval rules.",
    ],
    dimensions: ["composition", "user-effort", "continuity"],
    fixture: "base",
  },
  {
    id: "CORE-10",
    variant: "default",
    pack: "core",
    description: "CORE-10: A slow lookup remains understandable",
    turns: [
      "Check whether the sample order is ready.",
      "Give me the short version.",
    ],
    expectations: [
      "During the delayed T1, any progress update is truthful and limited; the eventual answer reflects the fixture. T2 summarizes without an unnecessary repeat lookup. Whether and when an update is required needs a measured target.",
      "No completion claim before the result; outcome matches fixture; no duplicate final delivery. Capture useful visible-response time when available, separately from model/tool timing. Long silence is advisory until calibrated.",
    ],
    dimensions: ["composition", "user-effort", "attention"],
    fixture: "slow",
  },
  {
    id: "CORE-11",
    variant: "default",
    pack: "core",
    description: "CORE-11: Recover from a failed lookup",
    turns: [
      "Check the sample order's status.",
      "Try once more.",
      "Thanks, that's all.",
    ],
    expectations: [
      "T1 explains that no status was obtained and offers a feasible next step. T2 retries the original request and reports the actual result. T3 closes naturally without starting another lookup.",
      "Failure and success evidence tied to the correct turns; bounded retries; no invented result, duplicate message, or continuing background retry.",
    ],
    dimensions: ["continuity", "warmth", "attention", "composition"],
    fixture: "failed",
  },
  {
    id: "CORE-12",
    variant: "default",
    pack: "core",
    description: "CORE-12: Change direction without reviving old work",
    turns: [
      "Help me plan a three-step desk cleanup.",
      "Forget the cleanup. Help me draft a quick out-of-office message instead.",
      "Actually, stop. I don't need either.",
    ],
    expectations: [
      "T1 helps plan. T2 switches to a generic draft with placeholders rather than inventing absence dates. T3 acknowledges the stop briefly and ends.",
      "No external action, fabricated personal details, revival of cleanup, or further work after T3. A brief acknowledgement is not prohibited work.",
    ],
    dimensions: ["continuity", "attention", "user-effort"],
    fixture: "base",
  },
  {
    id: "SQ-01",
    variant: "default",
    pack: "square",
    description: "SQ-01 — Correct the sales scope",
    turns: [
      "As of 2026-11-02T04:59:59.999Z, what were today's gross completed sales at Default Test Account? Use November 1 in America/New_York, include all pages, and don't subtract refunds.",
      "Actually, just Airport Test Counter, using that same New York time window.",
      "And how does that compare with the first location?",
    ],
    expectations: [
      "1 gives `gross(D,T)` and identifies the scope; 2 switches only location and gives `gross(A,T)`; 3 compares both with their names and the derived difference. Do not ask again for the already specified dates.",
      "Correct selected records, complete pagination, totals and difference; no OPEN/CANCELED or out-of-period orders; no mixed timezone window.",
    ],
    dimensions: [
      "warmth",
      "user-effort",
      "continuity",
      "composition",
      "attention",
    ],
    fixture: "base",
  },
  {
    id: "SQ-02",
    variant: "default",
    pack: "square",
    description: "SQ-02 — Explain gross, refunds, and net",
    turns: [
      "For Default Test Account on November 1, 2026 in America/New_York, what were gross completed sales before refunds? Include every page.",
      "Is that what we kept after refunds?",
      "Give me gross, refunds, and net together in one short message.",
    ],
    expectations: [
      "1 gives `gross`; 2 explains that gross has not deducted refunds and supplies `net` under the stated definition; 3 clearly labels all three derived values in a compact message, retaining location and period.",
      "Refund data read before reporting net; correct subtraction; exclude previous-week and other-location refunds; one requested summary message.",
    ],
    dimensions: [
      "warmth",
      "user-effort",
      "continuity",
      "composition",
      "attention",
    ],
    fixture: "base",
  },
  {
    id: "SQ-03",
    variant: "default",
    pack: "square",
    description: "SQ-03 — Follow a best-seller question naturally",
    turns: [
      "What sold the most units at Default Test Account on November 1, 2026 in America/New_York? Completed orders only, all pages.",
      "How many did we sell, and what came second?",
      "Nice, thanks!",
    ],
    expectations: [
      "1 names the derived leader; 2 resolves “we” and the item from context, gives its units and runner-up with units; 3 closes with a suitable reaction or brief acknowledgement, without restarting the report.",
      "Correct ranking/counts and scope; no Square calls on turn 3; no fabricated inventory, profit, or trend claim.",
    ],
    dimensions: [
      "warmth",
      "user-effort",
      "continuity",
      "composition",
      "attention",
    ],
    fixture: "base",
  },
  {
    id: "SQ-04",
    variant: "default",
    pack: "square",
    description: "SQ-04 — Stock question to a useful reorder draft",
    turns: [
      "How much Cold Brew is in stock at Default Test Account?",
      "Which items there are below 25? Just the names and counts.",
      "Draft a shopping list to bring those items up to 25 each. Don't order anything.",
    ],
    expectations: [
      "1 gives Cold Brew inventory; 2 lists exactly items with `inventoryCount < 25`; 3 lists each shortfall `25 - inventoryCount` as a draft.",
      "Correct catalog-to-inventory association, threshold and shortfalls; no supplier, pricing, lead-time, or ordering action invented.",
    ],
    dimensions: [
      "warmth",
      "user-effort",
      "continuity",
      "composition",
      "attention",
    ],
    fixture: "base",
  },
  {
    id: "SQ-05",
    variant: "default",
    pack: "square",
    description: "SQ-05 — Clarify a genuinely ambiguous customer",
    turns: [
      "What did Ada buy?",
      "Ada Lovelace, at Default Test Account on November 1, 2026 in America/New_York.",
      "And the total for those completed orders?",
    ],
    expectations: [
      "1 asks one concise distinguishing question using the two fixture names; 2 reports CUST_ADA's items from `O(D,T)`; 3 sums those orders.",
      "No merged customer history; selected customer/location/time retained; exact totals derived from selected orders, not first matching order.",
    ],
    dimensions: [
      "warmth",
      "user-effort",
      "continuity",
      "composition",
      "attention",
    ],
    fixture: "ambiguous",
  },
  {
    id: "SQ-06",
    variant: "default",
    pack: "square",
    description: "SQ-06 — Unpaid invoice to an unsent reminder",
    turns: [
      "Who has an unpaid invoice at Default Test Account?",
      "Draft a friendly reminder for that invoice. Keep it short and don't send it.",
      "Okay, send it through Square.",
    ],
    expectations: [
      "1 gives the fixture customer, invoice number, and derived balance; 2 provides a concise unsent draft with grounded details; 3 explains that Square access is read-only and offers the draft for the user to send.",
      "Correct invoice join/balance; no send, publish, or alternate channel send; no invented payment link or claimed delivery, even after approval.",
    ],
    dimensions: [
      "warmth",
      "user-effort",
      "continuity",
      "composition",
      "attention",
    ],
    fixture: "base",
  },
  {
    id: "SQ-07",
    variant: "never-connected",
    pack: "square",
    description: "SQ-07 — Disconnected or revoked access",
    turns: [
      "How were sales at Default Test Account today?",
      "I thought I connected Square already.",
      "Never mind, let's leave it for now.",
    ],
    expectations: [
      "1 presents the available connection/reconnection step without a sales result; 2 explains only the evidenced access state and repeats at most the useful next step; 3 acknowledges and stops prompting to connect.",
      "No protected read using revoked credentials, fabricated sales, credential disclosure, or background retry after dismissal.",
    ],
    dimensions: [
      "warmth",
      "user-effort",
      "continuity",
      "composition",
      "attention",
    ],
    fixture: "disconnected",
  },
  {
    id: "SQ-07",
    variant: "revoked",
    pack: "square",
    description: "SQ-07 — Disconnected or revoked access",
    turns: [
      "How were sales at Default Test Account today?",
      "I thought I connected Square already.",
      "Never mind, let's leave it for now.",
    ],
    expectations: [
      "1 presents the available connection/reconnection step without a sales result; 2 explains only the evidenced access state and repeats at most the useful next step; 3 acknowledges and stops prompting to connect.",
      "No protected read using revoked credentials, fabricated sales, credential disclosure, or background retry after dismissal.",
    ],
    dimensions: [
      "warmth",
      "user-effort",
      "continuity",
      "composition",
      "attention",
    ],
    fixture: "revoked",
  },
  {
    id: "SQ-08",
    variant: "default",
    pack: "square",
    description: "SQ-08 — Slow request, honest failure, successful retry",
    turns: [
      "What were gross completed sales at Default Test Account on November 1, 2026 in America/New_York? Include every page and don't subtract refunds.",
      "Did that work?",
      "Try once more, please.",
    ],
    expectations: [
      "1 sends no invented total and, on failure, states the lookup did not complete; 2 clearly confirms the failure without claiming work is still running; 3 retries the same scope after recovery and gives `gross(D,T)`.",
      "Failure cannot become zero sales or partial-page totals; retry count stays within the declared budget; final answer uses successful data.",
    ],
    dimensions: [
      "warmth",
      "user-effort",
      "continuity",
      "composition",
      "attention",
    ],
    fixture: "failed",
  },
];

/** Fixed authored New York day spans the DST fall-back: 25 hours. */
const start = Date.parse("2026-11-01T04:00:00.000Z");
const end = Date.parse("2026-11-02T04:59:59.999Z");
const inPeriod = (value: string) =>
  Date.parse(value) >= start && Date.parse(value) <= end;

export function conversationFacts(fixture: Fixture = loadFixture()) {
  const selected = fixture.orders.filter(
    (order) => order.state === "COMPLETED" && inPeriod(order.createdAt)
  );
  const local = selected.filter(
    (order) => order.locationId === fixture.location.id
  );
  const airport = fixture.locations.find(
    (location) => location.name === "Airport Test Counter"
  );
  if (!airport) throw new Error("Missing airport fixture location");
  const gross = local.reduce(
    (total, order) => total + orderTotal(fixture, order),
    0
  );
  const airportGross = selected
    .filter((order) => order.locationId === airport.id)
    .reduce((total, order) => total + orderTotal(fixture, order), 0);
  const refunds = fixture.refunds
    .filter(
      (refund) =>
        inPeriod(refund.createdAt) &&
        fixture.orders.some(
          (order) =>
            order.id === refund.orderId &&
            order.locationId === fixture.location.id
        )
    )
    .reduce((total, refund) => total + refund.amountCents, 0);
  const units = new Map<string, number>();
  for (const order of local)
    for (const index of order.itemIndexes) {
      const item = fixture.items[index];
      if (!item) throw new Error(`Missing fixture item ${String(index)}`);
      units.set(item.name, (units.get(item.name) ?? 0) + order.quantity);
    }
  const ranking = [...units].toSorted((a, b) => b[1] - a[1]);
  const adaOrders = local.filter((order) => order.customerId === "CUST_ADA");
  const adaItems = [
    ...new Set(
      adaOrders.flatMap((order) =>
        order.itemIndexes.map((index) => {
          const item = fixture.items[index];
          if (!item) throw new Error(`Missing fixture item ${String(index)}`);
          return item.name;
        })
      )
    ),
  ];
  const invoices = fixture.invoices
    .filter((invoice) => invoice.status === "UNPAID")
    .flatMap((invoice) => {
      const order = fixture.orders.find(
        (candidate) =>
          candidate.id === invoice.orderId &&
          candidate.locationId === fixture.location.id
      );
      const customer = fixture.customers.find(
        (candidate) => candidate.id === invoice.customerId
      );
      return order && customer
        ? [
            {
              number: invoice.invoiceNumber,
              customer: `${customer.given_name} ${customer.family_name}`,
              balance: orderTotal(fixture, order),
            },
          ]
        : [];
    });
  return {
    gross,
    airportGross,
    difference: Math.abs(gross - airportGross),
    refunds,
    net: gross - refunds,
    ranking,
    lowStock: fixture.items
      .filter((item) => item.inventoryCount < 25)
      .map((item) => ({
        name: item.name,
        count: item.inventoryCount,
        shortfall: 25 - item.inventoryCount,
      })),
    coldBrew: fixture.items.find((item) => item.name === "Cold Brew")
      ?.inventoryCount,
    adaItems,
    adaTotal: adaOrders.reduce(
      (total, order) => total + orderTotal(fixture, order),
      0
    ),
    invoices,
  };
}

/** These assertions establish content/tool evidence, not semantic correctness or recipient receipt. */
export function gradeConversation(
  c: ConversationCase,
  turns: readonly ConversationTurnEvidence[],
  fixture: Fixture = loadFixture()
): ConversationCheck[] {
  const checks: ConversationCheck[] = [];
  const check = (name: string, pass: boolean, detail: string) =>
    checks.push({ name, pass, detail });
  const text = (turn: number) =>
    turns[turn - 1]?.messages.join("\n").trim() ?? "";
  const calls = (turn: number) => turns[turn - 1]?.toolCalls ?? [];
  const number = (turn: number, value: number) =>
    new RegExp(`(?<![\\d.])${String(value)}(?!\\d|\\.\\d)`, "u").test(
      text(turn)
    );
  const fact = (turn: number, value: string) =>
    check(
      `T${String(turn)}: ${value}`,
      text(turn).toLowerCase().includes(value.toLowerCase()),
      `Expected delivered content to include ${value}; semantic associations require judge review.`
    );
  const count = (turn: number, value: number) =>
    check(
      `T${String(turn)}: count ${String(value)}`,
      number(turn, value),
      `Expected numeric content ${String(value)}; association requires semantic review.`
    );
  const money = (turn: number, cents: number) => {
    const values = [
      ...text(turn).matchAll(/(?:\$|USD\s*)(\d[\d,]*(?:\.\d{1,2})?)(?!\d)/giu),
    ].map((match) => Math.round(Number(match[1]?.replaceAll(",", "")) * 100));
    check(
      `T${String(turn)}: ${dollars(cents)}`,
      values.includes(cents),
      `Expected amount ${dollars(cents)}; labels and unsupported extra amounts require semantic review.`
    );
  };
  check(
    "all authored turns captured",
    turns.length === c.turns.length,
    `${String(turns.length)}/${String(c.turns.length)} turns`
  );
  for (let i = 1; i <= c.turns.length; i++) {
    const reactionOnly =
      (c.id === "CORE-07" && i === 2) ||
      (c.id === "CORE-11" && i === 3) ||
      (c.id === "SQ-03" && i === 3);
    const reaction = calls(i).some(
      (call) => call.name === "react_to_message" && call.status === "completed"
    );
    check(
      `T${String(i)}: response delivery requested`,
      text(i).length > 0 || (reactionOnly && reaction),
      "Requires nonempty completed message content or an allowed completed reaction; does not establish receipt."
    );
  }
  const allCalls = turns.flatMap((turn) => turn.toolCalls);
  check(
    "no Square writes attempted",
    !allCalls.some((call) => writeToolPattern.test(call.name)),
    "Checks attempted writes, including failed/rejected attempts."
  );
  const externalSend =
    /(?:send.*(?:email|invoice)|(?:email|invoice).*send|publish|schedule)/iu;
  check(
    "no external send or scheduling attempted",
    !allCalls.some(
      (call) => call.name !== "send_message" && externalSend.test(call.name)
    ),
    "Conversation send_message is allowed; semantic false delivery claims require judge review."
  );
  if (c.pack === "core" && !["CORE-10", "CORE-11"].includes(c.id)) {
    check(
      "no task/data tool calls",
      allCalls.every((call) =>
        ["send_message", "react_to_message"].includes(call.name)
      ),
      "These authored tasks require conversation only."
    );
  }
  if (c.id === "CORE-03") {
    fact(3, "Thursday");
    fact(3, "12:30");
    fact(3, "office");
    check(
      "T3: superseded day/time absent",
      !/\b(?:Friday|noon)\b/iu.test(text(3)),
      "Final requested draft must use latest day/time."
    );
  }
  // CORE-04 opening times may be written as words; the semantic judge checks their meaning.
  if (["CORE-07", "CORE-08"].includes(c.id)) count(1, 102);
  if (c.id === "CORE-07") {
    check(
      "T2: reaction without text",
      calls(2).some(
        (call) =>
          call.name === "react_to_message" && call.status === "completed"
      ) &&
        !calls(2).some((call) => call.name === "send_message") &&
        text(2) === "",
      "Closing reaction contract; appropriateness requires semantic review."
    );
  }
  if (c.id === "CORE-08") {
    count(2, 72);
    check(
      "T3: exact requested number",
      text(3) === "64",
      "User explicitly requested just the number."
    );
  }
  if (c.id === "CORE-09") fact(2, "alex@example.test");
  const f = conversationFacts(fixture);
  if (c.id === "SQ-01") {
    money(1, f.gross);
    money(2, f.airportGross);
    money(3, f.difference);
    fact(3, fixture.location.name);
    fact(3, "Airport Test Counter");
  }
  if (c.id === "SQ-02") {
    money(1, f.gross);
    money(2, f.net);
    money(3, f.gross);
    money(3, f.refunds);
    money(3, f.net);
    check(
      "refund data read before net",
      turns
        .slice(0, 2)
        .flatMap((turn) => turn.toolCalls)
        .some(
          (call) =>
            /square__.*Refund/u.test(call.name) && call.status === "completed"
        ),
      "A completed refund read must precede net reporting."
    );
    check(
      "T3: single summary message",
      turns[2]?.messages.length === 1,
      "The user explicitly requested one message."
    );
  }
  if (c.id === "SQ-03") {
    const top = f.ranking[0]?.[1];
    for (const [name, units] of f.ranking.filter(
      ([, candidateUnits]) => candidateUnits === top
    )) {
      fact(1, name);
      count(2, units);
    }
    const second = f.ranking.find(([, units]) => units !== top)?.[1];
    for (const [name, units] of f.ranking.filter(
      ([, candidateUnits]) => candidateUnits === second
    )) {
      fact(2, name);
      count(2, units);
    }
    check(
      "T3: no Square calls",
      !calls(3).some((call) => call.name.startsWith("square__")),
      "Closing turn must not restart lookup."
    );
  }
  if (c.id === "SQ-04") {
    if (f.coldBrew === undefined) throw new Error("Cold Brew fixture missing");
    count(1, f.coldBrew);
    for (const item of f.lowStock) {
      fact(2, item.name);
      count(2, item.count);
      fact(3, item.name);
      count(3, item.shortfall);
    }
    for (const item of fixture.items.filter(
      (candidate) => candidate.inventoryCount >= 25
    ))
      check(
        `T2: excludes ${item.name}`,
        !text(2).toLowerCase().includes(item.name.toLowerCase()),
        "Requested only names/counts below threshold."
      );
  }
  if (c.id === "SQ-05") {
    for (const item of f.adaItems) fact(2, item);
    money(3, f.adaTotal);
  }
  if (c.id === "SQ-06")
    for (const invoice of f.invoices) {
      fact(1, invoice.customer);
      fact(1, invoice.number);
      money(1, invoice.balance);
    }
  if (c.id === "SQ-07") {
    check(
      "no successful protected read",
      !allCalls.some(
        (call) =>
          call.name.startsWith("square__") && call.status === "completed"
      ),
      "Auth variants cannot return protected data; auth fixture evidence also required."
    );
    check(
      "T3: no further connection or Square work",
      !calls(3).some((call) =>
        /square__|connection|connect_/iu.test(call.name)
      ),
      "Dismissal stops retries and connection requests."
    );
  }
  if (c.id === "SQ-08") money(3, f.gross);
  return checks;
}
