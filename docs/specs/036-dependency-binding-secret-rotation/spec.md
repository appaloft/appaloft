# Dependency Binding Secret Rotation

## Status

- Round: Spec Round
- Artifact state: ready for Test-First / Code Round
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, additive public CLI/API/oRPC capability
- Decision state: no-ADR-needed

## Business Outcome

Operators can rotate the secret reference used by one active Resource dependency binding without
unbinding the dependency, deleting the Dependency Resource, editing server files, or rewriting
historical deployment snapshots.

This slice closes the next explicit dependency-binding gap after provider-neutral Postgres
bind/unbind and safe deployment snapshot references. It establishes binding-scoped credential
versioning for future deployments while keeping provider-native database credential rotation,
runtime environment injection, Redis, and backup/restore out of scope.

## Discover Findings

1. The existing Phase 7 baseline models `ResourceInstance` as the dependency resource and
   `ResourceBinding` as the Resource-to-dependency contract.
2. `ResourceBinding` already owns binding target metadata, lifecycle, and safe secret reference
   pointers, while deployment snapshots copy safe binding references immutably at admission.
3. Rotation must be a specific ResourceBinding command, not a generic dependency or resource
   update, because ADR-026 forbids generic aggregate updates.
4. Rotation replaces the binding-scoped secret reference for future deployment snapshot references.
   It does not prove runtime connectivity, mutate the upstream database password, restart runtime
   workloads, or change historical deployment snapshots.
5. No new ADR is needed because this slice reuses ADR-012 deployment snapshot boundaries, ADR-014
   deployment admission through Resource profile, ADR-025 control-plane/provider separation,
   ADR-026 intention-revealing command naming, and ADR-028 mutation coordination. It does not
   introduce provider credential ownership, runtime injection semantics, async lifecycle, or new
   cross-context ownership.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| DependencyBindingSecretRotation | The operator intent to replace the secret reference used by one ResourceBinding for future deployments. | Dependency Resources | binding secret rotation |
| BindingSecretRef | Safe control-plane reference to secret material for one ResourceBinding. | Dependency Resources | binding secret pointer |
| BindingSecretVersion | Monotonic version or timestamped reference identity used to distinguish rotations. | Dependency Resources | secret version |
| PreviousBindingSecretRef | Prior binding secret reference retained only as safe metadata or audit context. | Dependency Resources | previous secret pointer |
| RotationAcknowledgement | Explicit input confirming the operator understands active deployments keep their captured snapshot reference. | Dependency Resources | active deployment acknowledgement |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-BIND-ROTATE-001 | Rotate active binding secret reference | Active ResourceBinding with matching Resource and Dependency Resource context | `resources.rotate-dependency-binding-secret` supplies a new secret reference or secret-bearing input | ResourceBinding records the new safe binding secret reference/version, emits `resource-dependency-binding-secret-rotated`, and leaves ResourceInstance, runtime, provider database, and historical snapshots unchanged. |
| DEP-BIND-ROTATE-002 | Reject missing or inactive binding | Binding is missing, removed, or belongs to another Resource | Rotation command runs | Command returns `not_found` or `resource_dependency_binding_rotation_blocked`, no mutation. |
| DEP-BIND-ROTATE-003 | Reject unsafe secret input/output | Input tries to expose raw secret material through target name, read model, error, event, log, or snapshot output | Rotation command runs or read models are inspected | Raw passwords, tokens, auth headers, cookies, SSH credentials, provider tokens, private keys, sensitive query parameters, and materialized env values are absent. |
| DEP-BIND-ROTATE-004 | Preserve immutable deployment snapshots | A deployment captured the previous binding reference | Binding secret is rotated and `deployments.show` reads the historical deployment | Historical deployment detail still reports the old safe snapshot reference and never rewrites it to the new secret ref. |
| DEP-BIND-ROTATE-005 | Report latest binding secret metadata safely | Binding has been rotated | `resources.list-dependency-bindings` or `resources.show-dependency-binding` reads it | Output shows safe current rotation metadata and never returns raw secret material or previous plaintext. |
| DEP-BIND-ROTATE-006 | Entry surfaces dispatch one explicit command | Operation catalog, CLI, and HTTP/oRPC expose rotation | Public entrypoint is inspected | Entrypoints dispatch `RotateResourceDependencyBindingSecretCommand`, reuse the command schema, and expose no generic update command. |

## Domain Ownership

- Bounded context: Dependency Resources.
- Aggregate/resource owner: `ResourceBinding` owns binding-scoped secret reference identity,
  rotation version metadata, and active/removed rotation admission.
- Upstream/downstream contexts:
  - Workspace and Workload Delivery provide Resource ownership context.
  - Dependency Resources provide Dependency Resource readiness and masked connection metadata.
  - Release Orchestration snapshots safe references for future deployments and preserves historical
    snapshot immutability.
  - Runtime/provider adapters later consume runtime injection specs and provider-native credential
    rotation specs; they do not own this command's admission rules.

## Public Surfaces

- API/oRPC: accepted candidate
  `POST /api/resources/{resourceId}/dependency-bindings/{bindingId}/secret-rotations` using the
  application command schema.
- CLI: accepted candidate
  `appaloft resource dependency rotate-secret <resourceId> <bindingId>`.
- Web/UI: deferred until Code/Docs Round with i18n and tests.
- Config: no repository config fields.
- Events: `resource-dependency-binding-secret-rotated` domain event after durable persistence.
- Public docs/help: migration gap until the operation is implemented.
- Future MCP/tools: one operation for the explicit command, not a compound dependency update tool.

## Output Contracts

Rotation command success returns:

- `id`: ResourceBinding id;
- `rotatedAt`: timestamp;
- `secretVersion`: safe version/reference identifier.

Resource dependency binding list/show outputs may include:

- current safe binding secret reference presence;
- current safe secret version or rotated-at timestamp;
- previous version existence/count when useful for audit;
- deployment snapshot readiness summary.

Outputs must not include raw secret values, raw connection URLs, passwords, tokens, auth headers,
cookies, SSH credentials, provider tokens, private keys, sensitive query parameters, previous raw
secret material, or materialized environment values.

## Non-Goals

- No provider-native database password rotation.
- No Redis binding rotation.
- No runtime environment injection.
- No runtime restart, redeploy, retry, rollback, or health proof.
- No backup/restore.
- No mutation of historical deployment snapshots.
- No dependency resource delete, unbind, or provider database lifecycle change.

## Open Questions

- Provider-native credential rotation and runtime env injection may later decide whether a
  successful binding secret rotation should recommend or enqueue redeploy, but this command must
  not imply that behavior in this slice.
