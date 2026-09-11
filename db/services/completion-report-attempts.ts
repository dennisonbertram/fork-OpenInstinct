import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { completionReportAttempts, db } from "@/db";

/**
 * Durable claim for one physical effect of one interactive completion report.
 *
 * The ordering that matters: `claim` reserves the right to dispatch without
 * dispatching, `markProviderAttempted` is a compare-and-swap that must succeed
 * **before** any network call, and `markAccepted` records what the channel
 * confirmed afterwards. A crash between the second and third leaves the part
 * `attempted`, which recovery reports as uncertain and never re-sends.
 *
 * There is no poller, queue or retry here on purpose. This records what may
 * have already reached a provider; deciding what to tell the user about it
 * belongs to the completion obligation, not to this table.
 */

const partStateSchema = z.enum([
  "claimed",
  "attempted",
  "accepted",
  "unconfirmed",
]);

type CompletionReportPartState = z.infer<typeof partStateSchema>;

/** Logical identity of one physical effect. Never a model call ID. */
export interface CompletionReportPartKey {
  readonly workspaceId: string;
  readonly rootSessionId: string;
  readonly cohortId: string;
  readonly reportRevision: number;
  readonly part: string;
}

export interface CompletionReportClaim {
  readonly id: string;
  readonly state: CompletionReportPartState;
  readonly leaseOwner: string;
  readonly version: number;
  readonly providerHandle: string | null;
}

export type ClaimOutcome =
  /** This caller holds the right to dispatch. */
  | { readonly kind: "claimed"; readonly claim: CompletionReportClaim }
  /** Someone already did this. Do not dispatch; report what is known. */
  | { readonly kind: "settled"; readonly claim: CompletionReportClaim }
  /**
   * A previous owner may still be able to dispatch, or already did without
   * confirmation. Never take over and never send; say it is uncertain.
   */
  | { readonly kind: "uncertain"; readonly claim: CompletionReportClaim };

function keyMatches(key: CompletionReportPartKey) {
  return and(
    eq(completionReportAttempts.workspaceId, key.workspaceId),
    eq(completionReportAttempts.rootSessionId, key.rootSessionId),
    eq(completionReportAttempts.cohortId, key.cohortId),
    eq(completionReportAttempts.reportRevision, key.reportRevision),
    eq(completionReportAttempts.part, key.part)
  );
}

function projectClaim(row: {
  id: string;
  state: string;
  leaseOwner: string;
  version: number;
  providerHandle: string | null;
}): CompletionReportClaim {
  return {
    id: row.id,
    leaseOwner: row.leaseOwner,
    providerHandle: row.providerHandle,
    // Parsed rather than asserted: the column's CHECK constraint should make
    // this total, and a row that somehow violates it must fail loudly here
    // rather than be treated as a state this code understands.
    state: partStateSchema.parse(row.state),
    version: row.version,
  };
}

/**
 * Reserves the right to dispatch one part, without dispatching it.
 *
 * A part that already reached `attempted` or beyond is never re-claimed: the
 * provider may already hold it. A `claimed` part whose lease has expired may be
 * taken over, because the compare-and-swap in `markProviderAttempted` means the
 * old owner can no longer transition it — its version will have moved.
 */
