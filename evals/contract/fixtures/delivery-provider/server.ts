import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { z } from "zod";

const identitySchema = z.object({
  callId: z.string().min(1).optional(),
  sessionId: z.string().min(1),
  stepIndex: z.number().int().nonnegative().optional(),
  turnId: z.string().min(1),
});
const deliverySchema = identitySchema.extend({
  behavior: z.enum(["accept", "hold", "reject"]),
  deliveryClass: z.enum(["final", "recovery"]),
  callId: z.string().min(1),
});
const noticeSchema = identitySchema.extend({
  type: z.enum([
    "model.step.started",
    "turn.cancelled",
    "turn.completed",
    "turn.failed",
  ]),
});

type Delivery = z.infer<typeof deliverySchema> & {
  state: "acknowledged" | "aborted" | "pending" | "rejected";
};
type Notice = z.infer<typeof noticeSchema>;
type PendingDeliveryIdentity = Pick<
  Delivery,
  "callId" | "sessionId" | "stepIndex" | "turnId"
>;
export type ContractDeliveryIdentity = Pick<
  z.infer<typeof deliverySchema>,
  "callId" | "sessionId" | "turnId"
>;

function deliveryKey(identity: ContractDeliveryIdentity) {
  return [identity.sessionId, identity.turnId, identity.callId].join("\u0000");
}

export interface ContractDeliveryProvider {
  readonly url: string;
  close(): Promise<void>;
  snapshot(): ContractDeliveryProviderSnapshot;
}

interface ContractDeliveryProviderSnapshot {
  readonly attempts: readonly {
    readonly attempts: number;
    readonly duplicateAttempts: number;
    readonly sessionId: string;
  }[];
  readonly deliveries: readonly Delivery[];
  readonly notices: readonly Notice[];
}

