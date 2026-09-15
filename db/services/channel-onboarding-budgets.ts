import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  channelOnboardingQuotaBuckets,
  channelOnboardingQuotaReservations,
} from "@/db";
import { env } from "@/env";

type ChannelOnboardingQuotaKind =
  | "enrollment"
  | "model_turn"
  | "outbound_message";

type Executor = Pick<typeof db, "insert" | "select" | "update" | "execute">;

export interface ChannelOnboardingBudgetScope {
  readonly provider: "sendblue";
  readonly providerAccountId: string;
  readonly providerLineId: string;
}

export type ChannelOnboardingBudgetTransaction = Executor;

interface ReserveInput {
  readonly now?: Date;
  readonly requestKey: string;
  readonly scope: ChannelOnboardingBudgetScope;
  readonly transaction?: ChannelOnboardingBudgetTransaction;
}

export type ChannelOnboardingReservation =
  | { readonly kind: "reserved" }
  | { readonly kind: "already_reserved" }
  | { readonly kind: "limit_reached" };

export async function reserveChannelOnboardingEnrollment(
  input: ReserveInput & { readonly senderKey: string }
): Promise<ChannelOnboardingReservation> {
  return reserve("enrollment", input, input.senderKey);
}

export async function reserveChannelOnboardingModelTurn(
  input: ReserveInput
): Promise<ChannelOnboardingReservation> {
  return reserve("model_turn", input, null);
}

export async function reserveChannelOnboardingOutboundMessage(
  input: ReserveInput
): Promise<ChannelOnboardingReservation> {
  return reserve("outbound_message", input, null);
}

async function reserve(
  kind: ChannelOnboardingQuotaKind,
  input: ReserveInput,
  senderLookupHash: string | null
): Promise<ChannelOnboardingReservation> {
  validateInput(input, senderLookupHash);
  const limit = configuredLimit(kind);
  const reservationProviderLineId =
    kind === "enrollment" ? input.scope.providerLineId : null;
  const bucketStart =
    kind === "enrollment" ? enrollmentBucketStart : startOfUtcDay(input.now);
  const run = (transaction: Executor) =>
    reserveInTransaction({
      bucketStart,
      input,
      kind,
      limit,
      reservationProviderLineId,
      senderLookupHash,
      transaction,
    });
  return input.transaction ? run(input.transaction) : db.transaction(run);
}

