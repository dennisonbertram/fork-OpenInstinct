import { loop } from "@onkernel/browser-loop";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireOwnedBrowserSession } from "@/agent/subagents/worker/lib/owned-browser";
import { requireWorkerScope } from "@/agent/subagents/worker/lib/access";
import {
  assertKernelFrameOrigin,
  currentKernelPageOrigin,
} from "../lib/autofill/native";
import {
  browserRefStateForSession,
  executeBrowserLoopTool,
} from "../lib/semantic-loop";

const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dismiss_dialog") }),
  z.object({ kind: z.literal("fill_field"), value: z.string().max(10_000) }),
  z.object({ kind: z.literal("select_option"), value: z.string().max(500) }),
  z.object({ kind: z.literal("toggle_tab") }),
]);

export const interactBrowserElementInputSchema = z.object({
  action: actionSchema,
  browser_session_id: z.string().trim().min(1).max(500),
  frame_id: z.string().trim().min(1).max(200),
  origin: z
    .url()
    .refine(
      (value) => new URL(value).origin === value,
      "origin must not contain a path, query, or fragment"
    ),
  target_label: z.string().trim().min(1).max(500),
  target_ref: z.string().regex(/^e\d+$/u),
});

export default defineTool({
  description:
    "Perform one typed, reversible interaction against an observed browser ref. Form fill/select, tab toggles, and Escape dismissal stay prompt-free; links, menus, buttons, submit, purchase, send, delete, and unknown controls belong to commit_browser_action.",
  inputSchema: interactBrowserElementInputSchema,
  async execute(input, context) {
    const scope = await requireWorkerScope(context);
    await requireOwnedBrowserSession(scope, input.browser_session_id);
    const refState = browserRefStateForSession(input.browser_session_id);
    const target = refState?.refs.find(([ref]) => ref === input.target_ref);
    if (
      !target ||
      target[1].frameId !== input.frame_id ||
      `${target[1].role}: ${target[1].name}` !== input.target_label
    ) {
      throw new Error("The browser target reference is stale or mislabeled.");
    }
    if (!reversibleRole(input.action.kind, target[1].role)) {
      throw new Error(
        "This browser control is not structurally reversible; use commit_browser_action."
      );
    }
    const currentOrigin = await currentKernelPageOrigin({
      browserSessionId: input.browser_session_id,
      signal: context.abortSignal,
    });
    if (currentOrigin !== input.origin) {
      throw new Error(
        "The browser target no longer matches the requested origin."
      );
    }
    await assertKernelFrameOrigin({
      browserSessionId: input.browser_session_id,
      expectedOrigin: input.origin,
      frameId: input.frame_id,
      signal: context.abortSignal,
    });
    const step = toSafeStep(input.action, input.target_ref);
    const result = await executeBrowserLoopTool(
      input.browser_session_id,
      loop.tools.browser.act(),
      { steps: [step], successor: { depth: 4, filter: "interactive" } },
      context.abortSignal
    );
    return {
      action: input.action.kind,
      frame_id: input.frame_id,
      origin: currentOrigin,
      status: result.details.isError ? "uncertain" : "dispatched",
    } as const;
  },
});

function reversibleRole(
  action: z.infer<typeof actionSchema>["kind"],
  role: string
) {
  switch (action) {
    case "toggle_tab":
      return role === "tab";
    case "dismiss_dialog":
      return role === "dialog";
    case "fill_field":
      return ["textbox", "searchbox", "combobox", "spinbutton"].includes(role);
    case "select_option":
      return role === "combobox" || role === "listbox";
    default:
      return false;
  }
}

function toSafeStep(action: z.infer<typeof actionSchema>, ref: string) {
  switch (action.kind) {
    case "fill_field":
      return { type: "fill" as const, ref, value: action.value };
    case "select_option":
      return { type: "fill" as const, ref, value: action.value };
    case "dismiss_dialog":
      return { type: "key" as const, text: "Escape" };
    default:
      return { type: "click" as const, ref };
  }
}
