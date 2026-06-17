import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type ConnectionSnapshot, type ConnectorConnectionStore } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ShowConnectionQueryService {
  constructor(
    @inject(tokens.connectorConnectionStore)
    private readonly connectionStore: ConnectorConnectionStore,
  ) {}

  async execute(
    context: ExecutionContext,
    input: { connectionId: string },
  ): Promise<Result<ConnectionSnapshot>> {
    void context;
    const connection = this.connectionStore.findById(input.connectionId);
    if (!connection) {
      return err(domainError.notFound("Connection", input.connectionId));
    }
    return ok(connection);
  }
}
