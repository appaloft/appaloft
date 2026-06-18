import { Connection, domainError, err, OccurredAt, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext } from "../../execution-context";
import {
  type Clock,
  type ConnectionRevokeResult,
  type ConnectorConnectionStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { connectionBelongsToContext } from "./connection-tenant-scope";

@injectable()
export class RevokeConnectionUseCase {
  constructor(
    @inject(tokens.connectorConnectionStore)
    private readonly connectionStore: ConnectorConnectionStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(input: { connectionId: string }): Promise<Result<ConnectionRevokeResult>>;
  async execute(
    context: ExecutionContext,
    input: { connectionId: string },
  ): Promise<Result<ConnectionRevokeResult>>;
  async execute(
    contextOrInput: ExecutionContext | { connectionId: string },
    maybeInput?: { connectionId: string },
  ): Promise<Result<ConnectionRevokeResult>> {
    const context = maybeInput ? (contextOrInput as ExecutionContext) : undefined;
    const input = maybeInput ?? (contextOrInput as { connectionId: string });
    const snapshot = await this.connectionStore.findById(input.connectionId);
    if (!snapshot || !connectionBelongsToContext(context, snapshot)) {
      return err(domainError.notFound("Connection", input.connectionId));
    }
    const connection = Connection.rehydrate(snapshot);
    connection.revoke(OccurredAt.rehydrate(this.clock.now()));
    const connectionSnapshot = connection.toJSON();
    await this.connectionStore.save(connectionSnapshot);
    return ok({ connection: connectionSnapshot });
  }
}
