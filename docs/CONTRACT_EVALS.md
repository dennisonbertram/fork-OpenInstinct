# Fork contract evals: pin behavior upstream does not know about

This suite fails when an upstream merge breaks behavior only this fork owns.
It was introduced after the 2026-09-03 sync changed root tools and message
delivery without an automated fork-level gate.

Labels follow [`README.md`](README.md). **Implemented** means the repository
contains the behavior and a model-free check. **Covered elsewhere** names a
durable test that is a better fit than an Eve eval. **Proposed** remains future
work.

Related: [`PLUGIN_TESTING.md`](PLUGIN_TESTING.md) for the plugin test ladder and
[`SQUARE.md`](SQUARE.md) for the paid Square behavior gym.

## Two tiers

| Tier            | Command                         | Model                                     | Gate                                         |
| --------------- | ------------------------------- | ----------------------------------------- | -------------------------------------------- |
| Contract wiring | `pnpm eval:contract`            | scripted `mockModel`                      | every pull request and every upstream sync   |
| Behavior gyms   | `pnpm eval:square`, agent evals | real model and, where configured, a judge | on demand and for paths named in `AGENTS.md` |

The contract suite proves wiring, tool availability, scope, and mount names.
The paid gyms prove model judgment. Neither substitutes for the other.

## Implemented harness

`EVAL_CONTRACT_FIXTURE=1` selects
`evals/contract/fixture-model.ts` from the existing `step.started` resolver in
`agent/agent.ts`. Eve 0.49 requires a dynamic direct-model selection to include
`modelContextWindowTokens`; the resolver returns 128,000 for this fixture.

The flag is validated in `src/env.ts` and is accepted only in local development
with no Vercel environment. The production model path is unchanged. The
resolver still checks the authenticated caller and scheduled-run lease before
it selects the fixture.

The fixture understands a small command language:

```text
say <text> | <text>       call send_message once per segment
react heart               call react_to_message
load square               call load_skill
attach https://...        send a URL-backed image attachment
inspect <tool>            report whether a tool is present
call <tool> <json>        discover a connection tool when needed, call it,
                          then deliver its result through send_message
```

The supervisor in `scripts/run-contract-evals.ts`:

1. removes `AI_GATEWAY_API_KEY`, `VERCEL_OIDC_TOKEN`, and `VERCEL_ENV`;
2. starts an isolated Compose PostgreSQL database, the fake Square server, and
   a loopback stateless MCP server;
3. migrates and seeds the fixed authenticated caller;
4. builds the demo Eve extension;
5. runs the product-agent contract evals, then the isolated mount harness; and
6. stops both servers and removes the database volume on success, failure, or
   an interrupt.

The supervisor owns strict mode, targets, tags, reporters, and concurrency.
Only bounded output options such as `--junit`, `--json`, `--list`, `--verbose`,
and `--timeout` may pass through.

## Contract matrix

### Product agent: `evals/contract`

| Eval                       | Implemented contract                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `delivery-one-bubble`      | The agent delivers a reply through exactly one `send_message` call and leaves only `DELIVERY_COMPLETE` as assistant text. |
| `delivery-two-bubbles`     | Two requested messages produce two ordered `send_message` calls.                                                          |
| `delivery-reaction`        | A Tapback uses `react_to_message` and sends no text bubble.                                                               |
| `delivery-image-url`       | An image is passed as a URL attachment, never inline base64.                                                              |
| `delivery-no-markdown`     | A Square result delivered through `send_message` satisfies the plain-text delivery contract.                              |
| `scope-enforce-on`         | The suite runs with enforcement on and a Square read succeeds for the seeded user principal.                              |
| `square-skill-loads`       | The enabled root `load_skill` tool loads `square`.                                                                        |
| `square-connection-found`  | The enabled root `connection_search` tool discovers Square using its `{ keywords }` input contract.                       |
| `square-read-tool-works`   | Discovery exposes `square__ListCustomers`, which reaches the fake server as the authenticated workspace caller.           |
| `square-write-tool-absent` | `square__CreateCustomer` is absent from the model-visible tool surface.                                                   |

The fixture-only Square sandbox token path still derives and verifies the
user's workspace scope. The ordinary sandbox and production auth paths are not
weakened to make the eval work.

### Extension seam: isolated mount harness

`evals/contract/mount-harness` is a separate Eve app. It mounts the built
workspace fixture package from
`evals/contract/fixtures/demo-extension`; the product agent never imports or
mounts that test extension.

| Eval                    | Implemented contract                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `mount-demo-tool`       | A native extension tool is callable as `demo__ping`.                                                            |
| `mount-demo-connection` | `connection_search` discovers the mounted `demo__echo` connection and calls its MCP tool as `demo__echo__echo`. |

The MCP server uses `@modelcontextprotocol/sdk@1.30.0`, matching Eve's supported
2025-11-25 protocol generation, and returns bounded structured content.

## Covered elsewhere

The Eve eval channel does not post a real Linq webhook. Transport-specific
contracts remain in `tests/agent/channels/linq-message-delivery.test.ts`, where
the repository proves user-facing approval prompts hide tool internals and
accept clear natural confirmations, plus one tool call per native bubble,
native attachments, retries, galleries, and Tapbacks. Inbound signature,
duplicate-claim, and unverified-sender behavior also remains in channel tests.

Cross-workspace denial and fail-closed no-user behavior remain integration and
auth unit tests. The model-free eval channel currently authenticates one fixed
principal, so an eval cannot honestly prove a two-principal journey.

`tests/unit/agent-tool-boundaries.test.ts` pins the exact allowed set of root
tool stubs. An upstream addition that disables `load_skill` or
`connection_search` fails before the eval job.

## Proposed follow-up

Add an eval-only authenticated caller selector before moving any
two-principal scope case into this suite. It must remain guarded by the same
local-only fixture flag and must not become a production authentication path.

Approval rendering should stay in the Linq channel test unless a future eval
target can exercise the real Linq delivery adapter; observing a generic
`input.requested` event would not prove the text the user actually receives.

## Pull-request gate

`.github/workflows/checks.yml` runs `pnpm eval:contract` after the ordinary
checks job and uploads `.eve/evals` on failure. Contract evals use no judge and
no provider credential. A sync PR cannot merge while this job is red.

During implementation, temporarily restoring upstream's disabling stubs for
`load_skill` and `connection_search` made the root-boundary unit test fail and
made four product contract evals fail, including the Square skill and read-tool
rows. Removing the stubs restored the green suite. This mutation is not part of
the committed tree.
