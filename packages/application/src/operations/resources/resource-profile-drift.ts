import {
  type DeploymentSummary,
  type RequestedDeploymentMethod,
  type ResourceAccessProfile,
  type ResourceDetail,
  type ResourceDetailNetworkProfile,
  type ResourceDetailProfileDiagnostic,
  type ResourceDetailRuntimeProfile,
  type ResourceDetailSourceProfile,
  type ResourceProfileDiagnosticValue,
  type ResourceProfileDriftComparison,
  type ResourceProfileDriftSection,
  type ResourceProfileDriftSuggestedCommand,
} from "../../ports";

type PrimitiveValue = string | number | boolean | null;
type ComparableValue = PrimitiveValue | undefined;
type DiagnosticValueKey = "entryProfileValue" | "deploymentSnapshotValue";
type LoosePartial<T> = {
  [Key in keyof T]?: T[Key] extends PrimitiveValue | undefined
    ? T[Key] | undefined
    : T[Key] | LoosePartial<T[Key]> | undefined;
};

export interface ResourceProfileDriftProfile {
  source?: LoosePartial<ResourceDetailSourceProfile>;
  runtimeProfile?: LoosePartial<ResourceDetailRuntimeProfile>;
  networkProfile?: LoosePartial<ResourceDetailNetworkProfile>;
  accessProfile?: LoosePartial<ResourceAccessProfile>;
}

interface ProfileFieldDefinition {
  section: ResourceProfileDriftSection;
  fieldPath: string;
  suggestedCommand: ResourceProfileDriftSuggestedCommand;
  getValue(profile: ResourceProfileDriftProfile): ComparableValue;
}

export interface ResourceProfileDriftInput {
  resource: ResourceProfileDriftProfile;
  profile: ResourceProfileDriftProfile;
  comparison: ResourceProfileDriftComparison;
  comparedValueKey: DiagnosticValueKey;
  blocksDeploymentAdmission: boolean;
  latestDeploymentId?: string;
  configPointerPrefix?: string;
}

const profileFieldDefinitions: ProfileFieldDefinition[] = [
  sourceField("source.kind", "kind"),
  sourceField("source.locator", "locator"),
  sourceField("source.gitRef", "gitRef"),
  sourceField("source.commitSha", "commitSha"),
  sourceField("source.baseDirectory", "baseDirectory"),
  sourceField("source.imageName", "imageName"),
  sourceField("source.imageTag", "imageTag"),
  sourceField("source.imageDigest", "imageDigest"),
  runtimeField("runtimeProfile.strategy", "strategy"),
  runtimeField("runtimeProfile.installCommand", "installCommand"),
  runtimeField("runtimeProfile.buildCommand", "buildCommand"),
  runtimeField("runtimeProfile.startCommand", "startCommand"),
  runtimeField("runtimeProfile.runtimeName", "runtimeName"),
  runtimeField("runtimeProfile.publishDirectory", "publishDirectory"),
  runtimeField("runtimeProfile.dockerfilePath", "dockerfilePath"),
  runtimeField("runtimeProfile.dockerComposeFilePath", "dockerComposeFilePath"),
  runtimeField("runtimeProfile.buildTarget", "buildTarget"),
  healthRuntimeField("runtimeProfile.healthCheckPath", "healthCheckPath"),
  healthRuntimeField("runtimeProfile.healthCheck.http.path", "healthCheck.http.path"),
  networkField("networkProfile.internalPort", "internalPort"),
  networkField("networkProfile.upstreamProtocol", "upstreamProtocol"),
  networkField("networkProfile.exposureMode", "exposureMode"),
  networkField("networkProfile.targetServiceName", "targetServiceName"),
  networkField("networkProfile.hostPort", "hostPort"),
  accessField("accessProfile.generatedAccessMode", "generatedAccessMode"),
  accessField("accessProfile.pathPrefix", "pathPrefix"),
];

function sourceField(
  fieldPath: string,
  key: keyof ResourceDetailSourceProfile,
): ProfileFieldDefinition {
  return {
    section: "source",
    fieldPath,
    suggestedCommand: "resources.configure-source",
    getValue: (profile) => primitiveValue(profile.source?.[key]),
  };
}

function runtimeField(
  fieldPath: string,
  key: keyof ResourceDetailRuntimeProfile,
): ProfileFieldDefinition {
  return {
    section: "runtime",
    fieldPath,
    suggestedCommand: "resources.configure-runtime",
    getValue: (profile) => primitiveValue(profile.runtimeProfile?.[key]),
  };
}

function healthRuntimeField(
  fieldPath: string,
  key: keyof ResourceDetailRuntimeProfile | "healthCheck.http.path",
): ProfileFieldDefinition {
  return {
    section: "health",
    fieldPath,
    suggestedCommand: "resources.configure-health",
    getValue: (profile) =>
      key === "healthCheck.http.path"
        ? primitiveValue(profile.runtimeProfile?.healthCheck?.http?.path)
        : primitiveValue(profile.runtimeProfile?.[key]),
  };
}

function networkField(
  fieldPath: string,
  key: keyof ResourceDetailNetworkProfile,
): ProfileFieldDefinition {
  return {
    section: "network",
    fieldPath,
    suggestedCommand: "resources.configure-network",
    getValue: (profile) => primitiveValue(profile.networkProfile?.[key]),
  };
}

