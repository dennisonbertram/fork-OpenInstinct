import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  startContractDeliveryProvider,
  type ContractDeliveryIdentity,
  type ContractDeliveryProvider,
} from "./server";

let provider: ContractDeliveryProvider | undefined;

afterEach(async () => {
  await provider?.close();
  provider = undefined;
});

describe("contract delivery provider", () => {
  it("waits for and returns the exact pending delivery identity", async () => {
    provider = await startContractDeliveryProvider();
    const identity = {
      callId: "call-wait",
      sessionId: "session-wait",
      stepIndex: 2,
      turnId: "turn-wait",
    };
    const pendingIdentity = fetch(
      `${provider.url}/sessions/session-wait/deliveries/pending`
    );
    await expectState(provider.url, identity.sessionId, { waiters: 1 });

    const delivery = fetch(`${provider.url}/deliveries`, {
      body: JSON.stringify({
        ...identity,
        behavior: "hold",
        deliveryClass: "final",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const response = await pendingIdentity;
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(identity);
    expect(
      (await state(provider.url, identity.sessionId)).counts
    ).toMatchObject({
      attempts: 1,
      duplicateAttempts: 0,
      pending: 1,
      requests: 1,
    });
    expect((await release(provider.url, identity)).status).toBe(200);
    expect((await delivery).status).toBe(200);
  });

  it("settles a pending-delivery waiter when the provider closes", async () => {
    provider = await startContractDeliveryProvider();
    const pendingIdentity = fetch(
      `${provider.url}/sessions/session-close/deliveries/pending`
    );
    await expectState(provider.url, "session-close", { waiters: 1 });

    await provider.close();
    provider = undefined;

    expect((await pendingIdentity).status).toBe(503);
  });

  it("removes a pending-delivery waiter when its client aborts", async () => {
    provider = await startContractDeliveryProvider();
    const controller = new AbortController();
    const pendingIdentity = fetch(
      `${provider.url}/sessions/session-abort/deliveries/pending`,
      { signal: controller.signal }
    );
    await expectState(provider.url, "session-abort", { waiters: 1 });

    controller.abort();

    await expect(pendingIdentity).rejects.toThrow(/abort/u);
    await expectState(provider.url, "session-abort", { waiters: 0 });
  });

  it("holds and releases one exact session/turn/call identity", async () => {
    provider = await startContractDeliveryProvider();
    const identity = {
      callId: "call-1",
      sessionId: "session-1",
      stepIndex: 0,
      turnId: "turn-1",
    };
    const delivery = fetch(`${provider.url}/deliveries`, {
      body: JSON.stringify({
        ...identity,
        behavior: "hold",
        deliveryClass: "final",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    await expectState(provider.url, "session-1", { pending: 1, requests: 1 });
    const duplicate = await fetch(`${provider.url}/deliveries`, {
      body: JSON.stringify({
        ...identity,
        behavior: "hold",
        deliveryClass: "final",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(duplicate.status).toBe(409);
    await expectState(provider.url, "session-1", {
      attempts: 2,
      duplicateAttempts: 1,
      pending: 1,
      requests: 1,
    });
    const wrongRelease = await release(provider.url, {
      ...identity,
      sessionId: "session-2",
    });
    expect(wrongRelease.status).toBe(404);
    expect((await state(provider.url, "session-1")).counts.pending).toBe(1);

    expect((await release(provider.url, identity)).status).toBe(200);
    expect((await delivery).status).toBe(200);
    await expectState(provider.url, "session-1", {
      acknowledged: 1,
      pending: 0,
      requests: 1,
    });
  });

  it("does not collide when separate sessions reuse a call id", async () => {
    provider = await startContractDeliveryProvider();
    const providerUrl = provider.url;
    const responses = await Promise.all(
      ["session-a", "session-b"].map((sessionId) =>
        fetch(`${providerUrl}/deliveries`, {
          body: JSON.stringify({
            behavior: "accept",
            callId: "shared-call",
            deliveryClass: "final",
            sessionId,
            stepIndex: 0,
            turnId: "turn-1",
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      )
    );
    for (const response of responses) {
      expect(response.status).toBe(200);
    }
    expect((await state(provider.url, "session-a")).counts.acknowledged).toBe(
      1
    );
    expect((await state(provider.url, "session-b")).counts.acknowledged).toBe(
      1
    );
  });

  it("records rejection without acknowledgement", async () => {
    provider = await startContractDeliveryProvider();
    const response = await fetch(`${provider.url}/deliveries`, {
      body: JSON.stringify({
        behavior: "reject",
        callId: "call-reject",
        deliveryClass: "final",
        sessionId: "session-reject",
        stepIndex: 0,
        turnId: "turn-reject",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(503);
    expect((await state(provider.url, "session-reject")).counts).toMatchObject({
      acknowledged: 0,
      rejected: 1,
      requests: 1,
    });
  });
});

async function release(url: string, identity: ContractDeliveryIdentity) {
  return fetch(`${url}/deliveries/release`, {
    body: JSON.stringify(identity),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

async function state(url: string, sessionId: string) {
  const response = await fetch(
    `${url}/sessions/${encodeURIComponent(sessionId)}`
  );
  return stateSchema.parse(await response.json());
}

const stateSchema = z.object({
  counts: z.record(z.string(), z.number()),
});

async function expectState(
  url: string,
  sessionId: string,
  expected: Record<string, number>
) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- polling must observe each latest state
    const current = await state(url, sessionId);
    if (
      Object.entries(expected).every(
        ([key, value]) => current.counts[key] === value
      )
    ) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop -- polling must observe each latest state
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect((await state(url, sessionId)).counts).toMatchObject(expected);
}