export async function startContractDeliveryProvider({ port = 0 } = {}) {
  const deliveries = new Map<string, Delivery>();
  const notices: Notice[] = [];
  const pending = new Map<string, ServerResponse>();
  const pendingWaiters = new Map<string, Set<ServerResponse>>();
  const sessionAttempts = new Map<
    string,
    { attempts: number; duplicateAttempts: number }
  >();
  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse
  ) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST" && url.pathname === "/notices") {
        notices.push(noticeSchema.parse(await readJson(request)));
        sendJson(response, 202, { recorded: true });
        return;
      }
      if (request.method === "POST" && url.pathname === "/deliveries") {
        const delivery = deliverySchema.parse(await readJson(request));
        const key = deliveryKey(delivery);
        const attempts = sessionAttempts.get(delivery.sessionId) ?? {
          attempts: 0,
          duplicateAttempts: 0,
        };
        attempts.attempts += 1;
        if (deliveries.has(key)) {
          attempts.duplicateAttempts += 1;
          sessionAttempts.set(delivery.sessionId, attempts);
          sendJson(response, 409, { code: "DUPLICATE_REQUEST" });
          return;
        }
        sessionAttempts.set(delivery.sessionId, attempts);
        const recorded: Delivery = {
          ...delivery,
          state:
            delivery.behavior === "hold"
              ? "pending"
              : delivery.behavior === "reject"
                ? "rejected"
                : "acknowledged",
        };
        deliveries.set(key, recorded);
        if (delivery.behavior === "reject") {
          sendJson(response, 503, { code: "PROVIDER_REJECTED" });
          return;
        }
        if (delivery.behavior === "hold") {
          pending.set(key, response);
          settlePendingWaiters(delivery.sessionId, recorded);
          response.once("close", () => {
            if (response.writableEnded) return;
            pending.delete(key);
            recorded.state = "aborted";
          });
          return;
        }
        sendJson(response, 200, { id: `ack-${delivery.callId}` });
        return;
      }
      const pendingDelivery =
        /^\/sessions\/([^/]+)\/deliveries\/pending$/u.exec(url.pathname);
      if (request.method === "GET" && pendingDelivery?.[1]) {
        const sessionId = decodeURIComponent(pendingDelivery[1]);
        const delivery = [...deliveries.values()].find(
          (candidate) =>
            candidate.sessionId === sessionId && candidate.state === "pending"
        );
        if (delivery) {
          sendJson(response, 200, pendingDeliveryIdentity(delivery));
          return;
        }
        const waiters = pendingWaiters.get(sessionId) ?? new Set();
        waiters.add(response);
        pendingWaiters.set(sessionId, waiters);
        response.once("close", () => {
          if (response.writableEnded) return;
          removePendingWaiter(sessionId, response);
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/deliveries/release") {
        const identity = deliverySchema
          .pick({
            callId: true,
            sessionId: true,
            turnId: true,
          })
          .parse(await readJson(request));
        const key = deliveryKey(identity);
        const delivery = deliveries.get(key);
        const held = pending.get(key);
        if (!delivery || !held || delivery.state !== "pending") {
          sendJson(response, 404, { code: "PENDING_REQUEST_NOT_FOUND" });
          return;
        }
        pending.delete(key);
        delivery.state = "acknowledged";
        sendJson(held, 200, { id: `ack-${identity.callId}` });
        sendJson(response, 200, { released: true });
        return;
      }
      const cancel = /^\/sessions\/([^/]+)\/cancel$/u.exec(url.pathname);
      if (request.method === "POST" && cancel?.[1]) {
        const sessionId = decodeURIComponent(cancel[1]);
        let cancelled = 0;
        for (const [key, held] of pending) {
          const delivery = deliveries.get(key);
          if (delivery?.sessionId !== sessionId) continue;
          pending.delete(key);
          delivery.state = "aborted";
          cancelled += 1;
          sendJson(held, 499, { code: "REQUEST_ABORTED" });
        }
        sendJson(response, 200, { cancelled });
        return;
      }
      const session = /^\/sessions\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && session?.[1]) {
        const sessionId = decodeURIComponent(session[1]);
        const matching = [...deliveries.values()].filter(
          (delivery) => delivery.sessionId === sessionId
        );
        const sessionNotices = notices.filter(
          (notice) => notice.sessionId === sessionId
        );
        const attempts = sessionAttempts.get(sessionId) ?? {
          attempts: 0,
          duplicateAttempts: 0,
        };
        sendJson(response, 200, {
          deliveries: matching.map(
            ({ callId, deliveryClass, state, stepIndex, turnId }) => ({
              callId,
              deliveryClass,
              state,
              stepIndex,
              turnId,
            })
          ),
          counts: {
            aborted: matching.filter((item) => item.state === "aborted").length,
            acknowledged: matching.filter(
              (item) => item.state === "acknowledged"
            ).length,
            attempts: attempts.attempts,
            duplicateAttempts: attempts.duplicateAttempts,
            pending: matching.filter((item) => item.state === "pending").length,
            rejected: matching.filter((item) => item.state === "rejected")
              .length,
            requests: matching.length,
            waiters: pendingWaiters.get(sessionId)?.size ?? 0,
          },
          notices: sessionNotices,
        });
        return;
      }
      sendJson(response, 404, { code: "NOT_FOUND" });
    } catch {
      sendJson(response, 400, { code: "INVALID_REQUEST" });
    }
  };
  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });

  function removePendingWaiter(sessionId: string, response: ServerResponse) {
    const waiters = pendingWaiters.get(sessionId);
    waiters?.delete(response);
    if (waiters?.size === 0) pendingWaiters.delete(sessionId);
  }

  function settlePendingWaiters(sessionId: string, delivery: Delivery) {
    const waiters = pendingWaiters.get(sessionId);
    if (!waiters) return;
    pendingWaiters.delete(sessionId);
    for (const waiter of waiters) {
      sendJson(waiter, 200, pendingDeliveryIdentity(delivery));
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = z
    .object({ port: z.number().int().nonnegative() })
    .parse(server.address());
  const boundPort = address.port;
  return {
    url: `http://127.0.0.1:${boundPort.toString()}`,
    snapshot() {
      return {
        attempts: [...sessionAttempts].map(([sessionId, counts]) =>
          Object.assign({}, counts, { sessionId })
        ),
        deliveries: [...deliveries.values()].map((delivery) =>
          Object.assign({}, delivery)
        ),
        notices: notices.map((notice) => Object.assign({}, notice)),
      };
    },
    async close() {
      for (const waiters of pendingWaiters.values()) {
        for (const response of waiters) {
          sendJson(response, 503, { code: "PROVIDER_CLOSED" });
        }
      }
      pendingWaiters.clear();
      for (const [key, response] of pending) {
        pending.delete(key);
        const delivery = deliveries.get(key);
        if (delivery) delivery.state = "aborted";
        sendJson(response, 503, { code: "PROVIDER_CLOSED" });
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  } satisfies ContractDeliveryProvider;
}

async function readJson(request: IncomingMessage) {
  let body = "";
  for await (const chunk of request) body += String(chunk);
  return z.unknown().parse(JSON.parse(body));
}

interface SessionResponseBody {
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
  readonly deliveries: readonly Pick<
    Delivery,
    "callId" | "deliveryClass" | "state" | "stepIndex" | "turnId"
  >[];
  readonly notices: readonly Notice[];
}

type JsonBody =
  | PendingDeliveryIdentity
  | SessionResponseBody
  | { readonly cancelled: number }
  | { readonly code: string }
  | { readonly id: string }
  | { readonly recorded: boolean }
  | { readonly released: boolean };

function sendJson(
  response: ServerResponse,
  status: number,
  body: JsonBody
): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function pendingDeliveryIdentity(delivery: Delivery): PendingDeliveryIdentity {
  const { callId, sessionId, stepIndex, turnId } = delivery;
  return { callId, sessionId, stepIndex, turnId };
}
