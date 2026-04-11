import {
  type EnvironmentConfigDiffEntry,
  EnvironmentConfigSet,
  type EnvironmentConfigSnapshotEntryState,
  type EnvironmentSnapshot,
} from "../configuration/environment-config-set";
import { AggregateRoot } from "../shared/entity";
import { type EnvironmentId, EnvironmentSnapshotId, type ProjectId } from "../shared/identifiers";
import { ok, type Result } from "../shared/result";
import {
  ConfigScopeValue,
  type EnvironmentKindValue,
  type VariableExposureValue,
  type VariableKindValue,
} from "../shared/state-machine";
import { type CreatedAt, GeneratedAt, UpdatedAt } from "../shared/temporal";
import { type ConfigKey, type ConfigValueText, type EnvironmentName } from "../shared/text-values";

export type EnvironmentVariableState = ReturnType<EnvironmentConfigSet["toState"]>[number];
export type EnvironmentDiffEntry = EnvironmentConfigDiffEntry;

export interface EnvironmentState {
  id: EnvironmentId;
  projectId: ProjectId;
  name: EnvironmentName;
  kind: EnvironmentKindValue;
  parentEnvironmentId?: EnvironmentId;
  createdAt: CreatedAt;
  variables: EnvironmentConfigSet;
}

export class Environment extends AggregateRoot<EnvironmentState> {
  private constructor(state: EnvironmentState) {
    super(state);
  }

  static create(input: {
    id: EnvironmentId;
    projectId: ProjectId;
    name: EnvironmentName;
    kind: EnvironmentKindValue;
    parentEnvironmentId?: EnvironmentId;
    createdAt: CreatedAt;
  }): Result<Environment> {
    return ok(
      new Environment({
        id: input.id,
        projectId: input.projectId,
        name: input.name,
        kind: input.kind,
        createdAt: input.createdAt,
        variables: EnvironmentConfigSet.empty(),
        ...(input.parentEnvironmentId ? { parentEnvironmentId: input.parentEnvironmentId } : {}),
      }),
    );
  }

  static rehydrate(state: EnvironmentState): Environment {
    return new Environment({
      ...state,
      variables: EnvironmentConfigSet.rehydrate(state.variables.toState()),
    });
  }

  setVariable(input: {
    key: ConfigKey;
    value: ConfigValueText;
    kind: VariableKindValue;
    exposure: VariableExposureValue;
    scope?: ConfigScopeValue;
    isSecret?: boolean;
    updatedAt: UpdatedAt;
  }): Result<void> {
    const configSet = EnvironmentConfigSet.rehydrate(this.state.variables.toState());
    return configSet.setEntry(input).map((nextEntry) => {
      this.state.variables = configSet;
      this.recordDomainEvent("environment.variable_set", input.updatedAt, {
        key: nextEntry.toState().key.value,
        scope: nextEntry.toState().scope.value,
        exposure: nextEntry.toState().exposure.value,
      });
      return undefined;
    });
  }

  unsetVariable(input: {
    key: ConfigKey;
    exposure: VariableExposureValue;
    scope?: ConfigScopeValue;
    updatedAt: UpdatedAt;
  }): Result<void> {
    const configSet = EnvironmentConfigSet.rehydrate(this.state.variables.toState());
    return configSet.unsetEntry(input).map(() => {
      this.state.variables = configSet;
      this.recordDomainEvent("environment.variable_unset", input.updatedAt, {
        key: input.key.value,
        scope: (input.scope ?? ConfigScopeValue.rehydrate("environment")).value,
        exposure: input.exposure.value,
      });
      return undefined;
    });
  }

  materializeSnapshot(input: {
    snapshotId: EnvironmentSnapshotId;
    createdAt: GeneratedAt;
    inherited?: EnvironmentConfigSnapshotEntryState[];
  }): EnvironmentSnapshot {
    return this.state.variables.materializeSnapshot({
      environmentId: this.state.id,
      snapshotId: input.snapshotId,
      createdAt: input.createdAt,
      ...(input.inherited ? { inherited: input.inherited } : {}),
    });
  }

  diffAgainst(other: EnvironmentSnapshot): EnvironmentDiffEntry[] {
    return this.state.variables.diffAgainstSnapshot(
      this.state.id,
      GeneratedAt.rehydrate(this.state.createdAt.value),
      other,
    );
  }

  promoteTo(input: {
    targetEnvironmentId: EnvironmentId;
    targetName: EnvironmentName;
    targetKind: EnvironmentKindValue;
    createdAt: CreatedAt;
  }): Environment {
    return Environment.rehydrate({
      id: input.targetEnvironmentId,
      projectId: this.state.projectId,
      name: input.targetName,
      kind: input.targetKind,
      parentEnvironmentId: this.state.id,
      createdAt: input.createdAt,
      variables: EnvironmentConfigSet.rehydrate(
        this.materializeSnapshot({
          snapshotId: EnvironmentSnapshotId.rehydrate(
            `${input.targetEnvironmentId.value}-promotion`,
          ),
          createdAt: GeneratedAt.rehydrate(input.createdAt.value),
        })
          .toState()
          .variables.map((variable: EnvironmentConfigSnapshotEntryState) => ({
            key: variable.key,
            value: variable.value,
            kind: variable.kind,
            exposure: variable.exposure,
            scope: ConfigScopeValue.rehydrate("environment"),
            isSecret: variable.isSecret,
            updatedAt: UpdatedAt.rehydrate(input.createdAt.value),
          })),
      ),
    });
  }

  toState(): EnvironmentState {
    return {
      ...this.state,
      variables: EnvironmentConfigSet.rehydrate(this.state.variables.toState()),
    };
  }
}

export { Environment as EnvironmentProfile };
