import { createSendblueAdapter } from "chat-adapter-sendblue";
import { afterEach, describe, expect, it, vi } from "vitest";

// oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- this focused package-boundary test inspects synthetic SDK request JSON.

const line = "+12025550123";
const contact = "+12025550199";

describe("patched SendBlue adapter outbound contract", () => {
  const fetchMock = vi.fn<typeof fetch>();

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("sends a Chat SDK raw message once with the configured sender", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(response({ message_handle: "sent-text" }));
    const adapter = createAdapter();

    await adapter.postMessage(
      adapter.encodeThreadId({ contactNumber: contact, fromNumber: line }),
      {
        raw: "one logical reply",
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestBody(fetchMock)).toMatchObject({
      content: "one logical reply",
      from_number: line,
      number: contact,
    });
  });

  it("sends a native URL image with no second text request", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(response({ message_handle: "sent-image" }));
    const adapter = createAdapter();

    await adapter.sendMediaMessage(
      adapter.encodeThreadId({ contactNumber: contact, fromNumber: line }),
      "https://media.example/reference.png",
      ""
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestBody(fetchMock)).toMatchObject({
      content: "",
      from_number: line,
      media_url: "https://media.example/reference.png",
      number: contact,
    });
  });

  it("refuses another SendBlue line before making a provider request", async () => {
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createAdapter();

    await expect(
      adapter.postMessage(
        adapter.encodeThreadId({
          contactNumber: contact,
          fromNumber: "+12025550999",
        }),
        { raw: "wrong line" }
      )
    ).rejects.toThrow(/configured line/iu);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([new Error("timeout"), response({ error: "temporary" }, 500)])(
    "does not retry an uncertain provider result (%s)",
    async (result) => {
      vi.stubGlobal("fetch", fetchMock);
      fetchMock.mockImplementationOnce(async () => {
        if (result instanceof Error) throw result;
        return result;
      });
      const adapter = createAdapter();

      await expect(
        adapter.postMessage(
          adapter.encodeThreadId({ contactNumber: contact, fromNumber: line }),
          { raw: "do not retry" }
        )
      ).rejects.toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it("returns an empty provider handle for a HTTP-success error body", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(response({ error: "not accepted" }));
    const adapter = createAdapter();

    const result = await adapter.postMessage(
      adapter.encodeThreadId({ contactNumber: contact, fromNumber: line }),
      { raw: "provider error" }
    );

    expect(result.id).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function createAdapter() {
  return createSendblueAdapter({
    apiKey: "test-key",
    apiSecret: "test-secret",
    defaultFromNumber: line,
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const options = fetchMock.mock.calls[0]?.[1];
  if (!options || typeof options.body !== "string")
    throw new Error("Missing request body");
  return JSON.parse(options.body) as Record<string, unknown>;
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}