export async function claimCompletionReportPart(input: {
  readonly key: CompletionReportPartKey;
  readonly id: string;
  readonly channel: string;
  readonly conversationId: string;
  readonly contentDigest: string;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Date;
  readonly artifactId?: string;
  readonly mediaType?: string;
  readonly byteSize?: number;
  readonly now?: Date;
}): Promise<ClaimOutcome> {
  const now = input.now ?? new Date();

  return db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select()
      .from(completionReportAttempts)
      .where(keyMatches(input.key))
      .for("update");

    if (existing) {
      const claim = projectClaim(existing);
      if (claim.state === "accepted") return { claim, kind: "settled" };
      if (claim.state === "attempted" || claim.state === "unconfirmed") {
        return { claim, kind: "uncertain" };
      }
      if (existing.leaseExpiresAt > now) {
        // A live owner still holds the right to dispatch this part.
        return { claim, kind: "uncertain" };
      }

      const [taken] = await transaction
        .update(completionReportAttempts)
        .set({
          leaseExpiresAt: input.leaseExpiresAt,
          leaseOwner: input.leaseOwner,
          updatedAt: now,
          version: sql`${completionReportAttempts.version} + 1`,
        })
        .where(
          and(
            eq(completionReportAttempts.id, claim.id),
            eq(completionReportAttempts.version, claim.version),
            eq(completionReportAttempts.state, "claimed")
          )
        )
        .returning();
      return taken
        ? { claim: projectClaim(taken), kind: "claimed" }
        : { claim, kind: "uncertain" };
    }

    const [created] = await transaction
      .insert(completionReportAttempts)
      .values({
        artifactId: input.artifactId,
        byteSize: input.byteSize,
        channel: input.channel,
        cohortId: input.key.cohortId,
        contentDigest: input.contentDigest,
        conversationId: input.conversationId,
        createdAt: now,
        id: input.id,
        leaseExpiresAt: input.leaseExpiresAt,
        leaseOwner: input.leaseOwner,
        mediaType: input.mediaType,
        part: input.key.part,
        reportRevision: input.key.reportRevision,
        rootSessionId: input.key.rootSessionId,
        state: "claimed",
        updatedAt: now,
        workspaceId: input.key.workspaceId,
      })
      .onConflictDoNothing()
      .returning();

    if (created) return { claim: projectClaim(created), kind: "claimed" };

    // Another claimer inserted first inside this transaction's window. It may
    // already have finished, so classify what is actually there: calling a part
    // the provider accepted "uncertain" would report doubt about something that
    // definitely landed.
    const [raced] = await transaction
      .select()
      .from(completionReportAttempts)
      .where(keyMatches(input.key));
    if (!raced) throw new Error("The claimed report part disappeared.");
    const racedClaim = projectClaim(raced);
    return {
      claim: racedClaim,
      kind: racedClaim.state === "accepted" ? "settled" : "uncertain",
    };
  });
}

/**
 * Records that this owner is about to call the provider.
 *
 * This must succeed before the network call, and only the holder of the exact
 * lease and version may make it. A stale owner is refused and must not dispatch.
 */
export async function markProviderAttempted(input: {
  readonly id: string;
  readonly leaseOwner: string;
  readonly version: number;
  readonly now?: Date;
}): Promise<CompletionReportClaim | undefined> {
  const now = input.now ?? new Date();
  const [updated] = await db
    .update(completionReportAttempts)
    .set({
      state: "attempted",
      updatedAt: now,
      version: sql`${completionReportAttempts.version} + 1`,
    })
    .where(
      and(
        eq(completionReportAttempts.id, input.id),
        eq(completionReportAttempts.leaseOwner, input.leaseOwner),
        eq(completionReportAttempts.version, input.version),
        eq(completionReportAttempts.state, "claimed")
      )
    )
    .returning();
  return updated ? projectClaim(updated) : undefined;
}

/** Records that the channel confirmed this part, with its safe handle. */
export async function markAccepted(input: {
  readonly id: string;
  readonly leaseOwner: string;
  readonly version: number;
  readonly providerHandle?: string;
  readonly now?: Date;
}): Promise<CompletionReportClaim | undefined> {
  const now = input.now ?? new Date();
  const [updated] = await db
    .update(completionReportAttempts)
    .set({
      providerHandle: input.providerHandle,
      state: "accepted",
      updatedAt: now,
      version: sql`${completionReportAttempts.version} + 1`,
    })
    .where(
      and(
        eq(completionReportAttempts.id, input.id),
        eq(completionReportAttempts.leaseOwner, input.leaseOwner),
        eq(completionReportAttempts.version, input.version),
        eq(completionReportAttempts.state, "attempted")
      )
    )
    .returning();
  return updated ? projectClaim(updated) : undefined;
}

/**
 * Records that a dispatch may have reached the provider without confirmation.
 * Terminal: nothing re-sends a part in this state.
 */
export async function markUnconfirmed(input: {
  readonly id: string;
  readonly leaseOwner: string;
  readonly version: number;
  readonly now?: Date;
}): Promise<CompletionReportClaim | undefined> {
  const now = input.now ?? new Date();
  const [updated] = await db
    .update(completionReportAttempts)
    .set({
      state: "unconfirmed",
      updatedAt: now,
      version: sql`${completionReportAttempts.version} + 1`,
    })
    .where(
      and(
        eq(completionReportAttempts.id, input.id),
        eq(completionReportAttempts.leaseOwner, input.leaseOwner),
        eq(completionReportAttempts.version, input.version),
        eq(completionReportAttempts.state, "attempted")
      )
    )
    .returning();
  return updated ? projectClaim(updated) : undefined;
}

/** What is known about one part after a restart. */
export async function findCompletionReportPart(
  key: CompletionReportPartKey
): Promise<CompletionReportClaim | undefined> {
  const [row] = await db
    .select()
    .from(completionReportAttempts)
    .where(keyMatches(key));
  return row ? projectClaim(row) : undefined;
}
