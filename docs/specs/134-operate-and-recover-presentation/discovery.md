# Discovery: Operate And Recover Presentation

## Status

- Round: Grill / Discovery complete
- Owner decision: accepted on 2026-08-12. The owner explicitly delegated R3 frontier decisions to
  the implementation agent and instructed it to accept the recommended answers and record them.
- Proposed scope: one public `appaloft operate [resourceId]` task entry, bounded headless snapshot,
  an `operate/v1` mode in the existing Rust/Ratatui renderer, and explicit dispatch to existing
  observe/recovery/backup/restore/portability operations.
- Code changes allowed: no, until ADR-112, Spec 134, the Test Matrix and an actor-visible Ticket are
  accepted.

## Business Outcome

A developer or operator can select one Resource, understand its latest production state, diagnose
failure, perform an explicitly confirmed safe recovery, and verify the result without opening a
provider console or learning several unrelated command families.

## Facts From The Current Product

- Resource health, diagnostics and bounded runtime logs are already public query truth.
- Runtime monitoring samples, rollups and threshold evaluation are already public query truth.
- Deployment timeline, proof, recovery readiness, retry, redeploy and rollback are active public
  operations across CLI, HTTP/oRPC, Web, SDK and generated tools.
- Storage-volume and managed-dependency backup/restore, scheduled backup and whole-instance
  portability already have accepted lifecycle boundaries and operation families.
- `workspace-control-tui` is the shipped Rust/Ratatui sidecar. It already supports Workspace and
  Development modes over bounded loopback protocols while Bun owns queries, commands and IO.
- The missing R3 behavior is task-oriented composition and acceptance evidence, not another
  monitoring store, recovery aggregate, backup implementation or notification domain.

## Auto-Grill Decision Tree

| Frontier question | Recommended and accepted answer | Consequence |
| --- | --- | --- |
| Primary actor | Developer/operator responsible for one supported workload | Fleet/NOC dashboards remain outside R3. |
| Primary target | Resource; its latest relevant Deployment is resolved as readback | Recovery remains Resource/Deployment-owned instead of screen-owned. |
| Target selection | Optional `resourceId`; without it, show a bounded Resource chooser | A provider console or memorized internal id is not a prerequisite. |
| Product entry | `appaloft operate [resourceId]` | Existing expert commands remain stable and scriptable. |
| Lifecycle truth | Operate Session is ephemeral presentation coordination | No aggregate, event stream, table or durable status is added. |
| Snapshot | Compose existing Resource, Deployment, monitoring, logs, diagnostics, readiness, proof and backup read models | Partial evidence stays explicitly unavailable/degraded rather than fabricated. |
| Default UX | Interactive TTY starts the existing Ratatui renderer in `operate` mode | No OpenTUI rewrite or second native binary. |
| Headless parity | `--no-tui --json` returns the same bounded snapshot and action readiness | CI and agents do not depend on a renderer. |
| Refresh | User-triggered plus bounded polling; each snapshot carries observation time | The UI does not claim live truth after disconnect. |
| Recovery admission | Always read `deployments.recovery-readiness` immediately before mutation | Stale screen state cannot authorize retry/redeploy/rollback. |
| Confirmation | Every write action is previewed and explicitly confirmed in the same session | TUI convenience does not weaken command safety. |
| Rollback | Use the readiness-selected retained candidate; never roll back stateful data implicitly | Application rollback and data restore remain distinct. |
| Backup | Present existing volume/dependency artifacts; first closed-loop mutation uses a selected StorageVolume | No generic backup model is introduced. |
| Restore | Default to an independent new StorageVolume; live overwrite remains an expert acknowledged command | R3 exit evidence proves recovery without risking the current workload. |
| Portability | Show instance-level export-plan/artifact readiness and hand off to the existing owner-scoped command | Resource presentation does not take ownership of the whole instance. |
| Notification | Show threshold/delivery references and actionable state when present; no generic notification center | Notification-center breadth remains a later product slice. |
| Failure model | One failed optional query degrades its section; target lookup and mutation admission fail closed | Operators keep useful evidence without hiding critical blockers. |
| Cloud boundary | Entire neutral presentation/workflow is public; Cloud injects auth, entitlement, custody and providers | No Cloud-only Operate aggregate, table or TUI. |
| Acceptance | Failed deployment -> observe -> rollback -> proof, plus backup -> independent restore -> readback -> cleanup | R3 closes on actor-visible recovery evidence, not command counts. |
| Compatibility | Additive pre-1.0 CLI/renderer surface | Existing operation names, outputs and expert flows remain unchanged. |

## Event-Storming-Style Timeline

These are workflow observations, not new domain events.

| Order | Observation or intent | Actor | Existing owner | Policy/read model |
| --- | --- | --- | --- | --- |
| 1 | Resource selected | operator | Resource query | bounded chooser or explicit id |
| 2 | Operate snapshot observed | presentation | existing query owners | partial sections are explicit |
| 3 | Recovery action requested | operator | Deployment command | fresh readiness required |
| 4 | Recovery action confirmed | operator | Deployment command | exact action/candidate confirmation |
| 5 | New Deployment attempt accepted | Deployment context | Deployment | timeline and proof provide readback |
| 6 | Backup selected/created | operator | StorageVolumeBackup | existing plan/provider blockers |
| 7 | Backup restored independently | operator | StorageVolumeBackup | new target by default |
| 8 | Result verified | operator | proof/health/backup read models | before/after evidence is retained by owners |

## Rejected Alternatives

- A new `OperateSession` aggregate, persistence table, event stream or generic dashboard query.
- A Cloud-only recovery console or private copies of public Resource/Deployment/Backup state.
- Calling write operations from a query or letting the renderer own command policy.
- Automatic rollback, live data overwrite, background polling without bounded teardown, or silent
  fallback to provider credentials.
- Replacing Ratatui with OpenTUI before the accepted renderer contract is independently superseded.
- Treating notification-center or platform-management breadth as an R3 prerequisite.

## Public/Private Boundary

Public Appaloft owns the Operate presentation protocol, snapshot coordinator, CLI entry and renderer.
Every fact and mutation remains owned by its existing public operation. Cloud and Enterprise may
inject authorization, entitlement, credential custody, offsite targets and notification delivery,
but may not persist an Operate Session or redefine Resource, Deployment or Backup lifecycle truth.

## Open Questions

No question remains that changes R3 ownership, lifecycle, persistence or public contract. Layout,
poll interval and key bindings are implementation constants covered by tests.
