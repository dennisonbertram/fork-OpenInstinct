import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const bundleUrl = new URL(
  "../../node_modules/eve/dist/src/compiled/_chunks/workflow/wait-until-BtySPYD0.js",
  import.meta.url
);

// Execute the installed framed-stream reader against its owning World boundary.
// The assertions exercise cancellation/reconnection, not generated source text.
async function fixture({ delayOpen = false } = {}) {
  const source = await readFile(bundleUrl, "utf8");
  const start = source.indexOf("function mc(");
  const end = source.indexOf("const hc=", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const opening = Promise.withResolvers<undefined>();
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  const cancelled: number[] = [];
  let opened = 0;
  const world = {
    streams: {
      get: async () => {
        const id = opened++;
        if (delayOpen) await opening.promise;
        return new ReadableStream<Uint8Array>({
          start(controller) {
            controllers.push(controller);
          },
          cancel() {
            cancelled.push(id);
          },
        });
      },
      getInfo: async () => ({ done: false, tailIndex: 0 }),
    },
  };
  // SAFETY: This is the pinned installed dependency, with synthetic World data.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- VM exports the installed reader with its normal stream signature.
  const makeStream = runInNewContext(`${source.slice(start, end)}; mc`, {
    ReadableStream,
    Uint8Array,
    DataView,
    P: async () => world,
    fc: () => 50,
    pc: () => 1000,
    c: { is: () => false },
    uc: () => undefined,
    lc: () => undefined,
    console,
  }) as (
    runId: string,
    streamName: string,
    startIndex: number
  ) => ReadableStream<Uint8Array>;
  return {
    stream: makeStream("synthetic-run", "synthetic-stream", 0),
    controllers,
    cancelled,
    opened: () => opened,
    releaseOpen: () => {
      opening.resolve(undefined);
    },
  };
}

describe("installed Eve stream cancellation", () => {
  it("does not reconnect a resumable session after cancelling a pending read", async () => {
    const state = await fixture();
    const reader = state.stream.getReader();
    const read = reader.read();
    await vi.waitFor(() => {
      expect(state.controllers).toHaveLength(1);
    });
    await reader.cancel();
    expect((await read).done).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(state.opened()).toBe(1);
    expect(state.cancelled).toEqual([0]);
  });

  it("cancels a backend reader that finishes opening after cancellation", async () => {
    const state = await fixture({ delayOpen: true });
    await vi.waitFor(() => {
      expect(state.opened()).toBe(1);
    });
    await state.stream.cancel();
    state.releaseOpen();
    await vi.waitFor(() => {
      expect(state.cancelled).toEqual([0]);
    });
    expect(state.opened()).toBe(1);
  });

  it("still reconnects an interrupted resumable stream and delivers its next frame", async () => {
    const state = await fixture();
    const reader = state.stream.getReader();
    const read = reader.read();
    await vi.waitFor(() => {
      expect(state.controllers).toHaveLength(1);
    });
    state.controllers[0]?.close();
    await vi.waitFor(() => {
      expect(state.controllers).toHaveLength(2);
    });
    const frame = Uint8Array.from([0, 0, 0, 1, 42]);
    state.controllers[1]?.enqueue(frame);
    expect(await read).toEqual({ done: false, value: frame });
    await reader.cancel();
  });
});
