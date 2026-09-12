import { and, eq, inArray, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
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

/** One member of the complete cohort/revision roster a physical report covers. */
export interface CompletionReportBundleMember {
  readonly cohortId: string;
  readonly reportRevision: number;
}

/**
 * A row returned for recovery. `part` is the durable, exact physical-part key;
 * the bundle fields make its coverage explicit without storing report text.
 */
export interface CompletionReportPartRecord {
  readonly cohortId: string;
  readonly reportRevision: number;
  readonly part: string;
  readonly state: CompletionReportPartState;
  readonly bundleId?: string;
  readonly bundleCount?: number;
  readonly physicalPart: string;
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

export type BundleClaimOutcome =
  | {
      readonly kind: "claimed";
      readonly claims: readonly CompletionReportClaim[];
    }
  | {
      readonly kind: "settled";
      readonly claims: readonly CompletionReportClaim[];
    }
  | {
      readonly kind: "uncertain";
      readonly claims: readonly CompletionReportClaim[];
    };

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

const bundlePartPattern = /^bundle\/([a-f0-9]{64})\/([1-9][0-9]*)\/(.+)$/u;
const physicalPartPattern =
  /^(?:text|attachment|media-(?:upload|send):[0-9]+)$/u;
const bundleTransitionLost = new Error(
  "Completion report bundle transition was lost."
);

function bundleMetadata(part: string) {
  const matched = bundlePartPattern.exec(part);
  if (!matched) return { physicalPart: part };
  const [, bundleId, count, physicalPart] = matched;
  if (!bundleId || !count || !physicalPart)
    throw new Error("Invalid completion report bundle part.");
  return { bundleCount: Number(count), bundleId, physicalPart };
}

function canonicalMembers(input: readonly CompletionReportBundleMember[]) {
  const members = input.toSorted(
    (left, right) =>
      left.cohortId.localeCompare(right.cohortId) ||
      left.reportRevision - right.reportRevision
  );
  if (members.length === 0)
    throw new Error("A report bundle requires a member.");
  for (let index = 1; index < members.length; index += 1) {
    const prior = members.at(index - 1);
    const current = members.at(index);
    if (!prior || !current) throw new Error("Invalid report bundle member.");
    if (
      prior.cohortId === current.cohortId &&
      prior.reportRevision === current.reportRevision
    )
      throw new Error("A report bundle cannot name a cohort revision twice.");
  }
  return members;
}

/** Deterministic durable key for a complete physical report roster. */
export function completionReportBundlePart(input: {
  readonly workspaceId: string;
  readonly rootSessionId: string;
  readonly members: readonly CompletionReportBundleMember[];
  readonly physicalPart: string;
}) {
  if (!physicalPartPattern.test(input.physicalPart))
    throw new Error("Invalid completion report physical part.");
  const members = canonicalMembers(input.members);
  const bundleId = createHash("sha256")
    .update(
      JSON.stringify({
        members,
        rootSessionId: input.rootSessionId,
        workspaceId: input.workspaceId,
      })
    )
    .digest("hex");
  return `bundle/${bundleId}/${String(members.length)}/${input.physicalPart}`;
}

function memberPredicates(input: {
  readonly workspaceId: string;
  readonly rootSessionId: string;
  readonly members: readonly CompletionReportBundleMember[];
}) {
  return or(
    ...input.members.map((member) =>
      and(
        eq(completionReportAttempts.workspaceId, input.workspaceId),
        eq(completionReportAttempts.rootSessionId, input.rootSessionId),
        eq(completionReportAttempts.cohortId, member.cohortId),
        eq(completionReportAttempts.reportRevision, member.reportRevision)
      )
    )
  );
}

/**
 * Reserves every member of a physical report in one transaction. The advisory
 * lock serializes overlapping rosters even though their encoded bundle parts
 * differ, so `[A,B]` and `[B,C]` cannot both pass an empty-row check.
 */
export async function claimCompletionReportBundle(input: {
  readonly workspaceId: string;
  readonly rootSessionId: string;
  readonly members: readonly CompletionReportBundleMember[];
  readonly physicalPart: string;
  readonly channel: string;
  readonly conversationId: string;
  readonly contentDigest: string;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Date;
  readonly now?: Date;
}): Promise<BundleClaimOutcome> {
  const members = canonicalMembers(input.members);
  const part = completionReportBundlePart({ ...input, members });
  const now = input.now ?? new Date();
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.workspaceId}:${input.rootSessionId}:${input.physicalPart}`}))`
    );
    const rows = await transaction
      .select()
      .from(completionReportAttempts)
      .where(memberPredicates({ ...input, members }))
      .for("update");
    const byMember = new Map(
      members.map((member) => [
        `${member.cohortId}:${String(member.reportRevision)}`,
        rows.filter(
          (row) =>
            row.cohortId === member.cohortId &&
            row.reportRevision === member.reportRevision &&
            bundleMetadata(row.part).physicalPart === input.physicalPart
        ),
      ])
    );
    const exact = members.map((member) =>
      byMember
        .get(`${member.cohortId}:${String(member.reportRevision)}`)
        ?.find((row) => row.part === part)
    );
    const overlapping = [...byMember.values()].flat();
    if (overlapping.length > 0) {
      // Replay is safe only when the exact complete roster was accepted. Every
      // legacy `text`, previous bundle, mixed result, or partial exact bundle
      // may describe a distinct physical send and must remain uncertain.
      if (
        exact.every((row) => row?.state === "accepted") &&
        overlapping.length === exact.length
      )
        return {
          claims: exact.flatMap((row) => (row ? [projectClaim(row)] : [])),
          kind: "settled",
        };
      if (
        exact.length === members.length &&
        overlapping.length === exact.length &&
        exact.every((row) => row?.state === "claimed") &&
        exact.every((row) => row !== undefined && row.leaseExpiresAt <= now)
      ) {
        const taken = await Promise.all(
          exact.map(async (row) => {
            if (!row) throw bundleTransitionLost;
            const claim = projectClaim(row);
            const [updated] = await transaction
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
            if (!updated) throw bundleTransitionLost;
            return projectClaim(updated);
          })
        );
        return { claims: taken, kind: "claimed" };
      }
      return {
        claims: overlapping.map(projectClaim),
        kind: "uncertain",
      };
    }

    const created = await transaction
      .insert(completionReportAttempts)
      .values(
        members.map((member) => ({
          channel: input.channel,
          cohortId: member.cohortId,
          contentDigest: input.contentDigest,
          conversationId: input.conversationId,
          createdAt: now,
          // Incidental global primary key. The scoped composite unique index,
          // not this value, owns logical de-duplication.
          id: randomUUID(),
          leaseExpiresAt: input.leaseExpiresAt,
          leaseOwner: input.leaseOwner,
          part,
          reportRevision: member.reportRevision,
          rootSessionId: input.rootSessionId,
          state: "claimed",
          updatedAt: now,
          workspaceId: input.workspaceId,
        }))
      )
      .returning();
    return { claims: created.map(projectClaim), kind: "claimed" };
  });
}

