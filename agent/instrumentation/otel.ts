import { otel } from "eve/instrumentation/otel";
import { disableInstrumentation } from "eve/instrumentation";
import { isWorkflowResumeTimingEnabled } from "@/env";

export default isWorkflowResumeTimingEnabled()
  ? otel({
      traceChannelRequests: true,
    })
  : disableInstrumentation();
