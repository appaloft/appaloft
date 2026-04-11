import { AggregateRoot } from "../shared/entity";
import { type ProviderConnectionId, type ResourceInstanceId } from "../shared/identifiers";
import { ok, type Result } from "../shared/result";
import {
  type OwnerScopeValue,
  type ResourceInstanceKindValue,
  ResourceInstanceStatusValue,
} from "../shared/state-machine";
import { type CreatedAt, type OccurredAt } from "../shared/temporal";
import {
  type EndpointText,
  type OwnerId,
  type ProviderKey,
  type ResourceInstanceName,
} from "../shared/text-values";

export interface ResourceInstanceState {
  id: ResourceInstanceId;
  kind: ResourceInstanceKindValue;
  ownerScope: OwnerScopeValue;
  ownerId: OwnerId;
  name: ResourceInstanceName;
  providerKey: ProviderKey;
  connectionId?: ProviderConnectionId;
  endpoint?: EndpointText;
  status: ResourceInstanceStatusValue;
  createdAt: CreatedAt;
}

export interface ResourceInstanceVisitor<TContext, TResult> {
  visitResourceInstance(resourceInstance: ResourceInstance, context: TContext): TResult;
}

export class ResourceInstance extends AggregateRoot<ResourceInstanceState> {
  private constructor(state: ResourceInstanceState) {
    super(state);
  }

  static create(
    input: Omit<ResourceInstanceState, "status"> & { status?: ResourceInstanceStatusValue },
  ): Result<ResourceInstance> {
    const instance = new ResourceInstance({
      ...input,
      status: input.status ?? ResourceInstanceStatusValue.provisioning(),
    });
    instance.recordDomainEvent("resource.instance_created", input.createdAt, {
      kind: input.kind.value,
      providerKey: input.providerKey.value,
    });
    return ok(instance);
  }

  static rehydrate(state: ResourceInstanceState): ResourceInstance {
    return new ResourceInstance(state);
  }

  accept<TContext, TResult>(
    visitor: ResourceInstanceVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitResourceInstance(this, context);
  }

  markReady(at: OccurredAt, endpoint?: EndpointText): void {
    this.state.status = this.state.status.markReady();
    if (endpoint) {
      this.state.endpoint = endpoint;
    }
    this.recordDomainEvent("resource.instance_ready", at, {
      endpoint: this.state.endpoint?.value,
    });
  }

  markDeleted(at: OccurredAt): void {
    this.state.status = this.state.status.markDeleted();
    this.recordDomainEvent("resource.instance_deleted", at, {});
  }

  toState(): ResourceInstanceState {
    return { ...this.state };
  }
}
