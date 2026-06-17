import {
  type ConnectorCapabilityApplyInput,
  type ConnectorCapabilityApplyResult,
  type ConnectorCapabilityPlanInput,
  type ConnectorCapabilityPlanPreview,
  type ConnectorProviderAdapter,
  type ExecutionContext,
} from "@appaloft/application";
import {
  domainError,
  err,
  InfrastructureServerProposal,
  type InfrastructureServerProposalSnapshot,
  ok,
  type Result,
} from "@appaloft/core";

export interface VultrInfrastructureCredentialProvider {
  apiToken(): Promise<Result<string>> | Result<string>;
}

export type VultrInfrastructureFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface StaticVultrInfrastructureCredentialProviderOptions {
  apiToken: string;
}

export class StaticVultrInfrastructureCredentialProvider
  implements VultrInfrastructureCredentialProvider
{
  private readonly token: string;

  constructor(options: StaticVultrInfrastructureCredentialProviderOptions) {
    this.token = options.apiToken;
  }

  apiToken(): Result<string> {
    const token = this.token.trim();
    if (!token) {
      return err(domainError.validation("Vultr infrastructure API token is required"));
    }
    return ok(token);
  }
}

export interface VultrInfrastructureConnectorProviderAdapterOptions {
  connectorKey?: string;
  providerTitle?: string;
  apiBaseUrl?: string;
  fetcher?: VultrInfrastructureFetch;
  credentialProvider: VultrInfrastructureCredentialProvider;
}

interface VultrListResponse<T> {
  regions?: T[];
  plans?: T[];
  os?: T[];
  error?: string;
}

interface VultrRegion {
  id: string;
  city?: string;
  country?: string;
}

interface VultrPlan {
  id: string;
  monthly_cost?: number;
  ram?: number;
  vcpu_count?: number;
  disk?: number;
  locations?: string[];
}

interface VultrOs {
  id: number;
  name: string;
  arch?: string;
  family?: string;
}

interface VultrInfrastructureCatalog {
  regions: VultrRegion[];
  plans: VultrPlan[];
  os: VultrOs[];
}

export class VultrInfrastructureConnectorProviderAdapter implements ConnectorProviderAdapter {
  readonly connectorKey: string;
  private readonly providerTitle: string;
  private readonly apiBaseUrl: string;
  private readonly fetcher: VultrInfrastructureFetch;
  private readonly credentialProvider: VultrInfrastructureCredentialProvider;

  constructor(options: VultrInfrastructureConnectorProviderAdapterOptions) {
    this.connectorKey = options.connectorKey ?? "vultr-infrastructure";
    this.providerTitle = options.providerTitle ?? "Vultr Infrastructure";
    this.apiBaseUrl = (options.apiBaseUrl ?? "https://api.vultr.com/v2").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
    this.credentialProvider = options.credentialProvider;
  }

  canPlan(capabilityKey: string): boolean {
    return capabilityKey === "infrastructure.server.propose";
  }

  async planCapability(
    context: ExecutionContext,
    input: ConnectorCapabilityPlanInput,
  ): Promise<Result<ConnectorCapabilityPlanPreview>> {
    void context;
    if (!this.canPlan(input.capabilityKey)) {
      return err(
        domainError.validation(`Connector ${this.connectorKey} cannot plan ${input.capabilityKey}`),
      );
    }

    const parameters = parseInfrastructureProposalParameters(input.parameters ?? {});
    if (parameters.isErr()) return err(parameters.error);
    const catalog = await this.catalog();
    if (catalog.isErr()) return err(catalog.error);
    const proposalInput = proposalFromCatalog(catalog.value, parameters.value);
    if (proposalInput.isErr()) return err(proposalInput.error);
    const proposal = InfrastructureServerProposal.create(proposalInput.value);
    if (proposal.isErr()) return err(proposal.error);
    return ok(this.toPreview(input, proposal.value));
  }

