import {
  buildStrategyKinds,
  configScopes,
  deploymentLogSources,
  deploymentStatuses,
  environmentKinds,
  executionStrategyKinds,
  logLevels,
  packagingModes,
  sourceKinds,
  targetKinds,
  variableExposures,
  variableKinds,
} from "./enums";
import { domainError } from "./errors";
import { err, ok, type Result } from "./result";
import { ScalarValueObject } from "./value-object";

export {
  buildStrategyKinds,
  configScopes,
  deploymentLogSources,
  deploymentStatuses,
  environmentKinds,
  executionStrategyKinds,
  logLevels,
  packagingModes,
  sourceKinds,
  targetKinds,
  variableExposures,
  variableKinds,
};

function validateLiteralValue<TValue extends string>(
  value: string,
  allowed: readonly TValue[],
  label: string,
): Result<TValue> {
  if (allowed.includes(value as TValue)) {
    return ok(value as TValue);
  }

  return err(
    domainError.validation(`${label} must be one of ${allowed.join(", ")}`, {
      value,
    }),
  );
}

function createEnumValue<TValue extends string, TObject>(
  value: string,
  allowed: readonly TValue[],
  label: string,
  create: (validated: TValue) => TObject,
): Result<TObject> {
  return validateLiteralValue(value, allowed, label).map(create);
}

export abstract class EnumValueObject<TValue extends string> extends ScalarValueObject<TValue> {
  protected constructor(value: TValue) {
    super(value);
  }
}

export abstract class StateMachineValueObject<
  TValue extends string,
> extends EnumValueObject<TValue> {
  protected constructor(value: TValue) {
    super(value);
  }

  protected ensureCurrent(allowed: readonly TValue[], message: string): Result<void> {
    if (allowed.includes(this.value)) {
      return ok(undefined);
    }

    return err(
      domainError.invariant(message, {
        status: this.value,
      }),
    );
  }
}

const environmentKindBrand: unique symbol = Symbol("EnvironmentKindValue");
export class EnvironmentKindValue extends EnumValueObject<(typeof environmentKinds)[number]> {
  private [environmentKindBrand]!: void;

  private constructor(value: (typeof environmentKinds)[number]) {
    super(value);
  }

  static create(value: string): Result<EnvironmentKindValue> {
    return createEnumValue(
      value,
      environmentKinds,
      "Environment kind",
      (validated) => new EnvironmentKindValue(validated),
    );
  }

  static rehydrate(value: (typeof environmentKinds)[number]): EnvironmentKindValue {
    return new EnvironmentKindValue(value);
  }
}

const sourceKindBrand: unique symbol = Symbol("SourceKindValue");
export class SourceKindValue extends EnumValueObject<(typeof sourceKinds)[number]> {
  private [sourceKindBrand]!: void;

  private constructor(value: (typeof sourceKinds)[number]) {
    super(value);
  }

  static create(value: string): Result<SourceKindValue> {
    return createEnumValue(
      value,
      sourceKinds,
      "Source kind",
      (validated) => new SourceKindValue(validated),
    );
  }

  static rehydrate(value: (typeof sourceKinds)[number]): SourceKindValue {
    return new SourceKindValue(value);
  }
}

const targetKindBrand: unique symbol = Symbol("TargetKindValue");
export class TargetKindValue extends EnumValueObject<(typeof targetKinds)[number]> {
  private [targetKindBrand]!: void;

  private constructor(value: (typeof targetKinds)[number]) {
    super(value);
  }

  static create(value: string): Result<TargetKindValue> {
    return createEnumValue(
      value,
      targetKinds,
      "Target kind",
      (validated) => new TargetKindValue(validated),
    );
  }

  static rehydrate(value: (typeof targetKinds)[number]): TargetKindValue {
    return new TargetKindValue(value);
  }
}

const buildStrategyBrand: unique symbol = Symbol("BuildStrategyKindValue");
export class BuildStrategyKindValue extends EnumValueObject<(typeof buildStrategyKinds)[number]> {
  private [buildStrategyBrand]!: void;

