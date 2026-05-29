import { domainError, err, ok, type Result, safeTry } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type Clock, type IdGenerator } from "../../ports";
import { tokens } from "../../tokens";
import { maskDependencyConnectionUrl } from "./dependency-connection-masking";
import {
  type CreateDependencyResourceProvisioningPlanInput,
  type DependencyResourceProvisioningPlan,
  type DependencyResourceProvisioningPlanResponse,
} from "./dependency-resource-provisioning.schema";
import { type DependencyResourceProvisioningPlanStore } from "./dependency-resource-provisioning-plan.store";

function defaultManagedProviderKey(kind: string): string {
  return `appaloft-managed-${kind}`;
}

function response(
  plan: DependencyResourceProvisioningPlan,
  generatedAt: string,
): DependencyResourceProvisioningPlanResponse {
  return {
    schemaVersion: "dependency-resource-provisioning.plan/v1",
    plan,
    generatedAt,
  };
}

@injectable()
export class CreateDependencyResourceProvisioningPlanUseCase {
  constructor(
    @inject(tokens.dependencyResourceProvisioningPlanStore)
    private readonly planStore: DependencyResourceProvisioningPlanStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    _context: ExecutionContext,
    input: CreateDependencyResourceProvisioningPlanInput,
  ): Promise<Result<DependencyResourceProvisioningPlanResponse>> {
    const { clock, idGenerator, planStore } = this;

    return safeTry(async function* () {
      const requestedAt = clock.now();
      const id = idGenerator.next("drp");
      const plan = yield* buildPlan(id, input, requestedAt);

      await planStore.save({ plan, request: input });

      return ok(response(plan, clock.now()));
    });
  }
}

function buildPlan(
  id: string,
  input: CreateDependencyResourceProvisioningPlanInput,
  requestedAt: string,
): Result<DependencyResourceProvisioningPlan> {
  if (input.mode === "create") {
    const create = input.create;
    const providerKey = create.providerKey ?? defaultManagedProviderKey(create.kind);

    return ok({
      id,
      mode: "create",
      status: "planned",
      kind: create.kind,
      projectId: create.projectId,
      environmentId: create.environmentId,
      name: create.name,
      providerKey,
      ...(create.serverId ? { serverId: create.serverId } : {}),
      capabilities: create.capabilities ?? [],
      requiresAcceptance: true,
      requestedAt,
      summary: [
        `Create managed ${create.kind} dependency resource`,
        ...capabilitySummaryLines(create.capabilities ?? []),
        `Provider target ${providerKey}`,
        "No resource or provider mutation is performed until the plan is accepted",
      ],
    });
  }

  const reuse = input.reuse;
  const endpoint = maskDependencyConnectionUrl({
    kind: reuse.kind,
    connectionUrl: reuse.connectionUrl,
  });
  if (endpoint.isErr()) {
    return err(endpoint.error);
  }

  return ok({
    id,
    mode: "reuse",
    status: "planned",
    kind: reuse.kind,
    projectId: reuse.projectId,
    environmentId: reuse.environmentId,
    name: reuse.name,
    providerKey: `external-${reuse.kind}`,
    endpoint: endpoint.value.maskedConnection,
    capabilities: reuse.capabilities ?? [],
    requiresAcceptance: true,
    requestedAt,
    summary: [
      `Reuse external ${reuse.kind} dependency resource`,
      ...capabilitySummaryLines(reuse.capabilities ?? []),
      "Connection material is stored only when the plan is accepted",
      "No provider resource is created for reuse mode",
    ],
  });
}

export function missingDependencyResourceProvisioningPlan(planId: string) {
  return domainError.notFound("dependency_resource_provisioning_plan", planId);
}

function capabilitySummaryLines(
  capabilities: readonly { type: string; name: string; required: boolean }[],
): string[] {
  return capabilities.length > 0
    ? [
        `Requires dependency capabilities ${capabilities
          .map((capability) => `${capability.type}:${capability.name}`)
          .join(", ")}`,
        "Capability readback is required before binding readiness is trusted",
      ]
    : [];
}

export { response as dependencyResourceProvisioningPlanResponse };
