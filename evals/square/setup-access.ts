import { selectGatewayModel } from "@/db/services/settings";
import { ensureScope, verifyScopeAccess } from "@/db/services/scope";
import { accessScopeForUser } from "@/lib/access-scope";

const modelId = readModelArgument(process.argv.slice(2));
const scope = accessScopeForUser("better-auth:browser-benchmark");
await ensureScope(scope);

if (!(await verifyScopeAccess(scope))) {
  throw new Error("Could not provision the Square eval access scope.");
}

if (modelId) await selectGatewayModel(scope, modelId);

function readModelArgument(args: string[]) {
  if (args.length === 0) return undefined;
  if (args.length !== 2 || args[0] !== "--model") {
    throw new Error("Eval setup accepts only --model <model-id>.");
  }
  const model = args[1]?.trim();
  if (!model || model.length > 300) {
    throw new Error(
      "--model must be a non-empty model ID of at most 300 characters."
    );
  }
  return model;
}