  private constructor(value: (typeof buildStrategyKinds)[number]) {
    super(value);
  }

  static create(value: string): Result<BuildStrategyKindValue> {
    return createEnumValue(
      value,
      buildStrategyKinds,
      "Build strategy",
      (validated) => new BuildStrategyKindValue(validated),
    );
  }

  static rehydrate(value: (typeof buildStrategyKinds)[number]): BuildStrategyKindValue {
    return new BuildStrategyKindValue(value);
  }
}

const packagingModeBrand: unique symbol = Symbol("PackagingModeValue");
export class PackagingModeValue extends EnumValueObject<(typeof packagingModes)[number]> {
  private [packagingModeBrand]!: void;

  private constructor(value: (typeof packagingModes)[number]) {
    super(value);
  }

  static create(value: string): Result<PackagingModeValue> {
    return createEnumValue(
      value,
      packagingModes,
      "Packaging mode",
      (validated) => new PackagingModeValue(validated),
    );
  }

  static rehydrate(value: (typeof packagingModes)[number]): PackagingModeValue {
    return new PackagingModeValue(value);
  }
}

const executionStrategyBrand: unique symbol = Symbol("ExecutionStrategyKindValue");
export class ExecutionStrategyKindValue extends EnumValueObject<
  (typeof executionStrategyKinds)[number]
> {
  private [executionStrategyBrand]!: void;

  private constructor(value: (typeof executionStrategyKinds)[number]) {
    super(value);
  }

  static create(value: string): Result<ExecutionStrategyKindValue> {
    return createEnumValue(
      value,
      executionStrategyKinds,
      "Execution strategy",
      (validated) => new ExecutionStrategyKindValue(validated),
    );
  }

  static rehydrate(value: (typeof executionStrategyKinds)[number]): ExecutionStrategyKindValue {
    return new ExecutionStrategyKindValue(value);
  }
}

const deploymentStatusBrand: unique symbol = Symbol("DeploymentStatusValue");
export class DeploymentStatusValue extends StateMachineValueObject<
  (typeof deploymentStatuses)[number]
> {
  private [deploymentStatusBrand]!: void;

  private constructor(value: (typeof deploymentStatuses)[number]) {
    super(value);
  }

  static create(value: string): Result<DeploymentStatusValue> {
    return createEnumValue(
      value,
      deploymentStatuses,
      "Deployment status",
      (validated) => new DeploymentStatusValue(validated),
    );
  }

  static rehydrate(value: (typeof deploymentStatuses)[number]): DeploymentStatusValue {
    return new DeploymentStatusValue(value);
  }

  static created(): DeploymentStatusValue {
    return new DeploymentStatusValue("created");
  }

  markPlanning(): Result<DeploymentStatusValue> {
    return this.ensureCurrent(["created"], "Deployment must be created before planning").map(
      () => new DeploymentStatusValue("planning"),
    );
  }

  markPlanned(): Result<DeploymentStatusValue> {
    return this.ensureCurrent(["planning"], "Deployment must be planning before planned").map(
      () => new DeploymentStatusValue("planned"),
    );
  }

  start(): Result<DeploymentStatusValue> {
    return this.ensureCurrent(
      ["planned"],
      "Deployment must be planned before execution starts",
    ).map(() => new DeploymentStatusValue("running"));
  }

  applyExecutionResult(result: ExecutionStatusValue): Result<DeploymentStatusValue> {
    return this.ensureCurrent(["running"], "Deployment must be running before completion").map(
      () => {
        switch (result.value) {
          case "rolled-back":
            return new DeploymentStatusValue("rolled-back");
          case "succeeded":
            return new DeploymentStatusValue("succeeded");
          case "failed":
            return new DeploymentStatusValue("failed");
        }

        const unreachable: never = result.value;
        return new DeploymentStatusValue(unreachable);
      },
    );
  }
}

