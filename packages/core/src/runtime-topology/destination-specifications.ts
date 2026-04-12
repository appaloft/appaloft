import { type DeploymentTargetId, type DestinationId } from "../shared/identifiers";
import { type DestinationName } from "../shared/text-values";
import { type Destination, type DestinationState } from "./destination";

export interface DestinationSelectionSpecVisitor<TResult> {
  visitDestinationById(query: TResult, spec: DestinationByIdSpec): TResult;
  visitDestinationByServerAndName(query: TResult, spec: DestinationByServerAndNameSpec): TResult;
}

export interface DestinationMutationSpecVisitor<TResult> {
  visitUpsertDestination(spec: UpsertDestinationSpec): TResult;
}

export interface DestinationSelectionSpec {
  accept<TResult>(query: TResult, visitor: DestinationSelectionSpecVisitor<TResult>): TResult;
}

export interface DestinationMutationSpec {
  accept<TResult>(visitor: DestinationMutationSpecVisitor<TResult>): TResult;
}

export class DestinationByIdSpec implements DestinationSelectionSpec {
  private constructor(public readonly id: DestinationId) {}

  static create(id: DestinationId): DestinationByIdSpec {
    return new DestinationByIdSpec(id);
  }

  accept<TResult>(query: TResult, visitor: DestinationSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitDestinationById(query, this);
  }
}

export class DestinationByServerAndNameSpec implements DestinationSelectionSpec {
  private constructor(
    public readonly serverId: DeploymentTargetId,
    public readonly name: DestinationName,
  ) {}

  static create(
    serverId: DeploymentTargetId,
    name: DestinationName,
  ): DestinationByServerAndNameSpec {
    return new DestinationByServerAndNameSpec(serverId, name);
  }

  accept<TResult>(query: TResult, visitor: DestinationSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitDestinationByServerAndName(query, this);
  }
}

export class UpsertDestinationSpec implements DestinationMutationSpec {
  private constructor(public readonly state: DestinationState) {}

  static fromDestination(destination: Destination): UpsertDestinationSpec {
    return new UpsertDestinationSpec(destination.toState());
  }

  accept<TResult>(visitor: DestinationMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertDestination(this);
  }
}
