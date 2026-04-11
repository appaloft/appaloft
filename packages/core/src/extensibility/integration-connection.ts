import { AggregateRoot } from "../shared/entity";
import { type IntegrationConnectionId } from "../shared/identifiers";
import { ok, type Result } from "../shared/result";
import { IntegrationConnectionStatusValue, type OwnerScopeValue } from "../shared/state-machine";
import { type CreatedAt, type OccurredAt } from "../shared/temporal";
import {
  type ConnectionName,
  type ExternalAccountId,
  type IntegrationKey,
  type OwnerId,
} from "../shared/text-values";

export interface IntegrationConnectionState {
  id: IntegrationConnectionId;
  ownerScope: OwnerScopeValue;
  ownerId: OwnerId;
  integrationKey: IntegrationKey;
  name: ConnectionName;
  status: IntegrationConnectionStatusValue;
  externalAccountId?: ExternalAccountId;
  createdAt: CreatedAt;
}

export interface IntegrationConnectionVisitor<TContext, TResult> {
  visitIntegrationConnection(
    integrationConnection: IntegrationConnection,
    context: TContext,
  ): TResult;
}

export class IntegrationConnection extends AggregateRoot<IntegrationConnectionState> {
  private constructor(state: IntegrationConnectionState) {
    super(state);
  }

  static create(
    input: Omit<IntegrationConnectionState, "status"> & {
      status?: IntegrationConnectionStatusValue;
    },
  ): Result<IntegrationConnection> {
    const connection = new IntegrationConnection({
      ...input,
      status: input.status ?? IntegrationConnectionStatusValue.pending(),
    });
    connection.recordDomainEvent("integration_connection.created", input.createdAt, {
      integrationKey: input.integrationKey.value,
    });
    return ok(connection);
  }

  static rehydrate(state: IntegrationConnectionState): IntegrationConnection {
    return new IntegrationConnection(state);
  }

  accept<TContext, TResult>(
    visitor: IntegrationConnectionVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitIntegrationConnection(this, context);
  }

  connect(at: OccurredAt, externalAccountId?: ExternalAccountId): void {
    this.state.status = this.state.status.connect();
    if (externalAccountId) {
      this.state.externalAccountId = externalAccountId;
    }
    this.recordDomainEvent("integration_connection.connected", at, {
      integrationKey: this.state.integrationKey.value,
      externalAccountId: this.state.externalAccountId?.value,
    });
  }

  revoke(at: OccurredAt): void {
    this.state.status = this.state.status.revoke();
    this.recordDomainEvent("integration_connection.revoked", at, {
      integrationKey: this.state.integrationKey.value,
    });
  }

  toState(): IntegrationConnectionState {
    return { ...this.state };
  }
}