  canApply(capabilityKey: string): boolean {
    void capabilityKey;
    return false;
  }

  async applyCapability(
    context: ExecutionContext,
    input: ConnectorCapabilityApplyInput,
  ): Promise<Result<ConnectorCapabilityApplyResult>> {
    void context;
    return err(
      domainError.conflict(
        `Connector ${this.connectorKey} requires an accepted plan before server creation`,
        {
          capabilityKey: input.capabilityKey,
        },
      ),
    );
  }

  private async catalog(): Promise<Result<VultrInfrastructureCatalog>> {
    const [regions, plans, os] = await Promise.all([
      this.request<VultrListResponse<VultrRegion>>("/regions"),
      this.request<VultrListResponse<VultrPlan>>("/plans"),
      this.request<VultrListResponse<VultrOs>>("/os"),
    ]);
    if (regions.isErr()) return err(regions.error);
    if (plans.isErr()) return err(plans.error);
    if (os.isErr()) return err(os.error);
    return ok({
      regions: regions.value.regions ?? [],
      plans: plans.value.plans ?? [],
      os: os.value.os ?? [],
    });
  }

  private async request<T>(path: string): Promise<Result<T>> {
    const token = await this.credentialProvider.apiToken();
    if (token.isErr()) return err(token.error);
    const response = await this.fetcher(new URL(`${this.apiBaseUrl}${path}`), {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token.value}`,
      },
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return err(
        domainError.provider("Vultr infrastructure API returned a non-JSON response", {
          status: response.status,
        }),
      );
    }
    if (!response.ok) {
      return err(
        domainError.provider("Vultr infrastructure API request failed", {
          status: response.status,
        }),
      );
    }
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) {
      return err(
        domainError.provider("Vultr infrastructure API rejected the request", {
          providerError: error.trim(),
        }),
      );
    }
    return ok(payload as T);
  }

  private toPreview(
    input: ConnectorCapabilityPlanInput,
    proposal: InfrastructureServerProposal,
  ): ConnectorCapabilityPlanPreview {
    const infrastructureServerProposal = proposal.toJSON();
    return {
      planId: `vultr_infraplan_${stableHash({
        connectorKey: input.connectorKey,
        capabilityKey: input.capabilityKey,
        ownerRef: input.ownerRef,
        infrastructureServerProposal,
      })}`,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      riskLevel: proposal.riskLevel(),
      requiresExplicitAcceptance: proposal.requiresExplicitAcceptance(),
      summary: `${this.providerTitle}: ${proposal.summary()}`,
      effects: [
        {
          kind: "infrastructure.server.propose",
          title: proposal.title(),
          description: proposal.description(),
        },
        {
          kind: "infrastructure.cost.estimate",
          title: `Cost risk: ${proposal.riskLevel()}`,
          description:
            infrastructureServerProposal.estimatedMonthlyCostUsd === undefined
              ? "No monthly estimate was supplied by the provider adapter."
              : `Estimated monthly cost is $${infrastructureServerProposal.estimatedMonthlyCostUsd.toFixed(2)}.`,
        },
        {
          kind: "infrastructure.server.create.deferred",
          title: "Server creation requires accepted-plan support",
          description:
            "The Vultr provider adapter read the catalog and prepared a proposal; it did not create a paid server.",
        },
      ],
      cleanup: {
        supported: infrastructureServerProposal.cleanupSupported,
        description:
          "Cleanup becomes available only after a future accepted server creation records provider readback.",
      },
      providerPlan: {
        kind: "infrastructure-server-proposal",
        infrastructureServerProposal,
      },
    };
  }
}

interface InfrastructureProposalParameters {
  region: string;
  size: string;
  image: string;
  recommendedServerName: string;
  osUser: string;
  sshPort: number;
  sshPublicKeyRef?: string;
}

function parseInfrastructureProposalParameters(
  parameters: Record<string, unknown>,
): Result<InfrastructureProposalParameters> {
  const sshPort = optionalInteger(parameters.sshPort, 22);
  if (sshPort.isErr()) return err(sshPort.error);
  const sshPublicKeyRef =
    typeof parameters.sshPublicKeyRef === "string" && parameters.sshPublicKeyRef.trim()
      ? parameters.sshPublicKeyRef.trim()
      : undefined;
  return ok({
    region: optionalString(parameters.region, "ewr"),
    size: optionalString(parameters.size ?? parameters.plan, "vc2-1c-1gb"),
    image: optionalString(parameters.image ?? parameters.osId, "ubuntu-24.04"),
    recommendedServerName: optionalString(
      parameters.serverName ?? parameters.name,
      "appaloft-edge-1",
    ),
    osUser: optionalString(parameters.osUser, "root"),
    sshPort: sshPort.value,
    ...(sshPublicKeyRef ? { sshPublicKeyRef } : {}),
  });
}

function proposalFromCatalog(
  catalog: VultrInfrastructureCatalog,
  parameters: InfrastructureProposalParameters,
): Result<InfrastructureServerProposalSnapshot> {
  const region = catalog.regions.find((candidate) => candidate.id === parameters.region);
  if (!region) {
    return err(domainError.validation(`Vultr region ${parameters.region} is not available`));
  }
  const plan = catalog.plans.find((candidate) => candidate.id === parameters.size);
  if (!plan) {
    return err(domainError.validation(`Vultr plan ${parameters.size} is not available`));
  }
  if (plan.locations && plan.locations.length > 0 && !plan.locations.includes(region.id)) {
    return err(
      domainError.validation(`Vultr plan ${plan.id} is not available in region ${region.id}`),
    );
  }
  const os = selectOs(catalog.os, parameters.image);
  if (!os) {
    return err(domainError.validation(`Vultr OS image ${parameters.image} is not available`));
  }
  const estimatedMonthlyCostUsd = plan.monthly_cost;
  return ok({
    providerKey: "vultr",
    region: region.id,
    size: plan.id,
    image: String(os.id),
    recommendedServerName: parameters.recommendedServerName,
    osUser: parameters.osUser,
    sshPort: parameters.sshPort,
    ...(parameters.sshPublicKeyRef ? { sshPublicKeyRef: parameters.sshPublicKeyRef } : {}),
    ...(estimatedMonthlyCostUsd !== undefined ? { estimatedMonthlyCostUsd } : {}),
    costRiskLevel: costRiskLevel(estimatedMonthlyCostUsd),
    cleanupSupported: true,
    notes: [
      `Vultr region ${region.id}${region.city ? ` (${region.city})` : ""} was read from the provider catalog.`,
      `Vultr plan ${plan.id}${plan.vcpu_count ? ` with ${plan.vcpu_count} vCPU` : ""}${
        plan.ram ? ` and ${plan.ram} MB RAM` : ""
      } was read from the provider catalog.`,
      `Vultr OS ${os.id} (${os.name}) was read from the provider catalog.`,
      "This is a provider proposal only; no server is created until an accepted-plan command exists.",
    ],
    tags: ["appaloft", "connector", "vultr"],
  });
}

function selectOs(os: readonly VultrOs[], image: string): VultrOs | undefined {
  const normalized = normalizeSlug(image);
  return os.find(
    (candidate) =>
      String(candidate.id) === image ||
      normalizeSlug(candidate.name) === normalized ||
      normalizeSlug([candidate.family, candidate.name].filter(Boolean).join(" ")) === normalized,
  );
}

function optionalString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalInteger(value: unknown, fallback: number): Result<number> {
  if (value === undefined) return ok(fallback);
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return err(domainError.validation("Infrastructure numeric parameter must be an integer"));
  }
  return ok(value);
}

function costRiskLevel(cost: number | undefined): "low" | "medium" | "high" {
  if (cost === undefined || cost <= 25) return "low";
  if (cost <= 80) return "medium";
  return "high";
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
