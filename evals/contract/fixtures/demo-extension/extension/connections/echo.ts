import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import extension from "../extension";

export default defineDynamic({
  events: {
    "session.started": () =>
      defineMcpClientConnection({
        url: extension.config.serverUrl,
        description: "Demo echo service for the contract mount harness.",
        tools: { allow: ["echo"] },
      }),
  },
});
