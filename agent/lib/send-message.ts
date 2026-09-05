import { z } from "zod";

const attachmentSchema = z.object({
  kind: z.enum(["image", "video", "audio", "file"]),
  mimeType: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(180).optional(),
  url: z.url().refine((url) => new URL(url).protocol === "https:", {
    message: "Attachments must use HTTPS.",
  }),
});

const nativeLinkSchema = z
  .url()
  .max(2048)
  .refine((url) => new URL(url).protocol === "https:", {
    message: "Native links must use HTTPS.",
  });

const messageOutputSchema = z
  .strictObject({
    attachments: z.array(attachmentSchema).min(1).max(4).optional(),
    kind: z.literal("message"),
    text: z.string().trim().min(1).max(20_000).optional(),
  })
  .superRefine((message, context) => {
    if (!message.text && !message.attachments) {
      context.addIssue({
        code: "custom",
        message: "A message must include text or at least one attachment.",
      });
    }
  });

const linkOutputSchema = z.strictObject({
  kind: z.literal("link"),
  url: nativeLinkSchema,
});

export const sendMessageOutputSchema = z.discriminatedUnion("kind", [
  messageOutputSchema,
  linkOutputSchema,
]);

// Completion controls the tool loop and is omitted from channel-visible output.
const finalDeliveryField = {
  final: z
    .boolean()
    .optional()
    .describe(
      "Set true on the last user-visible message for this turn. Leave false for progress or a message followed by more work or another message."
    ),
};
export const sendMessageInputSchema = z.discriminatedUnion("kind", [
  messageOutputSchema.safeExtend(finalDeliveryField),
  linkOutputSchema.extend(finalDeliveryField),
]);

export const sendMessageToolResultSchema = z.object({
  kind: z.literal("tool-result"),
  output: sendMessageOutputSchema,
  toolName: z.literal("send_message"),
});
