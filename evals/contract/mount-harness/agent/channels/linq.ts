import { GET, POST, defineChannel } from "eve/channels";
import { z } from "zod";
// @boundaries-ignore: the contract fixture invokes the authored root Linq handler.
import { linqChannelConfig } from "../../../../../agent/channels/linq";
import {
  postFixtureDelivery,
  recordRuntimeNotice,
  type RuntimeIdentity,
} from "../lib/contract-delivery-provider";
import { heldWorkCount, releaseHeldWork } from "../tools/hold_work";

const requestSchema = z.object({ message: z.string().min(1) });

type ActionResultHandler = NonNullable<
  NonNullable<typeof linqChannelConfig.events>["action.result"]
>;

const eventHandler = linqChannelConfig.events["action.result"];
const linqEventContextBase = {
  bot: {
    getAdapter() {
      return {
        addReaction: async () => undefined,
        decodeThreadId: () => ({ chatId: "contract-fixture", isGroup: false }),
        postMessage: async () => undefined,
        removeReaction: async () => undefined,
      };
    },
  },
  state: {},
  streaming: false,
  streamingEditIntervalMs: 1_000,
};

export default defineChannel({
  routes: [
    GET("/contract-linq/held-work", async () =>
      Response.json({ pending: heldWorkCount() })
    ),
    POST("/contract-linq/held-work/release", async () => {
      releaseHeldWork();
      return Response.json({ released: true });
    }),
    GET(
      "/contract-linq/:threadId/session",
      async (_request, { params, resolveSession }) => {
        const threadId = z.string().parse(params.threadId);
        const session = await resolveSession(threadId);
        return session
          ? Response.json({ sessionId: session.id })
          : new Response(null, { status: 202 });
      }
    ),
    POST("/contract-linq/:threadId", async (request, { from, params }) => {
      const body = requestSchema.safeParse(await request.json());
      if (!body.success)
        return Response.json({ error: "invalid request" }, { status: 400 });
      const threadId = z.string().parse(params.threadId);
      void from(threadId)
        .send(body.data.message, {
          auth: {
            attributes: {},
            authenticator: "contract-linq",
            principalId: "contract-linq-user",
            principalType: "user",
          },
        })
        .catch(() => {
          console.error("[contract-linq] asynchronous fixture turn failed");
        });
      return Response.json({ address: threadId });
    }),
  ],
  events: {
    async "action.result"(event, _channel, session) {
      const identity = {
        callId: event.result.callId,
        sessionId: session.session.id,
        stepIndex: event.stepIndex,
        turnId: event.turnId,
      } satisfies Required<RuntimeIdentity>;
      // The real handler must run inside the live Eve event context so its
      // defineState settlement belongs to this session. The fake channel
      // deliberately has no workspace principal: plain-text delivery then
      // reaches only the runner-owned loopback provider acknowledgement.
      const anonymousSession = {
        ...session,
        session: {
          ...session.session,
          auth: { current: null, initiator: null },
        },
      };
      // SAFETY: This fixture supplies the Linq adapter surface used by the
      // production action.result handler and never exposes it to app code.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- test-only adapter boundary described above
      const fixtureContext = {
        ...linqEventContextBase,
        thread: fixtureThread(identity),
      } as unknown as Parameters<ActionResultHandler>[1];
      await eventHandler(event, fixtureContext, anonymousSession);
    },
    async "turn.failed"(event, _channel, session) {
      const handler = linqChannelConfig.events["turn.failed"];
      // SAFETY: This fixture supplies the same minimal Linq adapter surface
      // used by the production failure handler.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- test-only adapter boundary described above
      const fixtureContext = {
        ...linqEventContextBase,
        thread: fixtureThread({
          callId: `failure-${event.turnId}`,
          sessionId: session.session.id,
          stepIndex: 0,
          turnId: event.turnId,
        }),
      } as unknown as Parameters<typeof handler>[1];
      await handler(event, fixtureContext, {
        ...session,
        session: {
          ...session.session,
          auth: { current: null, initiator: null },
        },
      });
      await recordRuntimeNotice(
        { sessionId: session.session.id, turnId: event.turnId },
        "turn.failed"
      );
    },
    async "turn.completed"(event, _channel, session) {
      await recordRuntimeNotice(
        { sessionId: session.session.id, turnId: event.turnId },
        "turn.completed"
      );
    },
    async "turn.cancelled"(event, _channel, session) {
      await recordRuntimeNotice(
        { sessionId: session.session.id, turnId: event.turnId },
        "turn.cancelled"
      );
    },
  },
});

function fixtureThread(identity: Required<RuntimeIdentity>) {
  return {
    id: "linq:dm:contract-fixture",
    async post(message: { readonly raw?: unknown }) {
      const raw =
        z.object({ raw: z.string().optional() }).parse(message).raw ?? "";
      return postFixtureDelivery(identity, {
        behavior:
          raw === "Linq fixture rejected"
            ? "reject"
            : raw === "Linq fixture held ACK" ||
                raw === "Linq fixture held ACK cancel"
              ? "hold"
              : "accept",
        deliveryClass:
          raw === "Linq fixture progress" || raw === "Linq fixture sibling"
            ? "recovery"
            : raw.startsWith("Linq fixture")
              ? "final"
              : "recovery",
      });
    },
    toJSON() {
      return {
        _type: "chat:Thread",
        adapterName: "linq",
        channelId: "linq:dm:contract-fixture",
        currentMessage: { id: "contract-inbound-message" },
        id: "linq:dm:contract-fixture",
        isDM: true,
      };
    },
  };
}
