import { defineInstrumentation } from "eve/instrumentation";
import { evlogRuntimeContext } from "evlog/eve";
import {
  linqLatencyRuntimeContext,
  recordLinqLatencyModelInputPrepared,
} from "@/agent/lib/linq/timing";

export default defineInstrumentation({
  recordInputs: true,
  recordOutputs: true,
  traceChannelRequests: true,
  events: {
    "step.started": (input) => {
      const preparedAtMs = Date.now();
      recordLinqLatencyModelInputPrepared(input, preparedAtMs);
      const runtimeContext = {
        ...evlogRuntimeContext(input),
        ...linqLatencyRuntimeContext(input.session.auth.current, preparedAtMs),
      };
      return Object.keys(runtimeContext).length === 0
        ? undefined
        : { runtimeContext };
    },
  },
});
