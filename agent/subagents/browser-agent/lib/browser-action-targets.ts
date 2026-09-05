import { createHash } from "node:crypto";
import type { BrowserRefState } from "@onkernel/browser-loop";

// Reversible form controls plus controls dispatched through approved commits.
// Individual select options are represented by their owning combobox/listbox.
const actionableRoles = new Set([
  "textbox",
  "searchbox",
  "combobox",
  "spinbutton",
  "listbox",
  "tab",
  "dialog",
  "button",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "treeitem",
]);

export function browserActionTargets(
  sessionId: string,
  text: string,
  state: BrowserRefState | undefined
) {
  const unchanged = text.includes(
    "Page unchanged since the last snapshot; previous element refs are still valid."
  );
  const observedRefs = new Set(
    [...text.matchAll(/\[(e\d+)\]/gu)].map((match) => match[1])
  );
  return (state?.refs ?? [])
    .filter(
      ([ref, target]) =>
        actionableRoles.has(target.role) &&
        (observedRefs.has(ref) ||
          (unchanged && target.targetId === state?.activeTargetId)) &&
        redactBrowserValues(`${target.role}: ${target.name}`) ===
          `${target.role}: ${target.name}`
    )
    .slice(0, 100)
    .map(([ref, target]) => ({
      target_ref: ref,
      target_token: targetToken(sessionId, ref, target, state),
      display_label: `${target.role}: ${target.name}`,
    }));
}

export function redactBrowserValues(value: string) {
  return value
    .replace(/\bvalue\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/giu, "value=[omitted]")
    .replace(
      /(["']?value["']?\s*:\s*)(["'][^"']*["']|[^,}\s]+)/giu,
      "$1[omitted]"
    )
    .replace(/\b(?:\d[ -]?){13,19}\b/gu, "[sensitive value omitted]");
}

export function browserActionTargetsJson(
  targets: ReturnType<typeof browserActionTargets>
) {
  return JSON.stringify(targets).replace(
    /[\uE000-\uF8FF]/gu,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}

// An identity checksum, not an authorization grant. Owned-session, live origin,
// frame, structural action, and approval checks still run at each call site.
function targetToken(
  sessionId: string,
  ref: string,
  target: BrowserRefState["refs"][number][1],
  state: BrowserRefState | undefined
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "browser-target-v1",
        sessionId,
        ref,
        target.targetId,
        target.frameId,
        target.backendNodeId,
        target.generation,
        target.role,
        target.name,
        target.nth,
        target.cohort,
        state?.generations.find(([key]) => key === target.frameId)?.[1],
        state?.documents?.find(([key]) => key === target.frameId)?.[1],
      ])
    )
    .digest("hex");
}

export function resolveBrowserActionTarget(
  input: {
    browser_session_id: string;
    target_ref: string;
    target_token?: string;
    frame_id?: string;
    target_label?: string;
  },
  state: BrowserRefState | undefined
) {
  const target = state?.refs.find(([ref]) => ref === input.target_ref)?.[1];
  if (
    !target ||
    (input.target_token !== undefined
      ? !/^[a-f0-9]{64}$/u.test(input.target_token) ||
        input.target_token !==
          targetToken(input.browser_session_id, input.target_ref, target, state)
      : target.frameId !== input.frame_id ||
        `${target.role}: ${target.name}` !== input.target_label)
  ) {
    throw new Error(
      "The browser target reference is stale or bound to another frame."
    );
  }
  // Conflicting legacy fields must never override the token-bound identity.
  if (
    (input.frame_id !== undefined && input.frame_id !== target.frameId) ||
    (input.target_label !== undefined &&
      input.target_label !== `${target.role}: ${target.name}`)
  ) {
    throw new Error("The browser target reference is stale or mislabeled.");
  }
  return target;
}