async function transitionBundle(input: {
  readonly claims: readonly CompletionReportClaim[];
  readonly state: "attempted" | "accepted" | "unconfirmed";
  readonly providerHandle?: string;
  readonly now?: Date;
}): Promise<readonly CompletionReportClaim[] | undefined> {
  if (input.claims.length === 0) return undefined;
  const now = input.now ?? new Date();
  try {
    return await db.transaction(async (transaction) => {
      const expectedState =
        input.state === "attempted" ? "claimed" : "attempted";
      const changed = await Promise.all(
        input.claims.map(async (claim) => {
          const update = {
            state: input.state,
            updatedAt: now,
            version: sql`${completionReportAttempts.version} + 1`,
          };
          if (input.state === "accepted")
            Object.assign(update, { providerHandle: input.providerHandle });
          const [row] = await transaction
            .update(completionReportAttempts)
            .set(update)
            .where(
              and(
                eq(completionReportAttempts.id, claim.id),
                eq(completionReportAttempts.leaseOwner, claim.leaseOwner),
                eq(completionReportAttempts.version, claim.version),
                eq(completionReportAttempts.state, expectedState)
              )
            )
            .returning();
          if (!row) throw bundleTransitionLost;
          return projectClaim(row);
        })
      );
      return changed;
    });
  } catch (error) {
    if (error === bundleTransitionLost) return undefined;
    throw error;
  }
}

export function markBundleProviderAttempted(
  claims: readonly CompletionReportClaim[]
) {
  return transitionBundle({ claims, state: "attempted" });
}

export function markBundleAccepted(input: {
  readonly claims: readonly CompletionReportClaim[];
  readonly providerHandle?: string;
}) {
  return transitionBundle({ ...input, state: "accepted" });
}

export function markBundleUnconfirmed(
  claims: readonly CompletionReportClaim[]
) {
  return transitionBundle({ claims, state: "unconfirmed" });
}

/** Reads every physical report part for the selected cohorts, scoped by tenant and root. */
export async function findCompletionReportPartsForCohorts(input: {
  readonly workspaceId: string;
  readonly rootSessionId: string;
  readonly cohortIds: readonly string[];
}): Promise<readonly CompletionReportPartRecord[]> {
  if (input.cohortIds.length === 0) return [];
  const rows = await db
    .select()
    .from(completionReportAttempts)
    .where(
      and(
        eq(completionReportAttempts.workspaceId, input.workspaceId),
        eq(completionReportAttempts.rootSessionId, input.rootSessionId),
        inArray(completionReportAttempts.cohortId, [
          ...new Set(input.cohortIds),
        ])
      )
    );
  return rows.map((row) => {
    const metadata = bundleMetadata(row.part);
    return Object.assign(metadata, {
      cohortId: row.cohortId,
      part: row.part,
      reportRevision: row.reportRevision,
      state: partStateSchema.parse(row.state),
    });
  });
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
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.key.workspaceId}:${input.key.rootSessionId}:${bundleMetadata(input.key.part).physicalPart}`}))`
    );
    const rowsForMember = await transaction
      .select()
      .from(completionReportAttempts)
      .where(
        and(
          eq(completionReportAttempts.workspaceId, input.key.workspaceId),
          eq(completionReportAttempts.rootSessionId, input.key.rootSessionId),
          eq(completionReportAttempts.cohortId, input.key.cohortId),
          eq(completionReportAttempts.reportRevision, input.key.reportRevision)
        )
      )
      .for("update");
    const existing = rowsForMember.find((row) => row.part === input.key.part);
    if (!existing) {
      const overlap = rowsForMember.find(
        (row) =>
          bundleMetadata(row.part).physicalPart ===
          bundleMetadata(input.key.part).physicalPart
      );
      if (overlap) return { claim: projectClaim(overlap), kind: "uncertain" };
    }

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