const executionStatusBrand: unique symbol = Symbol("ExecutionStatusValue");
export class ExecutionStatusValue extends EnumValueObject<"succeeded" | "failed" | "rolled-back"> {
  private [executionStatusBrand]!: void;

  private constructor(value: "succeeded" | "failed" | "rolled-back") {
    super(value);
  }

  static create(value: string): Result<ExecutionStatusValue> {
    return createEnumValue(
      value,
      ["succeeded", "failed", "rolled-back"] as const,
      "Execution status",
      (validated) => new ExecutionStatusValue(validated),
    );
  }

  static rehydrate(value: "succeeded" | "failed" | "rolled-back"): ExecutionStatusValue {
    return new ExecutionStatusValue(value);
  }
}

const configScopeBrand: unique symbol = Symbol("ConfigScopeValue");
export class ConfigScopeValue extends EnumValueObject<(typeof configScopes)[number]> {
  private [configScopeBrand]!: void;

  private constructor(value: (typeof configScopes)[number]) {
    super(value);
  }

  static create(value: string): Result<ConfigScopeValue> {
    return createEnumValue(
      value,
      configScopes,
      "Config scope",
      (validated) => new ConfigScopeValue(validated),
    );
  }

  static rehydrate(value: (typeof configScopes)[number]): ConfigScopeValue {
    return new ConfigScopeValue(value);
  }
}

const variableKindBrand: unique symbol = Symbol("VariableKindValue");
export class VariableKindValue extends EnumValueObject<(typeof variableKinds)[number]> {
  private [variableKindBrand]!: void;

  private constructor(value: (typeof variableKinds)[number]) {
    super(value);
  }

  static create(value: string): Result<VariableKindValue> {
    return createEnumValue(
      value,
      variableKinds,
      "Variable kind",
      (validated) => new VariableKindValue(validated),
    );
  }

  static rehydrate(value: (typeof variableKinds)[number]): VariableKindValue {
    return new VariableKindValue(value);
  }
}

const variableExposureBrand: unique symbol = Symbol("VariableExposureValue");
export class VariableExposureValue extends EnumValueObject<(typeof variableExposures)[number]> {
  private [variableExposureBrand]!: void;

  private constructor(value: (typeof variableExposures)[number]) {
    super(value);
  }

  static create(value: string): Result<VariableExposureValue> {
    return createEnumValue(
      value,
      variableExposures,
      "Variable exposure",
      (validated) => new VariableExposureValue(validated),
    );
  }

  static rehydrate(value: (typeof variableExposures)[number]): VariableExposureValue {
    return new VariableExposureValue(value);
  }
}

const providerConnectionStatusBrand: unique symbol = Symbol("ProviderConnectionStatusValue");
export class ProviderConnectionStatusValue extends StateMachineValueObject<
  "pending" | "active" | "failed" | "disabled"
> {
  private [providerConnectionStatusBrand]!: void;

  private constructor(value: "pending" | "active" | "failed" | "disabled") {
    super(value);
  }

  static create(value: string): Result<ProviderConnectionStatusValue> {
    return createEnumValue(
      value,
      ["pending", "active", "failed", "disabled"] as const,
      "Provider connection status",
      (validated) => new ProviderConnectionStatusValue(validated),
    );
  }

  static rehydrate(
    value: "pending" | "active" | "failed" | "disabled",
  ): ProviderConnectionStatusValue {
    return new ProviderConnectionStatusValue(value);
  }

  static pending(): ProviderConnectionStatusValue {
    return new ProviderConnectionStatusValue("pending");
  }

  activate(): ProviderConnectionStatusValue {
    return new ProviderConnectionStatusValue("active");
  }
}

const integrationConnectionStatusBrand: unique symbol = Symbol("IntegrationConnectionStatusValue");
export class IntegrationConnectionStatusValue extends StateMachineValueObject<
  "pending" | "connected" | "failed" | "revoked"
