import { z } from "zod";

/** Increment only when the persisted direct-message representation changes. */
export const ONBOARDING_COPY_VERSION = "v1";
export const maximumSendblueOnboardingTextCharacters = 18_996;

export const directChannelOnboardingPayloadSchema = z
  .object({
    from: z.string().min(1).max(128),
    media: z
      .array(
        z.object({
          contentType: z.string().min(1).max(200),
          url: z.url().refine((value) => new URL(value).protocol === "https:"),
        })
      )
      .max(20)
      .optional(),
    presentation: z
      .union([
        z.object({ kind: z.literal("text") }).strict(),
        z.object({ kind: z.literal("carousel") }).strict(),
        z
          .object({
            kind: z.literal("single_media"),
            sendStyle: z.literal("celebration").optional(),
          })
          .strict(),
      ])
      .optional(),
    text: z.string().max(maximumSendblueOnboardingTextCharacters),
    to: z.string().min(1).max(128),
    version: z.literal(1),
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.presentation?.kind === "carousel") {
      if (payload.text !== "") {
        context.addIssue({
          code: "custom",
          message: "A carousel must be persisted without direct text.",
          path: ["text"],
        });
      }
      if ((payload.media?.length ?? 0) < 2) {
        context.addIssue({
          code: "custom",
          message: "A carousel requires at least two media URLs.",
          path: ["media"],
        });
      }
    } else if (
      !(
        payload.presentation?.kind === "single_media" &&
        payload.media?.length === 1 &&
        payload.text === ""
      ) &&
      payload.text.trim().length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "A direct message requires text unless it has one media item.",
        path: ["text"],
      });
    }
  });

export type DirectChannelOnboardingPayload = z.output<
  typeof directChannelOnboardingPayloadSchema
>;
