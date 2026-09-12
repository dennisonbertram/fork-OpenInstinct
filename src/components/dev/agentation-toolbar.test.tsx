import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

function AgentationStub({ endpoint }: { endpoint?: string }) {
  return <div data-agentation-toolbar="" data-endpoint={endpoint} />;
}

vi.mock("next/dynamic", () => ({
  default: () => AgentationStub,
}));

import { AgentationToolbar } from "./agentation-toolbar";

describe("agentation toolbar", () => {
  it("renders during local development", () => {
    const markup = renderToStaticMarkup(<AgentationToolbar enabled />);

    expect(markup).toContain("data-agentation-toolbar");
    expect(markup).toContain('data-endpoint="http://127.0.0.1:4747"');
  });

  it("is absent from production", () => {
    expect(renderToStaticMarkup(<AgentationToolbar enabled={false} />)).toBe(
      ""
    );
  });
});
