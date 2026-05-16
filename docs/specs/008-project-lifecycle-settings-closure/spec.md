# Project Lifecycle Settings Closure

## Status

- Round: Spec -> Test-First -> Code -> Post-Implementation Sync
- Artifact state: active for `0.6.0` Phase 4 closure

## Business Outcome

Operators can use the project detail/settings surface to understand and manage the project-level
lifecycle without mistaking project changes for deployment actions.

This closure originally used the existing `projects.show`, `projects.rename`, and
`projects.archive` operations. Later closure rounds added `projects.set-description`,
`projects.restore`, `projects.delete-check`, and guarded `projects.delete` as explicit named
operations. It does not introduce a generic `projects.update` operation.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Project lifecycle | Project identity and active/archived state. | Workspace | Project settings |
| Project settings | User-facing surface that reads project identity and submits project lifecycle commands. | Web console | Settings panel |
| Project rollup | Read-only summary of related resources, environments, deployments, and access routes. | Web console/read models | Summary counts |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| PROJ-LIFE-ENTRY-005 | Project detail/settings commands | A project exists | The Web project detail/settings page loads and the user applies lifecycle actions | The page reads `projects.show`, dispatches `projects.rename`, `projects.archive`, and `projects.restore`, and does not expose `projects.update`. |
| PROJ-LIFE-ENTRY-006 | Project settings side-effect clarity | A project detail/settings page is visible | The user reviews project settings and rollups | The page makes clear project-level lifecycle changes do not create deployments, mutate historical deployment snapshots, or immediately affect runtime state. |
| PROJ-LIFE-ENTRY-007 | Archived project affordance guard | An archived project is shown | The user reviews project-scoped creation controls | Project-scoped creation/deploy affordances are disabled or routed away from mutation; history and rollups remain readable. |

## Domain Ownership

- Bounded context: Workspace
- Aggregate/resource owner: `Project`
- Upstream/downstream contexts: resources, environments, deployments, access routes, snapshots, and
  runtime state may be read as rollups, but they are not mutated by project lifecycle commands.

## Public Surfaces

- API: existing `GET /api/projects/{projectId}`, `POST /api/projects/{projectId}/rename`,
  `POST /api/projects/{projectId}/archive`, `POST /api/projects/{projectId}/restore`,
  `GET /api/projects/{projectId}/delete-check`, and guarded
  `DELETE /api/projects/{projectId}`.
- CLI: existing `appaloft project show`, `appaloft project rename`, `appaloft project archive`,
  `appaloft project restore`, `appaloft project delete-check`, and guarded
  `appaloft project delete`.
- Web/UI: project detail/settings page reads `projects.show`, shows project/resource/environment
  rollups, submits rename/archive/restore, reads delete-check, enables guarded delete only when
  eligible, and disables project-scoped creation when archived.
- Config: not applicable. Repository config must not select or mutate project identity.
- Events: existing `project-renamed`, `project-archived`, `project-restored`, and
  `project-deleted`; none starts cleanup or runtime work.
- Public docs/help: existing `project.lifecycle` public docs anchor.

## Non-Goals

- `projects.update`, `UpdateProjectCommand`, or `PATCH /api/projects/{projectId}`.
- Bulk child cleanup or cascade deletion.
- Any mutation of resources, environments, deployments, historical deployment snapshots, access
  routes, logs, domains, certificates, or runtime state.

## Open Questions

- None for this closure slice.
