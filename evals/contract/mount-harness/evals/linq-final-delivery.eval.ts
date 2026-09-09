import { defineEval, type EveEvalContext } from "eve/evals";
import { equals } from "eve/evals/expect";
import { z } from "zod";

const acceptedRouteSchema = z.object({ address: z.string().min(1) });
const sessionRouteSchema = z.object({ sessionId: z.string().min(1) });
const pendingDeliverySchema = z.object({
  callId: z.string().min(1),
  sessionId: z.string().min(1),
  stepIndex: z.number().int().nonnegative(),
  turnId: z.string().min(1),
});

export default defineEval({
  description:
    "A Linq provider ACK settles final delivery before the Eve loop reaches its next step.",
  tags: ["contract-mount"],
  async test(t) {
    const session = await sendLinqFixture(t, "linq-final-timeout");
    session.calledTool("send_message", { count: 1, status: "completed" });
    session.notEvent("turn.failed");
    session.eventOrder([
      { type: "action.result" },
      { type: "turn.completed" },
      { type: "session.waiting" },
    ]);

    const normal = await session.send("linq-final-normal");
    normal.succeeded();
    normal.calledTool("send_message", { count: 1, status: "completed" });
    normal.eventOrder([
      { type: "action.result" },
      { type: "turn.completed" },
      { type: "session.waiting" },
    ]);

    const repeated = await session.send("linq-final-normal");
    repeated.succeeded();
    repeated.calledTool("send_message", { count: 1, status: "completed" });
    repeated.eventOrder([
      { type: "action.result" },
      { type: "turn.completed" },
      { type: "session.waiting" },
    ]);

    const sourceError = await sendLinqFixture(t, "linq-source-error");
    sourceError.eventOrder([
      { type: "step.started" },
      { type: "step.failed" },
      { type: "turn.failed" },
      { type: "session.waiting" },
    ]);
    sourceError.notEvent("action.result");

    const rejected = await sendLinqFixture(t, "linq-final-rejected");
    rejected.calledTool("send_message", { count: 1, status: "completed" });
    rejected.eventOrder([
      { type: "action.result" },
      { type: "turn.failed" },
      { type: "session.waiting" },
    ]);
    rejected.notEvent("turn.completed");

    const progress = await sendLinqFixture(t, "linq-final-progress");
    progress.succeeded();
    progress.calledTool("send_message", { count: 2, status: "completed" });
    progress.event("action.result", { count: 2 });
    progress.eventOrder([
      { type: "action.result" },
      { type: "turn.completed" },
      { type: "session.waiting" },
    ]);

    const failedSibling = await sendLinqFixture(t, "linq-final-failed-sibling");
    failedSibling.event("action.result", { count: 2 });
    failedSibling.event("action.result", { data: { status: "failed" } });
    failedSibling.event("turn.failed");
    failedSibling.notEvent("turn.completed");

    const heldSuccess = await startLinqFixture(t, "linq-final-held-success");
    await heldSuccess.waitForEvent("actions.requested");
    await expectHeldWork(t, 1);
    const heldSuccessState = await waitForProviderState(heldSuccess.sessionId, {
      acknowledged: 1,
      attempts: 1,
      completed: 0,
      duplicateAttempts: 0,
      modelStepStarts: 1,
    });
    t.check(heldSuccessState.counts.requests, equals(1));
    await releaseHeldWork(t);
    const heldSuccessResult = await heldSuccess.result();
    heldSuccessResult.succeeded();
    heldSuccessResult.event("action.result", { count: 2 });
    heldSuccessResult.eventOrder([
      { type: "action.result" },
      { type: "turn.completed" },
      { type: "session.waiting" },
    ]);

    const heldFailure = await startLinqFixture(t, "linq-final-held-failure");
    await heldFailure.waitForEvent("actions.requested");
    await expectHeldWork(t, 1);
    await releaseHeldWork(t);
    const heldFailureResult = await heldFailure.result();
    heldFailureResult.event("action.result", { data: { status: "failed" } });
    heldFailureResult.event("turn.failed");
    heldFailureResult.notEvent("turn.completed");

    const heldCancellation = await startLinqFixture(
      t,
      "linq-final-held-cancel"
    );
    await heldCancellation.waitForEvent("actions.requested");
    await expectHeldWork(t, 1);
    await heldCancellation.cancel();
    const cancelled = await heldCancellation.result();
    cancelled.eventOrder([
      { type: "turn.cancelled" },
      { type: "session.waiting" },
    ]);
    cancelled.notEvent("turn.completed");
    await expectHeldWork(t, 0);
    const afterCancellation =
      await heldCancellation.session.send("linq-final-normal");
    afterCancellation.succeeded();
    afterCancellation.calledTool("send_message", {
      count: 1,
      status: "completed",
    });

    const heldAcknowledgementAddress = await beginLinqFixture(
      t,
      "linq-final-held-ack"
    );
    const heldAcknowledgementSessionId = await resolveLinqFixtureSession(
      t,
      heldAcknowledgementAddress
    );
    const heldDelivery = await waitForPendingProviderDelivery(
      heldAcknowledgementSessionId
    );
    const pendingAcknowledgement = await providerState(
      heldAcknowledgementSessionId
    );
    assertProviderState(pendingAcknowledgement, {
      attempts: 1,
      completed: 0,
      duplicateAttempts: 0,
      modelStepStarts: 1,
      pending: 1,
      waiters: 0,
    });
    t.check(heldDelivery.stepIndex, equals(0));
    t.check(heldDelivery.turnId.length > 0, equals(true));
    await releaseProviderAcknowledgement({
      callId: heldDelivery.callId,
      sessionId: heldDelivery.sessionId,
      turnId: heldDelivery.turnId,
    });
    const heldAcknowledgement = await t.target.attachSession(
      heldAcknowledgementSessionId
    );
    heldAcknowledgement.succeeded();
    heldAcknowledgement.eventOrder([
      { type: "action.result" },
      { type: "turn.completed" },
      { type: "session.waiting" },
    ]);
    heldAcknowledgement.notEvent("step.started", { data: { stepIndex: 1 } });
    const completedAcknowledgement = await waitForProviderState(
      heldAcknowledgementSessionId,
      {
        acknowledged: 1,
        attempts: 1,
        completed: 1,
        duplicateAttempts: 0,
        modelStepStarts: 1,
        pending: 0,
      }
    );
    t.check(completedAcknowledgement.counts.requests, equals(1));

    const cancelledAddress = await beginLinqFixture(
      t,
      "linq-final-held-ack-cancel"
    );
    const cancelledSessionId = await resolveLinqFixtureSession(
      t,
      cancelledAddress
    );
    const cancelledTurn = t.target.watchTurn(cancelledSessionId);
    const cancelledDelivery =
      await waitForPendingProviderDelivery(cancelledSessionId);
    const pendingCancelledAcknowledgement =
      await providerState(cancelledSessionId);
    assertProviderState(pendingCancelledAcknowledgement, {
      attempts: 1,
      completed: 0,
      duplicateAttempts: 0,
      modelStepStarts: 1,
      pending: 1,
      waiters: 0,
    });
    const cancelReceipt = await cancelledTurn.cancel();
    t.check(cancelReceipt.status, equals("accepted"));
    // Eve does not expose a channel-callback AbortSignal, so the provider can
    // still accept the held request after cancellation. Releasing this exact
    // response separates provider acceptance from turn completion eligibility.
    await releaseProviderAcknowledgement({
      callId: cancelledDelivery.callId,
      sessionId: cancelledDelivery.sessionId,
      turnId: cancelledDelivery.turnId,
    });
    const cancelledAckResult = await cancelledTurn.result();
    t.check(
      cancelledAckResult.events.some(
        (event) =>
          event.type === "turn.cancelled" || event.type === "turn.completed"
      ),
      equals(true)
    );
    const cancelledState = await waitForProviderState(cancelledSessionId, {
      acknowledged: 1,
      attempts: 1,
      duplicateAttempts: 0,
      pending: 0,
    });
    t.check(cancelledState.counts.requests, equals(1));
    t.check(
      cancelledState.deliveries.filter(
        (delivery) =>
          delivery.deliveryClass === "final" &&
          delivery.state === "acknowledged"
      ).length,
      equals(1)
    );
  },
});

