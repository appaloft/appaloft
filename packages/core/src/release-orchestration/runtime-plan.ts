import { domainError } from "../shared/errors";
import {
  type DeploymentId,
  type DeploymentTargetId,
  type EnvironmentSnapshotId,
  type RollbackPlanId,
  type RuntimePlanId,
} from "../shared/identifiers";
import {
  type CanonicalRedirectStatusCode,
  type ExitCode,
  type HealthCheckExpectedStatusCode,
  type HealthCheckIntervalSeconds,
  type HealthCheckRetryCount,
  type HealthCheckStartPeriodSeconds,
  type HealthCheckTimeoutSeconds,
  type PortNumber,
} from "../shared/numeric-values";
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
  type HealthCheckHttpMethodValue,
  type HealthCheckSchemeValue,
  type HealthCheckTypeValue,
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
  type HealthCheckHostText,
  type HealthCheckPathText,
  type HealthCheckResponseText,
  type ImageReference,
  type MessageText,
  type PlanStepText,
  type ProviderKey,
  type PublicDomainName,
  type RoutePathPrefix,
  type SourceLocator,
} from "../shared/text-values";
import { ValueObject } from "../shared/value-object";

export const runtimeVerificationStepKinds = ["internal-http", "public-http"] as const;
export const runtimeArtifactKinds = ["image", "compose-project"] as const;
export const runtimeArtifactIntents = ["build-image", "prebuilt-image", "compose-project"] as const;
export const sourceRuntimeFamilies = [
  "custom",
  "dotnet",
  "elixir",
  "go",
  "java",
  "node",
  "php",
  "python",
  "ruby",
  "rust",
  "static",
] as const;
export const sourceFrameworks = [
  "actix-web",
  "angular",
  "astro",
  "aspnet-core",
  "axum",
  "chi",
  "django",
  "echo",
  "express",
  "fastapi",
  "fastify",
  "fiber",
  "flask",
  "gin",
  "hono",
  "koa",
  "laravel",
  "micronaut",
  "nestjs",
  "nextjs",
  "nuxt",
  "phoenix",
  "quarkus",
  "rails",
  "react",
  "remix",
  "rocket",
  "sinatra",
  "solid",
  "spring-boot",
  "svelte",
  "sveltekit",
  "symfony",
  "vite",
  "vue",
] as const;
export const sourcePackageManagers = [
  "bun",
  "cargo",
  "composer",
  "dotnet",
  "go",
  "gradle",
  "maven",
  "mix",
  "npm",
  "pip",
  "pnpm",
  "poetry",
  "uv",
  "yarn",
] as const;
export const sourceApplicationShapes = [
  "static",
  "serverful-http",
  "ssr",
  "hybrid-static-server",
  "worker",
  "container-native",
] as const;
export const sourceDetectedFiles = [
  "angular-json",
  "astro-config",
  "bun-lock",
  "cargo-toml",
  "composer-json",
  "compose-manifest",
  "csproj",
  "django-manage",
  "dockerfile",
  "git-directory",
  "go-mod",
  "gradle-build",
  "gradle-wrapper",
  "mix-exs",
  "maven-wrapper",
  "next-app-router",
  "next-config",
  "next-pages-router",
  "next-standalone-output",
  "next-static-output",
  "nuxt-config",
  "package-lock",
  "package-json",
  "pnpm-lock",
  "poetry-lock",
  "pom-xml",
  "pyproject-toml",
  "requirements-txt",
  "remix-config",
  "svelte-config",
  "uv-lock",
  "vite-config",
  "yarn-lock",
] as const;
export const sourceDetectedScripts = [
  "build",
  "dev",
  "export",
  "generate",
  "preview",
  "serve",
  "start",
  "start-built",
] as const;

export type RuntimeArtifactKind = (typeof runtimeArtifactKinds)[number];
export type RuntimeArtifactIntent = (typeof runtimeArtifactIntents)[number];
export type SourceRuntimeFamily = (typeof sourceRuntimeFamilies)[number];
export type SourceFramework = (typeof sourceFrameworks)[number];
export type SourcePackageManager = (typeof sourcePackageManagers)[number];
export type SourceApplicationShape = (typeof sourceApplicationShapes)[number];
export type SourceDetectedFile = (typeof sourceDetectedFiles)[number];
export type SourceDetectedScript = (typeof sourceDetectedScripts)[number];

