# Deployment Proof Workflow

```text
load scoped Deployment snapshot
  -> derive planned fingerprints, verification steps, and minimum expected effects
  -> request sanitized current runtime/artifact evidence from selected target adapter
  -> probe managed public routes and read the provider-stamped deployment identity
  -> read bounded timeline, Resource health, access/route, and recovery readiness evidence
  -> compare expected and observed identities/effects
  -> emit stable mismatches and unavailable evidence
  -> derive one proof verdict
  -> return the same deployments.proof/v1 DTO to every entrypoint
```

The workflow is a query. It never retries a deployment, redeploys, force-redeploys, rolls back,
repairs a route, or changes health policy. It may repeat a bounded read after a transient proxy
convergence response; that observation does not mutate runtime state. Recommended actions must be
existing operation keys.

## Minimum Expected Effects

- artifact-producing source/profile/configuration change: `rebuild-artifact`;
- runtime artifact/configuration change: `replace-workload` or `restart-workload`;
- route-only change: `apply-route`;
- health policy only: `verify-health-policy`;
- no relevant difference: `no-runtime-change`.

This is the minimum proof comparison, not a general Change Effect planner.

## Failure And Unavailability

- Adapter readback failure becomes structured unavailable evidence unless the failure itself proves
  the attempted rollout failed.
- A managed route that returns HTTP success with a missing or different deployment identity is a
  route/workload mismatch, not successful access evidence.
- Managed route readback bypasses ambient `HTTP_PROXY`/`HTTPS_PROXY`; those control-plane settings
  must not redirect deployment verification away from the configured domain.
- Raw provider output is logged only through existing redaction/diagnostic policy and never copied
  into proof.
- Not-found, forbidden, and resource-context mismatch fail before cross-scope evidence is read.
