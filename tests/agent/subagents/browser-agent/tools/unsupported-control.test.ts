import { describe, expect, it } from "vitest";
import {
  browserActionTargets,
  unsupportedControlMessage,
} from "@/agent/subagents/browser-agent/lib/browser-action-targets";
import { commitBrowserActionInputSchema } from "@/agent/subagents/browser-agent/tools/commit_browser_action";

/** Roles observed as action targets that no supported interaction can drive. */
const undrivableRoles = ["checkbox", "radio", "switch"];

describe("unsupported browser controls", () => {
  it("UC-01: commit_browser_action cannot truthfully encode toggling one", () => {
    // The tool classifies four material actions. None of them describes setting
    // a checkbox, so pointing the worker at it is an instruction it cannot obey.
    for (const action of ["check", "toggle", "set", "select"]) {
      expect(
        commitBrowserActionInputSchema.safeParse({
          action,
          browser_session_id: "session-1",
          origin: "https://example.test",
          target_ref: "e1",
          target_token: "a".repeat(64),
          terms: { kind: action },
        }).success
      ).toBe(false);
    }
  });

  it("UC-02: the message names the control rather than an impossible action", () => {
    for (const role of undrivableRoles) {
      const message = unsupportedControlMessage(role);

      // Say what the control is, so the worker can report it accurately.
      expect(message).toContain(role);
      // Never send the worker to a tool with no matching classification.
      expect(message).not.toContain("commit_browser_action");
    }
  });

  it("UC-03: the message offers a recovery that actually exists", () => {
    const message = unsupportedControlMessage("checkbox");

    // Preserve the session and hand over, or take a supported route. Both are
    // real dispositions; "use commit_browser_action" was not.
    expect(message).toMatch(/takeover|hand over|another supported route/iu);
    // It must not imply the control changed state.
    expect(message).not.toMatch(/\b(checked|enabled|toggled|set to)\b/iu);
  });

  it("UC-04: these roles are still observed, so the model is not lied to about what exists", () => {
    const refs = undrivableRoles.map((role, index) => [
      `e${String(index + 1)}`,
      {
        frameId: "frame-1",
        name: `${role} control`,
        role,
        targetId: "page-1",
      },
    ]);
    const snapshot = refs.map(([ref]) => `[${String(ref)}]`).join(" ");

    // Hiding them would be the other way to lie: they exist on the page, and a
    // worker that cannot see them cannot report why it is stuck.
    const observed = browserActionTargets(
      "session-1",
      snapshot,
      // SAFETY: a minimal synthetic ref state shaped like the browser loop's,
      // carrying only the fields this builder reads.
      {
        activeTargetId: "page-1",
        generations: [],
        refs,
      } as unknown as Parameters<typeof browserActionTargets>[2]
    );

    for (const role of undrivableRoles) {
      expect(
        observed.some((target) => target.display_label.startsWith(`${role}:`))
      ).toBe(true);
    }
  });
});
