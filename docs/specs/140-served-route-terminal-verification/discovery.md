# Served Route Terminal Verification — Grill / Discovery

## Status

- Round: Grill complete.
- Date: 2026-08-17.
- Owner decision: Q1 option 3 accepted on 2026-08-17.
- Code changes allowed: after Spec artifacts and `ready-for-agent` tickets exist.

## Actor And Observable Outcome

An operator deploying one Resource with multiple served domains or path/service routes receives a
terminal `succeeded` result only after every route that this deployment claims to serve has passed
the configured public HTTP verification. A failure removes the candidate and preserves or restores
the previously serving workload instead of reporting partial success.

## Evidence And Facts

- Runtime access-route snapshots already retain `domains`, `pathPrefix`, `targetServiceName`,
  `targetPort`, TLS mode and redirect intent.
- `packages/adapters/runtime/src/public-health-route.ts` currently returns one served route,
  preferring `/` and the configured target service.
- Local and Generic SSH Docker/Compose terminal verification then builds one URL from that route's
  first domain. Other domains and served paths are therefore not terminal success evidence.
- Redirect routes are a different behavior: their target must remain a served route, but redirect
  status/location proof is governed by deployment proof rather than workload health.
- Kubernetes has a separate external-route proof/rollback path. Docker Swarm currently proves task
  readiness before route-label promotion but does not run the same public HTTP terminal gate.
- Health-disabled Resources explicitly opt out of workload/public HTTP health and must not acquire
  a hidden mandatory network probe.

## Recommended Decision

For every active runtime that promotes public route ownership, verify every distinct served
`hostname + pathPrefix + targetServiceName` route applicable to the deployed target service.
Exclude redirects, dedupe identical URLs, preserve the health-disabled opt-out, and fail closed
before superseded workload cleanup. A Swarm public-route failure must restore the prior route owner
before the candidate is removed; it must not merely delete the candidate after promotion.

## Alternatives

1. Verify only one canonical route per hostname. This catches domain drift but not path/service
   routing drift.
2. Repair only Local/Generic SSH Docker/Compose, where the one-route selector is directly observed,
   and leave Swarm's service-only terminal gate unchanged.
3. Verify every served route/domain pair across Local, Generic SSH and Swarm. This is the
   recommendation because all three may publish route ownership.

## Accepted Decision

- Cover every route-producing active runtime, including Swarm promotion rollback.
- Verify every distinct served `hostname + pathPrefix + targetServiceName` route applicable to the
  deployed target service.
- Exclude redirects, dedupe identical URLs, preserve the health-disabled opt-out, and fail before
  superseded cleanup when any required route is unverified.
