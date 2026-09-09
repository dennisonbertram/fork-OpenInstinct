import { defineTool } from "eve/tools";
import { z } from "zod";

const pending = new Map<
  string,
  {
    readonly mode: "failure" | "success";
    readonly reject: (error: Error) => void;
    readonly resolve: () => void;
  }
>();

export function heldWorkCount() {
  return pending.size;
}

export function releaseHeldWork() {
  for (const [callId, work] of pending) {
    pending.delete(callId);
    if (work.mode === "failure") {
      work.reject(new Error("contract fixture held sibling failed"));
    } else {
      work.resolve();
    }
  }
}

export default defineTool({
  description: "Test-only controlled work for Eve lifecycle contract coverage.",
  inputSchema: z.object({ mode: z.enum(["failure", "success"]) }),
  async execute(input, context) {
    await new Promise<void>((resolve, reject) => {
      const cancel = () => {
        pending.delete(context.callId);
        reject(new Error("contract fixture held work cancelled"));
      };
      if (context.abortSignal.aborted) {
        cancel();
        return;
      }
      context.abortSignal.addEventListener("abort", cancel, { once: true });
      pending.set(context.callId, {
        mode: input.mode,
        reject: (error) => {
          context.abortSignal.removeEventListener("abort", cancel);
          reject(error);
        },
        resolve: () => {
          context.abortSignal.removeEventListener("abort", cancel);
          resolve();
        },
      });
    });
    return { completed: true };
  },
});
