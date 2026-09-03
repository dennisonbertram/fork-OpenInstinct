import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "@/components/ui/badge";

const variants = [
  "default",
  "secondary",
  "success",
  "warning",
  "information",
  "destructive",
  "outline",
  "ghost",
  "link",
] as const;

function markup(variant?: (typeof variants)[number]) {
  return renderToStaticMarkup(createElement(Badge, { variant }, "Label"));
}

describe("badge", () => {
  it.each(variants)("renders the %s variant as a pill", (variant) => {
    const html = markup(variant);
    expect(html).toContain(`data-variant="${variant}"`);
    expect(html).toContain("rounded-full");
  });

  it("puts ink text on the soft tint for the success tone", () => {
    const html = markup("success");
    expect(html).toContain("bg-success-subtle");
    expect(html).toContain("text-foreground");
    expect(html).not.toContain("text-primary-foreground");
  });

  it("falls back to the default variant", () => {
    expect(markup()).toContain('data-variant="default"');
  });
});
