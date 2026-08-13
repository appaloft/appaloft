# Platform Migration Journey — Grill / Discovery

## Status

- Round: Grill complete.
- Owner confirmation: the owner authorized the implementation agent to adopt every recommended
  answer, write the decisions into governing docs, and continue through Spec, Ticket and Code.
- Product target: R4 Platform Breadth, the Railway core-replacement gate for individual developers
  and teams of 2–10 people.

## Business Outcome

A developer can inspect a source repository plus an exported platform snapshot, preview exactly
which Appaloft Projects, Environments, Resources, variables, dependencies, volumes and domains will
be created, apply that plan through existing public operations, deploy and verify the application,
and retain rollback, recovery and exit evidence without returning to the source platform.

## Owner-Delegated Recommended Decisions

| Frontier | Accepted answer | Consequence |
| --- | --- | --- |
| Success measure | Three actor-visible migrations: fresh web, multi-service/Compose and stateful application. | Command count and issue count do not close R4. |
| Product entry | Add public `appaloft migrate plan/apply/status/verify/cleanup`; keep expert commands canonical. | Migration is an ephemeral task coordinator, not a new deployment lifecycle. |
| Input | A versioned, secret-safe migration bundle with source/config and optional artifact references. | Source adapters translate Railway or another platform at the boundary; core never imports vendor DTOs. |
| Railway acquisition | Support a checked-in/exported bundle first and an optional local read-only Railway CLI collector. | No Railway token is stored or sent to Appaloft; unsupported data fails during plan. |
| Mutation | The accepted plan dispatches existing commands in dependency order. | No direct repositories, SQL or provider SDK calls from the coordinator. |
| Resume | Persist no new business aggregate; return a signed/digested plan plus operation receipts that can be replayed idempotently. | Existing operation state remains authoritative. |
| Variables | Plain values may import; secrets become secret references or explicit configure-later blockers. | A plan and every readback stay redacted. |
| Database/data | Create/import DependencyResource and StorageVolume state through existing operations; restore defaults to a new target. | No implicit live overwrite and no generic SQL-copy lifecycle. |
| Domains | Use existing DomainBinding/DNS/certificate operations after deployment proof. | DNS/provider mutation remains explicit and independently authorized. |
| Surfaces | CLI, headless JSON, HTTP/oRPC/SDK and Web consume the same migration plan/result contract; MCP may consume it later. | No CLI-only hidden write path. |
| Cloud | Cloud injects tenant authz, entitlement, managed dependency providers, credential custody and hosted defaults. | No private Project/Environment/Resource/Migration truth. |
| R4 exit | Real web/Compose/stateful packets prove import, deploy, observe, recover and exact cleanup/exit. | Fake-only or unit-only evidence cannot close R4. |

## Event-Storming Timeline

| Order | Candidate fact/intention | Owner | Readback |
| --- | --- | --- | --- |
| 1 | Migration source inspected | migration adapter | sanitized source summary and unsupported blockers |
| 2 | Migration plan prepared | presentation/application coordinator | ordered existing operation messages and digest |
| 3 | Plan accepted | actor | exact confirmation and operation receipts |
| 4 | Existing resources configured | existing aggregate owners | existing list/show/effective-config queries |
| 5 | Deployment verified | Deployment | timeline, health and proof |
| 6 | Recovery rehearsed | existing recovery owners | rollback and independent restore proof |
| 7 | Migration verified/cleaned | coordinator | bounded verification packet and exact owned residual report |

These are workflow observations. They do not introduce migration domain events.

## Boundary Classification

| Addition | Classification | Reason |
| --- | --- | --- |
| Migration bundle schema, source adapter and presentation coordinator | `MOVE_PUBLIC` | Neutral Community/Cloud/Enterprise capability. |
| Existing project/config/resource/deploy/domain/data operations | `REUSE_PUBLIC` | They remain lifecycle truth. |
| Cloud tenant/authz/entitlement/custody/provider composition | `KEEP_PRIVATE` | Hosted policy and commercial integration. |
| Private migration aggregate/table or copied public DTO | `DELETE_OR_MERGE` | It would duplicate public truth. |

## Rejected Alternatives

- Cloning Railway command names one by one or storing a Railway project mirror.
- Letting the migration coordinator write repositories, provider SDKs or raw SQL directly.
- Importing secret values into plan/read models, silently ignoring unsupported fields, or changing
  DNS/data in the same unreviewed mutation.
- Declaring success from a generated config file without deploy, recovery and cleanup evidence.

## Open Questions

None that changes ownership, lifecycle, persistence or the R4 exit contract. Individual vendor
collectors and external provider acceptance require their own explicit credentials/effects packet.
