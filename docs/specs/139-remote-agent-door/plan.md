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
| Occupancy Preview URL | same tree; copy succeeded generated access from Resource `app` |
| Occupancy deploy reuse | public CLI adapter composing Binding + Environment `local` + Resource `app` + default Server |
| Occupancy EXPOSE port | detector + occupancy initializer |
| GitHub owner/repo | public CLI remote-code locator |
| Bare occupancy deploy | public CLI adapter composing latest occupancy + Binding/`app` |
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

Slice-10 verification:

- unit: created Resource `app` includes network `3000` / `http` / `reverse-proxy`;
- unit: existing Resource without network is configured; existing network is reused;
- `appaloftdev deployments plan --resource res_vhmyk4zutvnd --server srv_uil9cpctplou` no longer reports `missing-internal-port`.

Slice-11 verification:

- unit: remote-git with empty inspection does not select dockerfile;
- unit: remote-git with detected dockerfile still selects dockerfile;
- `appaloftdev deployments plan --resource res_vhmyk4zutvnd --server srv_uil9cpctplou` is blocked and does not claim `Dockerfile`.

Slice-12 verification:

- unit: remote-git enrichment is allowed;
- unit: detector inspects a cloned remote with root Dockerfile;
- `appaloftdev deployments plan --resource res_3qjkhtnc45nk --server srv_uil9cpctplou` against occupied `appaloft/examples` asks for `source.baseDirectory`.

Slice-13 verification:

- unit: occupancy with succeeded generated access prints `preview.url`;
- unit: occupancy without succeeded access omits `preview`;
- `appaloftdev workspace --json` after official hello create includes `http://app-jkhtnc45nk.127.0.0.1.sslip.io`.

Slice-14 verification:

- unit: git-remote with occupancy Resource `app` dispatches `deployments.create`;
- unit: missing Binding/`app` does not invent Resource;
- `appaloftdev deploy https://github.com/appaloft/examples.git` after occupy does not prompt for method.

Slice-15 verification:

- unit: single Dockerfile EXPOSE is recorded and used as occupancy internalPort;
- unit: missing or multiple EXPOSE keeps 3000;
- `appaloftdev resource show` after occupying `traefik/whoami` is `internalPort 80`.

Slice-16 verification:

- unit: `owner/repo` expands to github.com HTTPS when that path is not a local directory;
- unit: an existing local directory named `owner/repo` stays a path;
- `appaloftdev code traefik/whoami --no-attach` after occupying examples occupies whoami.

Slice-17 verification:

- unit: bare `deploy` dispatches `deployments.create` for the latest occupancy Resource `app`;
- unit: bare `deploy` without occupancy fail-closed when non-interactive;
- `appaloftdev deploy` after occupying `traefik/whoami` does not require a path.







## Risks

- Plan must stay read-only. Do not reuse the create bootstrap create-or-reuse
  path inside the query.
- Do not pick an arbitrary Destination when none is named `default`.
- Do not leak teammate disk contents through the occupancy tree.
- Do not invent Resource / Environment / Destination ids from occupancy.