export interface SourceDescriptorState {
  kind: SourceKindValue;
  locator: SourceLocator;
  displayName: DisplayNameText;
  inspection?: SourceInspectionSnapshot;
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
  healthCheck?: RuntimeHealthCheckPolicyState;
  port?: PortNumber;
  image?: ImageReference;
  dockerfilePath?: FilePathText;
  composeFile?: FilePathText;
  accessRoutes?: AccessRoute[];
  verificationSteps?: RuntimeVerificationStep[];
  metadata?: Record<string, string>;
}

export interface RuntimeHealthCheckHttpPolicyState {
  method: HealthCheckHttpMethodValue;
  scheme: HealthCheckSchemeValue;
  host: HealthCheckHostText;
  port?: PortNumber;
  path: HealthCheckPathText;
  expectedStatusCode: HealthCheckExpectedStatusCode;
  expectedResponseText?: HealthCheckResponseText;
}

export interface RuntimeHealthCheckCommandPolicyState {
  command: CommandText;
}

export interface RuntimeHealthCheckPolicyState {
  enabled: boolean;
  type: HealthCheckTypeValue;
  intervalSeconds: HealthCheckIntervalSeconds;
  timeoutSeconds: HealthCheckTimeoutSeconds;
  retries: HealthCheckRetryCount;
  startPeriodSeconds: HealthCheckStartPeriodSeconds;
  http?: RuntimeHealthCheckHttpPolicyState;
  command?: RuntimeHealthCheckCommandPolicyState;
}

export interface AccessRouteState {
  proxyKind: EdgeProxyKindValue;
  domains: PublicDomainName[];
  pathPrefix: RoutePathPrefix;
  tlsMode: TlsModeValue;
  targetPort?: PortNumber;
  redirectTo?: PublicDomainName;
  redirectStatus?: CanonicalRedirectStatusCode;
}

export interface RuntimeVerificationStepState {
  kind: RuntimeVerificationStepKindValue;
  label: PlanStepText;
}

export interface RuntimeArtifactSnapshotState {
  kind: RuntimeArtifactKindValue;
  intent: RuntimeArtifactIntentValue;
  image?: ImageReference;
  composeFile?: FilePathText;
  metadata?: Record<string, string>;
}

export interface SourceInspectionSnapshotState {
  runtimeFamily?: SourceRuntimeFamilyValue;
  framework?: SourceFrameworkValue;
  packageManager?: SourcePackageManagerValue;
  applicationShape?: SourceApplicationShapeValue;
  runtimeVersion?: SourceRuntimeVersionText;
  projectName?: DisplayNameText;
  detectedFiles?: SourceDetectedFileValue[];
  detectedScripts?: SourceDetectedScriptValue[];
  dockerfilePath?: FilePathText;
  composeFilePath?: FilePathText;
  jarPath?: FilePathText;
}

export interface RuntimePlanState {
  id: RuntimePlanId;
  source: SourceDescriptor;
  buildStrategy: BuildStrategyKindValue;
  packagingMode: PackagingModeValue;
  execution: RuntimeExecutionPlan;
  runtimeArtifact?: RuntimeArtifactSnapshot;
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

export interface SourceDescriptorVisitor<TResult> {
  localFolder(source: SourceDescriptor): TResult;
  localGit(source: SourceDescriptor): TResult;
  remoteGit(source: SourceDescriptor): TResult;
  gitPublic(source: SourceDescriptor): TResult;
  gitGithubApp(source: SourceDescriptor): TResult;
  gitDeployKey(source: SourceDescriptor): TResult;
  zipArtifact(source: SourceDescriptor): TResult;
  dockerfileInline(source: SourceDescriptor): TResult;
  dockerComposeInline(source: SourceDescriptor): TResult;
  dockerImage(source: SourceDescriptor): TResult;
  compose(source: SourceDescriptor): TResult;
}

function createRuntimeEnumValue<TValue extends string>(
  value: string,
  allowed: readonly TValue[],
  label: string,
): Result<TValue> {
  const matched = allowed.find((item) => item === value);
  if (!matched) {
    return err(domainError.validation(`${label} must be one of ${allowed.join(", ")}`, { value }));
  }

  return ok(matched);
}

const sourceRuntimeFamilyBrand: unique symbol = Symbol("SourceRuntimeFamilyValue");
export class SourceRuntimeFamilyValue extends ValueObject<SourceRuntimeFamily> {
  private [sourceRuntimeFamilyBrand]!: void;

