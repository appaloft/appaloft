import { Connection, domainError, err, OccurredAt, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import {
  type Clock,
  type ConnectionCallbackResult,
  type ConnectorConnectionStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CompleteConnectionCallbackCommandInput } from "./complete-connection-callback.command";

@injectable()
export class CompleteConnectionCallbackUseCase {
  constructor(
    @inject(tokens.connectorConnectionStore)
    private readonly connectionStore: ConnectorConnectionStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    input: CompleteConnectionCallbackCommandInput,
  ): Promise<Result<ConnectionCallbackResult>> {
    const snapshot = this.connectionStore.findById(input.connectionId);
    if (!snapshot) {
      return err(domainError.notFound("Connection", input.connectionId));
    }
    const connection = Connection.rehydrate(snapshot);
    const occurredAt = OccurredAt.rehydrate(this.clock.now());
    if (input.status === "success") {
      const connected = connection.connect(occurredAt, {
        ...(input.externalAccountId ? { externalAccountId: input.externalAccountId } : {}),
        ...(input.externalInstallationId
          ? { externalInstallationId: input.externalInstallationId }
          : {}),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      });
      if (connected.isErr()) {
        return err(connected.error);
      }
    } else {
      connection.fail(occurredAt, {
        code: input.errorCode ?? `connection.callback.${input.status}`,
        severity: input.status === "cancel" ? "warning" : "error",
        message:
          input.errorMessage ??
          (input.status === "cancel"
            ? "Connection authorization was cancelled."
            : "Connection authorization failed."),
      });
    }
    const connectionSnapshot = connection.toJSON();
    this.connectionStore.save(connectionSnapshot);
    return ok({ connection: connectionSnapshot });
  }
}