async function sendLinqFixture(t: EveEvalContext, message: string) {
  const sessionId = await resolveLinqFixtureSession(
    t,
    await beginLinqFixture(t, message)
  );
  return t.target.attachSession(sessionId);
}

async function startLinqFixture(t: EveEvalContext, message: string) {
  const sessionId = await resolveLinqFixtureSession(
    t,
    await beginLinqFixture(t, message)
  );
  return t.target.watchTurn(sessionId);
}

async function beginLinqFixture(t: EveEvalContext, message: string) {
  const threadId = `final-delivery-${crypto.randomUUID()}`;
  const response = await t.target.fetch(`/contract-linq/${threadId}`, {
    body: JSON.stringify({ message }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  t.check(response.status, equals(200));
  const body = acceptedRouteSchema.parse(await response.json());
  return body.address;
}

async function resolveLinqFixtureSession(t: EveEvalContext, address: string) {
  return pollForSession(t, address, 0);
}

async function pollForSession(
  t: EveEvalContext,
  address: string,
  attempt: number
): Promise<string> {
  if (attempt >= 20) {
    throw new Error("The test-only Linq route did not create a session.");
  }
  const sessionResponse = await t.target.fetch(
    `/contract-linq/${address}/session`
  );
  if (sessionResponse.status === 200) {
    return sessionRouteSchema.parse(await sessionResponse.json()).sessionId;
  }
  t.check(sessionResponse.status, equals(202));
  await new Promise((resolve) => setTimeout(resolve, 5));
  return pollForSession(t, address, attempt + 1);
}

interface ProviderState {
  readonly counts: {
    readonly aborted: number;
    readonly acknowledged: number;
    readonly attempts: number;
    readonly duplicateAttempts: number;
    readonly pending: number;
    readonly rejected: number;
    readonly requests: number;
    readonly waiters: number;
  };
  readonly deliveries: readonly {
    readonly callId: string;
    readonly deliveryClass: "final" | "recovery";
    readonly state: "acknowledged" | "aborted" | "pending" | "rejected";
    readonly stepIndex: number;
    readonly turnId: string;
  }[];
  readonly notices: readonly {
    readonly sessionId: string;
    readonly stepIndex?: number;
    readonly turnId: string;
    readonly type:
      | "model.step.started"
      | "turn.cancelled"
      | "turn.completed"
      | "turn.failed";
  }[];
}

const providerStateSchema: z.ZodType<ProviderState> = z.object({
  counts: z.object({
    aborted: z.number().int().nonnegative(),
    acknowledged: z.number().int().nonnegative(),
    attempts: z.number().int().nonnegative(),
    duplicateAttempts: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    requests: z.number().int().nonnegative(),
    waiters: z.number().int().nonnegative(),
  }),
  deliveries: z.array(
    z.object({
      callId: z.string().min(1),
      deliveryClass: z.enum(["final", "recovery"]),
      state: z.enum(["acknowledged", "aborted", "pending", "rejected"]),
      stepIndex: z.number().int().nonnegative(),
      turnId: z.string().min(1),
    })
  ),
  notices: z.array(
    z.object({
      sessionId: z.string().min(1),
      stepIndex: z.number().int().nonnegative().optional(),
      turnId: z.string().min(1),
      type: z.enum([
        "model.step.started",
        "turn.cancelled",
        "turn.completed",
        "turn.failed",
      ]),
    })
  ),
});

type ProviderExpectation = Partial<ProviderState["counts"]> & {
  readonly completed?: number;
  readonly modelStepStarts?: number;
};

async function providerState(sessionId: string): Promise<ProviderState> {
  const providerUrl = await deliveryProviderUrl();
  const response = await fetch(
    `${providerUrl}/sessions/${encodeURIComponent(sessionId)}`
  );
  if (!response.ok) throw new Error("Contract provider state was unavailable.");
  return providerStateSchema.parse(await response.json());
}

function matchesProviderState(
  state: ProviderState,
  expected: ProviderExpectation
) {
  const actual = {
    ...state.counts,
    completed: state.notices.filter(
      (notice) => notice.type === "turn.completed"
    ).length,
    modelStepStarts: state.notices.filter(
      (notice) => notice.type === "model.step.started"
    ).length,
  };
  return (
    (expected.aborted === undefined || actual.aborted === expected.aborted) &&
    (expected.acknowledged === undefined ||
      actual.acknowledged === expected.acknowledged) &&
    (expected.attempts === undefined ||
      actual.attempts === expected.attempts) &&
    (expected.completed === undefined ||
      actual.completed === expected.completed) &&
    (expected.modelStepStarts === undefined ||
      actual.modelStepStarts === expected.modelStepStarts) &&
    (expected.duplicateAttempts === undefined ||
      actual.duplicateAttempts === expected.duplicateAttempts) &&
    (expected.pending === undefined || actual.pending === expected.pending) &&
    (expected.rejected === undefined ||
      actual.rejected === expected.rejected) &&
    (expected.requests === undefined || actual.requests === expected.requests)
  );
}

function assertProviderState(
  state: ProviderState,
  expected: ProviderExpectation
) {
  if (matchesProviderState(state, expected)) return;
  const actual = {
    ...state.counts,
    completed: state.notices.filter(
      (notice) => notice.type === "turn.completed"
    ).length,
    modelStepStarts: state.notices.filter(
      (notice) => notice.type === "model.step.started"
    ).length,
  };
  throw new Error(
    `Contract provider state did not match ${JSON.stringify(expected)}; actual ${JSON.stringify(actual)}.`
  );
}

async function waitForPendingProviderDelivery(sessionId: string) {
  const providerUrl = await deliveryProviderUrl();
  const response = await fetch(
    `${providerUrl}/sessions/${encodeURIComponent(sessionId)}/deliveries/pending`
  );
  if (!response.ok) {
    throw new Error("Pending contract provider delivery was unavailable.");
  }
  const delivery = pendingDeliverySchema.parse(await response.json());
  if (delivery.sessionId !== sessionId) {
    throw new Error("Pending contract provider delivery changed sessions.");
  }
  return delivery;
}

async function waitForProviderState(
  sessionId: string,
  expected: ProviderExpectation
) {
  return pollForProviderState(sessionId, expected, 0);
}

async function pollForProviderState(
  sessionId: string,
  expected: ProviderExpectation,
  attempt: number
): Promise<ProviderState> {
  const state = await providerState(sessionId);
  if (matchesProviderState(state, expected)) return state;
  if (attempt >= 100) {
    const actual = {
      ...state.counts,
      completed: state.notices.filter(
        (notice) => notice.type === "turn.completed"
      ).length,
      modelStepStarts: state.notices.filter(
        (notice) => notice.type === "model.step.started"
      ).length,
    };
    throw new Error(
      `Contract provider state did not reach ${JSON.stringify(expected)}; actual ${JSON.stringify(actual)}.`
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
  return pollForProviderState(sessionId, expected, attempt + 1);
}

async function releaseProviderAcknowledgement(delivery: {
  readonly callId: string;
  readonly sessionId?: string;
  readonly turnId: string;
}) {
  if (!delivery.sessionId) {
    throw new Error("Held provider delivery is missing its session identity.");
  }
  const providerUrl = await deliveryProviderUrl();
  const response = await fetch(`${providerUrl}/deliveries/release`, {
    body: JSON.stringify(delivery),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error("Held provider delivery was not released.");
}

async function deliveryProviderUrl() {
  const { env } = await import("../env");
  return env.CONTRACT_DELIVERY_PROVIDER_URL;
}

async function expectHeldWork(t: EveEvalContext, expected: number) {
  const response = await t.target.fetch("/contract-linq/held-work");
  t.check(response.status, equals(200));
  const body = z
    .object({ pending: z.number().int().nonnegative() })
    .parse(await response.json());
  t.check(body.pending, equals(expected));
}

async function releaseHeldWork(t: EveEvalContext) {
  const response = await t.target.fetch("/contract-linq/held-work/release", {
    method: "POST",
  });
  t.check(response.status, equals(200));
}
