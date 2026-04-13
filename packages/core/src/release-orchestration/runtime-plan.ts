import { domainError } from "../shared/errors";
import {
  type DeploymentId,
  type DeploymentTargetId,
  type EnvironmentSnapshotId,
  type RollbackPlanId,
  type RuntimePlanId,
} from "../shared/identifiers";
import { type ExitCode, type PortNumber } from "../shared/numeric-values";
import { err, ok, type Result } from "../shared/result";
import {
  type BuildStrategyKindValue,
  type buildStrategyKinds,
  DeploymentLogSourceValue,
  type DeploymentPhaseValue,
  type EdgeProxyKindValue,
  type ExecutionStatusValue,
  type ExecutionStrategyKindValue,
  type edgeProxyKinds,
  type executionStrategyKinds,
  type LogLevelValue,
  type PackagingModeValue,
  type packagingModes,
  type SourceKindValue,
  type sourceKinds,
  type TargetKindValue,
  type TlsModeValue,
  type targetKinds,
  type tlsModes,
} from "../shared/state-machine";
import { type GeneratedAt, type OccurredAt } from "../shared/temporal";
import {
  type CommandText,
  type DetectSummary,
  type DisplayNameText,
  type ErrorCodeText,
  type FilePathText,
  type HealthCheckPathText,
  type ImageReference,
  type MessageText,
  type PlanStepText,
  type ProviderKey,
  type PublicDomainName,
  type RoutePathPrefix,
  type SourceLocator,
} from "../shared/text-values";
import { ValueObject } from "../shared/value-object";

export interface SourceDescriptorState {
  kind: SourceKindValue;
  locator: SourceLocator;
  displayName: DisplayNameText;
  metadata?: Record<string, string>;
}

export interface DeploymentTargetDescriptorState {
  kind: TargetKindValue;
  providerKey: ProviderKey;
  serverIds: DeploymentTargetId[];
  metadata?: Record<string, string>;
}

export interface RuntimeExecutionPlanState {
  kind: ExecutionStrategyKindValue;
  workingDirectory?: FilePathText;
  installCommand?: CommandText;
  buildCommand?: CommandText;
  startCommand?: CommandText;
  healthCheckPath?: HealthCheckPathText;
  port?: PortNumber;
  image?: ImageReference;
  dockerfilePath?: FilePathText;
  composeFile?: FilePathText;
  accessRoutes?: AccessRoute[];
  metadata?: Record<string, string>;
}

export interface AccessRouteState {
  proxyKind: EdgeProxyKindValue;
  domains: PublicDomainName[];
  pathPrefix: RoutePathPrefix;
  tlsMode: TlsModeValue;
  targetPort?: PortNumber;
}

export interface RuntimePlanState {
  id: RuntimePlanId;
  source: SourceDescriptor;
  buildStrategy: BuildStrategyKindValue;
  packagingMode: PackagingModeValue;
  execution: RuntimeExecutionPlan;
  target: DeploymentTargetDescriptor;
  detectSummary: DetectSummary;
  steps: PlanStepText[];
  generatedAt: GeneratedAt;
}

export interface DeploymentLogEntryState {
  timestamp: OccurredAt;
  source: DeploymentLogSourceValue;
  phase: DeploymentPhaseValue;
  level: LogLevelValue;
  message: MessageText;
}

type DeploymentLogEntryRehydrateState = Omit<DeploymentLogEntryState, "source"> & {
  source?: DeploymentLogSourceValue;
};

export interface ExecutionResultState {
  status: ExecutionStatusValue;
  exitCode: ExitCode;
  retryable: boolean;
  logs: DeploymentLogEntry[];
  errorCode?: ErrorCodeText;
  metadata?: Record<string, string>;
}

export interface RollbackPlanState {
  id: RollbackPlanId;
  deploymentId: DeploymentId;
  snapshotId: EnvironmentSnapshotId;
  target: DeploymentTargetDescriptor;
  steps: PlanStepText[];
  generatedAt: GeneratedAt;
}

