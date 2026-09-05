import assert from "node:assert/strict";
import { test } from "vitest";
import { startConversationFixtures } from "../fixtures";
const squareHeaders = {
  Authorization: "Bearer synthetic",
  "Square-Version": "2025-04-16",
};

test("conversation fixtures isolate ambiguity, restore failures explicitly, delay reads, and forbid writes", async () => {
  const f = await startConversationFixtures();
  try {
    f.configure({ mode: "ambiguous", caseId: "SQ-06", turn: 1 });
    const customers = await fetch(`${f.url}/v2/customers/search`, {
      method: "POST",
      headers: squareHeaders,
      body: JSON.stringify({
        query: { filter: { given_name: { exact: "Ada" } } },
      }),
    });
    assert.equal(customers.status, 200);
    assert.match(await customers.text(), /Testcase/);
    f.configure({ mode: "failed", caseId: "CORE-11", turn: 1 });
    assert.equal(
      (await fetch(`${f.url}/v2/locations`, { headers: squareHeaders })).status,
      503
    );
    assert.equal(
      (await fetch(`${f.url}/v2/locations`, { headers: squareHeaders })).status,
      503
    );
    f.configure({ mode: "failed", caseId: "CORE-11", turn: 2 });
    assert.equal(
      (await fetch(`${f.url}/v2/locations`, { headers: squareHeaders })).status,
      200
    );
    f.configure({ mode: "slow", caseId: "CORE-10", turn: 1 });
    const started = Date.now();
    assert.equal(
      (await fetch(`${f.url}/v2/locations`, { headers: squareHeaders })).status,
      200
    );
    assert.ok(Date.now() - started >= 1400);
    assert.equal(
      (
        await fetch(`${f.url}/v2/customers`, {
          method: "POST",
          headers: squareHeaders,
          body: "{}",
        })
      ).status,
      403
    );
    assert.equal((await fetch(`${f.url}/__conversation/requests`)).status, 401);
    assert.ok(f.snapshotRequests().some((r) => r.status === 503));
  } finally {
    await f.close();
  }
});

test("Connect fixture has missing-grant and authorization responses without Square access", async () => {
  const f = await startConversationFixtures();
  try {
    f.configure({ mode: "disconnected", caseId: "SQ-07", turn: 1 });
    const response = await fetch(`${f.url}/v1/connect/token/synthetic-square`, {
      method: "POST",
      body: "{}",
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: {
        code: "user_authorization_required",
        message: "Connect your Square account to continue.",
      },
    });
    const authorize = await fetch(
      `${f.url}/v1/connect/authorize/synthetic-square`,
      { method: "POST", body: "{}" }
    );
    assert.equal(authorize.status, 200);
    assert.match(await authorize.text(), /example\.invalid/);
    assert.equal(
      (await fetch(`${f.url}/v2/locations`, { headers: squareHeaders })).status,
      401
    );
  } finally {
    await f.close();
  }
});

test("selected sample order returns its completed state without inventing readiness", async () => {
  const f = await startConversationFixtures();
  try {
    const order = await fetch(`${f.url}/v2/orders/ORD_0`, {
      headers: squareHeaders,
    });
    assert.equal(order.status, 200);
    const data = await order.text();
    assert.match(data, /"state":"COMPLETED"/);
    assert.doesNotMatch(data, /fulfillments|PREPARED/);
    assert.equal(
      (await fetch(`${f.url}/v2/orders/missing`, { headers: squareHeaders }))
        .status,
      404
    );
  } finally {
    await f.close();
  }
});

test("control endpoints require the opaque token and SQ08 only recovers on turn three", async () => {
  const f = await startConversationFixtures();
  try {
    const config = { mode: "failed", caseId: "SQ-08", turn: 2 };
    assert.equal(
      (
        await fetch(`${f.url}/__conversation/configure`, {
          method: "POST",
          body: JSON.stringify(config),
        })
      ).status,
      401
    );
    assert.equal(
      (
        await fetch(`${f.url}/__conversation/configure`, {
          method: "POST",
          headers: { Authorization: `Bearer ${f.token}` },
          body: JSON.stringify(config),
        })
      ).status,
      200
    );
    assert.equal(
      (await fetch(`${f.url}/v2/orders/ORD_0`, { headers: squareHeaders }))
        .status,
      503
    );
    f.configure({ ...config, mode: "failed", turn: 3 });
    assert.equal(
      (await fetch(`${f.url}/v2/orders/ORD_0`, { headers: squareHeaders }))
        .status,
      200
    );
    const requests = await fetch(`${f.url}/__conversation/requests`, {
      headers: { Authorization: `Bearer ${f.token}` },
    });
    assert.equal(requests.status, 200);
    assert.doesNotMatch(await requests.text(), /Bearer|synthetic-verifier/);
  } finally {
    await f.close();
  }
});
