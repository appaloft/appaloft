import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, type ExecutionTenantContext } from "../../execution-context";
import {
  DefaultTenantContextResolver,
  DefaultUsageIntentPort,
  type TenantContextResolver,
  type UsageIntentInput,
  type UsageIntentPort,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  type RecordUsageIntentCommand,
  type RecordUsageIntentResponse,
} from "./record-usage-intent.command";

@injectable()
export class RecordUsageIntentUseCase {
  constructor(
    @inject(tokens.usageIntentPort)
    private readonly usageIntentPort?: UsageIntentPort,
    @inject(tokens.tenantContextResolver)
    private readonly tenantContextResolver?: TenantContextResolver,
  ) {}

  async execute(
    context: ExecutionContext,
    command: RecordUsageIntentCommand,
  ): Promise<Result<RecordUsageIntentResponse>> {
    const tenantContext = await (
      this.tenantContextResolver ?? new DefaultTenantContextResolver()
    ).resolveTenantContext(context);
    const effectiveContext = { ...context, tenant: tenantContext };
    const result = await (this.usageIntentPort ?? new DefaultUsageIntentPort()).recordUsageIntent(
      effectiveContext,
      cleanUsageIntentInput(command.input, tenantContext),
    );

    return ok({ result });
  }
}

function cleanUsageIntentInput(
  input: UsageIntentInput,
  tenantContext: ExecutionTenantContext,
): UsageIntentInput {
  const resourceRefs = cleanResourceRefs(input.resourceRefs);

  return {
    idempotencyKey: input.idempotencyKey,
    capabilityKey: input.capabilityKey,
    ...(input.actor ? { actor: input.actor } : {}),
    ...((input.tenantId ?? tenantContext.tenantId)
      ? { tenantId: input.tenantId ?? tenantContext.tenantId }
      : {}),
    ...((input.accountId ?? tenantContext.accountId)
      ? { accountId: input.accountId ?? tenantContext.accountId }
      : {}),
    ...((input.organizationId ?? tenantContext.organizationId)
      ? { organizationId: input.organizationId ?? tenantContext.organizationId }
      : {}),
    ...(resourceRefs ? { resourceRefs } : {}),
    ...(input.quantity ? { quantity: input.quantity } : {}),
    source: input.source,
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    ...(input.attributes ? { attributes: input.attributes } : {}),
  };
}

function cleanResourceRefs(
  input: UsageIntentInput["resourceRefs"],
): UsageIntentInput["resourceRefs"] {
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