  private constructor(value: SourceRuntimeFamily) {
    super(value);
  }

  static create(value: string): Result<SourceRuntimeFamilyValue> {
    return createRuntimeEnumValue(value, sourceRuntimeFamilies, "Source runtime family").map(
      (validated) => new SourceRuntimeFamilyValue(validated),
    );
  }

  static rehydrate(value: SourceRuntimeFamily): SourceRuntimeFamilyValue {
    return new SourceRuntimeFamilyValue(value);
  }

  get value(): SourceRuntimeFamily {
    return this.state;
  }
}

const sourceFrameworkBrand: unique symbol = Symbol("SourceFrameworkValue");
export class SourceFrameworkValue extends ValueObject<SourceFramework> {
  private [sourceFrameworkBrand]!: void;

  private constructor(value: SourceFramework) {
    super(value);
  }

  static create(value: string): Result<SourceFrameworkValue> {
    return createRuntimeEnumValue(value, sourceFrameworks, "Source framework").map(
      (validated) => new SourceFrameworkValue(validated),
    );
  }

  static rehydrate(value: SourceFramework): SourceFrameworkValue {
    return new SourceFrameworkValue(value);
  }

  get value(): SourceFramework {
    return this.state;
  }
}

const sourcePackageManagerBrand: unique symbol = Symbol("SourcePackageManagerValue");
export class SourcePackageManagerValue extends ValueObject<SourcePackageManager> {
  private [sourcePackageManagerBrand]!: void;

  private constructor(value: SourcePackageManager) {
    super(value);
  }

  static create(value: string): Result<SourcePackageManagerValue> {
    return createRuntimeEnumValue(value, sourcePackageManagers, "Source package manager").map(
      (validated) => new SourcePackageManagerValue(validated),
    );
  }

  static rehydrate(value: SourcePackageManager): SourcePackageManagerValue {
    return new SourcePackageManagerValue(value);
  }

  get value(): SourcePackageManager {
    return this.state;
  }
}

const sourceApplicationShapeBrand: unique symbol = Symbol("SourceApplicationShapeValue");
export class SourceApplicationShapeValue extends ValueObject<SourceApplicationShape> {
  private [sourceApplicationShapeBrand]!: void;

  private constructor(value: SourceApplicationShape) {
    super(value);
  }

  static create(value: string): Result<SourceApplicationShapeValue> {
    return createRuntimeEnumValue(value, sourceApplicationShapes, "Source application shape").map(
      (validated) => new SourceApplicationShapeValue(validated),
    );
  }

  static rehydrate(value: SourceApplicationShape): SourceApplicationShapeValue {
    return new SourceApplicationShapeValue(value);
  }

  get value(): SourceApplicationShape {
    return this.state;
  }
}

const sourceDetectedFileBrand: unique symbol = Symbol("SourceDetectedFileValue");
export class SourceDetectedFileValue extends ValueObject<SourceDetectedFile> {
  private [sourceDetectedFileBrand]!: void;

  private constructor(value: SourceDetectedFile) {
    super(value);
  }

  static create(value: string): Result<SourceDetectedFileValue> {
    return createRuntimeEnumValue(value, sourceDetectedFiles, "Source detected file").map(
      (validated) => new SourceDetectedFileValue(validated),
    );
  }

  static rehydrate(value: SourceDetectedFile): SourceDetectedFileValue {
    return new SourceDetectedFileValue(value);
  }

  get value(): SourceDetectedFile {
    return this.state;
  }
}

const sourceDetectedScriptBrand: unique symbol = Symbol("SourceDetectedScriptValue");
export class SourceDetectedScriptValue extends ValueObject<SourceDetectedScript> {
  private [sourceDetectedScriptBrand]!: void;

  private constructor(value: SourceDetectedScript) {
    super(value);
  }

  static create(value: string): Result<SourceDetectedScriptValue> {
    return createRuntimeEnumValue(value, sourceDetectedScripts, "Source detected script").map(
      (validated) => new SourceDetectedScriptValue(validated),
    );
  }

  static rehydrate(value: SourceDetectedScript): SourceDetectedScriptValue {
    return new SourceDetectedScriptValue(value);
  }

