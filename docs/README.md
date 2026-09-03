# OpenInstinct documentation

This directory describes the repository as it exists and the product direction
being considered. Documents use three labels deliberately:

- **Implemented** means the behavior exists in this repository.
- **Verified** means the named local or deployed path was exercised on the date
  recorded by the document.
- **Proposed** means a design or launch gate; it is not a production claim.

## Start here

| Reader              | Document                                                           | Purpose                                                                                                        |
| ------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Operator            | [`operations/VERCEL.md`](operations/VERCEL.md)                     | Zero-to-running local and Vercel setup, Linq, verification, rollback, and incidents                            |
| Coding agent        | [`AGENT_GUIDE.md`](AGENT_GUIDE.md)                                 | Repository topology, ownership boundaries, change recipes, and gates                                           |
| Architect           | [`ARCHITECTURE_REVIEW.md`](ARCHITECTURE_REVIEW.md)                 | Current system, trust boundaries, findings, and portability limits                                             |
| Product/engineering | [`PRODUCT_DIRECTION.md`](PRODUCT_DIRECTION.md)                     | Infrastructure-first recommendation, product model, MVP, API, webhooks, and phone lifecycle                    |
| Platform engineer   | [`MULTITENANCY.md`](MULTITENANCY.md)                               | Tenant isolation contract, migration sequence, quotas, lifecycle, and test strategy                            |
| Coding agent        | [`agent-loop.html`](agent-loop.html)                               | Diagram of one turn: channels, scope, session hooks, steps, tool branches, bubble delivery (open in a browser) |
| Integrations        | [`SQUARE.md`](SQUARE.md)                                           | Per-user Square connection: implemented pieces, sandbox state, verification, and the proposed POS gym          |
| Product/engineering | [`agent-conversation-feedback.md`](agent-conversation-feedback.md) | Dated log of user feedback on agent conversations; review material, not runtime instructions                   |
| Design/frontend     | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)                             | The design system as implemented: fonts, type roles, color tokens, radius, motion, primitives, shell, gaps     |
| Design/frontend     | [`JORY_DESIGN_MERGE.md`](JORY_DESIGN_MERGE.md)                     | Jory's design system inventory, side-by-side with this repository, and the proposed merge decisions            |
| Contributor         | [`../README.md`](../README.md)                                     | Product overview and normal development entry points                                                           |

## Current truth

- The application is a single Next.js 16 application with an Eve 0.46 agent.
- Vercel is the supported deployment target. Neon, Kernel, private Vercel Blob,
  Vercel Workflow/AI Gateway, and Vercel Connect are part of the current path.
- The database and service layer are workspace-scoped, but the product is not
  yet a shared multi-tenant service.
- One Linq connector and one phone line currently configure the deployment.
- `workspace` is the intended customer, isolation, billing, and lifecycle
  boundary. A future `agent` is a separately configurable resource owned by a
  workspace.
- The recommended product sequence is an agent-infrastructure service first,
  followed by a consumer text-to-create experience built on the same API.

## Keep documents honest

When behavior changes, update the nearest owning document in the same change.
Do not turn a proposed schema, API, provider capability, or launch gate into an
implemented claim. Re-run the applicable verification and replace dated
deployment evidence rather than silently carrying it forward.
