# projects.configure-workspace-profile Command Spec

## Metadata

- Operation key: `projects.configure-workspace-profile`
- Command class: `ConfigureProjectWorkspaceProfileCommand`
- Owner: `Project`
- Status: active public command

## Contract

The command stores or clears one Project default Agent Workspace Profile installation reference.
It accepts only an exact enabled, tenant-visible immutable installation id. Profile names are
resolved at the application boundary before the aggregate mutation.

The command fails without changing Project state when the Project is missing/archived, the Profile
installation is missing, disabled, stale, cross-tenant, or unauthorized. It does not compile a
Profile, create a Sandbox, resolve Credential Connections, or mutate the Profile installation.

```ts
type ConfigureProjectWorkspaceProfileCommandInput = {
  projectId: string;
  profileInstallationId: string | null;
};
```

Repeating the current value succeeds idempotently. Clearing the value means `workspaces.open`
requires an explicit Profile until another default is configured.

## Entrypoints

| Surface | Mapping |
| --- | --- |
| CLI | `appaloft project workspace-profile set <projectId> <installationId>` / `clear` |
| SDK | `projects.configureWorkspaceProfile(...)` |
| oRPC / HTTP | Catalog-backed command route |
| Console | Project Agent Workspace settings |

## References

- [ADR-103](../decisions/ADR-103-profile-aware-workspace-open-and-attach.md)
- [Spec 120](../specs/120-profile-aware-workspace-open-and-attach/spec.md)
- [Test Matrix](../testing/profile-aware-workspace-open-test-matrix.md)
