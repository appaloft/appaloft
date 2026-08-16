# Remote Agent Door — Plan

## Governing Sources

- [spec.md](./spec.md)
- [ADR-120](../../decisions/ADR-120-plan-default-destination.md)
- [ADR-118](../../decisions/ADR-118-remote-code-occupancy.md)
- [ADR-117](../../decisions/ADR-117-remote-agent-door.md) (login / Server / `--local`)
- [ADR-116](../../decisions/ADR-116-instant-local-scratch-session-boundary.md) (Scratch only)
- [workspaces.open](../../commands/workspaces.open.md)
- Spec 125 / 131 / 138 remain historical; default door is this spec

## Ownership

| Piece | Owner |
| --- | --- |
| Default `code` resolver | public CLI adapter |
| Remote SHA + Binding lookup | existing public queries |
| Occupancy create/resume | `workspaces.open` |
| `targetServerId` | public command input + placement port |
| Invisible `appaloft-remote` | Community activation initializer |
| Scratch | `code --local` only |
| Plan default Destination | `DeploymentContextResolver` read-only |
| Headless occupancy tree | public CLI adapter composing `servers.list` + `sandboxes.list` |
| Occupancy projectId | same tree; copy `activation.project.projectId` |
| Cloud default Server | later Cloud ticket; must honor `targetServerId` |

## Architecture

Do not add a new command family.

```text
deployments.plan --project --environment --resource --server
  if destinationId present -> load that Destination
  else if resource.defaultDestinationId -> load that Destination
  else load Server Destination named default
  never create Destination
  missing default -> destinationId is required
```

`deployments.create` remains the only write-side default-destination
create-or-reuse seam.

## Tests

Matrix `docs/testing/remote-agent-door-test-matrix.md`.

Slice-4 verification:

- unit: omitted destinationId uses Server `default`;
- unit: resource pin wins;
- unit: missing `default` fail-closed and creates nothing;
- `appaloftdev deployments plan` without `--destination` against occupancy
  Server `srv_uil9cpctplou` / resource `res_vj1602cxjisn` must not fail
  `destinationId is required`.

Slice-5 verification:

- unit: `--json` / `--no-tui` / non-TTY print `appaloft.workspace-occupancy/v1`;
- unit: tree includes Server id/name and occupancy workspaceId/repo;
- unit: interactive TTY still starts TUI;
- `appaloftdev workspace --json` lists `occupancy-mac` and ready Sandboxes.

Slice-6 verification:

- unit: occupancy with activation prints `projectId`;
- unit: occupancy without activation invents no projectId;
- `appaloftdev workspace --json` includes `prj_4o6txzih1dja` / `prj_aoqjs0es367x`.

Slice-7 verification:

- unit: omitted project/env resolve from Resource;
- unit: omitted resource still fail-closed;
- `appaloftdev deployments plan --resource res_vj1602cxjisn --server srv_uil9cpctplou` does not fail `Project id is required`.


Slice-8 verification:

- unit: missing `local` Environment is created;
- unit: existing `local` is reused and create is not called;
- `appaloftdev env list --project prj_aoqjs0es367x` shows `local` after occupying Hello-World.


Slice-9 verification:

- unit: missing Resource `app` is created with remote-git source;
- unit: existing Resource `app` is reused and create is not called;
- `appaloftdev resource list --project prj_aoqjs0es367x` shows slug `app` after occupying Hello-World.


## Risks

- Plan must stay read-only. Do not reuse the create bootstrap create-or-reuse
  path inside the query.
- Do not pick an arbitrary Destination when none is named `default`.
- Do not leak teammate disk contents through the occupancy tree.
- Do not invent Resource / Environment / Destination ids from occupancy.


