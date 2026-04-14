import { type DeploymentId, type ResourceId } from "../shared/identifiers";
import { type Deployment, type DeploymentState } from "./deployment";

export interface DeploymentSelectionSpecVisitor<TResult> {
  visitDeploymentById(query: TResult, spec: DeploymentByIdSpec): TResult;
  visitLatestDeployment(query: TResult, spec: LatestDeploymentSpec): TResult;
}

export interface DeploymentMutationSpecVisitor<TResult> {
  visitUpsertDeployment(spec: UpsertDeploymentSpec): TResult;
}

export interface DeploymentSelectionSpec {
  accept<TResult>(query: TResult, visitor: DeploymentSelectionSpecVisitor<TResult>): TResult;
}

export interface DeploymentMutationSpec {
  accept<TResult>(visitor: DeploymentMutationSpecVisitor<TResult>): TResult;
}

export class DeploymentByIdSpec implements DeploymentSelectionSpec {
  private constructor(public readonly id: DeploymentId) {}

  static create(id: DeploymentId): DeploymentByIdSpec {
    return new DeploymentByIdSpec(id);
  }

  accept<TResult>(query: TResult, visitor: DeploymentSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitDeploymentById(query, this);
  }
}

export class LatestDeploymentSpec implements DeploymentSelectionSpec {
  private constructor(public readonly resourceId: ResourceId) {}

  static forResource(resourceId: ResourceId): LatestDeploymentSpec {
    return new LatestDeploymentSpec(resourceId);
  }

  accept<TResult>(query: TResult, visitor: DeploymentSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitLatestDeployment(query, this);
  }
}

export class UpsertDeploymentSpec implements DeploymentMutationSpec {
  private constructor(public readonly state: DeploymentState) {}

  static fromDeployment(deployment: Deployment): UpsertDeploymentSpec {
    return new UpsertDeploymentSpec(deployment.toState());
  }

  accept<TResult>(visitor: DeploymentMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertDeployment(this);
  }
}
