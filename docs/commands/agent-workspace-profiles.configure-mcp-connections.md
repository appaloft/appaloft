# agent-workspace-profiles.configure-mcp-connections Command Spec

## Metadata

- Operation key: `agent-workspace-profiles.configure-mcp-connections`
- Command class: `ConfigureAgentWorkspaceProfileMcpConnectionsCommand`
- Owner: `AgentWorkspaceProfileInstallation`
- Status: active public command

## Contract

The command maps declared Adapter MCP requirement ids to host-owned, tenant-scoped remote MCP
Connection references. Portable Adapter and Profile definitions remain endpoint-, credential-, and
tenant-free.

```ts
type ConfigureAgentWorkspaceProfileMcpConnectionsCommandInput = {
  installationId: string;
  connections: ReadonlyArray<{
    requirementId: string;
    connectionReference: string;
  }>;
};
```

Every requirement id must exist in the immutable installed Adapter definition. References are opaque
normalized identifiers; endpoint URLs, authorization headers, tokens, upstream credentials, stdio
commands, and uploaded code are rejected. Updating the mapping affects future compiles only. Existing
Runtime pins and issued grants remain immutable until their exact cleanup path revokes them.

## Entrypoints

| Surface | Mapping |
| --- | --- |
| CLI | `appaloft agent-workspace-profile mcp-connection set ...` |
| SDK | `agentWorkspaceProfiles.configureMcpConnections(...)` |
| oRPC / HTTP | `POST /api/agent-workspace-profiles/{installationId}/mcp-connections` |
| MCP | Catalog-generated tool metadata and authenticated dispatch |

## References

- [ADR-106](../decisions/ADR-106-remote-mcp-connection-for-agent-workspaces.md)
- [Spec 124](../specs/124-remote-mcp-access-for-agent-workspaces/spec.md)
- [Test Matrix](../testing/remote-mcp-access-test-matrix.md)
