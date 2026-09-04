import { getTenancyReadiness } from "../db/services/tenancy-readiness.ts";

const report = await getTenancyReadiness();
process.stdout.write(`${JSON.stringify(report)}\n`);
