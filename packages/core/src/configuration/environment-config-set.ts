import { domainError } from "../shared/errors";
import { type EnvironmentId, EnvironmentSnapshotId } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import {
  ConfigScopeValue,
  type VariableExposureValue,
  type VariableKindValue,
} from "../shared/state-machine";
import { type GeneratedAt, type UpdatedAt } from "../shared/temporal";
import { type ConfigKey, type ConfigValueText } from "../shared/text-values";
import { ValueObject } from "../shared/value-object";

export interface EnvironmentConfigEntryState {
  key: ConfigKey;
  value: ConfigValueText;
  kind: VariableKindValue;
  exposure: VariableExposureValue;
  scope: ConfigScopeValue;
  isSecret: boolean;
  updatedAt: UpdatedAt;
}

export interface EnvironmentConfigSnapshotEntryState {
  key: ConfigKey;
  value: ConfigValueText;
  kind: VariableKindValue;
  exposure: VariableExposureValue;
  scope: ConfigScopeValue;
  isSecret: boolean;
}

export interface EnvironmentConfigSnapshotState {
  id: EnvironmentSnapshotId;
  environmentId: EnvironmentId;
  createdAt: GeneratedAt;
  precedence: readonly ConfigScopeValue[];
  variables: EnvironmentConfigSnapshotEntryState[];
}

export interface EnvironmentConfigDiffEntry {
  key: ConfigKey;
  exposure: VariableExposureValue;
  left?: EnvironmentConfigSnapshotEntry;
  right?: EnvironmentConfigSnapshotEntry;
  change: "added" | "removed" | "changed" | "unchanged";
}

const configScopePrecedenceOrder = [
  "defaults",
  "system",
  "organization",
  "project",
  "environment",
  "resource",
  "deployment",
] as const;

function precedenceIndex(scope: ConfigScopeValue): number {
  return configScopePrecedenceOrder.indexOf(scope.value);
}

function compareByPrecedence(left: EnvironmentConfigEntry, right: EnvironmentConfigEntry): number {
  return left.comparePrecedenceTo(right);
}

function normalizeSnapshotEntry(
  entry: EnvironmentConfigSnapshotEntryState | EnvironmentConfigSnapshotEntry,
): EnvironmentConfigSnapshotEntry {
  return entry instanceof EnvironmentConfigSnapshotEntry
    ? entry
    : EnvironmentConfigSnapshotEntry.rehydrate(entry);
}

export class EnvironmentConfigEntry extends ValueObject<EnvironmentConfigEntryState> {
  private constructor(state: EnvironmentConfigEntryState) {
    super(state);
  }

  static create(input: EnvironmentConfigEntryState): Result<EnvironmentConfigEntry> {
    if (input.exposure.value === "build-time" && !/^(PUBLIC_|VITE_)/.test(input.key.value)) {
      return err(
        domainError.validation(
          "Build-time variables must use the PUBLIC_ or VITE_ prefix to avoid accidental secret exposure",
        ),
      );
    }

    if (input.exposure.value === "build-time" && input.isSecret) {
      return err(domainError.validation("Build-time variables cannot be stored as secrets"));
    }

    return ok(new EnvironmentConfigEntry(input));
  }

  static rehydrate(state: EnvironmentConfigEntryState): EnvironmentConfigEntry {
    return new EnvironmentConfigEntry(state);
  }

  get key(): string {
    return this.state.key.value;
  }

  get value(): string {
    return this.state.value.value;
  }

  get kind(): string {
    return this.state.kind.value;
  }

  get exposure(): string {
    return this.state.exposure.value;
  }

  get scope(): string {
    return this.state.scope.value;
  }

  get isSecret(): boolean {
    return this.state.isSecret;
  }

  get updatedAt(): string {
    return this.state.updatedAt.value;
  }

  variableIdentity(): string {
    return `${this.state.key.value}:${this.state.exposure.value}`;
  }

  belongsToScope(scope: ConfigScopeValue): boolean {
    return this.state.scope.equals(scope);
  }

  matchesVariable(input: {
    key: ConfigKey;
    exposure: VariableExposureValue;
    scope?: ConfigScopeValue;
  }): boolean {
    return (
      this.state.key.equals(input.key) &&
      this.state.exposure.equals(input.exposure) &&
      (input.scope ? this.belongsToScope(input.scope) : true)
    );
  }

  comparePrecedenceTo(other: EnvironmentConfigEntry): number {
    return precedenceIndex(this.state.scope) - precedenceIndex(other.state.scope);
  }

  toSnapshotEntry(): EnvironmentConfigSnapshotEntry {
    return EnvironmentConfigSnapshotEntry.rehydrate({
      key: this.state.key,
      value: this.state.value,
      kind: this.state.kind,
      exposure: this.state.exposure,
      scope: this.state.scope,
      isSecret: this.state.isSecret,
    });
  }

  toState(): EnvironmentConfigEntryState {
    return { ...this.state };
  }
}

