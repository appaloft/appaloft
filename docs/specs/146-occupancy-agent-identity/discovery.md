# Occupancy Agent Identity — Grill / Discovery

## Status

- Round: Spec. Owner authorized the model correction 2026-08-23 after
  live occupy vs Railway Cloud Agents 5.43.1 (`railway code --codex`,
  `railway ca` home).
- Predecessor: Spec 139 / ADR-118 / ADR-122 / ADR-124.

## Actor And Observable Outcome

A teammate runs `appaloft code --codex` from a git checkout. They land on
**their Agent** (generated kebab name, unique). Git pin and Project stay
metadata. Exit leaves the Agent running. `appaloft workspace` lists Agents
by that name, not `repo@sha` or `sbx_*`.

## Settled Decisions

| ID | Decision | Source |
| --- | --- | --- |
| D1 | User-facing occupancy object is Agent | Railway `ca` / `code` chrome; owner 2026-08-23 |
| D2 | Agent name is generated kebab or explicit name, never `repo@sha` | Railway `supportive-balance`; ADR-125 |
| D3 | Exit detaches; Agent keeps running; sleep/delete are explicit | Railway session ended + `ca sleep` |
| D4 | Project is a stack; Resource is the Service; Binding is default index and rebinds | owner model review |
| D5 | `code` door stays origin / URL / this-folder | ADR-118/119/122 |
| D6 | Railway `ca` home is not this slice | prompt / New Session / `^t` later |

## Rejected

- Project-first `code` door.
- Cloning `ca` home TUI in this slice.
- Many Binding rows per identity without a new table shape.
