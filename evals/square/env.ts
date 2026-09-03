import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const squareEvalEnv = createEnv({
  server: {
    GITHUB_STEP_SUMMARY: z.string().min(1).optional(),
  },
  experimental__runtimeEnv: {},
});
