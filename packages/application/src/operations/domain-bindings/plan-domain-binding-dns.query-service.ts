import {
  type DnsRecordKind,
  type DnsRecordRequirementSnapshot,
  domainError,
  err,
  ok,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type ConnectorCapabilityPlanPreview,
  type DomainBindingReadModel,
  type DomainBindingSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type PlanConnectorCapabilityQueryService } from "../system/plan-connector-capability.query-service";
import { type PlanDomainBindingDnsQueryPayload } from "./plan-domain-binding-dns.query";

@injectable()
export class PlanDomainBindingDnsQueryService {
  constructor(
    @inject(tokens.domainBindingReadModel)
    private readonly domainBindingReadModel: DomainBindingReadModel,
    @inject(tokens.connectorCapabilityPlanQueryService)
    private readonly connectorPlanQueryService: PlanConnectorCapabilityQueryService,
  ) {}

  async execute(
    context: ExecutionContext,
    input: PlanDomainBindingDnsQueryPayload,
  ): Promise<Result<ConnectorCapabilityPlanPreview>> {
    const repositoryContext = toRepositoryContext(context);
    const { connectorPlanQueryService, domainBindingReadModel } = this;

    return safeTry(async function* () {
      const bindings = await domainBindingReadModel.list(repositoryContext);
      const binding = bindings.find((candidate) => candidate.id === input.domainBindingId);
      if (!binding) {
        return err(domainError.notFound("DomainBinding", input.domainBindingId));
      }

      const records = domainBindingDnsRecords(binding, input);
      if (records.isErr()) return err(records.error);

      return connectorPlanQueryService.execute(context, {
        connectorKey: input.connectorKey,
        capabilityKey: input.capabilityKey,
        ownerRef: {
          scope: "resource",
          id: binding.resourceId,
        },
        parameters: {
          ...(input.zoneName ? { zoneName: input.zoneName } : {}),
          records: records.value,
        },
      });
    });
  }
}

export function domainBindingDnsRecords(
  binding: DomainBindingSummary,
  input: Pick<PlanDomainBindingDnsQueryPayload, "proxied" | "recordType" | "ttl">,
): Result<DnsRecordRequirementSnapshot[]> {
  const expectedTargets = binding.dnsObservation?.expectedTargets.filter((target) => target.trim());
  if (!expectedTargets?.length) {
    return err(
      domainError.validation("Domain binding has no DNS expected target to plan", {
        domainBindingId: binding.id,
        phase: "domain-binding-dns-plan",
      }),
    );
  }

  return ok(
    expectedTargets.map((target) => ({
      name: binding.domainName,
      type: input.recordType ?? dnsRecordTypeForTarget(target),
      value: target,
      purpose: "domain-routing",
      ...(input.ttl !== undefined ? { ttl: input.ttl } : {}),
      ...(input.proxied !== undefined ? { proxied: input.proxied } : {}),
    })),
  );
}

function dnsRecordTypeForTarget(target: string): DnsRecordKind {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(target)) {
    return "A";
  }
  if (target.includes(":")) {
    return "AAAA";
  }
  return "CNAME";
}
