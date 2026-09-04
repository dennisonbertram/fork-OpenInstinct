import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: { CONTRACT_MCP_URL: z.url() },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
