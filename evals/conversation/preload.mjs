/* oxlint-disable anti-slop/no-runtime-typeof -- This preload parses its environment before any framework module loads. */
/* oxlint-disable eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- Evaluation-only Node preload runs before TypeScript or framework env loaders; these transient supervisor values are checked below. */
/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-argument, typescript/restrict-template-expressions -- Plain JavaScript preloader has no TypeScript project context. Runtime shape checks guard its environment contract. */
// Evaluation-only transport. Never import this from the application.
const originalFetch = globalThis.fetch;
const gateway = process.env.CONVERSATION_BUDGET_URL;
const token = process.env.CONVERSATION_BUDGET_TOKEN;
if (
  typeof gateway !== "string" ||
  typeof token !== "string" ||
  !gateway ||
  !token
)
  throw new Error("Missing evaluation budget transport");
const allowedReads = JSON.parse(
  process.env.CONVERSATION_ALLOWED_READ_URLS ?? "[]"
);
if (
  !Array.isArray(allowedReads) ||
  allowedReads.some((value) => typeof value !== "string")
)
  throw new Error("Invalid allowed read URLs");
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin === "https://ai-gateway.vercel.sh") {
    const headers = new Headers(request.headers);
    headers.set("authorization", `Bearer ${token}`);
    return originalFetch(`${gateway}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      signal: request.signal,
      redirect: "error",
    });
  }
  if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    return originalFetch(request, { redirect: "error" });
  const fixture = process.env.CONVERSATION_FIXTURE_URL;
  if (
    fixture &&
    url.origin === "https://api.vercel.com" &&
    url.pathname.startsWith("/v1/connect/")
  ) {
    const headers = new Headers(request.headers);
    headers.delete("authorization");
    return originalFetch(`${fixture}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      signal: request.signal,
      redirect: "error",
    });
  }
  if (request.method === "GET" && allowedReads.includes(url.href))
    return originalFetch(request, { redirect: "error" });
  throw new Error(`Evaluation blocked external request to ${url.origin}`);
};
