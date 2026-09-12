export * from "./diagnostics/index";

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./diagnostics/index";

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  void main();
