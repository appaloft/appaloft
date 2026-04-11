import { AggregateRoot } from "../shared/entity";
import { type ProviderConnectionId } from "../shared/identifiers";
import { ok, type Result } from "../shared/result";
import { type OwnerScopeValue, ProviderConnectionStatusValue } from "../shared/state-machine";
import { type CreatedAt, type OccurredAt } from "../shared/temporal";
import {
  type ConfigReference,
  type ConnectionName,
  type OwnerId,
  type ProviderKey,
} from "../shared/text-values";

export interface ProviderConnectionState {
  id: ProviderConnectionId;
  ownerScope: OwnerScopeValue;
  ownerId: OwnerId;
  providerKey: ProviderKey;
  name: ConnectionName;
  status: ProviderConnectionStatusValue;
  configReference?: ConfigReference;
  createdAt: CreatedAt;
}

export class ProviderConnection extends AggregateRoot<ProviderConnectionState> {
  private constructor(state: ProviderConnectionState) {
    super(state);
  }

  static create(
    input: Omit<ProviderConnectionState, "status"> & { status?: ProviderConnectionStatusValue },
  ): Result<ProviderConnection> {
    const connection = new ProviderConnection({
      ...input,
      status: input.status ?? ProviderConnectionStatusValue.pending(),
    });
    connection.recordDomainEvent("provider_connection.created", input.createdAt, {
      providerKey: input.providerKey.value,
    });
    return ok(connection);
  }

  static rehydrate(state: ProviderConnectionState): ProviderConnection {
    return new ProviderConnection(state);
  }

  activate(at: OccurredAt): void {
    this.state.status = this.state.status.activate();
    this.recordDomainEvent("provider_connection.activated", at, {
      providerKey: this.state.providerKey.value,
    });
  }

  toState(): ProviderConnectionState {
    return { ...this.state };
  }
}
