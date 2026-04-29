# Resource Profile Drift Visibility

## Status

- Round: Spec
- Artifact state: ready for Test-First Round

## Business Outcome

Operators can see when a resource's durable profile, a repository or entry-workflow profile, and the
latest deployment snapshot no longer describe the same intended workload. Appaloft reports the drift
through the existing resource detail query and config deploy workflow, with explicit recovery
commands, without adding a hidden resource update or deployment override path.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Resource profile drift | A field-level difference between the current resource-owned profile, an entry workflow's normalized profile, and/or the latest deployment snapshot. | Workload Delivery / Resource profile lifecycle | Existing-resource profile drift |
| Current Resource profile | Durable resource-owned source, runtime, network, access, health, and configuration state used by future deployment admission. | Workload Delivery | Resource settings |
| Entry workflow normalized profile | Source-adjacent repository config, CLI/Action flags, Web/local-agent draft, or future MCP tool input after validation and normalization, before it dispatches explicit operations. | Quick Deploy / config bootstrap | Repository config profile |
| Deployment snapshot profile | Immutable source/runtime/network/access/health/configuration facts captured by the latest deployment attempt. | Release Orchestration | Latest deployment snapshot |
| Drift section | The resource-owned concern where a changed field belongs: `source`, `runtime`, `network`, `access`, `health`, or `configuration`. | Resource profile lifecycle | Profile section |

## Behavior Boundary

Resource Profile Drift Visibility is an extension of `resources.show` profile diagnostics plus the
repository config deploy workflow's existing admission guard. It is not a new public query, not an
internal read workflow, and not a new mutation command.

Required boundary:

- `resources.show(includeProfileDiagnostics = true)` is the public reusable read surface for Web,
  CLI, HTTP/oRPC, and future MCP/tool diagnostics.
- Repository config deploy may compute the same normalized comparison before `deployments.create`.
  When the existing resource differs from the normalized profile and the entrypoint is not explicitly
  applying the matching resource command in that workflow step, it fails before deployment admission
  with `resource_profile_drift`.
- `deployments.create` stays ids-only and does not accept drift overrides or repository profile
  fields.
- Drift between current Resource profile and latest deployment snapshot is informational. It explains
  that the running/latest attempt used an older snapshot and does not block a new deployment.
- Drift between entry workflow profile and current Resource profile is blocking for config deploy
  admission unless the workflow first dispatches the explicit matching configuration command.

## Drift Comparison Objects

| Object | Source of truth | Mutability | Used for |
| --- | --- | --- | --- |
| Current Resource profile | `Resource` aggregate, resource configuration read model, and resource-owned access/health profile state. | Mutable only through named resource commands. | Future deployment admission and resource detail display. |
| Entry workflow normalized profile | Validated repository config plus trusted CLI/Action/Web/future-tool overrides after profile precedence resolution. | Transient entry-workflow input. | Config deploy preflight and remediation guidance. |
| Deployment snapshot profile | Latest deployment attempt's immutable runtime plan, network/access route snapshot, health policy snapshot, and environment snapshot. | Immutable after deployment acceptance. | Historical explanation and "pending redeploy" visibility. |

Comparison rules:

- Compare only normalized, provider-neutral profile fields. Do not compare raw config text,
  localized labels, generated timestamps, volatile source checkout paths, command render strings, or
  provider-native runtime ids.
- Secret values are compared by safe identity, presence, scope, exposure, kind, and masked digest or
  redacted equality marker when available. Raw secret values must never appear in diagnostics,
  errors, logs, or API responses.
- Missing values are explicit drift states: `missing-in-resource`, `missing-in-entry-profile`, or
  `missing-in-deployment-snapshot`.
- The same field may report multiple comparisons, such as current Resource profile differs from the
  entry profile and the latest deployment snapshot also differs from current Resource profile.

## User-Visible Result

Every drift item must include:

- `section`: one of `source`, `runtime`, `network`, `access`, `health`, or `configuration`;
- `fieldPath`: canonical path such as `source.baseDirectory`, `runtimeProfile.publishDirectory`,
  `networkProfile.internalPort`, `accessProfile.pathPrefix`, `healthPolicy.http.path`, or
  `configuration.runtime.DATABASE_URL`;
- `comparison`: `resource-vs-entry-profile`, `resource-vs-latest-snapshot`, or
  `entry-profile-vs-latest-snapshot`;
- redacted comparison values or value summaries for each available object;
- `blocksDeploymentAdmission`: `true` only when the entry workflow would otherwise deploy an
  existing resource from a normalized profile that has not been applied to the Resource;
- `suggestedCommand`: the explicit operation that owns the fix when known;
- optional CLI hint and config pointer when the drift comes from repository config.

Suggested command mapping:

