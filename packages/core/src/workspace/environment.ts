import {
  type EnvironmentConfigDiffEntry,
  EnvironmentConfigSet,
  type EnvironmentConfigSnapshotEntryState,
  type EnvironmentSnapshot,
} from "../configuration/environment-config-set";
import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { type EnvironmentId, EnvironmentSnapshotId, type ProjectId } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import {
  ConfigScopeValue,
  type EnvironmentKindValue,
  EnvironmentLifecycleStatusValue,
  type VariableExposureValue,
  type VariableKindValue,
} from "../shared/state-machine";
import {
  type ArchivedAt,
  type CreatedAt,
  GeneratedAt,
  type LockedAt,
  type UnlockedAt,
  UpdatedAt,
} from "../shared/temporal";
import {
  type ArchiveReason,
  type ConfigKey,
  type ConfigValueText,
  type EnvironmentName,
  type LockReason,
} from "../shared/text-values";

export type EnvironmentVariableState = ReturnType<EnvironmentConfigSet["toState"]>[number];
export type EnvironmentDiffEntry = EnvironmentConfigDiffEntry;

export interface EnvironmentState {
  id: EnvironmentId;
  projectId: ProjectId;
  name: EnvironmentName;
  kind: EnvironmentKindValue;
  parentEnvironmentId?: EnvironmentId;
  lifecycleStatus: EnvironmentLifecycleStatusValue;
  lockedAt?: LockedAt;
  lockReason?: LockReason;
  archivedAt?: ArchivedAt;
  archiveReason?: ArchiveReason;
  createdAt: CreatedAt;
  variables: EnvironmentConfigSet;
}

export interface EnvironmentVisitor<TContext, TResult> {
  visitEnvironment(environment: Environment, context: TContext): TResult;
}

type EnvironmentRehydrateState = Omit<
  EnvironmentState,
  "archiveReason" | "archivedAt" | "lifecycleStatus" | "lockReason" | "lockedAt" | "variables"
> &
  Partial<
    Pick<
      EnvironmentState,
      "archiveReason" | "archivedAt" | "lifecycleStatus" | "lockReason" | "lockedAt"
    >
  > & {
    variables: EnvironmentConfigSet;
  };

function environmentArchivedError(input: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  commandName: string;
  environmentName: EnvironmentName;
  archivedAt?: ArchivedAt;
}) {
  return domainError.environmentArchived("Archived environments cannot accept new mutations", {
    phase: "environment-lifecycle-guard",
    environmentId: input.environmentId.value,
    projectId: input.projectId.value,
    environmentName: input.environmentName.value,
    lifecycleStatus: "archived",
    commandName: input.commandName,
    ...(input.archivedAt ? { archivedAt: input.archivedAt.value } : {}),
  });
}

