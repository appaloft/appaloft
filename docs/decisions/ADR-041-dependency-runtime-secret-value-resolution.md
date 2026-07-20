# ADR-041: Dependency Runtime Secret Value Resolution

Status: Accepted

Date: 2026-05-06

## Decision

Dependency runtime injection requires a first-class Appaloft secret-value store and resolver for
dependency connection material. Runtime target adapters must not treat a safe secret reference as
the raw connection value, and deployment snapshots must continue to store only safe references.

The accepted boundary is:

```text
dependency import/provider realization/secret rotation
  -> dependency secret-value store
  -> safe dependency secret reference
  -> deployment injection snapshot
  -> runtime secret resolver
  -> runtime target adapter materialization
```

Dependency resource import commands store raw Postgres and Redis connection URLs through an
application port before persisting the `ResourceInstance`. Provider-managed Postgres realization
must either return an externally resolvable provider-owned secret reference or store the generated
connection value through the same Appaloft dependency secret-value store before the dependency
resource becomes binding-ready.

Imported-external dependency connection rotation overwrites the protected value behind the same
Appaloft-owned dependency secret reference and updates only masked endpoint metadata. It preserves
resource identity and bindings, does not rotate provider-native credentials, and does not redeploy
or restart consumers. Historical snapshots keep their reference and resolve the current protected
value if they are later retried or redeployed.

Binding secret rotation may continue to write binding-scoped secret values, but the stored value
must be resolvable by the same runtime secret resolver. Historical deployment snapshots keep their
captured secret references; the resolver reads the captured reference for retry, redeploy from a
retained snapshot, and rollback.

Runtime target adapters receive resolved secret values only at execution/materialization time and
must redact them from display text, logs, events, errors, diagnostics, read models, and public
contracts. For Docker Swarm, the adapter must create or update backend-native Docker secrets from
resolved values before service update and expose only the Docker secret name/handle in sanitized
intent and diagnostics.

## Context

ADR-040 made bound dependencies injectable and added safe runtime secret references to deployment
snapshots. ADR-041 closes the remaining boundary for resolving `appaloft://...` or
`appaloft+pg://...` references into actual connection values for workload execution without adding
dependency fields to `deployments.create`. Imported dependencies and provider-native realization
store safe connection secret references through the dependency resource secret store, while binding
secret rotation persists binding-scoped values for historical snapshot resolution. Postgres and
Redis closed-loop verification is now covered by the dependency resource test matrix and proves that
workloads can receive the actual database/Redis connection value without the operator editing server
files or passing secrets to `deployments.create`.

## Consequences

- `deployments.create` remains ids-only and does not accept dependency-specific input fields.
- Import and provider-realization use cases must store raw connection material before marking a
  dependency resource binding-ready when Appaloft owns the reference.
- `deployments.plan` and `deployments.create` must report/block unresolved Appaloft-owned
  dependency secret references before runtime work is accepted.
- Runtime target adapters must distinguish sanitized secret handles from resolved values.
- Persistence may store encrypted or otherwise protected raw dependency secret payloads, but only
  persistence adapters and runtime secret resolver implementations may read them back.
- Read models, contracts, CLI output, Web output, public docs, events, and logs expose only safe
  reference metadata and masked connection summaries.
- Imported connection replacement must be an explicit operation restricted to active
  `imported-external` resources; a generic dependency update remains forbidden.

## Implementation Requirements

- Add a dedicated application port for dependency secret storage and runtime resolution rather than
  reusing repositories or reading Kysely tables from runtime adapters.
- Do not overload `dependency_binding_secrets` for dependency-resource import material unless a
  migration explicitly generalizes ownership and preserves existing rotated-binding refs.
- Runtime adapters must accept resolved values through an execution-only boundary that also carries
  sanitized display handles.
- Missing, inactive, malformed, or backend-unsupported secret references must produce stable safe
  reason codes and must not create deployment attempts.
- Tests must prove that raw Postgres/Redis URLs are stored, resolved, injected, and redacted without
  appearing in deployment snapshots, read models, command display, errors, events, or diagnostics.

## References

- [Dependency Runtime Secret Value Resolution](../specs/048-dependency-runtime-secret-value-resolution/spec.md)
- [Imported Dependency Connection Rotation](../specs/109-imported-dependency-connection-rotation/spec.md)
- [Dependency Binding Runtime Injection](../specs/047-dependency-binding-runtime-injection/spec.md)
- [Dependency Resource Lifecycle](../workflows/dependency-resource-lifecycle.md)
- [Dependency Resource Test Matrix](../testing/dependency-resource-test-matrix.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [ADR-040: Dependency Binding Runtime Injection Boundary](./ADR-040-dependency-binding-runtime-injection-boundary.md)
- [ADR-023: Runtime Orchestration Target Boundary](./ADR-023-runtime-orchestration-target-boundary.md)
