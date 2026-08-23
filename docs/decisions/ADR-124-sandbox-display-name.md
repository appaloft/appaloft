# ADR-124: Sandbox Display Name

Status: Accepted (create-time git `repo@sha` name superseded by [ADR-125](./ADR-125-occupancy-agent-and-project-binding.md))

Date: 2026-08-21

## Context

Live Cloud Agents / Workspace TUI still painted `sbx_*` as the opened-row name
(spec 139 D76/D79). Users should see a readable name, never `sbx_*` / `prj_*` as
the sandbox or workspace row name.

Railway public docs (confirmed 2026-08-21, public pages only):

- users see readable names, never `prj_` / `sbx_` ids;
- `railway up` for a new project defaults to the directory name
  ([docs.railway.com/cli/up](https://docs.railway.com/cli/up));
- `railway init` without `--name` is randomly generated
  ([docs.railway.com/cli/init](https://docs.railway.com/cli/init)). Those docs
  do not specify adjective-noun as the formula;
- `ca setup` can create a project named Cloud Agents.

Appaloft keeps its own naming plan. Adjective-noun kebab is our generator, not
a Railway formula.

`sandboxId` remains the storage, API, and Docker identity. Changing the
`sbx_[A-Za-z0-9_.-]+` format would break provider handles, occupancy keys, and
the docker-sandbox-provider regex.

## Decision

1. `Sandbox` persists a `SandboxDisplayName` with the aggregate JSONB state.
   Reopen shows the same name. The id format is unchanged.
2. Name resolution at create, in order:
   - an explicit valid `name` that does not start with `sbx_`;
   - the linked / cwd folder directory name, or the last segment of a
     `folder.local/...` identity;
   - git identity + commit as `repo@short-sha` (repo leaf only);
   - otherwise a memorable generated kebab name. Appaloft's generator uses a
     small curated English adjective-noun list (for example `resonant-silence`).
     That formula is ours; do not claim it is Railway's.
3. Rows stored before this field exist rehydrate a stable generated name from
   the sandbox id. Queries do not write that backfill.
4. User-facing CLI, TUI, Cloud Agents list, inquire, details, help, and errors
   print the display name. They never print `sbx_`. JSON / `--json` may still
   include `sandboxId` / `workspaceId`.
5. Occupancy remains an internal resume key. This decision does not add
   Occupancy chrome, copy, or help.

## Consequences

- `sandboxes.create` accepts optional `name`, `directoryName`,
  `repositoryIdentity`, and `commitSha` as name hints. They are not a second
  identity.
- CLI `workspace show|pause|resume|terminate|terminal|connect|attach` accept the
  display name or the sandbox id.
- Public docs and the `code` banner show the display name.

## Rejected Alternatives

- Replacing `sbx_*` ids with adjective-noun ids.
- Using occupancy `owner/repo@sha` as the TUI row title.
- Writing a name backfill during list/show.
- Claiming Railway's undocumented random `init` name is adjective-noun.