export class SourceDescriptor extends ValueObject<SourceDescriptorState> {
  private constructor(state: SourceDescriptorState) {
    super(state);
  }

  static create(input: SourceDescriptorState): Result<SourceDescriptor> {
    return ok(new SourceDescriptor(input));
  }

  static rehydrate(state: SourceDescriptorState): SourceDescriptor {
    return new SourceDescriptor(state);
  }

  get kind(): (typeof sourceKinds)[number] {
    return this.state.kind.value;
  }

  get kindValue(): SourceKindValue {
    return this.state.kind;
  }

  get locator(): string {
    return this.state.locator.value;
  }

  get displayName(): string {
    return this.state.displayName.value;
  }

  get metadata(): Record<string, string> | undefined {
    return this.state.metadata ? { ...this.state.metadata } : undefined;
  }

  toState(): SourceDescriptorState {
    return {
      kind: this.state.kind,
      locator: this.state.locator,
      displayName: this.state.displayName,
      ...(this.state.metadata ? { metadata: { ...this.state.metadata } } : {}),
    };
  }
}

export class DeploymentTargetDescriptor extends ValueObject<DeploymentTargetDescriptorState> {
  private constructor(state: DeploymentTargetDescriptorState) {
    super(state);
  }

  static create(input: DeploymentTargetDescriptorState): Result<DeploymentTargetDescriptor> {
    if (input.serverIds.length === 0) {
      return err(
        domainError.validation("Deployment target descriptor must contain at least one server"),
      );
    }

    return ok(new DeploymentTargetDescriptor(input));
  }

  static rehydrate(state: DeploymentTargetDescriptorState): DeploymentTargetDescriptor {
    return new DeploymentTargetDescriptor(state);
  }

  get kind(): (typeof targetKinds)[number] {
    return this.state.kind.value;
  }

  get providerKey(): string {
    return this.state.providerKey.value;
  }

  get serverIds(): string[] {
    return this.state.serverIds.map((item) => item.value);
  }

  get metadata(): Record<string, string> | undefined {
    return this.state.metadata ? { ...this.state.metadata } : undefined;
  }

  toState(): DeploymentTargetDescriptorState {
    return {
      kind: this.state.kind,
      providerKey: this.state.providerKey,
      serverIds: [...this.state.serverIds],
      ...(this.state.metadata ? { metadata: { ...this.state.metadata } } : {}),
    };
  }
}

export class AccessRoute extends ValueObject<AccessRouteState> {
  private constructor(state: AccessRouteState) {
    super(state);
  }

  static create(input: AccessRouteState): Result<AccessRoute> {
    if (input.proxyKind.value === "none" && input.domains.length > 0) {
      return err(domainError.validation("Disabled access routes cannot declare domains"));
    }

    if (input.proxyKind.value !== "none" && input.domains.length === 0) {
      return err(domainError.validation("Access routes require at least one domain"));
    }

    return ok(new AccessRoute(input));
  }

  static rehydrate(state: AccessRouteState): AccessRoute {
    return new AccessRoute(state);
  }

  get proxyKind(): (typeof edgeProxyKinds)[number] {
    return this.state.proxyKind.value;
  }

  get domains(): string[] {
    return this.state.domains.map((domain) => domain.value);
  }

  get pathPrefix(): string {
    return this.state.pathPrefix.value;
  }

  get tlsMode(): (typeof tlsModes)[number] {
    return this.state.tlsMode.value;
  }

  get targetPort(): number | undefined {
    return this.state.targetPort?.value;
  }

  toState(): AccessRouteState {
    return {
      proxyKind: this.state.proxyKind,
      domains: [...this.state.domains],
      pathPrefix: this.state.pathPrefix,
      tlsMode: this.state.tlsMode,
      ...(this.state.targetPort ? { targetPort: this.state.targetPort } : {}),
    };
  }
}

export class RuntimeExecutionPlan extends ValueObject<RuntimeExecutionPlanState> {
  private constructor(state: RuntimeExecutionPlanState) {
    super(state);
  }

