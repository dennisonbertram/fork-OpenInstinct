import { disableInstrumentation } from "eve/instrumentation";

// The timing diagnostic writes an allowlisted local operational record instead
// of forwarding spans to Vercel Agent Runs. Keep Eve's seeded destination off.
export default disableInstrumentation();
