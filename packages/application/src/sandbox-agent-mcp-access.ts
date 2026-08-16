import { type AgentWorkspaceMcpBinding } from "./agent-workspace-profile";
import { type ExecutionContext } from "./execution-context";

export interface SandboxAgentMcpAccessDescriptor {
  capabilityId: string;
  serverName: string;
  transport: "streamable-http";
  url: string;
  accessToken: string;
  expiresAt: string;
  effectiveTools: string[];
}

export interface SandboxAgentMcpAccessIssueInput {
  executionContext: ExecutionContext;
  sandboxId: string;
  runtimeId: string;
  runId: string;
  binding: AgentWorkspaceMcpBinding;
}

export interface SandboxAgentMcpAccessProvider {
  issue(input: SandboxAgentMcpAccessIssueInput): Promise<SandboxAgentMcpAccessDescriptor>;
  revoke(input: {
    executionContext: ExecutionContext;
    sandboxId: string;
    runtimeId: string;
    runId: string;
    capabilityId: string;
  }): Promise<void>;
  /** Idempotently revokes every MCP capability owned by this exact Runtime/run scope. */
  revokeScope(input: Omit<SandboxAgentMcpAccessIssueInput, "binding">): Promise<void>;
}

const safeIdPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/u;
const serverNamePattern = /^[a-z][a-z0-9-]{0,62}$/u;
const toolNamePattern = /^[A-Za-z][A-Za-z0-9_.:/-]{0,127}$/u;

export const OCCUPANCY_FIRST_PARTY_MCP_REFERENCE = "appaloft-first-party";
export const OCCUPANCY_FIRST_PARTY_MCP_DISCOVERY_TOOLS = [
  "projects_list",
  "environments_list",
  "environments_create",
  "resources_list",
  "resources_show",
  "resources_create",
  "resources_configure_source",
  "resources_configure_runtime",
  "resources_configure_network",
  "resources_configure_access",
  "servers_list",
  "deployments_list",
  "deployments_plan",
  "deployments_create",
  "deployments_show",
  "deployments_proof",
  "deployments_timeline",
  "preview_environments_list",
  "preview_environments_show",
  "sandbox_ports_expose",
  "sandboxes_agent_tasks_deliver",
] as const;

export function withOccupancyFirstPartyMcpDiscovery(
  bindings: readonly AgentWorkspaceMcpBinding[] = [],
): readonly AgentWorkspaceMcpBinding[] {
  return bindings.map((binding) => {
    if (binding.connectionReference !== OCCUPANCY_FIRST_PARTY_MCP_REFERENCE) {
      return binding;
    }
    const requestedTools = [
      ...new Set([...binding.requestedTools, ...OCCUPANCY_FIRST_PARTY_MCP_DISCOVERY_TOOLS]),
    ];
    return requestedTools.length === binding.requestedTools.length &&
      requestedTools.every((tool, index) => tool === binding.requestedTools[index])
      ? binding
      : { ...binding, requestedTools };
  });
}

export function assertSandboxAgentMcpAccessDescriptor(
  descriptor: SandboxAgentMcpAccessDescriptor,
  binding: AgentWorkspaceMcpBinding,
): void {
  let url: URL;
  try {
    url = new URL(descriptor.url);
  } catch {
    throw new Error("sandbox_agent_mcp_access_invalid");
  }
  const requested = new Set(binding.requestedTools);
  if (
    !safeIdPattern.test(descriptor.capabilityId) ||
    !serverNamePattern.test(descriptor.serverName) ||
    descriptor.transport !== "streamable-http" ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    !descriptor.accessToken ||
    descriptor.accessToken.length > 4_096 ||
    /[\0\r\n]/u.test(descriptor.accessToken) ||
    !Number.isFinite(new Date(descriptor.expiresAt).getTime()) ||
    descriptor.effectiveTools.some(
      (tool, index) =>
        !toolNamePattern.test(tool) ||
        descriptor.effectiveTools.indexOf(tool) !== index ||
        (requested.size > 0 && !requested.has(tool)),
    )
  ) {
    throw new Error("sandbox_agent_mcp_access_invalid");
  }
}

export async function issueSandboxAgentMcpAccess(
  provider: SandboxAgentMcpAccessProvider | undefined,
  input: Omit<SandboxAgentMcpAccessIssueInput, "binding">,
  bindings: readonly AgentWorkspaceMcpBinding[] = [],
): Promise<SandboxAgentMcpAccessDescriptor[]> {
  if (bindings.length === 0) return [];
  if (!provider) throw new Error("sandbox_agent_mcp_access_unavailable");
  const capabilities: SandboxAgentMcpAccessDescriptor[] = [];
  try {
    for (const binding of bindings) {
      const capability = await provider.issue({ ...input, binding });
      capabilities.push({ ...capability, effectiveTools: [...capability.effectiveTools] });
      assertSandboxAgentMcpAccessDescriptor(capability, binding);
    }
    return capabilities;
  } catch (error) {
    await revokeSandboxAgentMcpAccess(provider, input, capabilities);
    throw error;
  }
}

export async function revokeSandboxAgentMcpAccess(
  provider: SandboxAgentMcpAccessProvider | undefined,
  input: Omit<SandboxAgentMcpAccessIssueInput, "binding">,
  capabilities: readonly SandboxAgentMcpAccessDescriptor[],
): Promise<void> {
  if (!provider) return;
  let firstError: unknown;
  for (const capability of capabilities) {
    try {
      await provider.revoke({ ...input, capabilityId: capability.capabilityId });
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError) throw firstError;
}

export async function reconcileSandboxAgentMcpAccessScope(
  provider: SandboxAgentMcpAccessProvider | undefined,
  input: Omit<SandboxAgentMcpAccessIssueInput, "binding">,
): Promise<void> {
  await provider?.revokeScope(input);
}
