import { ensureScope, verifyScopeAccess } from "@/db/services/scope";
import { accessScopeForUser } from "@/lib/access-scope";

const scope = accessScopeForUser("better-auth:browser-benchmark");
await ensureScope(scope);

if (!(await verifyScopeAccess(scope))) {
  throw new Error("Could not provision the Square eval access scope.");
}