  static create(input: RuntimeExecutionPlanState): Result<RuntimeExecutionPlan> {
    return ok(new RuntimeExecutionPlan(input));
  }

  static rehydrate(state: RuntimeExecutionPlanState): RuntimeExecutionPlan {
    return new RuntimeExecutionPlan(state);
  }

  get kind(): (typeof executionStrategyKinds)[number] {
    return this.state.kind.value;
  }

  get workingDirectory(): string | undefined {
    return this.state.workingDirectory?.value;
  }

  get installCommand(): string | undefined {
    return this.state.installCommand?.value;
  }

  get buildCommand(): string | undefined {
    return this.state.buildCommand?.value;
  }

  get startCommand(): string | undefined {
    return this.state.startCommand?.value;
  }

  get healthCheckPath(): string | undefined {
    return this.state.healthCheckPath?.value;
  }

  get port(): number | undefined {
    return this.state.port?.value;
  }

  get image(): string | undefined {
    return this.state.image?.value;
  }

  get dockerfilePath(): string | undefined {
    return this.state.dockerfilePath?.value;
  }

  get composeFile(): string | undefined {
    return this.state.composeFile?.value;
  }

  get accessRoutes(): AccessRoute[] {
    return [...(this.state.accessRoutes ?? [])];
  }

  get metadata(): Record<string, string> | undefined {
    return this.state.metadata ? { ...this.state.metadata } : undefined;
  }

  withMetadata(metadata: Record<string, string>): RuntimeExecutionPlan {
    return RuntimeExecutionPlan.rehydrate({
      ...this.state,
      metadata: {
        ...(this.state.metadata ?? {}),
        ...metadata,
      },
    });
  }

  withAccessRoutes(accessRoutes: AccessRoute[]): RuntimeExecutionPlan {
    return RuntimeExecutionPlan.rehydrate({
      ...this.state,
      accessRoutes: [...accessRoutes],
    });
  }

  toState(): RuntimeExecutionPlanState {
    return {
      kind: this.state.kind,
      ...(this.state.workingDirectory ? { workingDirectory: this.state.workingDirectory } : {}),
      ...(this.state.installCommand ? { installCommand: this.state.installCommand } : {}),
      ...(this.state.buildCommand ? { buildCommand: this.state.buildCommand } : {}),
      ...(this.state.startCommand ? { startCommand: this.state.startCommand } : {}),
      ...(this.state.healthCheckPath ? { healthCheckPath: this.state.healthCheckPath } : {}),
      ...(this.state.port ? { port: this.state.port } : {}),
      ...(this.state.image ? { image: this.state.image } : {}),
      ...(this.state.dockerfilePath ? { dockerfilePath: this.state.dockerfilePath } : {}),
      ...(this.state.composeFile ? { composeFile: this.state.composeFile } : {}),
      ...(this.state.accessRoutes ? { accessRoutes: [...this.state.accessRoutes] } : {}),
      ...(this.state.metadata ? { metadata: { ...this.state.metadata } } : {}),
    };
  }
}

export class RuntimePlan extends ValueObject<RuntimePlanState> {
  private constructor(state: RuntimePlanState) {
    super(state);
  }

  static create(input: RuntimePlanState): Result<RuntimePlan> {
    if (input.steps.length === 0) {
      return err(domainError.validation("Runtime plan must contain at least one step"));
    }

    return ok(new RuntimePlan(input));
  }

  static rehydrate(state: RuntimePlanState): RuntimePlan {
    return new RuntimePlan(state);
  }

  get id(): string {
    return this.state.id.value;
  }

  get source(): SourceDescriptor {
    return this.state.source;
  }

  get buildStrategy(): (typeof buildStrategyKinds)[number] {
    return this.state.buildStrategy.value;
  }

  get packagingMode(): (typeof packagingModes)[number] {
    return this.state.packagingMode.value;
  }

  get execution(): RuntimeExecutionPlan {
    return this.state.execution;
  }

  get target(): DeploymentTargetDescriptor {
    return this.state.target;
  }

  get detectSummary(): string {
    return this.state.detectSummary.value;
  }

