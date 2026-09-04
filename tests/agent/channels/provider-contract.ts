import { describe, expect, it } from "vitest";

interface MessagingProviderContractDriver {
  addReaction(): Promise<{ messageCount: number; reactionCount: number }>;
  requestApproval(toolName: string): Promise<string>;
  sendImage(url: string): Promise<{
    attachmentUrls: readonly string[];
    messageCount: number;
  }>;
  sendText(text: string): Promise<{ messageCount: number; text: string }>;
}

export function defineMessagingProviderContract(
  provider: string,
  createDriver: () => MessagingProviderContractDriver
) {
  describe(`${provider} portable messaging contract`, () => {
    it("maps one logical text send to one provider message", async () => {
      const observation = await createDriver().sendText("one logical reply");
      expect(observation).toEqual({
        messageCount: 1,
        text: "one logical reply",
      });
    });

    it("keeps a URL image as a native attachment", async () => {
      const url = "https://media.example/reference.png";
      const observation = await createDriver().sendImage(url);
      expect(observation).toEqual({ attachmentUrls: [url], messageCount: 1 });
    });

    it("maps a reaction without creating a text message", async () => {
      const observation = await createDriver().addReaction();
      expect(observation).toEqual({ messageCount: 0, reactionCount: 1 });
    });

    it("renders approval language without provider tool internals", async () => {
      const toolName = "provider-internal-write";
      const prompt = await createDriver().requestApproval(toolName);
      expect(prompt).not.toContain(toolName);
      expect(prompt).toMatch(/yes|go ahead|approve/iu);
      expect(prompt).toMatch(/cancel/iu);
    });
  });
}

export function defineInboundProviderContract(
  provider: string,
  rejectsUnsignedRequest: () => Promise<boolean>
) {
  describe(`${provider} portable inbound contract`, () => {
    it("rejects an unsigned provider request", async () => {
      await expect(rejectsUnsignedRequest()).resolves.toBe(true);
    });
  });
}
