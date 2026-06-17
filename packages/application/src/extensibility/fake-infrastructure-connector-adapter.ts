import {
  domainError,
  err,
  InfrastructureServerProposal,
  type InfrastructureServerProposalSnapshot,
  ok,
  type Result,
} from "@appaloft/core";

import { type ExecutionContext } from "../execution-context";
import {
  type ConnectorCapabilityApplyInput,
  type ConnectorCapabilityApplyResult,
  type ConnectorCapabilityPlanInput,
  type ConnectorCapabilityPlanPreview,
  type ConnectorProviderAdapter,
} from "../ports";

export interface FakeInfrastructureConnectorProviderAdapterOptions {
  connectorKey: string;
  providerKey: string;
  providerTitle: string;
}

export class FakeInfrastructureConnectorProviderAdapter implements ConnectorProviderAdapter {
  readonly connectorKey: string;
  private readonly providerKey: string;
  private readonly providerTitle: string;

  constructor(options: FakeInfrastructureConnectorProviderAdapterOptions) {
    this.connectorKey = options.connectorKey;
    this.providerKey = options.providerKey;
    this.providerTitle = options.providerTitle;
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

    const parameters = parseInfrastructureProposalParameters(
      this.providerKey,
      input.parameters ?? {},
    );
    if (parameters.isErr()) return err(parameters.error);
    const proposal = InfrastructureServerProposal.create(parameters.value);
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

  private toPreview(
    input: ConnectorCapabilityPlanInput,
    proposal: InfrastructureServerProposal,
  ): ConnectorCapabilityPlanPreview {
    const infrastructureServerProposal = proposal.toJSON();
    const planId = `infraplan_${stableHash({
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      ownerRef: input.ownerRef,
      infrastructureServerProposal,
    })}`;

    return {
      planId,
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
      ],
      cleanup: {
        supported: infrastructureServerProposal.cleanupSupported,
        description: infrastructureServerProposal.cleanupSupported
          ? "Cleanup requires the accepted server creation readback."
          : "Cleanup is not available for this proposal.",
      },
      providerPlan: {
        kind: "infrastructure-server-proposal",
        infrastructureServerProposal,
      },
    };
  }
}

function parseInfrastructureProposalParameters(
  providerKey: string,
  parameters: Record<string, unknown>,
): Result<InfrastructureServerProposalSnapshot> {
  const region = optionalString(parameters.region, "ewr");
  const size = optionalString(parameters.size, "vc2-1c-1gb");
  const image = optionalString(parameters.image, "ubuntu-24.04");
  const recommendedServerName = optionalString(
    parameters.serverName ?? parameters.name,
    "appaloft-edge-1",
  );
  const osUser = optionalString(parameters.osUser, "root");
  const sshPort = optionalInteger(parameters.sshPort, 22);
  if (sshPort.isErr()) return err(sshPort.error);
  const estimatedMonthlyCostUsd = optionalCost(parameters.estimatedMonthlyCostUsd, size);
  if (estimatedMonthlyCostUsd.isErr()) return err(estimatedMonthlyCostUsd.error);
  const sshPublicKeyRef =
    typeof parameters.sshPublicKeyRef === "string" && parameters.sshPublicKeyRef.trim()
      ? parameters.sshPublicKeyRef.trim()
      : undefined;

  return ok({
    providerKey,
    region,
    size,
    image,
    recommendedServerName,
    osUser,
    sshPort: sshPort.value,
    ...(sshPublicKeyRef ? { sshPublicKeyRef } : {}),
    ...(estimatedMonthlyCostUsd.value !== undefined
      ? { estimatedMonthlyCostUsd: estimatedMonthlyCostUsd.value }
      : {}),
    costRiskLevel: costRiskLevel(estimatedMonthlyCostUsd.value),
    cleanupSupported: true,
    notes: [
      "This is a provider proposal only; no server is created until an accepted-plan command exists.",
      "The proposal must be reviewed by a human or operator before any paid resource mutation.",
    ],
    tags: ["appaloft", "connector", providerKey],
  });
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

function optionalCost(value: unknown, size: string): Result<number | undefined> {
  if (value === undefined) {
    return ok(defaultMonthlyCost(size));
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return err(domainError.validation("Infrastructure monthly cost must be non-negative"));
  }
  return ok(value);
}

function defaultMonthlyCost(size: string): number | undefined {
  const costs: Record<string, number> = {
    "vc2-1c-1gb": 6,
    "vc2-1c-2gb": 12,
    "vc2-2c-4gb": 24,
    "vc2-4c-8gb": 48,
  };
  return costs[size];
}

function costRiskLevel(cost: number | undefined): "low" | "medium" | "high" {
  if (cost === undefined || cost <= 25) return "low";
  if (cost <= 80) return "medium";
  return "high";
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
