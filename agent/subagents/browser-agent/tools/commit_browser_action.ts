import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { requireOwnedBrowserSession } from "@/agent/subagents/browser-agent/lib/owned-browser";
import { requireWorkerScope } from "@/agent/subagents/browser-agent/lib/access";
import { readVaultItem } from "@/db/services/vault";
import {
  fillWithKernelNativeAutofill,
  nativeAutofillTokens,
} from "../lib/autofill/native";
import { vaultAutofillProvider } from "../lib/autofill/provider";
import { materializeAutofillClaims } from "../lib/autofill/service";
import {
  assertKernelFrameOrigin,
  currentKernelPageOrigin,
} from "../lib/autofill/native";
import {
  browserRefStateForSession,
  executeBrowserLoopTool,
} from "../lib/semantic-loop";
import { markVaultFilledBrowserSession } from "../lib/vault-browser-guard";
import { loop } from "@onkernel/browser-loop";

const termsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("place_order"),
    item: z.string().trim().min(1).max(500),
    merchant: z.string().trim().min(1).max(500),
    option: z.string().trim().min(1).max(500),
    quantity: z.number().int().positive().max(1000),
    total: z.string().trim().min(1).max(100),
  }),
  z.object({
    kind: z.literal("send_message"),
    content: z.string().trim().min(1).max(10_000),
    recipient: z.string().trim().min(1).max(500),
  }),
  z.object({
    impact: z.string().trim().min(1).max(1_000),
    kind: z.literal("delete"),
    target: z.string().trim().min(1).max(500),
  }),
  z.object({
    description: z.string().trim().min(1).max(1_000),
    kind: z.literal("submit"),
  }),
]);

export const commitBrowserActionInputSchema = z
  .object({
    action: z.enum(["delete", "place_order", "send_message", "submit"]),
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
    terms: termsSchema,
    payment: z
      .object({
        candidate_id: z.string().trim().min(1).max(500),
        frame_id: z.string().trim().min(1).max(200),
        origin: z
          .url()
          .refine(
            (value) => new URL(value).origin === value,
            "origin must not contain a path, query, or fragment"
          ),
      })
      .optional(),
  })
  .superRefine((input, context) => {
    if (input.terms.kind !== input.action) {
      context.addIssue({
        code: "custom",
        message: "The action must match its material terms.",
        path: ["terms"],
      });
    }
    if (input.payment && input.action !== "place_order") {
      context.addIssue({
        code: "custom",
        message:
          "Payment vault values can only be used by a place_order commit.",
        path: ["payment"],
      });
    }
  });

export const commitBrowserActionApproval = always();

export default defineTool({
  approval: commitBrowserActionApproval,
  description:
    "Commit one reviewed browser action against an exact origin and snapshot-scoped target. This is the only worker tool for submitting, ordering, sending, or deleting; routine browser preparation remains available through semantic and computer tools.",
  inputSchema: commitBrowserActionInputSchema,
  async execute(input, context) {
    const scope = await requireWorkerScope(context);
    await requireOwnedBrowserSession(scope, input.browser_session_id);
    const currentOrigin = await currentKernelPageOrigin({
      browserSessionId: input.browser_session_id,
      signal: context.abortSignal,
    });
    if (currentOrigin !== input.origin) {
      throw new Error(
        "The browser target no longer matches the approved origin."
      );
    }
    const refState = browserRefStateForSession(input.browser_session_id);
    const target = refState?.refs.find(([ref]) => ref === input.target_ref);
    if (
      !target ||
      target[1].frameId !== input.frame_id ||
      `${target[1].role}: ${target[1].name}` !== input.target_label
    ) {
      throw new Error(
        "The browser target reference is stale or bound to another frame."
      );
    }
    if (input.terms.kind !== input.action) {
      throw new Error("The approved action and material terms do not match.");
    }
    if (input.payment && input.action !== "place_order") {
      throw new Error(
        "Payment vault values can only be used by an approved place_order commit."
      );
    }
    await assertKernelFrameOrigin({
      browserSessionId: input.browser_session_id,
      expectedOrigin: input.origin,
      frameId: input.frame_id,
      signal: context.abortSignal,
    });

    if (input.payment) {
      const paymentItem = await readVaultItem(
        scope,
        input.payment.candidate_id
      );
      if (paymentItem?.kind !== "payment") {
        throw new Error("The approved payment handle is no longer available.");
      }
      const paymentTokens = nativeAutofillTokens.payment;
      const claims = await materializeAutofillClaims(
        scope,
        input.payment.candidate_id,
        {
          availableTokens: new Set(paymentTokens),
          origin: input.payment.origin,
          surface: {
            fields: paymentTokens.map((token) => ({ score: 100, token })),
            id: "payment-card",
            kind: "payment-card",
          },
        },
        vaultAutofillProvider
      );
      await fillWithKernelNativeAutofill({
        authorizedFrameId: input.payment.frame_id,
        authorizedFrameOrigin: input.payment.origin,
        browserSessionId: input.browser_session_id,
        claims,
        expectedOrigin: input.origin,
        kind: "payment",
        signal: context.abortSignal,
      });
      markVaultFilledBrowserSession(input.browser_session_id);
      const currentRefState = browserRefStateForSession(
        input.browser_session_id
      );
      const currentTarget = currentRefState?.refs.find(
        ([ref]) => ref === input.target_ref
      );
      if (
        !currentTarget ||
        currentTarget[1].frameId !== input.frame_id ||
        `${currentTarget[1].role}: ${currentTarget[1].name}` !==
          input.target_label
      ) {
        throw new Error(
          "The order target changed while payment was being filled."
        );
      }
      await assertKernelFrameOrigin({
        browserSessionId: input.browser_session_id,
        expectedOrigin: input.origin,
        frameId: input.frame_id,
        signal: context.abortSignal,
      });
    }

    const result = await executeBrowserLoopTool(
      input.browser_session_id,
      loop.tools.browser.act(),
      {
        steps: [{ type: "click", ref: input.target_ref }],
        successor: { depth: 4, filter: "interactive" },
      },
      context.abortSignal
    );
    return {
      action: input.action,
      frame_id: input.frame_id,
      origin: currentOrigin,
      status: result.details.isError ? "uncertain" : "dispatched",
    } as const;
  },
});
