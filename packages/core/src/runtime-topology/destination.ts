import { AggregateRoot } from "../shared/entity";
import { type DeploymentTargetId, type DestinationId } from "../shared/identifiers";
import { ok, type Result } from "../shared/result";
import { DestinationKindValue } from "../shared/state-machine";
import { type CreatedAt } from "../shared/temporal";
import { type DestinationName } from "../shared/text-values";

export interface DestinationState {
  id: DestinationId;
  serverId: DeploymentTargetId;
  name: DestinationName;
  kind: DestinationKindValue;
  createdAt: CreatedAt;
}

export interface DestinationVisitor<TContext, TResult> {
  visitDestination(destination: Destination, context: TContext): TResult;
}

export class Destination extends AggregateRoot<DestinationState> {
  private constructor(state: DestinationState) {
    super(state);
  }

  static register(input: {
    id: DestinationId;
    serverId: DeploymentTargetId;
    name: DestinationName;
    kind?: DestinationKindValue;
    createdAt: CreatedAt;
  }): Result<Destination> {
    const destination = new Destination({
      id: input.id,
      serverId: input.serverId,
      name: input.name,
      kind: input.kind ?? DestinationKindValue.rehydrate("generic"),
      createdAt: input.createdAt,
    });

    destination.recordDomainEvent("destination.registered", input.createdAt, {
      serverId: input.serverId.value,
      kind: destination.state.kind.value,
    });

    return ok(destination);
  }

  static rehydrate(state: DestinationState): Destination {
    return new Destination(state);
  }

  accept<TContext, TResult>(
    visitor: DestinationVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitDestination(this, context);
  }

  toState(): DestinationState {
    return { ...this.state };
  }
}