function environmentLockedError(input: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  commandName: string;
  environmentName: EnvironmentName;
  lockedAt?: LockedAt;
}) {
  return domainError.environmentLocked("Locked environments cannot accept new mutations", {
    phase: "environment-lifecycle-guard",
    environmentId: input.environmentId.value,
    projectId: input.projectId.value,
    environmentName: input.environmentName.value,
    lifecycleStatus: "locked",
    commandName: input.commandName,
    ...(input.lockedAt ? { lockedAt: input.lockedAt.value } : {}),
  });
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
        lifecycleStatus: EnvironmentLifecycleStatusValue.active(),
        ...(input.parentEnvironmentId ? { parentEnvironmentId: input.parentEnvironmentId } : {}),
      }),
    );
  }

  static rehydrate(state: EnvironmentRehydrateState): Environment {
    return new Environment({
      ...state,
      variables: EnvironmentConfigSet.rehydrate(state.variables.toState()),
      lifecycleStatus: state.lifecycleStatus ?? EnvironmentLifecycleStatusValue.active(),
      ...(state.lockedAt ? { lockedAt: state.lockedAt } : {}),
      ...(state.lockReason ? { lockReason: state.lockReason } : {}),
      ...(state.archivedAt ? { archivedAt: state.archivedAt } : {}),
      ...(state.archiveReason ? { archiveReason: state.archiveReason } : {}),
    });
  }

  accept<TContext, TResult>(
    visitor: EnvironmentVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitEnvironment(this, context);
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
    const lifecycleGuard = this.ensureCanAcceptMutation("environments.set-variable");
    if (lifecycleGuard.isErr()) {
      return err(lifecycleGuard.error);
    }

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
    const lifecycleGuard = this.ensureCanAcceptMutation("environments.unset-variable");
    if (lifecycleGuard.isErr()) {
      return err(lifecycleGuard.error);
    }

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

  rename(input: { name: EnvironmentName; renamedAt: UpdatedAt }): Result<{ changed: boolean }> {
    const lifecycleGuard = this.ensureCanAcceptMutation("environments.rename");
    if (lifecycleGuard.isErr()) {
      return err(lifecycleGuard.error);
    }

    if (this.state.name.equals(input.name)) {
      return ok({ changed: false });
    }

    const previousName = this.state.name;
    this.state.name = input.name;
    this.recordDomainEvent("environment-renamed", input.renamedAt, {
      environmentId: this.state.id.value,
      projectId: this.state.projectId.value,
      previousName: previousName.value,
      nextName: input.name.value,
      environmentKind: this.state.kind.value,
      renamedAt: input.renamedAt.value,
    });

    return ok({ changed: true });
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
  }): Result<Environment> {
    const lifecycleGuard = this.ensureCanAcceptMutation("environments.promote");
    if (lifecycleGuard.isErr()) {
      return err(lifecycleGuard.error);
    }

    return ok(
      Environment.rehydrate({
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
      }),
    );
  }

  cloneTo(input: {
    targetEnvironmentId: EnvironmentId;
    targetName: EnvironmentName;
    targetKind?: EnvironmentKindValue;
    createdAt: CreatedAt;
  }): Result<Environment> {
    const lifecycleGuard = this.ensureCanAcceptMutation("environments.clone");
    if (lifecycleGuard.isErr()) {
      return err(lifecycleGuard.error);
    }

    return ok(
      Environment.rehydrate({
        id: input.targetEnvironmentId,
        projectId: this.state.projectId,
        name: input.targetName,
        kind: input.targetKind ?? this.state.kind,
        parentEnvironmentId: this.state.id,
        createdAt: input.createdAt,
        variables: EnvironmentConfigSet.rehydrate(
          this.materializeSnapshot({
            snapshotId: EnvironmentSnapshotId.rehydrate(`${input.targetEnvironmentId.value}-clone`),
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
      }),
    );
  }

  archive(input: { archivedAt: ArchivedAt; reason?: ArchiveReason }): Result<{ changed: boolean }> {
    if (this.state.lifecycleStatus.isArchived()) {
      return ok({ changed: false });
    }

    const nextStatus = this.state.lifecycleStatus.archive();
    if (nextStatus.isErr()) {
      return err(nextStatus.error);
    }

    this.state.lifecycleStatus = nextStatus.value;
    this.state.archivedAt = input.archivedAt;
    delete this.state.lockedAt;
    delete this.state.lockReason;
    if (input.reason) {
      this.state.archiveReason = input.reason;
    } else {
      delete this.state.archiveReason;
    }
    this.recordDomainEvent("environment-archived", input.archivedAt, {
      environmentId: this.state.id.value,
      projectId: this.state.projectId.value,
      environmentName: this.state.name.value,
      environmentKind: this.state.kind.value,
      archivedAt: input.archivedAt.value,
      ...(input.reason ? { reason: input.reason.value } : {}),
    });

    return ok({ changed: true });
  }

  lock(input: { lockedAt: LockedAt; reason?: LockReason }): Result<{ changed: boolean }> {
    if (this.state.lifecycleStatus.isArchived()) {
      return err(
        environmentArchivedError({
          environmentId: this.state.id,
          projectId: this.state.projectId,
          commandName: "environments.lock",
          environmentName: this.state.name,
          ...(this.state.archivedAt ? { archivedAt: this.state.archivedAt } : {}),
        }),
      );
    }

    if (this.state.lifecycleStatus.isLocked()) {
      return ok({ changed: false });
    }

    const nextStatus = this.state.lifecycleStatus.lock();
    if (nextStatus.isErr()) {
      return err(nextStatus.error);
    }

    this.state.lifecycleStatus = nextStatus.value;
    this.state.lockedAt = input.lockedAt;
    if (input.reason) {
      this.state.lockReason = input.reason;
    } else {
      delete this.state.lockReason;
    }
    this.recordDomainEvent("environment-locked", input.lockedAt, {
      environmentId: this.state.id.value,
      projectId: this.state.projectId.value,
      environmentName: this.state.name.value,
      environmentKind: this.state.kind.value,
      lockedAt: input.lockedAt.value,
      ...(input.reason ? { reason: input.reason.value } : {}),
    });

    return ok({ changed: true });
  }

  unlock(input: { unlockedAt: UnlockedAt }): Result<{ changed: boolean }> {
    if (this.state.lifecycleStatus.isArchived()) {
      return err(
        environmentArchivedError({
          environmentId: this.state.id,
          projectId: this.state.projectId,
          commandName: "environments.unlock",
          environmentName: this.state.name,
          ...(this.state.archivedAt ? { archivedAt: this.state.archivedAt } : {}),
        }),
      );
    }

    if (this.state.lifecycleStatus.isActive()) {
      return ok({ changed: false });
    }

    const nextStatus = this.state.lifecycleStatus.unlock();
    if (nextStatus.isErr()) {
      return err(nextStatus.error);
    }

    const previousLockedAt = this.state.lockedAt;
    const previousLockReason = this.state.lockReason;
    this.state.lifecycleStatus = nextStatus.value;
    delete this.state.lockedAt;
    delete this.state.lockReason;
    this.recordDomainEvent("environment-unlocked", input.unlockedAt, {
      environmentId: this.state.id.value,
      projectId: this.state.projectId.value,
      environmentName: this.state.name.value,
      environmentKind: this.state.kind.value,
      unlockedAt: input.unlockedAt.value,
      ...(previousLockedAt ? { lockedAt: previousLockedAt.value } : {}),
      ...(previousLockReason ? { reason: previousLockReason.value } : {}),
    });

    return ok({ changed: true });
  }

  ensureCanCreateResource(): Result<void> {
    return this.ensureCanAcceptMutation("resources.create");
  }

  ensureCanClone(): Result<void> {
    return this.ensureCanAcceptMutation("environments.clone");
  }

  ensureCanRename(): Result<void> {
    return this.ensureCanAcceptMutation("environments.rename");
  }

  ensureCanCreateDeployment(): Result<void> {
    return this.ensureCanAcceptMutation("deployments.create");
  }

  private ensureCanAcceptMutation(commandName: string): Result<void> {
    if (this.state.lifecycleStatus.isActive()) {
      return ok(undefined);
    }

    if (this.state.lifecycleStatus.isLocked()) {
      return err(
        environmentLockedError({
          environmentId: this.state.id,
          projectId: this.state.projectId,
          commandName,
          environmentName: this.state.name,
          ...(this.state.lockedAt ? { lockedAt: this.state.lockedAt } : {}),
        }),
      );
    }

    return err(
      environmentArchivedError({
        environmentId: this.state.id,
        projectId: this.state.projectId,
        commandName,
        environmentName: this.state.name,
        ...(this.state.archivedAt ? { archivedAt: this.state.archivedAt } : {}),
      }),
    );
  }

  toState(): EnvironmentState {
    return {
      ...this.state,
      variables: EnvironmentConfigSet.rehydrate(this.state.variables.toState()),
    };
  }
}

export { Environment as EnvironmentProfile };