> {
  private [integrationConnectionStatusBrand]!: void;

  private constructor(value: "pending" | "connected" | "failed" | "revoked") {
    super(value);
  }

  static create(value: string): Result<IntegrationConnectionStatusValue> {
    return createEnumValue(
      value,
      ["pending", "connected", "failed", "revoked"] as const,
      "Integration connection status",
      (validated) => new IntegrationConnectionStatusValue(validated),
    );
  }

  static rehydrate(
    value: "pending" | "connected" | "failed" | "revoked",
  ): IntegrationConnectionStatusValue {
    return new IntegrationConnectionStatusValue(value);
  }

  static pending(): IntegrationConnectionStatusValue {
    return new IntegrationConnectionStatusValue("pending");
  }

  connect(): IntegrationConnectionStatusValue {
    return new IntegrationConnectionStatusValue("connected");
  }

  revoke(): IntegrationConnectionStatusValue {
    return new IntegrationConnectionStatusValue("revoked");
  }
}

const pluginInstallationStatusBrand: unique symbol = Symbol("PluginInstallationStatusValue");
export class PluginInstallationStatusValue extends StateMachineValueObject<
  "installed" | "disabled" | "incompatible"
> {
  private [pluginInstallationStatusBrand]!: void;

  private constructor(value: "installed" | "disabled" | "incompatible") {
    super(value);
  }

  static create(value: string): Result<PluginInstallationStatusValue> {
    return createEnumValue(
      value,
      ["installed", "disabled", "incompatible"] as const,
      "Plugin installation status",
      (validated) => new PluginInstallationStatusValue(validated),
    );
  }

  static rehydrate(
    value: "installed" | "disabled" | "incompatible",
  ): PluginInstallationStatusValue {
    return new PluginInstallationStatusValue(value);
  }

  disable(): PluginInstallationStatusValue {
    return new PluginInstallationStatusValue("disabled");
  }

  markIncompatible(): PluginInstallationStatusValue {
    return new PluginInstallationStatusValue("incompatible");
  }
}

const resourceInstanceKindBrand: unique symbol = Symbol("ResourceInstanceKindValue");
export class ResourceInstanceKindValue extends EnumValueObject<
  "postgres" | "redis" | "s3" | "dns" | "secret-manager" | "registry" | "generic-service"
> {
  private [resourceInstanceKindBrand]!: void;

  private constructor(
    value: "postgres" | "redis" | "s3" | "dns" | "secret-manager" | "registry" | "generic-service",
  ) {
    super(value);
  }

  static create(value: string): Result<ResourceInstanceKindValue> {
    return createEnumValue(
      value,
      ["postgres", "redis", "s3", "dns", "secret-manager", "registry", "generic-service"] as const,
      "Resource instance kind",
      (validated) => new ResourceInstanceKindValue(validated),
    );
  }

  static rehydrate(
    value: "postgres" | "redis" | "s3" | "dns" | "secret-manager" | "registry" | "generic-service",
  ): ResourceInstanceKindValue {
    return new ResourceInstanceKindValue(value);
  }
}

const ownerScopeBrand: unique symbol = Symbol("OwnerScopeValue");
export class OwnerScopeValue extends EnumValueObject<"system" | "organization" | "project"> {
  private [ownerScopeBrand]!: void;

  private constructor(value: "system" | "organization" | "project") {
    super(value);
  }

  static create(value: string): Result<OwnerScopeValue> {
    return createEnumValue(
      value,
      ["system", "organization", "project"] as const,
      "Owner scope",
      (validated) => new OwnerScopeValue(validated),
    );
  }

  static rehydrate(value: "system" | "organization" | "project"): OwnerScopeValue {
    return new OwnerScopeValue(value);
  }
}

const resourceInstanceStatusBrand: unique symbol = Symbol("ResourceInstanceStatusValue");
export class ResourceInstanceStatusValue extends StateMachineValueObject<
  "provisioning" | "ready" | "degraded" | "deleted"
