import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { accessScopeForUser } from "@/lib/access-scope";
import {
  agentManifestContentDigest,
  type AgentManifest,
} from "@/lib/agent-manifest";
import {
  agentRevisions,
  agents,
  channelConversations,
  channelParticipants,
  db,
  phoneIdentities,
  platformLines,
  workspaceMemberships,
} from "@/db";
import { recordAuditEvent } from "./audit";

const bindingSelection = {
  agentId: channelConversations.agentId,
  createdAt: channelConversations.createdAt,
  id: channelConversations.id,
  pinnedRevisionId: channelConversations.pinnedRevisionId,
  platformLine: platformLines,
  platformLineId: channelConversations.platformLineId,
  provider: channelConversations.provider,
  providerAccountId: channelConversations.providerAccountId,
  providerConversationId: channelConversations.providerConversationId,
  status: channelConversations.status,
  updatedAt: channelConversations.updatedAt,
  workspaceId: channelConversations.workspaceId,
};

const legacyPersonalAgentManifest = {
  capabilities: [],
  instructions: "You are a helpful personal assistant.",
  modelPolicy: { tier: "standard" },
  version: 1,
} satisfies AgentManifest;

function activeBindingConditions({
  provider,
  providerAccountId,
  providerConversationId,
  workspaceId,
}: {
  readonly provider: string;
  readonly providerAccountId: string;
  readonly providerConversationId: string;
  readonly workspaceId?: string;
}) {
  return and(
    eq(channelConversations.provider, provider),
    eq(channelConversations.providerAccountId, providerAccountId),
    eq(channelConversations.providerConversationId, providerConversationId),
    eq(channelConversations.status, "active"),
    ...(workspaceId ? [eq(channelConversations.workspaceId, workspaceId)] : [])
  );
}

export async function resolveConversationBinding({
  provider,
  providerAccountId,
  providerConversationId,
}: {
  readonly provider: string;
  readonly providerAccountId: string;
  readonly providerConversationId: string;
}) {
  const [binding] = await db
    .select(bindingSelection)
    .from(channelConversations)
    .innerJoin(
      platformLines,
      eq(platformLines.id, channelConversations.platformLineId)
    )
    .where(
      activeBindingConditions({
        provider,
        providerAccountId,
        providerConversationId,
      })
    )
    .limit(1);
  return binding;
}

export async function claimConversationInboundMessage({
  bindingId,
  messageId,
  workspaceId,
}: {
  readonly bindingId: string;
  readonly messageId: string;
  readonly workspaceId: string;
}) {
  const [claimed] = await db
    .update(channelConversations)
    .set({
      lastInboundMessageId: messageId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(channelConversations.id, bindingId),
        eq(channelConversations.workspaceId, workspaceId),
        eq(channelConversations.status, "active"),
        or(
          isNull(channelConversations.lastInboundMessageId),
          ne(channelConversations.lastInboundMessageId, messageId)
        )
      )
    )
    .returning({ id: channelConversations.id });
  return claimed !== undefined;
}

