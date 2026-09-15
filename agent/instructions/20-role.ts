import { defineDynamic, defineInstructions } from "eve/instructions";
import {
  isChannelObservedSession,
  resolveModeInstructions,
} from "@/agent/lib/mode";
import { applicationOrigin } from "@/lib/application-origin";
import channelObservedInstructions from "./content/role/channel-observed.md?raw";
import interactiveInstructions from "./content/role/interactive.md?raw";
import scheduledReportInstructions from "./content/role/scheduled-report.md?raw";
import scheduledWorkerInstructions from "./content/role/scheduled-worker.md?raw";

export default defineDynamic({
  events: {
    "turn.started": (_event, context) => {
      if (isChannelObservedSession(context)) {
        const secureWorkspaceUrl = new URL(
          "/sign-in?callbackUrl=%2F",
          applicationOrigin()
        ).toString();
        return defineInstructions({
          content: `${channelObservedInstructions}\n\nTo verify securely and optionally connect Square, open ${secureWorkspaceUrl}. Basic text and photo help does not require verification or a connection.`,
        });
      }
      return resolveModeInstructions(context, {
        "channel-observed": channelObservedInstructions,
        interactive: interactiveInstructions,
        "scheduled-report": scheduledReportInstructions,
        "scheduled-worker": scheduledWorkerInstructions,
      });
    },
  },
});
