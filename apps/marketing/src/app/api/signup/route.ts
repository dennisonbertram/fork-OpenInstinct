// Public marketing-site signup proxy: forwards { email } to Core's
// POST /public/signup and passes Core's JSON response through with Core's
// status. Not dashboard-gated -- this must work whenever the site is up.

function coreBaseUrl(): string | undefined {
  const value = process.env.JORY_CORE_BASE_URL;
  return value && value.length > 0 ? value.replace(/\/+$/, "") : undefined;
}

export async function POST(request: Request): Promise<Response> {
  const base = coreBaseUrl();
  if (!base) {
    return Response.json(
      { ok: false, error: "core_unreachable" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid_email" },
      { status: 400 }
    );
  }

  const email =
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>).email === "string"
      ? ((body as Record<string, unknown>).email as string)
      : undefined;

  if (!email || email.length === 0 || email.length > 254) {
    return Response.json(
      { ok: false, error: "invalid_email" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${base}/public/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json().catch(() => ({}));
    return Response.json(json, { status: res.status });
  } catch {
    return Response.json(
      { ok: false, error: "core_unreachable" },
      { status: 503 }
    );
  }
}
