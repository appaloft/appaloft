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

## Risks

- Plan must stay read-only. Do not reuse the create bootstrap create-or-reuse
  path inside the query.
- Do not pick an arbitrary Destination when none is named `default`.
- Missing `internalPort` remains the next first-deploy blocker.

