# agent-workspace-profiles.configure-credential-connections Command Spec

## Metadata

- Operation key: `agent-workspace-profiles.configure-credential-connections`
- Command class: `ConfigureAgentWorkspaceProfileCredentialConnectionsCommand`
- Owner: `AgentWorkspaceProfileInstallation`
- Status: active public command

## Contract

The command maps declared Profile credential requirement ids to tenant-scoped named Credential
Connection references. Portable Profile definitions remain tenant- and secret-free.

```ts
type ConfigureAgentWorkspaceProfileCredentialConnectionsCommandInput = {
  installationId: string;
  connections: ReadonlyArray<{
    requirementId: string;
    connectionReference: string;
  }>;
};
```

Every requirement id must exist in the immutable Profile/Adapter definition. Connection references
must be normalized identifiers; secret values, secret URIs, tokens, API keys, usernames and
passwords are rejected. The result returns requirement ids plus masked Connection identity/status,
never secret material.

Compilation and Workspace admission fail closed when a required Connection is missing, disabled,
stale, ambiguous, cross-tenant or unauthorized. Updating the mapping affects only future compiles;
existing Runtime pins and grants remain immutable.

## Entrypoints

| Surface | Mapping |
| --- | --- |
| CLI | `appaloft agent-workspace-profile credential-connection set ...` |
| SDK | `agentWorkspaceProfiles.configureCredentialConnections(...)` |
| oRPC / HTTP | Catalog-backed command route |
| Console | Profile installation Credential Connections |

## References

- [ADR-100](../decisions/ADR-100-agent-adapter-distribution-and-workspace-profile-boundary.md)
- [ADR-102](../decisions/ADR-102-profile-aware-workspace-open-and-attach.md)
- [Spec 119](../specs/119-profile-aware-workspace-open-and-attach/spec.md)
- [Test Matrix](../testing/profile-aware-workspace-open-test-matrix.md)
