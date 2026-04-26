# Resource Access Profile Configuration

## Status

- Round: Spec -> Test-First -> Code
- Artifact state: active

## Business Outcome

Operators can change a resource's reusable generated-access preferences after the resource exists.
The change is resource-owned profile state, affects future deployment route resolution, and is
visible through `resources.show`.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Resource access profile | Resource-owned reusable public access preferences for generated default access routes. | Workload Delivery / Resource | Access settings |
| Generated access mode | Whether a resource inherits generated access policy or disables generated default access for future deployments. | Resource access profile | Default access toggle |
| Route path prefix | The path prefix used when Appaloft creates a generated default access route for the resource. | Runtime Topology route realization | Path prefix |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| RAP-001 | Disable generated default access for one resource. | An active resource has reverse-proxy network profile. | The operator runs `resources.configure-access` with `generatedAccessMode = "disabled"`. | The resource stores the profile, emits `resource-access-configured`, `resources.show` returns the profile, planned generated access disappears, and future deployments do not generate a default route. |
| RAP-002 | Restore generated access inheritance. | A resource has generated access disabled. | The operator runs `resources.configure-access` with `generatedAccessMode = "inherit"`. | Future planned/deployment route resolution may use the configured default access policy again. |
| RAP-003 | Configure a generated route path prefix. | An active reverse-proxy resource needs generated access under a path prefix. | The operator sets `pathPrefix = "/app"`. | The path prefix is stored, returned by `resources.show`, used by planned generated access, and copied to future generated route snapshots. |
| RAP-004 | Reject unsafe path prefix input. | An active resource exists. | The operator submits a path prefix without a leading slash or with an empty value. | The command returns `validation_error`, `phase = "resource-access-resolution"`, and no resource event is emitted. |
| RAP-005 | Guard archived resources. | A resource is archived. | The operator submits any access profile change. | The command returns `resource_archived`, `phase = "resource-lifecycle-guard"`, and no event is emitted. |

## Domain Ownership

- Bounded context: Workload Delivery, with Runtime Topology route resolution downstream.
- Aggregate/resource owner: `Resource`.
- Upstream/downstream contexts: Default access policy/provider and edge proxy route realization
  observe this profile when resolving generated routes. They do not own the profile.

## Public Surfaces

- API: `POST /api/resources/{resourceId}/access-profile`.
- CLI: `appaloft resource configure-access <resourceId>`.
- Web/UI: Resource detail access settings form.
- Config: Not a repository config field in this slice.
- Events: `resource-access-configured`.
- Public docs/help: `/docs/access/generated-routes/#resource-access-profile` and localized
  equivalent.

## Non-Goals

- Custom domain binding lifecycle.
- TLS certificate policy or issuance.
- Default access provider/system/server policy editing.
- Applying proxy routes to currently running deployments.
- Redeploy/restart after profile change.
- Direct host-port exposure.

## Open Questions

- None for this slice.
