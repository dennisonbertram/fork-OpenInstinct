import { defineExtension } from "eve/extension";
import { z } from "zod";

export default defineExtension({
  config: z.object({
    serverToken: z.string().min(16),
    serverUrl: z.url(),
  }),
});
