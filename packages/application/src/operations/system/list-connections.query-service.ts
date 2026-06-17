import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { EmptyConnectorConnectionProjectionSource } from "../../extensibility/connection-projections";
import {
  type ConnectionSnapshot,
  type ConnectorConnectionProjectionSource,
  type ConnectorConnectionStore,
  type ConnectorConnectionStoreListInput,
} from "../../ports";
import { tokens } from "../../tokens";
import { ownerScopeForConnectionList } from "./connection-tenant-scope";
import { type ListConnectionsQueryInput } from "./list-connections.query";

@injectable()
export class ListConnectionsQueryService {
  constructor(
    @inject(tokens.connectorConnectionStore)
    private readonly connectionStore: ConnectorConnectionStore,
    @inject(tokens.connectorConnectionProjectionSource)
    private readonly projectionSource: ConnectorConnectionProjectionSource = new EmptyConnectorConnectionProjectionSource(),
  ) {}

  async execute(
    context: ExecutionContext,
    input: ListConnectionsQueryInput = {},
  ): Promise<{ items: ConnectionSnapshot[] }> {
    const owner = ownerScopeForConnectionList(context, input.owner);
    if (owner.isErr()) {
      return { items: [] };
    }
    const storeInput: ConnectorConnectionStoreListInput = {};
    if (owner.value) {
      storeInput.owner = owner.value;
    }
    if (input.connectorKey) {
      storeInput.connectorKey = input.connectorKey;
    }
    if (input.category) {
      storeInput.category = input.category;
    }
    const items = this.connectionStore.list(storeInput);
    const projected = await this.projectionSource.list(context, storeInput);
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const item of projected) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      }
    }
    return { items: [...byId.values()] };
  }
}
