import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Return a deterministic pong from the mounted demo extension.",
  inputSchema: z.object({ name: z.string() }),
  execute: ({ name }) => ({ text: `pong ${name}` }),
});
