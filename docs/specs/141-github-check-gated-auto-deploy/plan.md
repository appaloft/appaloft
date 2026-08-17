# GitHub Check-Gated Auto Deploy Plan

## Architecture

- Resource aggregate owns normalized `requiredChecks` policy intent.
- Source-event application workflow owns waiting, blocking, supersession and dispatch decisions.
- GitHub integration verifies/normalizes `check_run.completed` into provider-neutral completed-check
  facts; transport never evaluates Resource policy.
- PG/PGlite owns durable delivery dedupe and an atomic exact-revision claim boundary. Persistence
  does not decide which conclusions count as passing.
- Existing deployment dispatcher remains the only path to `deployments.create`.

## CQRS And Persistence

1. Extend configure/read schemas and Resource JSON policy persistence.
2. Extend source-event policy results with safe required/observed check summaries and gate state.
3. Add migration `121_source_event_required_checks` for durable check deliveries and indexed
   repository/revision waiting lookup, or an equivalent transactionally safe representation.
4. Add an internal application command/handler for verified completed-check facts and register it
   in the operation catalog if the command bus is used.
5. Provide a compare-and-set claim so only the transition from all-satisfied to dispatching may
   create a deployment.
6. Keep operator replay safe: superseded results cannot be revived; failed dispatch may use the
   existing explicit replay contract after current policy re-evaluation.

## Entrypoints

- Repository config parser/planner, CLI flags/help, HTTP/oRPC, Web form/readback.
- GitHub HMAC verifier and source-events route for `check_run` completed.
- Source-event list/show Web diagnostics and SDK/OpenAPI/generated operation metadata.
- Bilingual public source auto-deploy docs include GitHub Checks read permission and recovery.

## Test Strategy

- Core policy normalization/compatibility tests.
- Application lifecycle tests including fan-out, rerun, out-of-order, supersession and exact-once.
- PG/PGlite concurrency/dedupe/migration/read-model tests.
- GitHub verifier and HTTP signature/payload tests.
- Repository config, CLI, HTTP/oRPC, Web, SDK/OpenAPI/docs coverage tests.
- Composed server test proving webhook -> gate -> existing deployment dispatcher wiring.

## Risks

- Two final check deliveries may race; application-only in-memory dedupe is insufficient.
- GitHub delivery order is not guaranteed; provider completion metadata must prevent regression.
- A policy replacement while a revision waits must fail closed under the policy snapshot stored on
  that source-event result; it cannot silently adopt new names.
- Diagnostics must not persist check output, annotations, URLs or raw provider payloads.
