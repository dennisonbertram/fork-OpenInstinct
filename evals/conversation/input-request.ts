import { z } from "zod";
/** Observed clarification request, not completed delivery or proof of rendering. */
export const conversationInputRequestSchema = z.object({
  requestId: z.string().min(1),
  prompt: z.string().trim().min(1),
  allowFreeform: z.boolean().optional(),
  display: z.string().optional(),
  options: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string().optional(),
        style: z.string().optional(),
      })
    )
    .optional(),
});
export type ConversationInputRequest = z.infer<
  typeof conversationInputRequestSchema
>;

// Narrow user-facing subset of eve/client AuthorizationRequiredStreamEvent.data.
// Internal webhook/callback metadata is deliberately excluded.
export const conversationAuthorizationRequestSchema = z.object({
  attemptId: z.string().optional(),
  candidateId: z.string().optional(),
  name: z.string(),
  description: z.string(),
  turnId: z.string(),
  stepIndex: z.number().int(),
  sequence: z.number().int(),
  authorization: z
    .object({
      url: z.string().optional(),
      userCode: z.string().optional(),
      expiresAt: z.string().optional(),
      instructions: z.string().optional(),
      displayName: z.string().optional(),
    })
    .optional(),
});
// A terminal outcome is independent evidence, never inferred from a request.
export const conversationAuthorizationOutcomeSchema =
  conversationAuthorizationRequestSchema.omit({ description: true }).extend({
    outcome: z.enum(["authorized", "declined", "failed", "timed-out"]),
    reason: z.string().optional(),
  });

export type ConversationAuthorizationRequest = z.infer<
  typeof conversationAuthorizationRequestSchema
>;