> {
  private [resourceInstanceStatusBrand]!: void;

  private constructor(value: "provisioning" | "ready" | "degraded" | "deleted") {
    super(value);
  }

  static create(value: string): Result<ResourceInstanceStatusValue> {
    return createEnumValue(
      value,
      ["provisioning", "ready", "degraded", "deleted"] as const,
      "Resource instance status",
      (validated) => new ResourceInstanceStatusValue(validated),
    );
  }

  static rehydrate(
    value: "provisioning" | "ready" | "degraded" | "deleted",
  ): ResourceInstanceStatusValue {
    return new ResourceInstanceStatusValue(value);
  }

  static provisioning(): ResourceInstanceStatusValue {
    return new ResourceInstanceStatusValue("provisioning");
  }

  markReady(): ResourceInstanceStatusValue {
    return new ResourceInstanceStatusValue("ready");
  }

  markDeleted(): ResourceInstanceStatusValue {
    return new ResourceInstanceStatusValue("deleted");
  }
}

const resourceBindingScopeBrand: unique symbol = Symbol("ResourceBindingScopeValue");
export class ResourceBindingScopeValue extends EnumValueObject<
  "environment" | "release" | "build-only" | "runtime-only"
> {
  private [resourceBindingScopeBrand]!: void;

  private constructor(value: "environment" | "release" | "build-only" | "runtime-only") {
    super(value);
  }

  static create(value: string): Result<ResourceBindingScopeValue> {
    return createEnumValue(
      value,
      ["environment", "release", "build-only", "runtime-only"] as const,
      "Resource binding scope",
      (validated) => new ResourceBindingScopeValue(validated),
    );
  }

  static rehydrate(
    value: "environment" | "release" | "build-only" | "runtime-only",
  ): ResourceBindingScopeValue {
    return new ResourceBindingScopeValue(value);
  }
}

const resourceInjectionModeBrand: unique symbol = Symbol("ResourceInjectionModeValue");
export class ResourceInjectionModeValue extends EnumValueObject<"env" | "file" | "reference"> {
  private [resourceInjectionModeBrand]!: void;

  private constructor(value: "env" | "file" | "reference") {
    super(value);
  }

  static create(value: string): Result<ResourceInjectionModeValue> {
    return createEnumValue(
      value,
      ["env", "file", "reference"] as const,
      "Resource injection mode",
      (validated) => new ResourceInjectionModeValue(validated),
    );
  }

  static rehydrate(value: "env" | "file" | "reference"): ResourceInjectionModeValue {
    return new ResourceInjectionModeValue(value);
  }
}

const workloadKindBrand: unique symbol = Symbol("WorkloadKindValue");
export class WorkloadKindValue extends EnumValueObject<
  "web_app" | "api_service" | "worker" | "cron_job" | "static_site" | "gateway"
> {
  private [workloadKindBrand]!: void;

  private constructor(
    value: "web_app" | "api_service" | "worker" | "cron_job" | "static_site" | "gateway",
  ) {
    super(value);
  }

  static create(value: string): Result<WorkloadKindValue> {
    return createEnumValue(
      value,
      ["web_app", "api_service", "worker", "cron_job", "static_site", "gateway"] as const,
      "Workload kind",
      (validated) => new WorkloadKindValue(validated),
    );
  }

  static rehydrate(
    value: "web_app" | "api_service" | "worker" | "cron_job" | "static_site" | "gateway",
  ): WorkloadKindValue {
    return new WorkloadKindValue(value);
  }
}

const runtimeKindBrand: unique symbol = Symbol("RuntimeKindValue");
export class RuntimeKindValue extends EnumValueObject<
  "web-server" | "worker" | "scheduler" | "static-site"
> {
  private [runtimeKindBrand]!: void;

  private constructor(value: "web-server" | "worker" | "scheduler" | "static-site") {
    super(value);
  }

  static create(value: string): Result<RuntimeKindValue> {
    return createEnumValue(
      value,
      ["web-server", "worker", "scheduler", "static-site"] as const,
      "Runtime kind",
      (validated) => new RuntimeKindValue(validated),
    );
  }

  static rehydrate(value: "web-server" | "worker" | "scheduler" | "static-site"): RuntimeKindValue {
    return new RuntimeKindValue(value);
  }
}