  get steps(): string[] {
    return this.state.steps.map((item) => item.value);
  }

  get generatedAt(): string {
    return this.state.generatedAt.value;
  }

  withExecution(execution: RuntimeExecutionPlan): RuntimePlan {
    return RuntimePlan.rehydrate({
      ...this.state,
      execution,
    });
  }

  toState(): RuntimePlanState {
    return {
      ...this.state,
      steps: [...this.state.steps],
    };
  }
}

export class DeploymentLogEntry extends ValueObject<DeploymentLogEntryState> {
  private constructor(state: DeploymentLogEntryState) {
    super(state);
  }

  static create(input: DeploymentLogEntryState): Result<DeploymentLogEntry> {
    return ok(new DeploymentLogEntry(input));
  }

  static rehydrate(state: DeploymentLogEntryRehydrateState): DeploymentLogEntry {
    return new DeploymentLogEntry({
      ...state,
      source: state.source ?? DeploymentLogSourceValue.yundu(),
    });
  }

  get timestamp(): string {
    return this.state.timestamp.value;
  }

  get source(): string {
    return this.state.source.value;
  }

  get phase(): string {
    return this.state.phase.value;
  }

  get level(): string {
    return this.state.level.value;
  }

  get message(): string {
    return this.state.message.value;
  }

  toState(): DeploymentLogEntryState {
    return { ...this.state };
  }
}

export class ExecutionResult extends ValueObject<ExecutionResultState> {
  private constructor(state: ExecutionResultState) {
    super(state);
  }

  static create(input: ExecutionResultState): Result<ExecutionResult> {
    return ok(new ExecutionResult(input));
  }

  static rehydrate(state: ExecutionResultState): ExecutionResult {
    return new ExecutionResult({
      status: state.status,
      exitCode: state.exitCode,
      retryable: state.retryable,
      logs: [...state.logs],
      ...(state.errorCode ? { errorCode: state.errorCode } : {}),
      ...(state.metadata ? { metadata: { ...state.metadata } } : {}),
    });
  }

  get status(): "succeeded" | "failed" | "rolled-back" {
    return this.state.status.value;
  }

  get exitCode(): number {
    return this.state.exitCode.value;
  }

  get retryable(): boolean {
    return this.state.retryable;
  }

  get logs(): DeploymentLogEntry[] {
    return [...this.state.logs];
  }

  get errorCode(): string | undefined {
    return this.state.errorCode?.value;
  }

  get metadata(): Record<string, string> | undefined {
    return this.state.metadata ? { ...this.state.metadata } : undefined;
  }

  toState(): ExecutionResultState {
    return {
      status: this.state.status,
      exitCode: this.state.exitCode,
      retryable: this.state.retryable,
      logs: [...this.state.logs],
      ...(this.state.errorCode ? { errorCode: this.state.errorCode } : {}),
      ...(this.state.metadata ? { metadata: { ...this.state.metadata } } : {}),
    };
  }
}

export class RollbackPlan extends ValueObject<RollbackPlanState> {
  private constructor(state: RollbackPlanState) {
    super(state);
  }

  static create(input: RollbackPlanState): Result<RollbackPlan> {
    if (input.steps.length === 0) {
      return err(domainError.validation("Rollback plan must contain at least one step"));
    }

    return ok(new RollbackPlan(input));
  }

  static rehydrate(state: RollbackPlanState): RollbackPlan {
    return new RollbackPlan(state);
  }

  get id(): string {
    return this.state.id.value;
  }

  get deploymentId(): string {
    return this.state.deploymentId.value;
  }

  get snapshotId(): string {
    return this.state.snapshotId.value;
  }

  get target(): DeploymentTargetDescriptor {
    return this.state.target;
  }

  get steps(): string[] {
    return this.state.steps.map((item) => item.value);
  }

  get generatedAt(): string {
    return this.state.generatedAt.value;
  }

  toState(): RollbackPlanState {
    return {
      ...this.state,
      steps: [...this.state.steps],
    };
  }
}
