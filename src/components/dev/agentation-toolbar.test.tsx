import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

function AgentationStub() {
  return <div data-agentation-toolbar="" />;
}

vi.mock("next/dynamic", () => ({
  default: () => AgentationStub,
}));

import { AgentationToolbar } from "./agentation-toolbar";

describe("agentation toolbar", () => {
  it("renders during local development", () => {
    expect(renderToStaticMarkup(<AgentationToolbar enabled />)).toContain(
      "data-agentation-toolbar"
    );
  });

  it("is absent from production", () => {
    expect(renderToStaticMarkup(<AgentationToolbar enabled={false} />)).toBe(
      ""
    );
  });
});
