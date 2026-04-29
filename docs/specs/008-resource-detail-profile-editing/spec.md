# Resource Detail Profile Editing

## Status

- Round: Spec -> Test-First -> Code -> Sync
- Artifact state: active

## Business Outcome

Operators can edit a resource's source, runtime, and network profiles from the resource detail page
and understand that each save is a durable resource profile edit. These edits affect future
deployment admission and route planning only. They do not rewrite historical deployment snapshots
and do not immediately restart, rename, stop, or replace a running workload.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Resource detail profile editing | The owner-scoped Web surface for changing source, runtime, and network profile sections on one resource. | Workload Delivery / Resource | Resource settings, resource configuration |
| Durable resource profile edit | A persisted resource-owned configuration change consumed by future deployments. | Resource profile lifecycle | Saved profile change |
| Future deployment boundary | The rule that profile edits are not runtime execution and only take effect when a later deployment snapshots the profile. | Resource profile lifecycle | Future-only edit |
| Deployment snapshot | The immutable source/runtime/network/config facts captured by one deployment attempt. | Release Orchestration | Historical snapshot |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| RDP-001 | Resource detail shows the editing boundary. | An operator opens one resource detail profile page. | Source, runtime, and network forms are visible. | The page states these are durable profile edits for future deployments, historical deployment snapshots stay unchanged, and current runtime is not restarted. |
| RDP-002 | Edit source profile from resource detail. | An active resource is open in Web. | The operator saves source profile fields. | Web dispatches `resources.configure-source`, invalidates `resources.show`/resource list state, and keeps deployment/runtime side effects out of the form. |
| RDP-003 | Edit runtime profile from resource detail. | An active resource is open in Web. | The operator saves runtime strategy or command fields. | Web dispatches `resources.configure-runtime`, invalidates `resources.show`/resource list state, and does not present the save as a restart or redeploy action. |
| RDP-004 | Edit network profile from resource detail. | An active resource is open in Web. | The operator saves internal port/protocol/exposure fields. | Web dispatches `resources.configure-network`, invalidates resource detail/list and observation state, and explains that route planning changes require a future deployment or route workflow. |
| RDP-005 | Keep entrypoint schemas unified. | CLI, HTTP/oRPC, Web, docs help, and future tool metadata reference resource profile editing. | The behavior is exposed or documented. | Each surface uses the existing operation keys and command/query schemas; no generic `resources.update` or transport-only source/runtime/network schema is introduced. |

## Domain Ownership

- Bounded context: Workload Delivery.
- Aggregate/resource owner: `Resource`.
- Upstream/downstream contexts: Release Orchestration consumes the resource profile when creating
  future deployment snapshots. Runtime Topology and edge proxy route realization may observe the
  network profile, but they do not own the source/runtime/network profile edits.

## Public Surfaces

- API: Existing `POST /api/resources/{resourceId}/source`,
  `POST /api/resources/{resourceId}/runtime-profile`, and
  `POST /api/resources/{resourceId}/network-profile` routes.
- CLI: Existing `appaloft resource configure-source`, `configure-runtime`, and
  `configure-network` commands.
- Web/UI: Resource detail profile tab source/runtime/network forms.
- Config: Repository config can seed profile inputs through existing entry workflows, but it does
  not directly choose Appaloft identity.
- Events: Existing `resource-source-configured`, `resource-runtime-configured`, and
  `resource-network-configured`.
- Public docs/help: Existing resource source/runtime/network profile anchors, with updated
  future-only profile edit wording.

## Non-Goals

- Adding a generic `resources.update` command.
- Changing command/query schemas for source/runtime/network profile operations.
- Editing access or health profile behavior in this slice.
- Redeploy, restart, rollback, cancel, runtime cleanup, or live route apply.
- Direct host-port exposure.
- Mutating historical deployment snapshots.

## Open Questions

- None for this resource detail editing closure. Existing-resource profile drift is governed by the
  later [Resource Profile Drift Visibility](../011-resource-profile-drift-visibility/spec.md)
  artifact and remains outside this closure.
