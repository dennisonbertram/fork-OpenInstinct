import { defineDynamic } from "eve/instructions";
import { resolveModeInstructions } from "@/agent/lib/mode";
import messageStyle from "./content/message-style.md?raw";

export default defineDynamic({
  events: {
    "turn.started": (_event, context) =>
      resolveModeInstructions(context, {
        "channel-observed": messageStyle,
        interactive: messageStyle,
        "scheduled-report": messageStyle,
      }),
  },
});
