import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type ConnectorDescriptor,
  type ConnectorRegistry,
  type ConnectorRegistryListInput,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListConnectorsQueryInput } from "./list-connectors.query";

@injectable()
export class ListConnectorsQueryService {
  constructor(
    @inject(tokens.connectorRegistry)
    private readonly connectorRegistry: ConnectorRegistry,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ListConnectorsQueryInput = {},
  ): Promise<{ items: ConnectorDescriptor[] }> {
    void context;
    const registryInput: ConnectorRegistryListInput = {};
    if (input.category) {
      registryInput.category = input.category;
    }
    if (input.includeUnavailable !== undefined) {
      registryInput.includeUnavailable = input.includeUnavailable;
    }
    return {
      items: this.connectorRegistry.list(registryInput),
    };
  }
}
