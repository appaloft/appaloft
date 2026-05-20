import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  DefaultDeploymentOverlayPort,
  DefaultTenantContextResolver,
  type DeploymentOverlayEvaluateInput,
  type DeploymentOverlayPort,
  type TenantContextResolver,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  type EvaluateDeploymentOverlayCommand,
  type EvaluateDeploymentOverlayResponse,
} from "./evaluate-deployment-overlay.command";

@injectable()
export class EvaluateDeploymentOverlayUseCase {
  constructor(
    @inject(tokens.deploymentOverlayPort)
    private readonly deploymentOverlayPort?: DeploymentOverlayPort,
    @inject(tokens.tenantContextResolver)
    private readonly tenantContextResolver?: TenantContextResolver,
  ) {}

  async execute(
    context: ExecutionContext,
    command: EvaluateDeploymentOverlayCommand,
  ): Promise<Result<EvaluateDeploymentOverlayResponse>> {
    const result = await evaluateDeploymentOverlayWithPort({
      context,
      input: command.input,
      deploymentOverlayPort: this.deploymentOverlayPort,
      tenantContextResolver: this.tenantContextResolver,
    });

    if (result.isErr()) {
      return err(result.error);
    }

    return ok({ result: result.value });
  }
}

export async function evaluateDeploymentOverlayWithPort(input: {
  context: ExecutionContext;
  input: DeploymentOverlayEvaluateInput;
  deploymentOverlayPort?: DeploymentOverlayPort | undefined;
  tenantContextResolver?: TenantContextResolver | undefined;
}): Promise<Result<Awaited<ReturnType<DeploymentOverlayPort["evaluateDeploymentOverlay"]>>>> {
  const tenantContext = await (
    input.tenantContextResolver ?? new DefaultTenantContextResolver()
  ).resolveTenantContext(input.context);
  const effectiveContext = tenantContext
    ? { ...input.context, tenant: tenantContext }
    : input.context;
  const result = await (
    input.deploymentOverlayPort ?? new DefaultDeploymentOverlayPort()
  ).evaluateDeploymentOverlay(
    effectiveContext,
    cleanDeploymentOverlayInput(input.input, tenantContext),
  );

  if (result.decision === "rejected") {
    return err(
      domainError.operationCheckDenied("Deployment overlay rejected this operation", {
        operationKey: result.operationKey,
        checkKind: "deployment-overlay",
        reason: result.reason,
        source: result.source,
      }),
    );
  }

  return ok(result);
}

function cleanDeploymentOverlayInput(
  input: DeploymentOverlayEvaluateInput,
  tenantContext: ExecutionContext["tenant"],
): DeploymentOverlayEvaluateInput {
  const resourceRefs = cleanResourceRefs(input.resourceRefs);

  return {
    operationKey: input.operationKey,
    ...(input.actor ? { actor: input.actor } : {}),
    ...((input.tenantId ?? tenantContext?.tenantId)
      ? { tenantId: input.tenantId ?? tenantContext?.tenantId }
      : {}),
    ...((input.accountId ?? tenantContext?.accountId)
      ? { accountId: input.accountId ?? tenantContext?.accountId }
      : {}),
    ...((input.organizationId ?? tenantContext?.organizationId)
      ? { organizationId: input.organizationId ?? tenantContext?.organizationId }
      : {}),
    ...(resourceRefs ? { resourceRefs } : {}),
    ...(input.capabilityKey ? { capabilityKey: input.capabilityKey } : {}),
    source: input.source,
    ...(input.attributes ? { attributes: input.attributes } : {}),
  };
}

function cleanResourceRefs(
  input: DeploymentOverlayEvaluateInput["resourceRefs"],
): DeploymentOverlayEvaluateInput["resourceRefs"] {
  if (!input) {
    return undefined;
  }

  const refs: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value?.trim()) {
      refs[key] = value;
    }
  }
  return Object.keys(refs).length > 0 ? refs : undefined;
}
