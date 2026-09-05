import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireOwnedBrowserSession } from "@/agent/subagents/browser-agent/lib/owned-browser";
import { requireWorkerScope } from "@/agent/subagents/browser-agent/lib/access";
import { readVaultItem } from "@/db/services/vault";
import { kernel } from "@/lib/kernel";
import {
  currentKernelPageOrigin,
  fillWithKernelNativeAutofill,
  nativeAutofillTokens,
} from "../lib/autofill/native";
import { vaultAutofillProvider } from "../lib/autofill/provider";
import { materializeAutofillClaims } from "../lib/autofill/service";
import { markVaultFilledBrowserSession } from "../lib/vault-browser-guard";

const inputSchema = z.object({
  browserSessionId: z.string().trim().min(1).max(500),
  candidateId: z.string().trim().min(1).max(500),
  allowNewPasswordField: z
    .boolean()
    .optional()
    .describe(
      "Explicit compatibility for a known sign-in form whose sole password is incorrectly marked new-password. Requires purpose: login; rejects registration, reset/change, OTP, multiple passwords, and ambiguous submit controls."
    ),
  purpose: z
    .enum(["login", "signup"])
    .optional()
    .describe(
      "For a login vault item: signup explicitly fills the saved password into new-password and confirmation controls in the focused registration form. Omit or use login for existing-account sign-in. Never use signup for password changes."
    ),
});

const outputSchema = z.object({
  filledClaims: z.number().int().nonnegative(),
  kind: z.enum(["address", "contact", "login", "payment"]),
  origin: z.string(),
  success: z.literal(true),
});

export default defineTool({
  description:
    "Fill a login, card, contact, traveler, or address form with an opaque handle returned by list_vault. Focus one control in the intended form first. For explicitly authorized account registration, set purpose: signup to fill new-password and confirmation fields from the saved login. Ordinary login mode excludes these fields. Only for a known sign-in form with a mislabeled sole password, purpose: login plus allowNewPasswordField: true enables guarded compatibility. Never supply vault fields, selectors, origins, or secret values.",
  inputSchema,
  outputSchema,
  async execute(input, context) {
    const scope = await requireWorkerScope(context);

    await requireOwnedBrowserSession(scope, input.browserSessionId);
    const item = await readVaultItem(scope, input.candidateId);
    if (!item) throw new Error("The selected vault item was not found.");
    if (
      item.kind !== "address" &&
      item.kind !== "contact" &&
      item.kind !== "login" &&
      item.kind !== "payment"
    ) {
      throw new Error(
        "Native browser autofill currently supports only logins, cards, contacts, and addresses."
      );
    }
    if (
      input.allowNewPasswordField &&
      (input.purpose !== "login" || item.kind !== "login")
    ) {
      throw new Error(
        "New-password compatibility requires an explicit login purpose and saved login item."
      );
    }
    if (input.purpose === "signup" && item.kind !== "login") {
      throw new Error("Signup autofill requires a saved login item.");
    }
    if (item.kind === "payment") {
      throw new Error(
        "Payment vault values can only be injected inside an approved place_order commit."
      );
    }
    if (item.kind === "login") {
      const browser = await kernel.browsers.retrieve(
        input.browserSessionId,
        {},
        { signal: context.abortSignal }
      );
      if (!browser.profile_save_changes) {
        throw new Error(
          "Login autofill requires a browser created with save_changes: true. Delete this browser, create a writable browser at the same URL, then focus and fill again."
        );
      }
    }

    const origin = await currentKernelPageOrigin({
      browserSessionId: input.browserSessionId,
      signal: context.abortSignal,
    });
    const surfaceKind =
      item.kind === "login"
        ? "credentials"
        : item.kind === "contact"
          ? "contact"
          : "postal-address";
    const tokens = nativeAutofillTokens[item.kind];
    const surface = {
      fields: tokens.map((token) => ({ score: 100, token })),
      id: surfaceKind,
      kind: surfaceKind,
    };

    const claims = await materializeAutofillClaims(
      scope,
      input.candidateId,
      {
        availableTokens: new Set(tokens),
        origin,
        surface,
      },
      vaultAutofillProvider
    );
    // A later field can reject after an earlier secret has already been filled.
    markVaultFilledBrowserSession(input.browserSessionId);
    const result = await fillWithKernelNativeAutofill({
      browserSessionId: input.browserSessionId,
      claims,
      expectedOrigin: origin,
      kind: item.kind,
      loginPurpose: input.purpose ?? "login",
      allowNewPasswordField: input.allowNewPasswordField ?? false,
      signal: context.abortSignal,
    }).catch(() => {
      throw new Error(
        "Secure autofill could not be completed. The form may be partially filled; use safe verification or request human takeover."
      );
    });

    return {
      filledClaims: result.filledClaims,
      kind: item.kind,
      origin: result.origin,
      success: true as const,
    };
  },
});