| Section | Example field paths | Suggested operation |
| --- | --- | --- |
| `source` | `source.kind`, `source.locator`, `source.gitRef`, `source.baseDirectory`, image tag/digest | `resources.configure-source` |
| `runtime` | `runtimeProfile.strategy`, install/build/start commands, `runtimeName`, Dockerfile/Compose path, publish directory, build target | `resources.configure-runtime` |
| `network` | `networkProfile.internalPort`, `upstreamProtocol`, `exposureMode`, `targetServiceName`, `hostPort` | `resources.configure-network` |
| `access` | `accessProfile.generatedAccessMode`, `accessProfile.pathPrefix` | `resources.configure-access` |
| `health` | enabled/type/timing fields, HTTP method/scheme/host/port/path/expected status | `resources.configure-health` |
| `configuration` | resource-scoped variable key/exposure/kind/scope differences | `resources.set-variable` or `resources.unset-variable` |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| RPDV-001 | Resource detail shows profile drift diagnostics. | A resource has current profile fields that differ from its latest deployment snapshot. | Web, CLI, API, or future MCP calls `resources.show` with profile diagnostics enabled. | The response includes drift items by section and field, marks them non-blocking, and suggests the relevant resource command when the user wants future deployments to align with current resource state. |
| RPDV-002 | Config deploy rejects unapplied existing-resource drift. | A repository config normalized profile differs from an existing linked resource's current profile. | CLI config deploy is about to dispatch `deployments.create` without first applying the explicit profile command. | The workflow stops before deployment admission with `resource_profile_drift`, includes section/field details, and suggests the matching `appaloft resource configure-*`, `set-variable`, or `unset-variable` command. |
| RPDV-003 | Config deploy does not report benign snapshot drift as a blocker. | The current resource profile matches the normalized repository config, but the latest deployment snapshot is older. | CLI config deploy prepares a new deployment. | The workflow may report informational `resource-vs-latest-snapshot` drift but does not block deployment admission. |
| RPDV-004 | Secret/configuration drift stays redacted. | Resource or entry profile contains secret references or masked resource variables. | Drift diagnostics compare configuration fields. | The result shows key, exposure, kind, scope, source, and masked equality state only; no raw value appears. |
| RPDV-005 | Entrypoints share one diagnostic vocabulary. | Web resource detail, CLI resource show/config deploy, HTTP/oRPC, and future MCP need drift guidance. | They render or transport drift data. | They reuse the `resources.show` diagnostic shape and operation keys; no transport-only drift schema or generic `resources.update` remedy is introduced. |

## Domain Ownership

- Bounded context: Workload Delivery.
- Aggregate/resource owner: `Resource` owns current profile state and the explicit remediation
  commands.
- Upstream/downstream contexts: Quick Deploy/config bootstrap produces transient normalized profile
  input; Release Orchestration owns immutable deployment snapshots. Neither owns current resource
  profile mutation.
- Context relationship: read-side comparison across Resource, entry workflow input, and latest
  deployment snapshot; no new aggregate or durable drift record.

## Public Surfaces

- API: extend `resources.show` diagnostics; no new HTTP/oRPC route for drift in this slice.
- CLI: `appaloft resource show --json` may expose diagnostics; config deploy reports
  `resource_profile_drift` before deployment admission for blocking entry-profile drift.
- Web/UI: resource detail shows sectioned drift badges/callouts and links or actions to named
  resource commands.
- Config: repository config remains an entry-workflow profile source, not a resource identity or
  deployment command input.
- Events: no new events. Drift is computed read/preflight data.
- Public docs/help: user-facing docs/help should point to existing resource profile/configuration
  anchors plus a new or updated troubleshooting anchor for profile drift.
- Future MCP/tools: expose the same `resources.show` diagnostics and suggested operation keys.

## Non-Goals

- Adding `resources.profile-drift`, `resources.diff-profile`, or a generic `resources.update`.
- Mutating resource profiles from `deployments.create`.
- Automatically applying repository config drift without an explicit resource command step.
- Mutating historical deployment snapshots.
- Runtime restart, redeploy, rollback, route apply, domain binding, certificate issuance, or secret
  material inspection.
- Persisting drift as aggregate state.

## ADR Decision

No new ADR is required for this Spec Round. The behavior fits existing accepted decisions:

- ADR-012 defines Resource profile versus deployment snapshot ownership and already requires explicit
  resource commands or profile-drift rejection for existing-resource config changes.
- ADR-014 keeps deployment admission ids-only and prevents config/profile fields from re-entering
  `deployments.create`.
- ADR-010 and ADR-024 classify repository config deploy as an entry workflow over explicit
  operations.
- ADR-026 forbids a generic resource update remedy.

## Open Questions

- Should a later Code Round add an explicit `--apply-profile` or `--configure-profile` config-deploy
  mode that dispatches suggested commands before deployment, or should config deploy remain
  fail-first for existing-resource drift until the operator runs the commands directly?
