import {
  ConnectionCapabilityKey,
  ConnectorDefinition,
  domainError,
  err,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type ConnectorCapabilityPlanPreview,
  type ConnectorProviderAdapterRegistry,
  type ConnectorRegistry,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ConnectorCapabilityPlanQueryInput } from "./plan-connector-capability.query";

@injectable()
export class PlanConnectorCapabilityQueryService {
  constructor(
    @inject(tokens.connectorRegistry)
    private readonly connectorRegistry: ConnectorRegistry,
    @inject(tokens.connectorProviderAdapterRegistry)
    private readonly adapterRegistry: ConnectorProviderAdapterRegistry,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConnectorCapabilityPlanQueryInput,
  ): Promise<Result<ConnectorCapabilityPlanPreview>> {
    const connectorSnapshot = this.connectorRegistry.findByKey(input.connectorKey);
    if (!connectorSnapshot) {
      return err(domainError.notFound("Connector", input.connectorKey));
    }

    const connector = ConnectorDefinition.rehydrate(connectorSnapshot);
    const capabilityKey = ConnectionCapabilityKey.rehydrate(input.capabilityKey);
    if (!connector.supportsCapability(capabilityKey)) {
      return err(
        domainError.validation(
          `Connector ${input.connectorKey} does not implement ${input.capabilityKey}`,
        ),
      );
    }

    const safePlanOnlyCapability = input.capabilityKey === "dns.records.plan";
    if (!connector.availability().isActionable() && !safePlanOnlyCapability) {
      return err(
        domainError.conflict(`Connector ${input.connectorKey} is not currently available`, {
          connectorKey: input.connectorKey,
        }),
      );
    }

    const adapter = this.adapterRegistry.findForConnector(input.connectorKey);
    if (!adapter?.canPlan(input.capabilityKey)) {
      return err(
        domainError.conflict(`Connector ${input.connectorKey} has no planning adapter`, {
          connectorKey: input.connectorKey,
        }),
      );
    }

    return adapter.planCapability(context, {
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      ...(input.ownerRef ? { ownerRef: input.ownerRef } : {}),
      ...(input.parameters ? { parameters: input.parameters } : {}),
    });
  }
}
