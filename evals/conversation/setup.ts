import { ensureScope } from "@/db/services/scope";
import { getGatewayModel } from "@/db/services/settings";
import { accessScopeForUser } from "@/lib/access-scope";
import { db } from "@/db";
const scope = accessScopeForUser("better-auth:browser-benchmark");
await ensureScope(scope);
console.log(`CONVERSATION_MODEL=${await getGatewayModel(scope)}`);
await db.$client.end();