export class EnvironmentConfigSnapshotEntry extends ValueObject<EnvironmentConfigSnapshotEntryState> {
  private constructor(state: EnvironmentConfigSnapshotEntryState) {
    super(state);
  }

  static create(
    input: EnvironmentConfigSnapshotEntryState,
  ): Result<EnvironmentConfigSnapshotEntry> {
    return ok(new EnvironmentConfigSnapshotEntry(input));
  }

  static rehydrate(state: EnvironmentConfigSnapshotEntryState): EnvironmentConfigSnapshotEntry {
    return new EnvironmentConfigSnapshotEntry(state);
  }

  get key(): string {
    return this.state.key.value;
  }

  get value(): string {
    return this.state.value.value;
  }

  get kind(): string {
    return this.state.kind.value;
  }

  get exposure(): string {
    return this.state.exposure.value;
  }

  get scope(): string {
    return this.state.scope.value;
  }

  get isSecret(): boolean {
    return this.state.isSecret;
  }

  variableIdentity(): string {
    return `${this.state.key.value}:${this.state.exposure.value}`;
  }

  hasSameSnapshotValueAs(other: EnvironmentConfigSnapshotEntry): boolean {
    return (
      this.state.value.equals(other.state.value) &&
      this.state.scope.equals(other.state.scope) &&
      this.state.isSecret === other.state.isSecret
    );
  }

  toState(): EnvironmentConfigSnapshotEntryState {
    return { ...this.state };
  }
}

export class EnvironmentConfigSnapshot extends ValueObject<EnvironmentConfigSnapshotState> {
  private constructor(state: EnvironmentConfigSnapshotState) {
    super(state);
  }

  static create(input: EnvironmentConfigSnapshotState): Result<EnvironmentConfigSnapshot> {
    return ok(new EnvironmentConfigSnapshot(input));
  }

  static rehydrate(state: EnvironmentConfigSnapshotState): EnvironmentConfigSnapshot {
    return new EnvironmentConfigSnapshot({
      ...state,
      precedence: [...state.precedence],
      variables: [...state.variables],
    });
  }

  get id(): string {
    return this.state.id.value;
  }

  get snapshotId(): EnvironmentSnapshotId {
    return this.state.id;
  }

  get environmentId(): string {
    return this.state.environmentId.value;
  }

  get createdAt(): string {
    return this.state.createdAt.value;
  }

  get precedence(): string[] {
    return this.state.precedence.map((item) => item.value);
  }

  get variables(): EnvironmentConfigSnapshotEntry[] {
    return this.state.variables.map((entry) => EnvironmentConfigSnapshotEntry.rehydrate(entry));
  }

  toState(): EnvironmentConfigSnapshotState {
    return {
      ...this.state,
      precedence: [...this.state.precedence],
      variables: [...this.state.variables],
    };
  }
}

export class EnvironmentConfigSet {
  private constructor(private readonly entries: EnvironmentConfigEntry[]) {}

  static empty(): EnvironmentConfigSet {
    return new EnvironmentConfigSet([]);
  }

  static rehydrate(
    entries: EnvironmentConfigEntryState[] | EnvironmentConfigEntry[],
  ): EnvironmentConfigSet {
    return new EnvironmentConfigSet(
      entries.map((entry) =>
        entry instanceof EnvironmentConfigEntry ? entry : EnvironmentConfigEntry.rehydrate(entry),
      ),
    );
  }

  toState(): EnvironmentConfigEntryState[] {
    return this.entries.map((entry) => entry.toState());
  }

  get length(): number {
    return this.entries.length;
  }

  [Symbol.iterator](): Iterator<EnvironmentConfigEntry> {
    return this.entries[Symbol.iterator]();
  }

  map<TResult>(callback: (entry: EnvironmentConfigEntry, index: number) => TResult): TResult[] {
    return this.entries.map(callback);
  }

  some(callback: (entry: EnvironmentConfigEntry, index: number) => boolean): boolean {
    return this.entries.some(callback);
  }

  find(
    callback: (entry: EnvironmentConfigEntry, index: number) => boolean,
  ): EnvironmentConfigEntry | undefined {
    return this.entries.find(callback);
  }

  setEntry(input: {
    key: ConfigKey;
    value: ConfigValueText;
    kind: VariableKindValue;
    exposure: VariableExposureValue;
    scope?: ConfigScopeValue;
    isSecret?: boolean;
    updatedAt: UpdatedAt;
  }): Result<EnvironmentConfigEntry> {
    const scope = input.scope ?? ConfigScopeValue.rehydrate("environment");
    return EnvironmentConfigEntry.create({
      key: input.key,
      value: input.value,
      kind: input.kind,
      exposure: input.exposure,
      scope,
      isSecret: input.isSecret ?? false,
      updatedAt: input.updatedAt,
    }).map((nextEntry) => {
      const existingIndex = this.entries.findIndex(
        (variable) =>
          variable.variableIdentity() === nextEntry.variableIdentity() &&
          variable.belongsToScope(scope),
      );

      if (existingIndex >= 0) {
        this.entries.splice(existingIndex, 1, nextEntry);
      } else {
        this.entries.push(nextEntry);
      }

      return nextEntry;
    });
  }

