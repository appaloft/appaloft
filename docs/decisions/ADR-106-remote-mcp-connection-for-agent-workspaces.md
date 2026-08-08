# ADR-106: Remote MCP Connection For Agent Workspaces

## Context

Agent Workspace Profiles can already pin an Agent Adapter and named credential connections. Pi and
OpenCode can consume brokered model access without receiving a provider key. They cannot yet declare
or consume an organization-managed remote MCP server. Treating MCP configuration as an arbitrary
credential or copying an endpoint into an Adapter manifest would expose tenant configuration, bypass
Workspace lifecycle cleanup, and encourage Agent-specific control-plane branches.

## Decision

Public Appaloft owns the provider-neutral Workspace contract:

- a declarative Adapter may declare bounded remote MCP requirements;
- a Profile installation binds each requirement to one opaque connection reference;
- compilation pins those safe references into the Workspace/Runtime plan;
- one `SandboxAgentMcpAccessIssuer` port exchanges the exact binding and
  Sandbox/Workspace/Runtime/run scope for a short-lived Streamable HTTP gateway capability;
- Pi, OpenCode, and future harnesses receive the same capability contract and render only their
  native MCP client configuration;
- Runtime completion, cancellation, replacement, and Workspace termination revoke the exact access
  scope through the same lifecycle that cleans process credential grants.

The public manifest never contains an endpoint, bearer token, API key, client secret, tenant policy,
or executable MCP command. Public Appaloft does not own a remote MCP connection registry, upstream
credential custody, organization authorization, tool classification, audit, billing, or a hosted
gateway. A hosting composition may provide those concerns behind the public issuer port.

V1 supports HTTPS MCP Streamable HTTP only. Tenant-provided stdio commands, uploaded control-plane
code, SSE-only legacy transports, and arbitrary headers are rejected. A binding may request named
tools, but the hosting policy can only narrow that request. Write-capable tools require an explicit
hosting approval; public code never infers safety from a tool name or description.

## Consequences

- Adapter/Profile authors can describe MCP needs without learning a Cloud product model.
- Profile compilation and Runtime lifecycle remain portable across Community, Cloud, and Enterprise.
- Hosts can rotate or revoke an upstream credential without rewriting an immutable Profile manifest.
- A Sandbox sees only a bounded Appaloft gateway URL, short-lived token, server alias, expiry, and
  effective tool names. Raw upstream endpoint and credential stay outside the Sandbox.
- The hosted connection lifecycle and Marketplace distribution remain separate later slices.

## Rejected alternatives

- Put endpoint/key/header values in Adapter or Profile JSON.
- Model an MCP server as a generic process-environment credential.
- Permit tenant-uploaded stdio MCP commands in the control plane.
- Add Pi-specific and OpenCode-specific connection operations.
- Treat every advertised MCP tool as read-only unless its name looks mutating.

## References

- [Spec 117](../specs/117-agent-adapter-sdk-and-workspace-profiles/spec.md)
- [Spec 123](../specs/123-brokered-model-access/spec.md)
- [Spec 124](../specs/124-remote-mcp-access-for-agent-workspaces/spec.md)
- [Remote MCP Access Test Matrix](../testing/remote-mcp-access-test-matrix.md)
