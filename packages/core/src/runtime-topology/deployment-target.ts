import { AggregateRoot } from "../shared/entity";
import { type DeploymentTargetId } from "../shared/identifiers";
import { type PortNumber } from "../shared/numeric-values";
import { ok, type Result } from "../shared/result";
import { TargetKindValue } from "../shared/state-machine";
import { type CreatedAt } from "../shared/temporal";
import {
  type DeploymentTargetName,
  type HostAddress,
  type ProviderKey,
} from "../shared/text-values";

export interface DeploymentTargetState {
  id: DeploymentTargetId;
  name: DeploymentTargetName;
  host: HostAddress;
  port: PortNumber;
  providerKey: ProviderKey;
  targetKind: TargetKindValue;
  createdAt: CreatedAt;
}

export class DeploymentTarget extends AggregateRoot<DeploymentTargetState> {
  private constructor(state: DeploymentTargetState) {
    super(state);
  }

  static register(input: {
    id: DeploymentTargetId;
    name: DeploymentTargetName;
    host: HostAddress;
    port: PortNumber;
    providerKey: ProviderKey;
    targetKind?: TargetKindValue;
    createdAt: CreatedAt;
  }): Result<DeploymentTarget> {
    const deploymentTarget = new DeploymentTarget({
      id: input.id,
      name: input.name,
      host: input.host,
      port: input.port,
      providerKey: input.providerKey,
      targetKind: input.targetKind ?? TargetKindValue.rehydrate("single-server"),
      createdAt: input.createdAt,
    });

    deploymentTarget.recordDomainEvent("deployment_target.registered", input.createdAt, {
      providerKey: input.providerKey.value,
    });

    return ok(deploymentTarget);
  }

  static rehydrate(state: DeploymentTargetState): DeploymentTarget {
    return new DeploymentTarget(state);
  }

  toState(): DeploymentTargetState {
    return { ...this.state };
  }
}

export type ServerState = DeploymentTargetState;
export { DeploymentTarget as Server };
