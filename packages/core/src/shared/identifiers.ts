import { domainError } from "./errors";
import { err, ok, type Result } from "./result";
import { ScalarValueObject } from "./value-object";

function validateIdentifier(value: string, label: string): Result<string> {
  const normalized = value.trim();

  if (!normalized) {
    return err(domainError.validation(`${label} is required`));
  }

  return ok(normalized);
}

function createIdentifierValue<TIdentifier extends IdentifierValue>(
  value: string,
  label: string,
  create: (normalized: string) => TIdentifier,
): Result<TIdentifier> {
  return validateIdentifier(value, label).map(create);
}

export abstract class IdentifierValue extends ScalarValueObject<string> {
  protected constructor(value: string) {
    super(value);
  }
}

const projectIdBrand: unique symbol = Symbol("ProjectId");
export class ProjectId extends IdentifierValue {
  private [projectIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ProjectId> {
    return createIdentifierValue(value, "Project ID", (normalized) => new ProjectId(normalized));
  }

  static rehydrate(value: string): ProjectId {
    return new ProjectId(value.trim());
  }
}

const environmentIdBrand: unique symbol = Symbol("EnvironmentId");
export class EnvironmentId extends IdentifierValue {
  private [environmentIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<EnvironmentId> {
    return createIdentifierValue(
      value,
      "Environment ID",
      (normalized) => new EnvironmentId(normalized),
    );
  }

  static rehydrate(value: string): EnvironmentId {
    return new EnvironmentId(value.trim());
  }
}

const deploymentTargetIdBrand: unique symbol = Symbol("DeploymentTargetId");
export class DeploymentTargetId extends IdentifierValue {
  private [deploymentTargetIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DeploymentTargetId> {
    return createIdentifierValue(
      value,
      "Deployment target ID",
      (normalized) => new DeploymentTargetId(normalized),
    );
  }

  static rehydrate(value: string): DeploymentTargetId {
    return new DeploymentTargetId(value.trim());
  }
}

const sshCredentialIdBrand: unique symbol = Symbol("SshCredentialId");
export class SshCredentialId extends IdentifierValue {
  private [sshCredentialIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<SshCredentialId> {
    return createIdentifierValue(
      value,
      "SSH credential ID",
      (normalized) => new SshCredentialId(normalized),
    );
  }

  static rehydrate(value: string): SshCredentialId {
    return new SshCredentialId(value.trim());
  }
}

const destinationIdBrand: unique symbol = Symbol("DestinationId");
export class DestinationId extends IdentifierValue {
  private [destinationIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DestinationId> {
    return createIdentifierValue(
      value,
      "Destination ID",
      (normalized) => new DestinationId(normalized),
    );
  }

  static rehydrate(value: string): DestinationId {
    return new DestinationId(value.trim());
  }
}

const deploymentIdBrand: unique symbol = Symbol("DeploymentId");
export class DeploymentId extends IdentifierValue {
  private [deploymentIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DeploymentId> {
    return createIdentifierValue(
      value,
      "Deployment ID",
      (normalized) => new DeploymentId(normalized),
    );
  }

  static rehydrate(value: string): DeploymentId {
    return new DeploymentId(value.trim());
  }
}

const releaseIdBrand: unique symbol = Symbol("ReleaseId");
export class ReleaseId extends IdentifierValue {
  private [releaseIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ReleaseId> {
    return createIdentifierValue(value, "Release ID", (normalized) => new ReleaseId(normalized));
  }

  static rehydrate(value: string): ReleaseId {
    return new ReleaseId(value.trim());
  }
}

const workloadIdBrand: unique symbol = Symbol("WorkloadId");
export class WorkloadId extends IdentifierValue {
  private [workloadIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<WorkloadId> {
    return createIdentifierValue(value, "Workload ID", (normalized) => new WorkloadId(normalized));
  }

  static rehydrate(value: string): WorkloadId {
    return new WorkloadId(value.trim());
  }
}

const resourceIdBrand: unique symbol = Symbol("ResourceId");
export class ResourceId extends IdentifierValue {
  private [resourceIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ResourceId> {
    return createIdentifierValue(value, "Resource ID", (normalized) => new ResourceId(normalized));
  }

  static rehydrate(value: string): ResourceId {
    return new ResourceId(value.trim());
  }
}

const storageVolumeIdBrand: unique symbol = Symbol("StorageVolumeId");
export class StorageVolumeId extends IdentifierValue {
  private [storageVolumeIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StorageVolumeId> {
    return createIdentifierValue(
      value,
      "Storage volume ID",
      (normalized) => new StorageVolumeId(normalized),
    );
  }

  static rehydrate(value: string): StorageVolumeId {
    return new StorageVolumeId(value.trim());
  }
}

const resourceStorageAttachmentIdBrand: unique symbol = Symbol("ResourceStorageAttachmentId");
export class ResourceStorageAttachmentId extends IdentifierValue {
  private [resourceStorageAttachmentIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ResourceStorageAttachmentId> {
    return createIdentifierValue(
      value,
      "Resource storage attachment ID",
      (normalized) => new ResourceStorageAttachmentId(normalized),
    );
  }

  static rehydrate(value: string): ResourceStorageAttachmentId {
    return new ResourceStorageAttachmentId(value.trim());
  }
}

const resourceInstanceIdBrand: unique symbol = Symbol("ResourceInstanceId");
export class ResourceInstanceId extends IdentifierValue {
  private [resourceInstanceIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ResourceInstanceId> {
    return createIdentifierValue(
      value,
      "Resource instance ID",
      (normalized) => new ResourceInstanceId(normalized),
    );
  }

  static rehydrate(value: string): ResourceInstanceId {
    return new ResourceInstanceId(value.trim());
  }
}

const resourceBindingIdBrand: unique symbol = Symbol("ResourceBindingId");
export class ResourceBindingId extends IdentifierValue {
  private [resourceBindingIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ResourceBindingId> {
    return createIdentifierValue(
      value,
      "Resource binding ID",
      (normalized) => new ResourceBindingId(normalized),
    );
  }

  static rehydrate(value: string): ResourceBindingId {
    return new ResourceBindingId(value.trim());
  }
}

const domainBindingIdBrand: unique symbol = Symbol("DomainBindingId");
export class DomainBindingId extends IdentifierValue {
  private [domainBindingIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DomainBindingId> {
    return createIdentifierValue(
      value,
      "Domain binding ID",
      (normalized) => new DomainBindingId(normalized),
    );
  }

  static rehydrate(value: string): DomainBindingId {
    return new DomainBindingId(value.trim());
  }
}

const domainVerificationAttemptIdBrand: unique symbol = Symbol("DomainVerificationAttemptId");
export class DomainVerificationAttemptId extends IdentifierValue {
  private [domainVerificationAttemptIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DomainVerificationAttemptId> {
    return createIdentifierValue(
      value,
      "Domain verification attempt ID",
      (normalized) => new DomainVerificationAttemptId(normalized),
    );
  }

  static rehydrate(value: string): DomainVerificationAttemptId {
    return new DomainVerificationAttemptId(value.trim());
  }
}

const certificateIdBrand: unique symbol = Symbol("CertificateId");
export class CertificateId extends IdentifierValue {
  private [certificateIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateId> {
    return createIdentifierValue(
      value,
      "Certificate ID",
      (normalized) => new CertificateId(normalized),
    );
  }

  static rehydrate(value: string): CertificateId {
    return new CertificateId(value.trim());
  }
}

const certificateAttemptIdBrand: unique symbol = Symbol("CertificateAttemptId");
export class CertificateAttemptId extends IdentifierValue {
  private [certificateAttemptIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateAttemptId> {
    return createIdentifierValue(
      value,
      "Certificate attempt ID",
      (normalized) => new CertificateAttemptId(normalized),
    );
  }

  static rehydrate(value: string): CertificateAttemptId {
    return new CertificateAttemptId(value.trim());
  }
}

const organizationIdBrand: unique symbol = Symbol("OrganizationId");
export class OrganizationId extends IdentifierValue {
  private [organizationIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<OrganizationId> {
    return createIdentifierValue(
      value,
      "Organization ID",
      (normalized) => new OrganizationId(normalized),
    );
  }

  static rehydrate(value: string): OrganizationId {
    return new OrganizationId(value.trim());
  }
}

const organizationMemberIdBrand: unique symbol = Symbol("OrganizationMemberId");
export class OrganizationMemberId extends IdentifierValue {
  private [organizationMemberIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<OrganizationMemberId> {
    return createIdentifierValue(
      value,
      "Organization member ID",
      (normalized) => new OrganizationMemberId(normalized),
    );
  }

  static rehydrate(value: string): OrganizationMemberId {
    return new OrganizationMemberId(value.trim());
  }
}

const userIdBrand: unique symbol = Symbol("UserId");
export class UserId extends IdentifierValue {
  private [userIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<UserId> {
    return createIdentifierValue(value, "User ID", (normalized) => new UserId(normalized));
  }

  static rehydrate(value: string): UserId {
    return new UserId(value.trim());
  }
}

const providerConnectionIdBrand: unique symbol = Symbol("ProviderConnectionId");
export class ProviderConnectionId extends IdentifierValue {
  private [providerConnectionIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ProviderConnectionId> {
    return createIdentifierValue(
      value,
      "Provider connection ID",
      (normalized) => new ProviderConnectionId(normalized),
    );
  }

  static rehydrate(value: string): ProviderConnectionId {
    return new ProviderConnectionId(value.trim());
  }
}

const integrationConnectionIdBrand: unique symbol = Symbol("IntegrationConnectionId");
export class IntegrationConnectionId extends IdentifierValue {
  private [integrationConnectionIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<IntegrationConnectionId> {
    return createIdentifierValue(
      value,
      "Integration connection ID",
      (normalized) => new IntegrationConnectionId(normalized),
    );
  }

  static rehydrate(value: string): IntegrationConnectionId {
    return new IntegrationConnectionId(value.trim());
  }
}

const pluginInstallationIdBrand: unique symbol = Symbol("PluginInstallationId");
export class PluginInstallationId extends IdentifierValue {
  private [pluginInstallationIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<PluginInstallationId> {
    return createIdentifierValue(
      value,
      "Plugin installation ID",
      (normalized) => new PluginInstallationId(normalized),
    );
  }

  static rehydrate(value: string): PluginInstallationId {
    return new PluginInstallationId(value.trim());
  }
}

const runtimePlanIdBrand: unique symbol = Symbol("RuntimePlanId");
export class RuntimePlanId extends IdentifierValue {
  private [runtimePlanIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<RuntimePlanId> {
    return createIdentifierValue(
      value,
      "Runtime plan ID",
      (normalized) => new RuntimePlanId(normalized),
    );
  }

  static rehydrate(value: string): RuntimePlanId {
    return new RuntimePlanId(value.trim());
  }
}

const environmentSnapshotIdBrand: unique symbol = Symbol("EnvironmentSnapshotId");
export class EnvironmentSnapshotId extends IdentifierValue {
  private [environmentSnapshotIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<EnvironmentSnapshotId> {
    return createIdentifierValue(
      value,
      "Environment snapshot ID",
      (normalized) => new EnvironmentSnapshotId(normalized),
    );
  }

  static rehydrate(value: string): EnvironmentSnapshotId {
    return new EnvironmentSnapshotId(value.trim());
  }
}

const rollbackPlanIdBrand: unique symbol = Symbol("RollbackPlanId");
export class RollbackPlanId extends IdentifierValue {
  private [rollbackPlanIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<RollbackPlanId> {
    return createIdentifierValue(
      value,
      "Rollback plan ID",
      (normalized) => new RollbackPlanId(normalized),
    );
  }

  static rehydrate(value: string): RollbackPlanId {
    return new RollbackPlanId(value.trim());
  }
}
