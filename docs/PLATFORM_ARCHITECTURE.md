# Platform architecture: integration ownership

This is the implementation boundary for adding product capabilities to this
fork. It distinguishes what belongs in core from what should ship as an Eve
extension, skill, connection, or MCP server.

Labels follow [`README.md`](README.md). The boundaries and reference harness
below are **Implemented**. Individual future plugins remain **Proposed** until
their own code and test ladder exist.

## The path forward

Keep this fork. Treat OpenInstinct upstream as an optional source of changes,
not as a parent that must continually be merged. Keep Eve as the runtime and
extend it through its authored capability surfaces. A fork patch is an
exception with an owner and removal test, not a normal integration technique.

The model may choose among capabilities that trusted code already authorized.
It never chooses the caller identity, workspace, credential, provider endpoint,
or approval policy.

## Ownership boundaries

| Concern                                               | Owner                                   | Rule                                                                                     |
| ----------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Login, workspace membership, vault, policy, revisions | core application                        | Server-derived identity and workspace are authoritative.                                 |
| Turn loop, sessions, capability mounting              | Eve                                     | Prefer documented Eve APIs; track every package patch.                                   |
| iMessage, SMS, or another transport                   | one provider channel adapter            | Provider conditionals stop at the channel boundary.                                      |
| Conversation and delegation                           | root agent                              | No browser access and no credential values.                                              |
| Browser and vault injection                           | browser worker                          | Secrets enter trusted tools by opaque handle only.                                       |
| Optional procedure                                    | skill                                   | Guidance only; it does not grant a capability.                                           |
| External service capability                           | native tool, OpenAPI, or MCP connection | Choose the provider interface that fits; package reusable contributions as an extension. |
| External credential                                   | Eve connection auth or trusted broker   | Resolve per authenticated principal; never put it in model input or history.             |

Do not add a generic plugin loader, tool catalog, dependency container, or a
provider switch in core. Eve already discovers and namespaces extension
capabilities as `<mount>__<capability>`.

## Credential-bearing capability pattern

1. A verified channel establishes a user principal and workspace.
2. The authored tool or connection resolves credentials for that principal.
3. Trusted connection auth obtains or mints a bearer token.
4. The trusted tool or Eve connection injects credentials into the provider
   request; they are not model arguments.
5. The provider/service verifies authorization and enforces its read/write policy.
6. Results are bounded and contain no credential.

Use `principalType: "user"` for a user's external account. Use app scope only
for an explicitly shared installation. A write tool additionally needs clear
approval, an idempotency key, and an outcome that distinguishes succeeded,
failed, and uncertain dispatch.

The reference fixture under `evals/contract/fixtures/demo-extension` implements
a packaged skill, a user-scoped Eve MCP connection using a fixed synthetic
bearer, and one read-only MCP tool. It is isolated test code, not a production
identity verifier, and is not mounted by the product agent. Square uses an
OpenAPI connection; Gmail uses native tools. See [PLUGINS.md](PLUGINS.md) for
the current integration choices. Customer-supplied endpoints remain future work.

## Messaging provider contract

Provider adapters must instantiate the shared test contract in
`tests/agent/channels/provider-contract.ts`. It pins the portable behavior:

- one logical text send produces one provider message;
- images stay native URL attachments;
- a reaction creates no text message;
- approval text names clear confirmation and cancellation choices without
  exposing internal tool names; and
- unsigned inbound requests fail closed.

Linq instantiates it today. A future Sendblue adapter must pass the same suite
before product routing can select it. Do not introduce a production provider
abstraction until a second implementation makes the common shape concrete.

## Gym ladder

| Layer                         | Purpose                                                    | Gate                       |
| ----------------------------- | ---------------------------------------------------------- | -------------------------- |
| Static boundary tests         | namespaces, allowed tools, patch size, no writes           | every PR                   |
| Provider contract             | portable delivery and inbound authentication               | every provider PR          |
| Model-free Eve contract evals | root wiring, scope, extension mount, credentialed MCP call | every PR and sync intake   |
| Integration tests             | database scope and two-principal denial                    | every relevant PR          |
| Paid behavior gym             | model judgment and response quality                        | paths named in `AGENTS.md` |
| Live provider smoke           | credentials, carrier/provider delivery, callback reality   | preview/release gate       |

Debug from the lowest red layer upward. A live smoke never substitutes for a
deterministic contract, and a model-free contract never proves model judgment.

## Change rule

Before adding a capability, write down its owner, principal scope, read/write
class, approval rule, idempotency behavior, and lowest useful gym layer. If it
cannot fit one of the boundaries above, review the architecture before adding a
conditional to the loop.
