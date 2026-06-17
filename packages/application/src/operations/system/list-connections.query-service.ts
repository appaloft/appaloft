import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type ConnectionSnapshot,
  type ConnectorConnectionStore,
  type ConnectorConnectionStoreListInput,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListConnectionsQueryInput } from "./list-connections.query";

@injectable()
export class ListConnectionsQueryService {
  constructor(
    @inject(tokens.connectorConnectionStore)
    private readonly connectionStore: ConnectorConnectionStore,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ListConnectionsQueryInput = {},
  ): Promise<{ items: ConnectionSnapshot[] }> {
    void context;
    const storeInput: ConnectorConnectionStoreListInput = {};
    if (input.owner) {
      storeInput.owner = input.owner;
    }
    if (input.connectorKey) {
      storeInput.connectorKey = input.connectorKey;
    }
    if (input.category) {
      storeInput.category = input.category;
    }
    return { items: this.connectionStore.list(storeInput) };
  }
}
