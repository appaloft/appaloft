import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import {
  checkOperationGuards,
  createOperationCheckRequest,
  scopeOperation,
} from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  AllowAllOperationScopePort,
  type OperationCapabilityPort,
  type OperationCapabilityQuery,
  type OperationCapabilityResult,
  type OperationGuardPort,
  type OperationScopePort,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  type QueryCapabilitiesQuery,
  type QueryCapabilitiesResponse,
} from "./query-capabilities.query";

const defaultOperationGuardPort = new AllowAllOperationGuardPort();
const defaultOperationScopePort = new AllowAllOperationScopePort();

@injectable()
export class DefaultOperationCapabilityPort implements OperationCapabilityPort {
  constructor(
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
    @inject(tokens.operationScopePort)
    private readonly operationScopePort?: OperationScopePort,
  ) {}

  async checkCapabilities(
    context: ExecutionContext,
    input: { queries: readonly OperationCapabilityQuery[] },
  ): Promise<readonly OperationCapabilityResult[]> {
    const capabilities: OperationCapabilityResult[] = [];

    for (const capabilityQuery of input.queries) {
      capabilities.push(await this.checkCapability(context, capabilityQuery));
    }

    return capabilities;
  }

  private async checkCapability(
    context: ExecutionContext,
    capabilityQuery: OperationCapabilityQuery,
  ): Promise<OperationCapabilityResult> {
    const entry = findOperationCatalogEntryByKey(capabilityQuery.operationKey);
    if (!entry) {
      return {
        operationKey: capabilityQuery.operationKey,
        allowed: false,
        mode: "denied",
        hint: "hidden",
        reason: "operation-unknown",
        details: {
          operationKey: capabilityQuery.operationKey,
        },
      };
    }

    const request = createOperationCheckRequest({
      context: {
        ...context,
        ...(capabilityQuery.actor ? { actor: capabilityQuery.actor } : {}),
      },
      entry,
      ...(capabilityQuery.organizationId ? { organizationId: capabilityQuery.organizationId } : {}),
      ...(capabilityQuery.resourceRefs
        ? { resourceRefs: cleanResourceRefs(capabilityQuery.resourceRefs) }
        : {}),
    });
    const checked = await checkOperationGuards({
      context,
      entry,
      operationGuardPort: this.operationGuardPort ?? defaultOperationGuardPort,
      ...(capabilityQuery.organizationId ? { organizationId: capabilityQuery.organizationId } : {}),
      ...(capabilityQuery.resourceRefs
        ? { resourceRefs: cleanResourceRefs(capabilityQuery.resourceRefs) }
        : {}),
    });

    if (checked.isErr()) {
      return {
        operationKey: entry.key,
        allowed: false,
        mode: "denied",
        hint: "disabled",
        reason: String(checked.error.details?.reason ?? checked.error.code),
        details: checked.error.details,
      };
    }

    if (entry.kind === "query") {
      const scoped = await scopeOperation({
        context,
        entry,
        operationScopePort: this.operationScopePort ?? defaultOperationScopePort,
        ...(request.organizationId ? { organizationId: request.organizationId } : {}),
        ...(request.resourceRefs ? { resourceRefs: request.resourceRefs } : {}),
      });

      if (scoped.isErr()) {
        return {
          operationKey: entry.key,
          allowed: false,
          mode: "denied",
          hint: "disabled",
          reason: String(scoped.error.details?.reason ?? scoped.error.code),
          details: scoped.error.details,
        };
      }

      const decision = scoped.value;
      return {
        operationKey: entry.key,
        allowed: true,
        mode: decision.visibility,
        hint: decision.visibility === "constrained" ? "partial" : "enabled",
        reason: decision.reason,
        ...(decision.details ? { details: decision.details } : {}),
      };
    }

    return {
      operationKey: entry.key,
      allowed: true,
      mode: "unrestricted",
      hint: "enabled",
      reason: "operation-capability-allowed",
    };
  }
}

@injectable()
export class QueryCapabilitiesQueryService {
  constructor(
    @inject(tokens.operationCapabilityPort)
    private readonly operationCapabilityPort: OperationCapabilityPort,
  ) {}

  async execute(
    context: ExecutionContext,
    query: QueryCapabilitiesQuery,
  ): Promise<Result<QueryCapabilitiesResponse>> {
    const capabilities = await this.operationCapabilityPort.checkCapabilities(context, {
      queries: query.input.queries.map((capabilityQuery) => ({
        operationKey: capabilityQuery.operationKey,
        ...(capabilityQuery.organizationId
          ? { organizationId: capabilityQuery.organizationId }
          : {}),
        ...(capabilityQuery.resourceRefs
          ? { resourceRefs: cleanResourceRefs(capabilityQuery.resourceRefs) }
          : {}),
      })),
    });

    return ok({ capabilities: [...capabilities] });
  }
}

function cleanResourceRefs(input: Record<string, string | undefined>) {
  const refs: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value?.trim()) {
      refs[key] = value;
    }
  }
  return refs;
}
