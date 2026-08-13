# ADR-113: Platform Migration Presentation Boundary

Status: Accepted

Date: 2026-08-13

## Context

Appaloft already owns the neutral lifecycle and operations needed to run common platform workloads,
but migration currently requires users to discover and sequence many expert commands. R4 needs one
reviewable journey without creating a source-platform mirror or a second deployment model.

## Decision

1. Public Appaloft owns a versioned, secret-safe Migration Bundle published language.
2. Vendor source adapters are anticorruption layers and translate into that language.
3. `appaloft migrate` is an ephemeral task coordinator. It owns no aggregate, table or event and
   dispatches only existing public Commands and Queries.
4. A no-effect plan is deterministic and digest-bound. Apply requires the exact digest and records
   safe operation receipts sufficient for resume, verification and exact cleanup.
5. Secrets are references or explicit configure-later blockers; raw secret values never enter plan,
   receipt, error, log or read models.
6. Data restore defaults to an independent target. Domain/DNS/certificate effects remain explicit
   existing operations after deployment readiness.
7. CLI, HTTP/oRPC/SDK and Web consume the same contract. Cloud may inject authz, entitlement,
   credential custody and managed providers but may not own a private migration lifecycle.

## Consequences

R4 can be measured by complete migrations while existing expert operations remain canonical and
script-compatible. Vendor adapters can evolve independently. Partial failures are recoverable and
do not require a distributed transaction across aggregates/providers.

## Rejected Alternatives

Vendor project mirrors, direct repository/provider writes, a Cloud-only importer, opaque one-click
mutation, secret-bearing export files and command-by-command Railway cloning.

## Verification

See Spec 135 and `docs/testing/platform-migration-journey-test-matrix.md`.