  unsetEntry(input: {
    key: ConfigKey;
    exposure: VariableExposureValue;
    scope?: ConfigScopeValue;
  }): Result<void> {
    const scope = input.scope ?? ConfigScopeValue.rehydrate("environment");
    const existingIndex = this.entries.findIndex((variable) =>
      variable.matchesVariable({
        key: input.key,
        exposure: input.exposure,
        scope,
      }),
    );

    if (existingIndex < 0) {
      return err(domainError.notFound("environment_variable", `${input.key.value}:${scope.value}`));
    }

    this.entries.splice(existingIndex, 1);
    return ok(undefined);
  }

  materializeSnapshot(input: {
    environmentId: EnvironmentId;
    snapshotId: EnvironmentSnapshotId;
    createdAt: GeneratedAt;
    inherited?: EnvironmentConfigSnapshotEntryState[] | EnvironmentConfigSnapshotEntry[];
  }): EnvironmentConfigSnapshot {
    const merged = new Map<string, EnvironmentConfigSnapshotEntry>();

    for (const inherited of input.inherited ?? []) {
      const entry = normalizeSnapshotEntry(inherited);
      merged.set(entry.variableIdentity(), entry);
    }

    for (const variable of [...this.entries].sort(compareByPrecedence)) {
      merged.set(variable.variableIdentity(), variable.toSnapshotEntry());
    }

    return EnvironmentConfigSnapshot.rehydrate({
      id: input.snapshotId,
      environmentId: input.environmentId,
      createdAt: input.createdAt,
      precedence: [
        ConfigScopeValue.rehydrate("defaults"),
        ConfigScopeValue.rehydrate("system"),
        ConfigScopeValue.rehydrate("organization"),
        ConfigScopeValue.rehydrate("project"),
        ConfigScopeValue.rehydrate("environment"),
        ConfigScopeValue.rehydrate("resource"),
        ConfigScopeValue.rehydrate("deployment"),
      ],
      variables: [...merged.values()]
        .map((entry) => entry.toState())
        .sort(
          (left, right) =>
            left.key.value.localeCompare(right.key.value) ||
            left.exposure.value.localeCompare(right.exposure.value),
        ),
    });
  }

  diffAgainstSnapshot(
    currentEnvironmentId: EnvironmentId,
    currentCreatedAt: GeneratedAt,
    other: EnvironmentConfigSnapshot,
  ): EnvironmentConfigDiffEntry[] {
    const left = new Map(
      this.materializeSnapshot({
        environmentId: currentEnvironmentId,
        snapshotId: EnvironmentSnapshotId.rehydrate(`${currentEnvironmentId.value}-diff`),
        createdAt: currentCreatedAt,
      })
        .toState()
        .variables.map((variable) => [
          EnvironmentConfigSnapshotEntry.rehydrate(variable).variableIdentity(),
          EnvironmentConfigSnapshotEntry.rehydrate(variable),
        ]),
    );
    const right = new Map(
      other
        .toState()
        .variables.map((variable) => [
          EnvironmentConfigSnapshotEntry.rehydrate(variable).variableIdentity(),
          EnvironmentConfigSnapshotEntry.rehydrate(variable),
        ]),
    );

    const identities = new Set([...left.keys(), ...right.keys()]);
    const diff: EnvironmentConfigDiffEntry[] = [];

    for (const identity of identities) {
      const leftVariable = left.get(identity);
      const rightVariable = right.get(identity);

      if (!leftVariable && rightVariable) {
        diff.push({
          key: rightVariable.toState().key,
          exposure: rightVariable.toState().exposure,
          right: rightVariable,
          change: "added",
        });
        continue;
      }

      if (leftVariable && !rightVariable) {
        diff.push({
          key: leftVariable.toState().key,
          exposure: leftVariable.toState().exposure,
          left: leftVariable,
          change: "removed",
        });
        continue;
      }

      if (!leftVariable || !rightVariable) {
        continue;
      }

      const leftState = leftVariable.toState();
      diff.push({
        key: leftState.key,
        exposure: leftState.exposure,
        change: leftVariable.hasSameSnapshotValueAs(rightVariable) ? "unchanged" : "changed",
        left: leftVariable,
        right: rightVariable,
      });
    }

    return diff.sort(
      (leftEntry, rightEntry) =>
        leftEntry.key.value.localeCompare(rightEntry.key.value) ||
        leftEntry.exposure.value.localeCompare(rightEntry.exposure.value),
    );
  }
}

export type EnvironmentSnapshot = EnvironmentConfigSnapshot;
export type EnvironmentSnapshotVariable = EnvironmentConfigSnapshotEntry;
