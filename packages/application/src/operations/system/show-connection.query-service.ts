import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { EmptyConnectorConnectionProjectionSource } from "../../extensibility/connection-projections";
import {
  type ConnectionSnapshot,
  type ConnectorConnectionProjectionSource,
  type ConnectorConnectionStore,
} from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ShowConnectionQueryService {
  constructor(
    @inject(tokens.connectorConnectionStore)
    private readonly connectionStore: ConnectorConnectionStore,
    @inject(tokens.connectorConnectionProjectionSource)
    private readonly projectionSource: ConnectorConnectionProjectionSource = new EmptyConnectorConnectionProjectionSource(),
  ) {}

  async execute(
    context: ExecutionContext,
    input: { connectionId: string },
  ): Promise<Result<ConnectionSnapshot>> {
    const connection = this.connectionStore.findById(input.connectionId);
    if (connection) {
      return ok(connection);
    }

    const projected = await this.projectionSource.findById(context, input.connectionId);
    if (!projected) {
      return err(domainError.notFound("Connection", input.connectionId));
    }
    return ok(projected);
  }
}
