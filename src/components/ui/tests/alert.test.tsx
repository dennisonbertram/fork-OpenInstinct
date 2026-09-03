import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Alert } from "@/components/ui/alert";

const tones = ["success", "warning", "information"] as const;

function markup(variant: (typeof tones)[number] | "destructive") {
  return renderToStaticMarkup(createElement(Alert, { variant }, "Saved"));
}

describe("alert", () => {
  it.each(tones)("puts ink text on the %s tint with the tone on the icon", (tone) => {
    const html = markup(tone);
    expect(html).toContain(`data-variant="${tone}"`);
    expect(html).toContain(`bg-${tone}-subtle`);
    expect(html).toContain("text-foreground");
    expect(html).toContain(`*:[svg]:text-${tone}`);
    expect(html).not.toMatch(new RegExp(`(^|\\s)text-${tone}(\\s|")`));
  });

  it("keeps red text for the destructive tone", () => {
    expect(markup("destructive")).toContain("text-destructive");
  });
});