  get value(): SourceDetectedScript {
    return this.state;
  }
}

const sourceRuntimeVersionBrand: unique symbol = Symbol("SourceRuntimeVersionText");
export class SourceRuntimeVersionText extends ValueObject<string> {
  private [sourceRuntimeVersionBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<SourceRuntimeVersionText> {
    const normalized = value.trim();
    if (!normalized) {
      return err(domainError.validation("Source runtime version is required"));
    }

    return ok(new SourceRuntimeVersionText(normalized));
  }

  static rehydrate(value: string): SourceRuntimeVersionText {
    return new SourceRuntimeVersionText(value.trim());
  }

  get value(): string {
    return this.state;
  }
}

export class SourceInspectionSnapshot extends ValueObject<SourceInspectionSnapshotState> {
  private constructor(state: SourceInspectionSnapshotState) {
    super(state);
  }

  static create(input: SourceInspectionSnapshotState): Result<SourceInspectionSnapshot> {
    return ok(new SourceInspectionSnapshot(input));
  }

  static rehydrate(state: SourceInspectionSnapshotState): SourceInspectionSnapshot {
    return new SourceInspectionSnapshot(state);
  }

  get runtimeFamily(): SourceRuntimeFamily | undefined {
    return this.state.runtimeFamily?.value;
  }

  get framework(): SourceFramework | undefined {
    return this.state.framework?.value;
  }

  get packageManager(): SourcePackageManager | undefined {
    return this.state.packageManager?.value;
  }

  get applicationShape(): SourceApplicationShape | undefined {
    return this.state.applicationShape?.value;
  }

  get runtimeVersion(): string | undefined {
    return this.state.runtimeVersion?.value;
  }

  get projectName(): string | undefined {
    return this.state.projectName?.value;
  }

  get detectedFiles(): SourceDetectedFile[] {
    return (this.state.detectedFiles ?? []).map((item) => item.value);
  }

  get detectedScripts(): SourceDetectedScript[] {
    return (this.state.detectedScripts ?? []).map((item) => item.value);
  }

  get dockerfilePath(): string | undefined {
    return this.state.dockerfilePath?.value;
  }

  get composeFilePath(): string | undefined {
    return this.state.composeFilePath?.value;
  }

  get jarPath(): string | undefined {
    return this.state.jarPath?.value;
  }

  hasDetectedFile(file: SourceDetectedFile): boolean {
    return this.detectedFiles.includes(file);
  }

  hasDetectedScript(script: SourceDetectedScript): boolean {
    return this.detectedScripts.includes(script);
  }

  toState(): SourceInspectionSnapshotState {
    return {
      ...(this.state.runtimeFamily ? { runtimeFamily: this.state.runtimeFamily } : {}),
      ...(this.state.framework ? { framework: this.state.framework } : {}),
      ...(this.state.packageManager ? { packageManager: this.state.packageManager } : {}),
      ...(this.state.applicationShape ? { applicationShape: this.state.applicationShape } : {}),
      ...(this.state.runtimeVersion ? { runtimeVersion: this.state.runtimeVersion } : {}),
      ...(this.state.projectName ? { projectName: this.state.projectName } : {}),
      ...(this.state.detectedFiles ? { detectedFiles: [...this.state.detectedFiles] } : {}),
      ...(this.state.detectedScripts ? { detectedScripts: [...this.state.detectedScripts] } : {}),
      ...(this.state.dockerfilePath ? { dockerfilePath: this.state.dockerfilePath } : {}),
      ...(this.state.composeFilePath ? { composeFilePath: this.state.composeFilePath } : {}),
      ...(this.state.jarPath ? { jarPath: this.state.jarPath } : {}),
    };
  }
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

  get inspection(): SourceInspectionSnapshot | undefined {
    return this.state.inspection;
  }

  get metadata(): Record<string, string> | undefined {
    return this.state.metadata ? { ...this.state.metadata } : undefined;
  }

  accept<TResult>(visitor: SourceDescriptorVisitor<TResult>): TResult {
    switch (this.kind) {
      case "local-folder":
        return visitor.localFolder(this);
      case "local-git":
        return visitor.localGit(this);
      case "remote-git":
        return visitor.remoteGit(this);
      case "git-public":
        return visitor.gitPublic(this);
      case "git-github-app":
        return visitor.gitGithubApp(this);
      case "git-deploy-key":
        return visitor.gitDeployKey(this);
      case "zip-artifact":
        return visitor.zipArtifact(this);
      case "dockerfile-inline":
        return visitor.dockerfileInline(this);
      case "docker-compose-inline":
        return visitor.dockerComposeInline(this);
      case "docker-image":
        return visitor.dockerImage(this);
      case "compose":
        return visitor.compose(this);
    }

    const unhandled: never = this.kind;
    return unhandled;
  }

