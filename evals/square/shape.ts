import { splitLinqReply } from "@/agent/lib/linq/reply";

/** Formats cents as a Square-style dollar string, e.g. 875 -> "$8.75". */
export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export interface BubbleGateResult {
  readonly bubbles: number;
  readonly ok: boolean;
  readonly note?: string;
}

/**
 * KTD6 bubble gate: a normal answer passes at 2 bubbles, warns at 3 (soft),
 * and fails above 3. A list answer with 5+ items must state a count and
 * offer the rest instead of listing them all.
 */
export function bubbleGate(
  reply: string,
  layout: "normal" | "list"
): BubbleGateResult {
  const bubbles = splitLinqReply(reply).length;

  if (layout === "list") {
    if (bubbles <= 3) return { bubbles, ok: true };
    const summarized = /\d/u.test(reply) && reply.includes("?");
    return {
      bubbles,
      note: summarized ? undefined : "list reply lacks a count and an offer",
      ok: summarized,
    };
  }

  if (bubbles <= 2) return { bubbles, ok: true };
  if (bubbles === 3)
    return { bubbles, note: "3 bubbles (soft warn)", ok: true };
  return {
    bubbles,
    note: `${String(bubbles)} bubbles (over the limit)`,
    ok: false,
  };
}