function accessField(fieldPath: string, key: keyof ResourceAccessProfile): ProfileFieldDefinition {
  return {
    section: "access",
    fieldPath,
    suggestedCommand: "resources.configure-access",
    getValue: (profile) => primitiveValue(profile.accessProfile?.[key]),
  };
}

function primitiveValue(value: unknown): ComparableValue {
  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return JSON.stringify(value);
}

function diagnosticValue(value: ComparableValue): ResourceProfileDiagnosticValue {
  if (value === undefined) {
    return { state: "missing" };
  }

  return {
    state: "present",
    displayValue: value,
  };
}

function messageFor(input: {
  comparison: ResourceProfileDriftComparison;
  fieldPath: string;
}): string {
  if (input.comparison === "resource-vs-entry-profile") {
    return `Resource profile differs from entry workflow profile at ${input.fieldPath}.`;
  }

  if (input.comparison === "entry-profile-vs-latest-snapshot") {
    return `Entry workflow profile differs from latest deployment snapshot at ${input.fieldPath}.`;
  }

  return `Resource profile differs from latest deployment snapshot at ${input.fieldPath}.`;
}

function configPointerFor(input: {
  prefix: string | undefined;
  fieldPath: string;
}): string | undefined {
  if (!input.prefix) {
    return undefined;
  }

  const withoutProfile = input.fieldPath
    .replace(/^runtimeProfile\./, "runtime.")
    .replace(/^networkProfile\./, "network.")
    .replace(/^accessProfile\./, "access.")
    .replace(/^source\./, "source.");

  return `${input.prefix}.${withoutProfile}`;
}

export function compareResourceProfileDrift(
  input: ResourceProfileDriftInput,
): ResourceDetailProfileDiagnostic[] {
  return profileFieldDefinitions.flatMap((field) => {
    const resourceValue = field.getValue(input.resource);
    const comparedValue = field.getValue(input.profile);

    if (resourceValue === comparedValue || comparedValue === undefined) {
      return [];
    }

    const configPointer = configPointerFor({
      prefix: input.configPointerPrefix,
      fieldPath: field.fieldPath,
    });
    const diagnostic = {
      code: "resource_profile_drift",
      severity: input.blocksDeploymentAdmission ? "blocking" : "info",
      message: messageFor({ comparison: input.comparison, fieldPath: field.fieldPath }),
      path: field.fieldPath,
      section: field.section,
      fieldPath: field.fieldPath,
      comparison: input.comparison,
      resourceValue: diagnosticValue(resourceValue),
      [input.comparedValueKey]: diagnosticValue(comparedValue),
      ...(input.latestDeploymentId ? { latestDeploymentId: input.latestDeploymentId } : {}),
      ...(configPointer ? { configPointer } : {}),
      blocksDeploymentAdmission: input.blocksDeploymentAdmission,
      suggestedCommand: field.suggestedCommand,
    } satisfies ResourceDetailProfileDiagnostic;

    return [diagnostic];
  });
}

function buildStrategyToDeploymentMethod(
  buildStrategy: DeploymentSummary["runtimePlan"]["buildStrategy"],
): RequestedDeploymentMethod {
  switch (buildStrategy) {
    case "compose-deploy":
      return "docker-compose";
    case "static-artifact":
      return "static";
    case "buildpack":
      return "auto";
    default:
      return buildStrategy;
  }
}

export function resourceProfileFromDeploymentSnapshot(
  deployment: DeploymentSummary,
): ResourceProfileDriftProfile {
  const execution = deployment.runtimePlan.execution;
  return {
    source: {
      kind: deployment.runtimePlan.source.kind,
      locator: deployment.runtimePlan.source.locator,
      displayName: deployment.runtimePlan.source.displayName,
    },
    runtimeProfile: {
      strategy: buildStrategyToDeploymentMethod(deployment.runtimePlan.buildStrategy),
      ...(execution.installCommand ? { installCommand: execution.installCommand } : {}),
      ...(execution.buildCommand ? { buildCommand: execution.buildCommand } : {}),
      ...(execution.startCommand ? { startCommand: execution.startCommand } : {}),
      ...(execution.healthCheckPath ? { healthCheckPath: execution.healthCheckPath } : {}),
      ...(execution.healthCheck ? { healthCheck: execution.healthCheck } : {}),
      ...(execution.dockerfilePath ? { dockerfilePath: execution.dockerfilePath } : {}),
      ...(execution.composeFile ? { dockerComposeFilePath: execution.composeFile } : {}),
    },
    networkProfile: {
      ...(execution.port ? { internalPort: execution.port } : {}),
      upstreamProtocol: "http",
      exposureMode: execution.accessRoutes?.length ? "reverse-proxy" : "none",
    },
    accessProfile: {
      generatedAccessMode: execution.accessRoutes?.length ? "inherit" : "disabled",
      pathPrefix: execution.accessRoutes?.[0]?.pathPrefix ?? "/",
    },
  };
}

export function resourceProfileFromResourceDetail(
  detail: ResourceDetail,
): ResourceProfileDriftProfile {
  return {
    ...(detail.source ? { source: detail.source } : {}),
    ...(detail.runtimeProfile ? { runtimeProfile: detail.runtimeProfile } : {}),
    ...(detail.networkProfile ? { networkProfile: detail.networkProfile } : {}),
    ...(detail.accessProfile ? { accessProfile: detail.accessProfile } : {}),
  };
}
