# @jory/marketing

The standalone Jory public marketing site, built with Next.js 16 App Router
inside the repository's pnpm workspace. It contains the public landing,
product-story, pricing, security, terms, why, world, and scroll-world routes.

## Stack

- **Next.js 16** (App Router)
- **TypeScript** (strict)
- **Tailwind CSS v4** (`@tailwindcss/postcss`)
- **Inter Tight** via `next/font/google`
- **Vitest** + `@testing-library/react` (unit tests)
- **Playwright** (E2E smoke test)
- **pino** (structured logging on server, console shim on client)

## Running locally

From the repository root, run `pnpm install` and `pnpm dev:marketing`. Or run
the package directly with `pnpm --filter @jory/marketing dev`.

The root `pnpm check` and `pnpm build` commands include this package; the
package-level `check` command runs its typecheck, unit tests, and build.

## Tests

```bash
pnpm --filter @jory/marketing typecheck
pnpm --filter @jory/marketing test
pnpm --filter @jory/marketing build
pnpm --filter @jory/marketing test:e2e
```

The Playwright smoke suite builds and starts the package on port 3210, so it
does not require a separately running app or the excluded dashboard Core stub.

## Configuration

- `JORY_CORE_BASE_URL` is an optional server-only target for `POST /api/signup`.
  When it is unset or unreachable, the route preserves the public 503 response;
  malformed requests preserve the 400 response.
- `NEXT_PUBLIC_SITE_URL` controls metadata, sitemap, and robots URLs. It
  defaults to `https://heyjory.com`.
