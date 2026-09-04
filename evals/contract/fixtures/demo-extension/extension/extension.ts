import { defineExtension } from "eve/extension";
import { z } from "zod";

export default defineExtension({
  config: z.object({ serverUrl: z.url() }),
});