export async function createConversationBinding({
  phoneIdentityId,
  platformLine,
  provider,
  providerAccountId,
  providerConversationId,
  userId,
}: {
  readonly phoneIdentityId: string;
  readonly platformLine: {
    readonly connectorId?: string;
    readonly environment?: string;
    readonly providerLineId: string;
  };
  readonly provider: "linq";
  readonly providerAccountId: string;
  readonly providerConversationId: string;
  readonly userId: string;
}) {
  const scope = accessScopeForUser(`better-auth:${userId}`);
  const now = new Date();

  const binding = await db.transaction(async (transaction) => {
    const [identity] = await transaction
      .select({ id: phoneIdentities.id })
      .from(phoneIdentities)
      .where(
        and(
          eq(phoneIdentities.id, phoneIdentityId),
          eq(phoneIdentities.userId, userId),
          eq(phoneIdentities.status, "verified")
        )
      )
      .limit(1);
    if (!identity) return undefined;

    const activeAgents = await transaction
      .select({ id: agents.id, activeRevisionId: agents.activeRevisionId })
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, scope.workspaceId),
          eq(agents.status, "active"),
          isNotNull(agents.activeRevisionId)
        )
      )
      .for("update")
      .limit(2);
    let [agent] = activeAgents;
    if (activeAgents.length === 0) {
      agent = await reconcileLegacyPersonalAgent(transaction, scope, userId);
    }
    if (activeAgents.length > 1 || !agent) return undefined;
    if (!agent.activeRevisionId) return undefined;

    await transaction
      .insert(platformLines)
      .values({
        connectorId: platformLine.connectorId,
        environment: platformLine.environment,
        id: randomUUID(),
        provider,
        providerLineId: platformLine.providerLineId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        set: {
          connectorId: platformLine.connectorId,
          environment: platformLine.environment,
          updatedAt: now,
        },
        target: [platformLines.provider, platformLines.providerLineId],
      });
    const [line] = await transaction
      .select({ id: platformLines.id })
      .from(platformLines)
      .where(
        and(
          eq(platformLines.provider, provider),
          eq(platformLines.providerLineId, platformLine.providerLineId)
        )
      )
      .limit(1);
    if (!line) throw new Error("Failed to resolve platform line.");

    await transaction
      .insert(channelConversations)
      .values({
        agentId: agent.id,
        id: randomUUID(),
        pinnedRevisionId: agent.activeRevisionId,
        platformLineId: line.id,
        provider,
        providerAccountId,
        providerConversationId,
        updatedAt: now,
        workspaceId: scope.workspaceId,
      })
      .onConflictDoNothing({
        target: [
          channelConversations.provider,
          channelConversations.providerAccountId,
          channelConversations.providerConversationId,
        ],
      });

    const [conversationBinding] = await transaction
      .select(bindingSelection)
      .from(channelConversations)
      .innerJoin(
        platformLines,
        eq(platformLines.id, channelConversations.platformLineId)
      )
      .where(
        activeBindingConditions({
          provider,
          providerAccountId,
          providerConversationId,
          workspaceId: scope.workspaceId,
        })
      )
      .limit(1);
    if (!conversationBinding) return undefined;

    await transaction
      .insert(channelParticipants)
      .values({
        conversationId: conversationBinding.id,
        id: randomUUID(),
        phoneIdentityId,
      })
      .onConflictDoNothing({
        target: [
          channelParticipants.conversationId,
          channelParticipants.phoneIdentityId,
        ],
      });
    return conversationBinding;
  });
  if (binding) {
    void recordAuditEvent(scope, {
      action: "channel.conversation.bind",
      target: binding.id,
    }).catch(() => {
      console.warn("[audit] event recording failed");
    });
  }
  return binding;
}

async function reconcileLegacyPersonalAgent(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  scope: ReturnType<typeof accessScopeForUser>,
  userId: string
) {
  if (
    accessScopeForUser(`better-auth:${userId}`).workspaceId !==
    scope.workspaceId
  ) {
    return undefined;
  }

  const owners = await transaction
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, scope.workspaceId),
        eq(workspaceMemberships.role, "owner"),
        eq(workspaceMemberships.status, "active")
      )
    )
    .limit(2);
  if (owners.length !== 1 || owners[0]?.userId !== scope.userId)
    return undefined;

  const agentId = randomUUID();
  const revisionId = randomUUID();
  const now = new Date();
  await transaction.insert(agents).values({
    activeRevisionId: null,
    createdAt: now,
    displayName: "Personal assistant",
    id: agentId,
    slug: "personal-assistant",
    status: "draft",
    updatedAt: now,
    workspaceId: scope.workspaceId,
  });
  await transaction.insert(agentRevisions).values({
    agentId,
    contentDigest: agentManifestContentDigest(legacyPersonalAgentManifest),
    createdAt: now,
    createdByUserId: scope.userId,
    id: revisionId,
    manifest: legacyPersonalAgentManifest,
    revisionNumber: 1,
    workspaceId: scope.workspaceId,
  });
  const [agent] = await transaction
    .update(agents)
    .set({ activeRevisionId: revisionId, status: "active", updatedAt: now })
    .where(
      and(eq(agents.id, agentId), eq(agents.workspaceId, scope.workspaceId))
    )
    .returning({ id: agents.id, activeRevisionId: agents.activeRevisionId });
  return agent;
}

// Lifecycle close handling arrives with the channel webhook slice.
