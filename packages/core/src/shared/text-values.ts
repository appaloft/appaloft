import { domainError } from "./errors";
import { err, ok, type Result } from "./result";
import { ScalarValueObject } from "./value-object";

function validateRequiredText(value: string, label: string): Result<string> {
  const normalized = value.trim();

  if (!normalized) {
    return err(domainError.validation(`${label} is required`));
  }

  return ok(normalized);
}

function rehydrateRequiredText(value: string): string {
  return value.trim();
}

function validateSlug(value: string, label: string): Result<string> {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return err(domainError.validation(`${label} is required`));
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return err(
      domainError.validation(`${label} must contain only lowercase letters, digits, and hyphens`),
    );
  }

  return ok(normalized);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function createRequiredTextValue<TText>(
  value: string,
  label: string,
  create: (normalized: string) => TText,
): Result<TText> {
  return validateRequiredText(value, label).map(create);
}

function createSlugTextValue<TText>(
  value: string,
  label: string,
  create: (normalized: string) => TText,
): Result<TText> {
  return validateSlug(value, label).map(create);
}

abstract class NonEmptyTextValue extends ScalarValueObject<string> {
  protected constructor(value: string) {
    super(value);
  }
}

const projectNameBrand: unique symbol = Symbol("ProjectName");
export class ProjectName extends NonEmptyTextValue {
  private [projectNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ProjectName> {
    return createRequiredTextValue(
      value,
      "Project name",
      (normalized) => new ProjectName(normalized),
    );
  }

  static rehydrate(value: string): ProjectName {
    return new ProjectName(rehydrateRequiredText(value));
  }
}

const projectSlugBrand: unique symbol = Symbol("ProjectSlug");
export class ProjectSlug extends ScalarValueObject<string> {
  private [projectSlugBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ProjectSlug> {
    return createSlugTextValue(value, "Project slug", (normalized) => new ProjectSlug(normalized));
  }

  static fromName(name: ProjectName): Result<ProjectSlug> {
    return ProjectSlug.create(slugify(name.value));
  }

  static rehydrate(value: string): ProjectSlug {
    return new ProjectSlug(rehydrateRequiredText(value).toLowerCase());
  }
}

const organizationNameBrand: unique symbol = Symbol("OrganizationName");
export class OrganizationName extends NonEmptyTextValue {
  private [organizationNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<OrganizationName> {
    return createRequiredTextValue(
      value,
      "Organization name",
      (normalized) => new OrganizationName(normalized),
    );
  }

  static rehydrate(value: string): OrganizationName {
    return new OrganizationName(rehydrateRequiredText(value));
  }
}

const organizationSlugBrand: unique symbol = Symbol("OrganizationSlug");
export class OrganizationSlug extends ScalarValueObject<string> {
  private [organizationSlugBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<OrganizationSlug> {
    return createSlugTextValue(
      value,
      "Organization slug",
      (normalized) => new OrganizationSlug(normalized),
    );
  }

  static fromName(name: OrganizationName): Result<OrganizationSlug> {
    return OrganizationSlug.create(slugify(name.value));
  }

  static rehydrate(value: string): OrganizationSlug {
    return new OrganizationSlug(rehydrateRequiredText(value).toLowerCase());
  }
}

const environmentNameBrand: unique symbol = Symbol("EnvironmentName");
export class EnvironmentName extends NonEmptyTextValue {
  private [environmentNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<EnvironmentName> {
    return createRequiredTextValue(
      value,
      "Environment name",
      (normalized) => new EnvironmentName(normalized),
    );
  }

  static rehydrate(value: string): EnvironmentName {
    return new EnvironmentName(rehydrateRequiredText(value));
  }
}

const deploymentTargetNameBrand: unique symbol = Symbol("DeploymentTargetName");
export class DeploymentTargetName extends NonEmptyTextValue {
  private [deploymentTargetNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DeploymentTargetName> {
    return createRequiredTextValue(
      value,
      "Deployment target name",
      (normalized) => new DeploymentTargetName(normalized),
    );
  }

  static rehydrate(value: string): DeploymentTargetName {
    return new DeploymentTargetName(rehydrateRequiredText(value));
  }
}

const destinationNameBrand: unique symbol = Symbol("DestinationName");
export class DestinationName extends NonEmptyTextValue {
  private [destinationNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DestinationName> {
    return createRequiredTextValue(
      value,
      "Destination name",
      (normalized) => new DestinationName(normalized),
    );
  }

  static rehydrate(value: string): DestinationName {
    return new DestinationName(rehydrateRequiredText(value));
  }
}

const workloadNameBrand: unique symbol = Symbol("WorkloadName");
export class WorkloadName extends NonEmptyTextValue {
  private [workloadNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<WorkloadName> {
    return createRequiredTextValue(
      value,
      "Workload name",
      (normalized) => new WorkloadName(normalized),
    );
  }

  static rehydrate(value: string): WorkloadName {
    return new WorkloadName(rehydrateRequiredText(value));
  }
}

const resourceNameBrand: unique symbol = Symbol("ResourceName");
export class ResourceName extends NonEmptyTextValue {
  private [resourceNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ResourceName> {
    return createRequiredTextValue(
      value,
      "Resource name",
      (normalized) => new ResourceName(normalized),
    );
  }

  static rehydrate(value: string): ResourceName {
    return new ResourceName(rehydrateRequiredText(value));
  }
}

const resourceSlugBrand: unique symbol = Symbol("ResourceSlug");
export class ResourceSlug extends ScalarValueObject<string> {
  private [resourceSlugBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ResourceSlug> {
    return createSlugTextValue(
      value,
      "Resource slug",
      (normalized) => new ResourceSlug(normalized),
    );
  }

  static fromName(name: ResourceName): Result<ResourceSlug> {
    return ResourceSlug.create(slugify(name.value));
  }

  static rehydrate(value: string): ResourceSlug {
    return new ResourceSlug(rehydrateRequiredText(value).toLowerCase());
  }
}

const resourceServiceNameBrand: unique symbol = Symbol("ResourceServiceName");
export class ResourceServiceName extends NonEmptyTextValue {
  private [resourceServiceNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ResourceServiceName> {
    return createRequiredTextValue(
      value,
      "Resource service name",
      (normalized) => new ResourceServiceName(normalized),
    );
  }

  static rehydrate(value: string): ResourceServiceName {
    return new ResourceServiceName(rehydrateRequiredText(value));
  }
}

const resourceInstanceNameBrand: unique symbol = Symbol("ResourceInstanceName");
export class ResourceInstanceName extends NonEmptyTextValue {
  private [resourceInstanceNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ResourceInstanceName> {
    return createRequiredTextValue(
      value,
      "Resource instance name",
      (normalized) => new ResourceInstanceName(normalized),
    );
  }

  static rehydrate(value: string): ResourceInstanceName {
    return new ResourceInstanceName(rehydrateRequiredText(value));
  }
}

const connectionNameBrand: unique symbol = Symbol("ConnectionName");
export class ConnectionName extends NonEmptyTextValue {
  private [connectionNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ConnectionName> {
    return createRequiredTextValue(
      value,
      "Connection name",
      (normalized) => new ConnectionName(normalized),
    );
  }

  static rehydrate(value: string): ConnectionName {
    return new ConnectionName(rehydrateRequiredText(value));
  }
}

const providerKeyBrand: unique symbol = Symbol("ProviderKey");
export class ProviderKey extends NonEmptyTextValue {
  private [providerKeyBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ProviderKey> {
    return createRequiredTextValue(
      value,
      "Provider key",
      (normalized) => new ProviderKey(normalized),
    );
  }

  static rehydrate(value: string): ProviderKey {
    return new ProviderKey(rehydrateRequiredText(value));
  }
}

const integrationKeyBrand: unique symbol = Symbol("IntegrationKey");
export class IntegrationKey extends NonEmptyTextValue {
  private [integrationKeyBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<IntegrationKey> {
    return createRequiredTextValue(
      value,
      "Integration key",
      (normalized) => new IntegrationKey(normalized),
    );
  }

  static rehydrate(value: string): IntegrationKey {
    return new IntegrationKey(rehydrateRequiredText(value));
  }
}

const pluginNameBrand: unique symbol = Symbol("PluginName");
export class PluginName extends NonEmptyTextValue {
  private [pluginNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<PluginName> {
    return createRequiredTextValue(
      value,
      "Plugin name",
      (normalized) => new PluginName(normalized),
    );
  }

  static rehydrate(value: string): PluginName {
    return new PluginName(rehydrateRequiredText(value));
  }
}

const releaseVersionBrand: unique symbol = Symbol("ReleaseVersion");
export class ReleaseVersion extends NonEmptyTextValue {
  private [releaseVersionBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ReleaseVersion> {
    return createRequiredTextValue(
      value,
      "Release version",
      (normalized) => new ReleaseVersion(normalized),
    );
  }

  static rehydrate(value: string): ReleaseVersion {
    return new ReleaseVersion(rehydrateRequiredText(value));
  }
}

const versionTextBrand: unique symbol = Symbol("VersionText");
export class VersionText extends NonEmptyTextValue {
  private [versionTextBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<VersionText> {
    return createRequiredTextValue(value, "Version", (normalized) => new VersionText(normalized));
  }

  static rehydrate(value: string): VersionText {
    return new VersionText(rehydrateRequiredText(value));
  }
}

const sourceRevisionBrand: unique symbol = Symbol("SourceRevision");
export class SourceRevision extends NonEmptyTextValue {
  private [sourceRevisionBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<SourceRevision> {
    return createRequiredTextValue(
      value,
      "Source revision",
      (normalized) => new SourceRevision(normalized),
    );
  }

  static rehydrate(value: string): SourceRevision {
    return new SourceRevision(rehydrateRequiredText(value));
  }
}

const artifactDigestBrand: unique symbol = Symbol("ArtifactDigest");
export class ArtifactDigest extends NonEmptyTextValue {
  private [artifactDigestBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ArtifactDigest> {
    return createRequiredTextValue(
      value,
      "Artifact digest",
      (normalized) => new ArtifactDigest(normalized),
    );
  }

  static rehydrate(value: string): ArtifactDigest {
    return new ArtifactDigest(rehydrateRequiredText(value));
  }
}

const hostAddressBrand: unique symbol = Symbol("HostAddress");
export class HostAddress extends NonEmptyTextValue {
  private [hostAddressBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<HostAddress> {
    return createRequiredTextValue(value, "Host", (normalized) => new HostAddress(normalized));
  }

  static rehydrate(value: string): HostAddress {
    return new HostAddress(rehydrateRequiredText(value));
  }
}

const deploymentTargetUsernameBrand: unique symbol = Symbol("DeploymentTargetUsername");
export class DeploymentTargetUsername extends NonEmptyTextValue {
  private [deploymentTargetUsernameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DeploymentTargetUsername> {
    return createRequiredTextValue(
      value,
      "Deployment target username",
      (normalized) => new DeploymentTargetUsername(normalized),
    );
  }

  static rehydrate(value: string): DeploymentTargetUsername {
    return new DeploymentTargetUsername(rehydrateRequiredText(value));
  }

  static fromOptional(value?: string): DeploymentTargetUsername | undefined {
    const normalized = validateOptionalText(value);
    return normalized ? new DeploymentTargetUsername(normalized) : undefined;
  }
}

const sshPublicKeyTextBrand: unique symbol = Symbol("SshPublicKeyText");
export class SshPublicKeyText extends NonEmptyTextValue {
  private [sshPublicKeyTextBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<SshPublicKeyText> {
    return createRequiredTextValue(
      value,
      "SSH public key",
      (normalized) => new SshPublicKeyText(normalized),
    );
  }

  static rehydrate(value: string): SshPublicKeyText {
    return new SshPublicKeyText(rehydrateRequiredText(value));
  }

  static fromOptional(value?: string): SshPublicKeyText | undefined {
    const normalized = validateOptionalText(value);
    return normalized ? new SshPublicKeyText(normalized) : undefined;
  }
}

const sshPrivateKeyTextBrand: unique symbol = Symbol("SshPrivateKeyText");
export class SshPrivateKeyText extends NonEmptyTextValue {
  private [sshPrivateKeyTextBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<SshPrivateKeyText> {
    return createRequiredTextValue(
      value,
      "SSH private key",
      (normalized) => new SshPrivateKeyText(normalized),
    );
  }

  static rehydrate(value: string): SshPrivateKeyText {
    return new SshPrivateKeyText(rehydrateRequiredText(value));
  }
}

const aliasTextBrand: unique symbol = Symbol("AliasText");
export class AliasText extends NonEmptyTextValue {
  private [aliasTextBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AliasText> {
    return createRequiredTextValue(value, "Alias", (normalized) => new AliasText(normalized));
  }

  static rehydrate(value: string): AliasText {
    return new AliasText(rehydrateRequiredText(value));
  }
}

const descriptionTextBrand: unique symbol = Symbol("DescriptionText");
export class DescriptionText extends NonEmptyTextValue {
  private [descriptionTextBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DescriptionText> {
    return createRequiredTextValue(
      value,
      "Description",
      (normalized) => new DescriptionText(normalized),
    );
  }

  static rehydrate(value: string): DescriptionText {
    return new DescriptionText(rehydrateRequiredText(value));
  }

  static fromOptional(value?: string): DescriptionText | undefined {
    const normalized = validateOptionalText(value);
    return normalized ? new DescriptionText(normalized) : undefined;
  }
}

const endpointTextBrand: unique symbol = Symbol("EndpointText");
export class EndpointText extends NonEmptyTextValue {
  private [endpointTextBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<EndpointText> {
    return createRequiredTextValue(value, "Endpoint", (normalized) => new EndpointText(normalized));
  }

  static rehydrate(value: string): EndpointText {
    return new EndpointText(rehydrateRequiredText(value));
  }

  static fromOptional(value?: string): EndpointText | undefined {
    const normalized = validateOptionalText(value);
    return normalized ? new EndpointText(normalized) : undefined;
  }
}

const externalAccountIdBrand: unique symbol = Symbol("ExternalAccountId");
export class ExternalAccountId extends NonEmptyTextValue {
  private [externalAccountIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ExternalAccountId> {
    return createRequiredTextValue(
      value,
      "External account ID",
      (normalized) => new ExternalAccountId(normalized),
    );
  }

  static rehydrate(value: string): ExternalAccountId {
    return new ExternalAccountId(rehydrateRequiredText(value));
  }

  static fromOptional(value?: string): ExternalAccountId | undefined {
    const normalized = validateOptionalText(value);
    return normalized ? new ExternalAccountId(normalized) : undefined;
  }
}

const configReferenceBrand: unique symbol = Symbol("ConfigReference");
export class ConfigReference extends NonEmptyTextValue {
  private [configReferenceBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ConfigReference> {
    return createRequiredTextValue(
      value,
      "Config reference",
      (normalized) => new ConfigReference(normalized),
    );
  }

  static rehydrate(value: string): ConfigReference {
    return new ConfigReference(rehydrateRequiredText(value));
  }

  static fromOptional(value?: string): ConfigReference | undefined {
    const normalized = validateOptionalText(value);
    return normalized ? new ConfigReference(normalized) : undefined;
  }
}

const apiVersionBrand: unique symbol = Symbol("ApiVersionText");
export class ApiVersionText extends NonEmptyTextValue {
  private [apiVersionBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ApiVersionText> {
    return createRequiredTextValue(
      value,
      "API version",
      (normalized) => new ApiVersionText(normalized),
    );
  }

  static rehydrate(value: string): ApiVersionText {
    return new ApiVersionText(rehydrateRequiredText(value));
  }
}

const ownerIdBrand: unique symbol = Symbol("OwnerId");
export class OwnerId extends NonEmptyTextValue {
  private [ownerIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<OwnerId> {
    return createRequiredTextValue(value, "Owner ID", (normalized) => new OwnerId(normalized));
  }

  static rehydrate(value: string): OwnerId {
    return new OwnerId(rehydrateRequiredText(value));
  }
}

const messageTextBrand: unique symbol = Symbol("MessageText");
export class MessageText extends NonEmptyTextValue {
  private [messageTextBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<MessageText> {
    return createRequiredTextValue(value, "Message", (normalized) => new MessageText(normalized));
  }

  static rehydrate(value: string): MessageText {
    return new MessageText(rehydrateRequiredText(value));
  }
}

const detectSummaryBrand: unique symbol = Symbol("DetectSummary");
export class DetectSummary extends NonEmptyTextValue {
  private [detectSummaryBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DetectSummary> {
    return createRequiredTextValue(
      value,
      "Detect summary",
      (normalized) => new DetectSummary(normalized),
    );
  }

  static rehydrate(value: string): DetectSummary {
    return new DetectSummary(rehydrateRequiredText(value));
  }
}

const planStepTextBrand: unique symbol = Symbol("PlanStepText");
export class PlanStepText extends NonEmptyTextValue {
  private [planStepTextBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<PlanStepText> {
    return createRequiredTextValue(
      value,
      "Plan step",
      (normalized) => new PlanStepText(normalized),
    );
  }

  static rehydrate(value: string): PlanStepText {
    return new PlanStepText(rehydrateRequiredText(value));
  }
}

const commandTextBrand: unique symbol = Symbol("CommandText");
export class CommandText extends NonEmptyTextValue {
  private [commandTextBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CommandText> {
    return createRequiredTextValue(value, "Command", (normalized) => new CommandText(normalized));
  }

  static rehydrate(value: string): CommandText {
    return new CommandText(rehydrateRequiredText(value));
  }

  static fromOptional(value?: string): CommandText | undefined {
    const normalized = validateOptionalText(value);
    return normalized ? new CommandText(normalized) : undefined;
  }
}

const configKeyBrand: unique symbol = Symbol("ConfigKey");
export class ConfigKey extends NonEmptyTextValue {
  private [configKeyBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ConfigKey> {
    return createRequiredTextValue(value, "Config key", (normalized) => new ConfigKey(normalized));
  }

  static rehydrate(value: string): ConfigKey {
    return new ConfigKey(rehydrateRequiredText(value));
  }
}

const configValueBrand: unique symbol = Symbol("ConfigValueText");
export class ConfigValueText extends NonEmptyTextValue {
  private [configValueBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ConfigValueText> {
    return createRequiredTextValue(
      value,
      "Config value",
      (normalized) => new ConfigValueText(normalized),
    );
  }

  static rehydrate(value: string): ConfigValueText {
    return new ConfigValueText(rehydrateRequiredText(value));
  }
}

const sourceLocatorBrand: unique symbol = Symbol("SourceLocator");
export class SourceLocator extends NonEmptyTextValue {
  private [sourceLocatorBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<SourceLocator> {
    return createRequiredTextValue(
      value,
      "Source locator",
      (normalized) => new SourceLocator(normalized),
    );
  }

  static rehydrate(value: string): SourceLocator {
    return new SourceLocator(rehydrateRequiredText(value));
  }
}

const displayNameBrand: unique symbol = Symbol("DisplayNameText");
export class DisplayNameText extends NonEmptyTextValue {
  private [displayNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DisplayNameText> {
    return createRequiredTextValue(
      value,
      "Display name",
      (normalized) => new DisplayNameText(normalized),
    );
  }

  static rehydrate(value: string): DisplayNameText {
    return new DisplayNameText(rehydrateRequiredText(value));
  }
}

const filePathBrand: unique symbol = Symbol("FilePathText");
export class FilePathText extends NonEmptyTextValue {
  private [filePathBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<FilePathText> {
    return createRequiredTextValue(
      value,
      "File path",
      (normalized) => new FilePathText(normalized),
    );
  }

  static rehydrate(value: string): FilePathText {
    return new FilePathText(rehydrateRequiredText(value));
  }

  static fromOptional(value?: string): FilePathText | undefined {
    const normalized = validateOptionalText(value);
    return normalized ? new FilePathText(normalized) : undefined;
  }
}

const imageReferenceBrand: unique symbol = Symbol("ImageReference");
export class ImageReference extends NonEmptyTextValue {
  private [imageReferenceBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ImageReference> {
    return createRequiredTextValue(
      value,
      "Image reference",
      (normalized) => new ImageReference(normalized),
    );
  }

  static rehydrate(value: string): ImageReference {
    return new ImageReference(rehydrateRequiredText(value));
  }

  static fromOptional(value?: string): ImageReference | undefined {
    const normalized = validateOptionalText(value);
    return normalized ? new ImageReference(normalized) : undefined;
  }
}

const healthCheckPathBrand: unique symbol = Symbol("HealthCheckPathText");
export class HealthCheckPathText extends NonEmptyTextValue {
  private [healthCheckPathBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<HealthCheckPathText> {
    return createRequiredTextValue(
      value,
      "Health check path",
      (normalized) => new HealthCheckPathText(normalized),
    );
  }

  static rehydrate(value: string): HealthCheckPathText {
    return new HealthCheckPathText(rehydrateRequiredText(value));
  }

  static fromOptional(value?: string): HealthCheckPathText | undefined {
    const normalized = validateOptionalText(value);
    return normalized ? new HealthCheckPathText(normalized) : undefined;
  }
}

function validateRoutePathPrefix(value: string): Result<string> {
  return validateRequiredText(value, "Route path prefix").andThen((normalized) => {
    if (!normalized.startsWith("/")) {
      return err(domainError.validation("Route path prefix must start with /"));
    }

    return ok(normalized);
  });
}

function validatePublicDomainName(value: string): Result<string> {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return err(domainError.validation("Public domain name is required"));
  }

