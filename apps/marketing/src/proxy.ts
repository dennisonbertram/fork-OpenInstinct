import type { NextRequest } from "next/server";

// The marketing app has no authenticated middleware boundary. This local
// no-op proxy keeps Next from discovering the parent application's proxy when
// building from the workspace.
export function proxy(_request: NextRequest) {}
