import { eveChannel } from "eve/channels/eve";
import { localDev } from "eve/channels/auth";

const authenticateLocalDev = localDev();

export default eveChannel({
  auth: async (request) => {
    const local = await authenticateLocalDev(request);
    if (!local) return null;
    return {
      ...local,
      authenticator: "contract-local-dev",
      principalId: "better-auth:contract-user",
      principalType: "user",
    };
  },
});
