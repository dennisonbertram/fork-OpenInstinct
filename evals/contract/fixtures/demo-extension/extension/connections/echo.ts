import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import extension from "../extension";

export default defineDynamic({
  events: {
    "session.started": () =>
      defineMcpClientConnection({
        auth: {
          getToken: async () => ({ token: extension.config.serverToken }),
          principalType: "user",
        },
        instanceKey: "contract-user-account",
        url: extension.config.serverUrl,
        description: "Demo echo service for the contract mount harness.",
        tools: { allow: ["echo"] },
      }),
  },
});
