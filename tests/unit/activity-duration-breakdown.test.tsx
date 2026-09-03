import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityDurationBreakdown } from "@/components/browser/activity-duration-breakdown";
import {
  browserActivityKinds,
  type BrowserActivityDurations,
} from "@/lib/browser-activity";

describe("ActivityDurationBreakdown", () => {
  it("renders one activity-N swatch per kind and no raw palette class", () => {
    const durations: BrowserActivityDurations = Object.fromEntries(
      browserActivityKinds.map((kind, index) => [kind, index + 1])
    );
    const html = renderToStaticMarkup(
      createElement(ActivityDurationBreakdown, { durations })
    );
    for (let n = 1; n <= 9; n++) {
      expect(html).toContain(`bg-activity-${String(n)}`);
    }
    expect(html).not.toMatch(/bg-[a-z]+-[0-9]{3}\b/);
  });
});