async function reserveInTransaction({
  bucketStart,
  input,
  kind,
  limit,
  reservationProviderLineId,
  senderLookupHash,
  transaction,
}: {
  readonly bucketStart: Date;
  readonly input: ReserveInput;
  readonly kind: ChannelOnboardingQuotaKind;
  readonly limit: number;
  readonly reservationProviderLineId: string | null;
  readonly senderLookupHash: string | null;
  readonly transaction: Executor;
}): Promise<ChannelOnboardingReservation> {
  // Enrollment takes the same subject lock as provisioning, and it must be
  // the first database statement in this transaction. This prevents a second
  // first-contact transaction from observing a half-provisioned identity.
  if (kind === "enrollment" && senderLookupHash !== null) {
    await lockEnrollmentSubject(transaction, input.scope, senderLookupHash);
  }
  await lockOperationKey(transaction, input.requestKey);
  if (kind !== "enrollment") {
    await lockDailyAccountBucket(transaction, input.scope, kind, bucketStart);
  }

  const [existing] = await transaction
    .select({
      accepted: channelOnboardingQuotaReservations.accepted,
      kind: channelOnboardingQuotaReservations.kind,
      provider: channelOnboardingQuotaReservations.provider,
      providerAccountId: channelOnboardingQuotaReservations.providerAccountId,
      providerLineId: channelOnboardingQuotaReservations.providerLineId,
      senderLookupHash: channelOnboardingQuotaReservations.senderLookupHash,
    })
    .from(channelOnboardingQuotaReservations)
    .where(
      eq(channelOnboardingQuotaReservations.operationKey, input.requestKey)
    )
    .limit(1);
  if (existing) {
    if (
      existing.kind !== kind ||
      existing.provider !== input.scope.provider ||
      existing.providerAccountId !== input.scope.providerAccountId ||
      existing.providerLineId !== reservationProviderLineId ||
      existing.senderLookupHash !== senderLookupHash
    ) {
      throw new Error(
        "Channel onboarding quota operation key was reused for another scope."
      );
    }
    return existing.accepted
      ? { kind: "already_reserved" }
      : { kind: "limit_reached" };
  }

  const bucketWhere = and(
    eq(channelOnboardingQuotaBuckets.kind, kind),
    eq(channelOnboardingQuotaBuckets.provider, input.scope.provider),
    eq(
      channelOnboardingQuotaBuckets.providerAccountId,
      input.scope.providerAccountId
    ),
    kind === "enrollment"
      ? eq(
          channelOnboardingQuotaBuckets.providerLineId,
          input.scope.providerLineId
        )
      : isNull(channelOnboardingQuotaBuckets.providerLineId),
    eq(channelOnboardingQuotaBuckets.bucketStart, bucketStart),
    senderLookupHash === null
      ? isNull(channelOnboardingQuotaBuckets.senderLookupHash)
      : eq(channelOnboardingQuotaBuckets.senderLookupHash, senderLookupHash)
  );

  const [created] = await transaction
    .insert(channelOnboardingQuotaBuckets)
    .values({
      bucketStart,
      id: randomUUID(),
      kind,
      provider: input.scope.provider,
      providerAccountId: input.scope.providerAccountId,
      providerLineId: kind === "enrollment" ? input.scope.providerLineId : null,
      senderLookupHash,
      updatedAt: input.now,
      used: 1,
    })
    .onConflictDoNothing()
    .returning({
      id: channelOnboardingQuotaBuckets.id,
      used: channelOnboardingQuotaBuckets.used,
    });

  const bucket =
    created ??
    (
      await transaction
        .select({
          id: channelOnboardingQuotaBuckets.id,
          used: channelOnboardingQuotaBuckets.used,
        })
        .from(channelOnboardingQuotaBuckets)
        .where(bucketWhere)
        .for("update")
        .limit(1)
    )[0];
  if (!bucket)
    throw new Error("Channel onboarding quota bucket was not created.");

  const accepted = created !== undefined || bucket.used < limit;
  if (accepted && !created) {
    await transaction
      .update(channelOnboardingQuotaBuckets)
      .set({
        updatedAt: input.now,
        used: sql`${channelOnboardingQuotaBuckets.used} + 1`,
      })
      .where(eq(channelOnboardingQuotaBuckets.id, bucket.id));
  }

  await transaction.insert(channelOnboardingQuotaReservations).values({
    accepted,
    bucketStart,
    counterId: bucket.id,
    kind,
    operationKey: input.requestKey,
    provider: input.scope.provider,
    providerAccountId: input.scope.providerAccountId,
    providerLineId: reservationProviderLineId,
    senderLookupHash,
  });
  return accepted ? { kind: "reserved" } : { kind: "limit_reached" };
}

function configuredLimit(kind: ChannelOnboardingQuotaKind) {
  const limit =
    kind === "enrollment"
      ? env.SENDBLUE_TEXT_ONBOARDING_MAX_ENROLLMENTS_PER_SENDER
      : kind === "model_turn"
        ? env.SENDBLUE_TEXT_ONBOARDING_MAX_MODEL_TURNS_PER_DAY
        : env.SENDBLUE_TEXT_ONBOARDING_MAX_OUTBOUND_MESSAGES_PER_DAY;
  if (limit === undefined) {
    throw new Error(
      `SendBlue text onboarding ${kind} limit is not configured.`
    );
  }
  return limit;
}

function validateInput(input: ReserveInput, senderLookupHash: string | null) {
  if (!input.requestKey)
    throw new Error("Channel onboarding quota request key is required.");
  if (!input.scope.providerAccountId || !input.scope.providerLineId) {
    throw new Error("Channel onboarding quota scope is required.");
  }
  if (senderLookupHash !== null && !senderLookupHash) {
    throw new Error("Channel onboarding enrollment sender key is required.");
  }
}

const enrollmentBucketStart = new Date("1970-01-01T00:00:00.000Z");

function startOfUtcDay(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

async function lockEnrollmentSubject(
  transaction: Executor,
  scope: ChannelOnboardingBudgetScope,
  senderLookupHash: string
) {
  await transaction.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('channel-onboarding-subject:' || ${scope.provider} || ':' || ${scope.providerAccountId} || ':' || ${scope.providerLineId} || ':' || ${senderLookupHash}))`
  );
}

async function lockOperationKey(transaction: Executor, operationKey: string) {
  await transaction.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('channel-onboarding-operation:' || ${operationKey}))`
  );
}

async function lockDailyAccountBucket(
  transaction: Executor,
  scope: ChannelOnboardingBudgetScope,
  kind: Exclude<ChannelOnboardingQuotaKind, "enrollment">,
  bucketStart: Date
) {
  await transaction.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('channel-onboarding-account-day:' || ${scope.provider} || ':' || ${scope.providerAccountId} || ':' || ${kind} || ':' || ${bucketStart.toISOString()}))`
  );
}
