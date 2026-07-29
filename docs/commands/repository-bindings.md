# Repository Binding Operations

## Metadata

- Operation keys: `repository-bindings.bind`, `repository-bindings.show`,
  `repository-bindings.unbind`
- Owner: `RepositoryBinding`
- Status: active public command/query family
- Governing decision:
  [ADR-102](../decisions/ADR-102-profile-aware-workspace-open-and-attach.md)

## Contract

`RepositoryBinding` maps one tenant-scoped connector-neutral Repository Identity to one Project.
It is not deployment `SourceLink`, a forge installation, or a Workspace lifecycle record.

| Operation | Input | Result |
| --- | --- | --- |
| `repository-bindings.bind` | Credential-free repository locator and `projectId` | Safe binding descriptor with canonical identity. |
| `repository-bindings.show` | Credential-free repository locator or canonical identity | Exact visible binding or `not_found`. |
| `repository-bindings.unbind` | Binding id and expected Project id | Removed binding evidence. |

Normalization accepts scp-style SSH, `ssh://`, and credential-free HTTPS. It lowercases the host,
removes default ports, trailing slash, and `.git`, and preserves repository path case. User info,
passwords, tokens, query strings, fragments, ambiguous paths, and organization guessing fail
validation.

One tenant may bind an identity to at most one active Project. Repeating the same bind is
idempotent; rebinding to another Project conflicts. Unbind never terminates a Workspace or changes
a Project, Profile installation, Credential Connection, deployment SourceLink, or forge resource.

## Entrypoints

| Surface | Mapping |
| --- | --- |
| CLI | `appaloft repository bind <repository> --project <projectId>` and `repository show/unbind` |
| SDK | `repositoryBindings.bind/show/unbind` |
| oRPC / HTTP | Catalog-backed routes over the same message schemas |
| Console | Project Repository settings |

## Verification

See
[Profile-Aware Workspace Open And Attach Test Matrix](../testing/profile-aware-workspace-open-test-matrix.md).
