import { z } from "zod";
import type { AccessScope } from "@/lib/access-scope";
import { readOperationsJourneyMetadata } from "@/db/services/operations-journey";

const maxJourneyWindowMs = 24 * 60 * 60 * 1000;

export const operationsJourneyInputSchema = z
  .object({
    sessionId: z.string().min(1).max(128),
    sinceUtc: z.iso
      .datetime()
      .refine((value) => value.endsWith("Z"), "UTC is required."),
    untilUtc: z.iso
      .datetime()
      .refine((value) => value.endsWith("Z"), "UTC is required."),
  })
  .superRefine((value, context) => {
    const since = Date.parse(value.sinceUtc);
    const until = Date.parse(value.untilUtc);
    if (until <= since || until - since > maxJourneyWindowMs) {
      context.addIssue({
        code: "custom",
        message: "Journey window must be positive and no longer than 24 hours.",
      });
    }
  });

export type OperationsJourneyInput = z.infer<
  typeof operationsJourneyInputSchema
>;

export async function readOperationsJourney(
  scope: AccessScope,
  input: OperationsJourneyInput
) {
  const parsed = operationsJourneyInputSchema.parse(input);
  const evidence = await readOperationsJourneyMetadata(scope, {
    sessionId: parsed.sessionId,
    since: new Date(parsed.sinceUtc),
    until: new Date(parsed.untilUtc),
  });
  return {
    query: parsed,
    status: evidence.gaps.some((gap) => gap.owner === "session")
      ? "incomplete"
      : evidence.gaps.length === 0
        ? "complete"
        : "partial",
    observations: evidence.observations,
    gaps: evidence.gaps,
    bounds: {
      pageLimit: evidence.pageLimit,
      pagesRead: evidence.pagesRead,
      truncated: evidence.truncated,
      redaction: "allowlist" as const,
    },
  };
}