  toState(): SourceDescriptorState {
    return {
      kind: this.state.kind,
      locator: this.state.locator,
      displayName: this.state.displayName,
      ...(this.state.inspection ? { inspection: this.state.inspection } : {}),
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

    if (input.redirectStatus && !input.redirectTo) {
      return err(domainError.validation("Canonical redirect status requires redirect target"));
    }

    if (
      input.redirectTo &&
      input.domains.some((domain) => domain.value === input.redirectTo?.value)
    ) {
      return err(domainError.validation("Canonical redirect cannot target its source domain"));
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

  get routeBehavior(): "serve" | "redirect" {
    return this.state.redirectTo ? "redirect" : "serve";
  }

  get redirectTo(): string | undefined {
    return this.state.redirectTo?.value;
  }

  get redirectStatus(): 301 | 302 | 307 | 308 | undefined {
    return this.state.redirectStatus?.value;
  }

  toState(): AccessRouteState {
    return {
      proxyKind: this.state.proxyKind,
      domains: [...this.state.domains],
      pathPrefix: this.state.pathPrefix,
      tlsMode: this.state.tlsMode,
      ...(this.state.targetPort ? { targetPort: this.state.targetPort } : {}),
      ...(this.state.redirectTo ? { redirectTo: this.state.redirectTo } : {}),
      ...(this.state.redirectStatus ? { redirectStatus: this.state.redirectStatus } : {}),
    };
  }
}

const runtimeVerificationStepKindBrand: unique symbol = Symbol("RuntimeVerificationStepKindValue");
export class RuntimeVerificationStepKindValue extends ValueObject<
  (typeof runtimeVerificationStepKinds)[number]
> {
  private [runtimeVerificationStepKindBrand]!: void;

  private constructor(value: (typeof runtimeVerificationStepKinds)[number]) {
    super(value);
  }

  static create(value: string): Result<RuntimeVerificationStepKindValue> {
    const kind = runtimeVerificationStepKinds.find((item) => item === value);

    if (!kind) {
      return err(
        domainError.validation(
          `Runtime verification step kind must be one of ${runtimeVerificationStepKinds.join(", ")}`,
          { value },
        ),
      );
    }

    return ok(new RuntimeVerificationStepKindValue(kind));
  }

  static rehydrate(
    value: (typeof runtimeVerificationStepKinds)[number],
  ): RuntimeVerificationStepKindValue {
    return new RuntimeVerificationStepKindValue(value);
  }

  get value(): (typeof runtimeVerificationStepKinds)[number] {
    return this.state;
  }
}

export class RuntimeVerificationStep extends ValueObject<RuntimeVerificationStepState> {
  private constructor(state: RuntimeVerificationStepState) {
    super(state);
  }

  static create(input: RuntimeVerificationStepState): Result<RuntimeVerificationStep> {
    return ok(new RuntimeVerificationStep(input));
  }

  static rehydrate(state: RuntimeVerificationStepState): RuntimeVerificationStep {
    return new RuntimeVerificationStep(state);
  }

  get kind(): (typeof runtimeVerificationStepKinds)[number] {
    return this.state.kind.value;
  }

  get label(): string {
    return this.state.label.value;
  }

  toState(): RuntimeVerificationStepState {
    return { ...this.state };
  }
}

const runtimeArtifactKindBrand: unique symbol = Symbol("RuntimeArtifactKindValue");
export class RuntimeArtifactKindValue extends ValueObject<RuntimeArtifactKind> {
  private [runtimeArtifactKindBrand]!: void;

  private constructor(value: RuntimeArtifactKind) {
    super(value);
  }

  static create(value: string): Result<RuntimeArtifactKindValue> {
    const kind = runtimeArtifactKinds.find((item) => item === value);

    if (!kind) {
      return err(
        domainError.validation(
          `Runtime artifact kind must be one of ${runtimeArtifactKinds.join(", ")}`,
          { value },
        ),
      );
    }

    return ok(new RuntimeArtifactKindValue(kind));
  }

  static rehydrate(value: RuntimeArtifactKind): RuntimeArtifactKindValue {
    return new RuntimeArtifactKindValue(value);
  }

  get value(): RuntimeArtifactKind {
    return this.state;
  }
}

const runtimeArtifactIntentBrand: unique symbol = Symbol("RuntimeArtifactIntentValue");
export class RuntimeArtifactIntentValue extends ValueObject<RuntimeArtifactIntent> {
  private [runtimeArtifactIntentBrand]!: void;

  private constructor(value: RuntimeArtifactIntent) {
    super(value);
  }

  static create(value: string): Result<RuntimeArtifactIntentValue> {
    const intent = runtimeArtifactIntents.find((item) => item === value);

    if (!intent) {
      return err(
        domainError.validation(
          `Runtime artifact intent must be one of ${runtimeArtifactIntents.join(", ")}`,
          { value },
        ),
      );
    }

    return ok(new RuntimeArtifactIntentValue(intent));
  }

  static rehydrate(value: RuntimeArtifactIntent): RuntimeArtifactIntentValue {
    return new RuntimeArtifactIntentValue(value);
  }

  get value(): RuntimeArtifactIntent {
    return this.state;
  }
}

export class RuntimeArtifactSnapshot extends ValueObject<RuntimeArtifactSnapshotState> {
  private constructor(state: RuntimeArtifactSnapshotState) {
    super(state);
  }

  static create(input: RuntimeArtifactSnapshotState): Result<RuntimeArtifactSnapshot> {
    if (input.intent.value === "prebuilt-image" && !input.image) {
      return err(domainError.validation("Prebuilt image artifacts require an image reference"));
    }

    if (input.kind.value === "compose-project" && !input.composeFile) {
      return err(domainError.validation("Compose project artifacts require a compose file"));
    }

    return ok(new RuntimeArtifactSnapshot(input));
  }

  static rehydrate(state: RuntimeArtifactSnapshotState): RuntimeArtifactSnapshot {
    return new RuntimeArtifactSnapshot(state);
  }

  get kind(): RuntimeArtifactKind {
    return this.state.kind.value;
  }

  get intent(): RuntimeArtifactIntent {
    return this.state.intent.value;
  }

  get image(): string | undefined {
    return this.state.image?.value;
  }

  get composeFile(): string | undefined {
    return this.state.composeFile?.value;
  }

  get metadata(): Record<string, string> | undefined {
    return this.state.metadata ? { ...this.state.metadata } : undefined;
  }

  toState(): RuntimeArtifactSnapshotState {
    return {
      kind: this.state.kind,
      intent: this.state.intent,
      ...(this.state.image ? { image: this.state.image } : {}),
      ...(this.state.composeFile ? { composeFile: this.state.composeFile } : {}),
      ...(this.state.metadata ? { metadata: { ...this.state.metadata } } : {}),
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

  get healthCheck(): RuntimeHealthCheckPolicyState | undefined {
    return this.state.healthCheck
      ? {
          ...this.state.healthCheck,
          ...(this.state.healthCheck.http ? { http: { ...this.state.healthCheck.http } } : {}),
          ...(this.state.healthCheck.command
            ? { command: { ...this.state.healthCheck.command } }
            : {}),
        }
      : undefined;
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

  get verificationSteps(): RuntimeVerificationStep[] {
    return [...(this.state.verificationSteps ?? [])];
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

  withVerificationSteps(verificationSteps: RuntimeVerificationStep[]): RuntimeExecutionPlan {
    return RuntimeExecutionPlan.rehydrate({
      ...this.state,
      verificationSteps: [...verificationSteps],
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
      ...(this.state.healthCheck
        ? {
            healthCheck: {
              ...this.state.healthCheck,
              ...(this.state.healthCheck.http ? { http: { ...this.state.healthCheck.http } } : {}),
              ...(this.state.healthCheck.command
                ? { command: { ...this.state.healthCheck.command } }
                : {}),
            },
          }
        : {}),
      ...(this.state.port ? { port: this.state.port } : {}),
      ...(this.state.image ? { image: this.state.image } : {}),
      ...(this.state.dockerfilePath ? { dockerfilePath: this.state.dockerfilePath } : {}),
      ...(this.state.composeFile ? { composeFile: this.state.composeFile } : {}),
      ...(this.state.accessRoutes ? { accessRoutes: [...this.state.accessRoutes] } : {}),
      ...(this.state.verificationSteps
        ? { verificationSteps: [...this.state.verificationSteps] }
        : {}),
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

  get runtimeArtifact(): RuntimeArtifactSnapshot | undefined {
    return this.state.runtimeArtifact;
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
      source: state.source ?? DeploymentLogSourceValue.appaloft(),
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