const organizationRoleBrand: unique symbol = Symbol("OrganizationRoleValue");
export class OrganizationRoleValue extends EnumValueObject<
  "owner" | "admin" | "developer" | "viewer" | "billing"
> {
  private [organizationRoleBrand]!: void;

  private constructor(value: "owner" | "admin" | "developer" | "viewer" | "billing") {
    super(value);
  }

  static create(value: string): Result<OrganizationRoleValue> {
    return createEnumValue(
      value,
      ["owner", "admin", "developer", "viewer", "billing"] as const,
      "Organization role",
      (validated) => new OrganizationRoleValue(validated),
    );
  }

  static rehydrate(
    value: "owner" | "admin" | "developer" | "viewer" | "billing",
  ): OrganizationRoleValue {
    return new OrganizationRoleValue(value);
  }
}

const organizationPlanTierBrand: unique symbol = Symbol("OrganizationPlanTierValue");
export class OrganizationPlanTierValue extends EnumValueObject<
  "community" | "team" | "enterprise"
> {
  private [organizationPlanTierBrand]!: void;

  private constructor(value: "community" | "team" | "enterprise") {
    super(value);
  }

  static create(value: string): Result<OrganizationPlanTierValue> {
    return createEnumValue(
      value,
      ["community", "team", "enterprise"] as const,
      "Organization plan tier",
      (validated) => new OrganizationPlanTierValue(validated),
    );
  }

  static rehydrate(value: "community" | "team" | "enterprise"): OrganizationPlanTierValue {
    return new OrganizationPlanTierValue(value);
  }
}

const logLevelBrand: unique symbol = Symbol("LogLevelValue");
export class LogLevelValue extends EnumValueObject<(typeof logLevels)[number]> {
  private [logLevelBrand]!: void;

  private constructor(value: (typeof logLevels)[number]) {
    super(value);
  }

  static create(value: string): Result<LogLevelValue> {
    return createEnumValue(
      value,
      logLevels,
      "Log level",
      (validated) => new LogLevelValue(validated),
    );
  }

  static rehydrate(value: (typeof logLevels)[number]): LogLevelValue {
    return new LogLevelValue(value);
  }
}

const deploymentLogSourceBrand: unique symbol = Symbol("DeploymentLogSourceValue");
export class DeploymentLogSourceValue extends EnumValueObject<
  (typeof deploymentLogSources)[number]
> {
  private [deploymentLogSourceBrand]!: void;

  private constructor(value: (typeof deploymentLogSources)[number]) {
    super(value);
  }

  static create(value: string): Result<DeploymentLogSourceValue> {
    return createEnumValue(
      value,
      deploymentLogSources,
      "Deployment log source",
      (validated) => new DeploymentLogSourceValue(validated),
    );
  }

  static yundu(): DeploymentLogSourceValue {
    return new DeploymentLogSourceValue("yundu");
  }

  static rehydrate(value: (typeof deploymentLogSources)[number]): DeploymentLogSourceValue {
    return new DeploymentLogSourceValue(value);
  }
}

const deploymentPhaseBrand: unique symbol = Symbol("DeploymentPhaseValue");
export class DeploymentPhaseValue extends EnumValueObject<
  "detect" | "plan" | "package" | "deploy" | "verify" | "rollback"
> {
  private [deploymentPhaseBrand]!: void;

  private constructor(value: "detect" | "plan" | "package" | "deploy" | "verify" | "rollback") {
    super(value);
  }

  static create(value: string): Result<DeploymentPhaseValue> {
    return createEnumValue(
      value,
      ["detect", "plan", "package", "deploy", "verify", "rollback"] as const,
      "Deployment phase",
      (validated) => new DeploymentPhaseValue(validated),
    );
  }

  static rehydrate(
    value: "detect" | "plan" | "package" | "deploy" | "verify" | "rollback",
  ): DeploymentPhaseValue {
    return new DeploymentPhaseValue(value);
  }
}
