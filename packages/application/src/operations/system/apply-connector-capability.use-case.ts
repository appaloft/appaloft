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
  type ConnectorCapabilityApplyResult,
  type ConnectorProviderAdapterRegistry,
  type ConnectorRegistry,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ApplyConnectorCapabilityCommandInput } from "./apply-connector-capability.command";

@injectable()
export class ApplyConnectorCapabilityUseCase {
  constructor(
    @inject(tokens.connectorRegistry)
    private readonly connectorRegistry: ConnectorRegistry,
    @inject(tokens.connectorProviderAdapterRegistry)
    private readonly adapterRegistry: ConnectorProviderAdapterRegistry,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ApplyConnectorCapabilityCommandInput,
  ): Promise<Result<ConnectorCapabilityApplyResult>> {
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

    if (!connector.availability().isActionable()) {
      return err(
        domainError.conflict(`Connector ${input.connectorKey} is not currently available`, {
          connectorKey: input.connectorKey,
        }),
      );
    }

    const adapter = this.adapterRegistry.findForConnector(input.connectorKey);
    if (!adapter?.canApply(input.capabilityKey)) {
      return err(
        domainError.conflict(`Connector ${input.connectorKey} has no apply adapter`, {
          connectorKey: input.connectorKey,
        }),
      );
    }

    return adapter.applyCapability(context, {
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      ...(input.ownerRef ? { ownerRef: input.ownerRef } : {}),
      ...(input.acceptedPlanId ? { acceptedPlanId: input.acceptedPlanId } : {}),
      ...(input.parameters ? { parameters: input.parameters } : {}),
    });
  }
}