  if (normalized.includes("://") || normalized.includes("/") || normalized.includes(":")) {
    return err(domainError.validation("Public domain name must not include scheme, path, or port"));
  }

  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(normalized)
  ) {
    return err(domainError.validation("Public domain name must be a valid DNS hostname"));
  }

  return ok(normalized);
}

const routePathPrefixBrand: unique symbol = Symbol("RoutePathPrefix");
export class RoutePathPrefix extends NonEmptyTextValue {
  private [routePathPrefixBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<RoutePathPrefix> {
    return validateRoutePathPrefix(value).map((normalized) => new RoutePathPrefix(normalized));
  }

  static rehydrate(value: string): RoutePathPrefix {
    return new RoutePathPrefix(rehydrateRequiredText(value));
  }
}

const publicDomainNameBrand: unique symbol = Symbol("PublicDomainName");
export class PublicDomainName extends NonEmptyTextValue {
  private [publicDomainNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<PublicDomainName> {
    return validatePublicDomainName(value).map((normalized) => new PublicDomainName(normalized));
  }

  static rehydrate(value: string): PublicDomainName {
    return new PublicDomainName(rehydrateRequiredText(value).toLowerCase());
  }
}

const errorCodeBrand: unique symbol = Symbol("ErrorCodeText");
export class ErrorCodeText extends NonEmptyTextValue {
  private [errorCodeBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ErrorCodeText> {
    return createRequiredTextValue(
      value,
      "Error code",
      (normalized) => new ErrorCodeText(normalized),
    );
  }

  static rehydrate(value: string): ErrorCodeText {
    return new ErrorCodeText(rehydrateRequiredText(value));
  }

  static fromOptional(value?: string): ErrorCodeText | undefined {
    const normalized = validateOptionalText(value);
    return normalized ? new ErrorCodeText(normalized) : undefined;
  }
}
