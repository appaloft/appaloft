# Resource Detail Profile Editing Closure

## Status

- Round: Spec -> Test-First -> Code -> Sync
- Artifact state: active

## Business Outcome

Operators can use one resource detail/settings surface to manage resource-owned source, runtime,
network, access, health, and configuration profiles without accidentally creating deployment or
routing side effects.

Every save is a durable resource profile/configuration edit for future deployment admission,
verification, route planning, or deployment snapshot materialization. These saves do not create a
deployment, mutate historical deployment snapshots, immediately restart or rename current runtime
state, bind domains, issue certificates, or apply proxy routes.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Resource detail/profile editing closure | Phase 4 closure that the resource detail/settings surface manages each active resource-owned profile section through named operations. | Workload Delivery / Resource | Resource settings closure |
| Resource-owned profile | Durable source, runtime, network, access, health, or configuration state stored on the resource side before deployment admission snapshots it. | Resource profile lifecycle | Resource settings |
| Future-only profile edit | A resource-owned change consumed by later deployment or route planning without changing current runtime or historical snapshots. | Resource profile lifecycle | Durable profile edit |
| Resource configuration override | One resource-scoped variable or secret entry resolved above environment scope for future deployment snapshots. | Configuration / Resource | Resource variable |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| RDP-CLOSE-001 | Resource detail exposes every Phase 4 resource-owned profile section. | An operator opens resource detail/settings. | They review profile, configuration, and health sections. | Source, runtime, network, access, health, and configuration controls are reachable from resource detail. |
| RDP-CLOSE-002 | Profile saves use named operations. | An active resource is open in Web. | The operator saves source, runtime, network, access, health, or configuration changes. | Web dispatches the matching `resources.configure-*`, `resources.set-variable`, or `resources.unset-variable` operation and refetches the matching read path. |
| RDP-CLOSE-003 | Entrypoints share schemas and operation names. | CLI, HTTP/oRPC, Web, docs help, and future tool metadata refer to resource profile editing. | The behavior is exposed or documented. | Each surface uses existing command/query schemas and operation keys; no generic `resources.update` or transport-only resource update shape exists. |
| RDP-CLOSE-004 | Side effects are explicit. | The operator saves a resource-level profile or config change. | The change is accepted. | The UI/docs/specs make clear that the save does not create deployments, mutate historical snapshots, immediately affect current runtime/workload, bind domains, issue certificates, or apply proxy routes. |
| RDP-CLOSE-005 | Resource profile drift is not hidden in the closure claim. | Phase 4 resource detail/profile editing closes. | Roadmap status is updated. | Resource profile drift visibility remains governed by the later Resource Profile Drift Visibility artifact, not this Phase 4 editing closure. |

## Domain Ownership

- Bounded context: Workload Delivery.
- Aggregate/resource owner: `Resource`.
- Upstream/downstream contexts: Release Orchestration consumes resource profiles and configuration
  overrides during future `deployments.create`; Runtime Topology observes network/access profiles
  for route planning; Resource Health observes health policy; Configuration provides environment
  precedence inputs. None of those downstream contexts owns the resource profile edit.

## Public Surfaces

- API: Existing named routes for `resources.configure-source`, `resources.configure-runtime`,
  `resources.configure-network`, `resources.configure-access`, `resources.configure-health`,
  `resources.set-variable`, `resources.unset-variable`, `resources.show`, and
  `resources.effective-config`.
- CLI: Existing `appaloft resource configure-*`, `set-variable`, `unset-variable`, `show`, and
  `effective-config` subcommands.
- Web/UI: Resource detail/settings profile, configuration, and health sections.
- Config: Repository config can seed or reconfigure profile values through existing entry workflows
  where specified; it does not create a broad resource update surface or choose Appaloft identity.
- Events: Existing resource profile/configuration events remain unchanged.
- Public docs/help: Existing source/runtime/network/health/access/variable-precedence anchors cover
  the closure with traceability to this artifact.

## Non-Goals

- Adding `resources.update` or any generic resource mutation.
- Adding new command/query schemas for profile editing.
- Redeploy, restart, rollback, cancel, runtime cleanup, runtime hot reload, or live route apply.
- Domain binding creation, certificate issuance, default access policy editing, or proxy repair.
- New profile drift detection or drift reconciliation behavior; see
  [Resource Profile Drift Visibility](../011-resource-profile-drift-visibility/spec.md).

## Open Questions

- None for the Phase 4 resource detail/profile editing closure. Resource profile drift visibility is
  governed by [Resource Profile Drift Visibility](../011-resource-profile-drift-visibility/spec.md).
