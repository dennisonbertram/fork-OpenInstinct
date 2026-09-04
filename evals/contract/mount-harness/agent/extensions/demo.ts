import demo from "@openinstinct/contract-demo-extension";
import { env } from "../../env";

export default demo({ serverUrl: env.CONTRACT_MCP_URL });
