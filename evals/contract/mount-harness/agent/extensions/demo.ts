import demo from "@openinstinct/contract-demo-extension";
import { env } from "../../env";

export default demo({
  serverToken: env.CONTRACT_MCP_TOKEN,
  serverUrl: env.CONTRACT_MCP_URL,
});
