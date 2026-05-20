import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  DefaultRouteSurfacePort,
  DefaultTenantContextResolver,
  type RouteSurfaceEvaluateInput,
  type RouteSurfacePort,
  type TenantContextResolver,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  type EvaluateRouteSurfaceCommand,
  type EvaluateRouteSurfaceResponse,
} from "./evaluate-route-surface.command";

@injectable()
export class EvaluateRouteSurfaceUseCase {
  constructor(
    @inject(tokens.routeSurfacePort)
    private readonly routeSurfacePort?: RouteSurfacePort,
    @inject(tokens.tenantContextResolver)
    private readonly tenantContextResolver?: TenantContextResolver,
  ) {}

  async execute(
    context: ExecutionContext,
    command: EvaluateRouteSurfaceCommand,
  ): Promise<Result<EvaluateRouteSurfaceResponse>> {
    const result = await evaluateRouteSurfaceWithPort({
      context,
      input: command.input,
      routeSurfacePort: this.routeSurfacePort,
      tenantContextResolver: this.tenantContextResolver,
    });

    if (result.isErr()) {
      return err(result.error);
    }

    return ok({ result: result.value });
  }
}

export async function evaluateRouteSurfaceWithPort(input: {
  context: ExecutionContext;
  input: RouteSurfaceEvaluateInput;
  routeSurfacePort?: RouteSurfacePort | undefined;
  tenantContextResolver?: TenantContextResolver | undefined;
}): Promise<Result<Awaited<ReturnType<RouteSurfacePort["evaluateRouteSurface"]>>>> {
  const tenantContext = await (
    input.tenantContextResolver ?? new DefaultTenantContextResolver()
  ).resolveTenantContext(input.context);
  const effectiveContext = tenantContext
    ? { ...input.context, tenant: tenantContext }
    : input.context;
  const result = await (
    input.routeSurfacePort ?? new DefaultRouteSurfacePort()
  ).evaluateRouteSurface(effectiveContext, cleanRouteSurfaceInput(input.input, tenantContext));

  if (result.decision === "rejected") {
    return err(
      domainError.operationCheckDenied("Route surface rejected this operation", {
        operationKey: result.operationKey,
        checkKind: "route-surface",
        reason: result.reason,
        source: result.source,
        surfaceKind: result.surfaceKind,
      }),
    );
  }

  return ok(result);
}

function cleanRouteSurfaceInput(
  input: RouteSurfaceEvaluateInput,
  tenantContext: ExecutionContext["tenant"],
): RouteSurfaceEvaluateInput {
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
    surfaceKind: input.surfaceKind,
    ...(input.attributes ? { attributes: input.attributes } : {}),
  };
}

function cleanResourceRefs(
  input: RouteSurfaceEvaluateInput["resourceRefs"],
): RouteSurfaceEvaluateInput["resourceRefs"] {
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
