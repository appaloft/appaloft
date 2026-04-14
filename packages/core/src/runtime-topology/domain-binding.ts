import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type DeploymentTargetId,
  type DestinationId,
  type DomainBindingId,
  type DomainVerificationAttemptId,
  type EnvironmentId,
  type ProjectId,
  type ResourceId,
} from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { type EdgeProxyKindValue, type TlsModeValue } from "../shared/state-machine";
import { type CreatedAt } from "../shared/temporal";
import {
  type MessageText,
  type PublicDomainName,
  type RoutePathPrefix,
} from "../shared/text-values";
import { ScalarValueObject } from "../shared/value-object";

export const domainBindingStatuses = [
  "requested",
  "pending_verification",
  "bound",
  "certificate_pending",
  "ready",
  "not_ready",
  "failed",
] as const;

export type DomainBindingStatus = (typeof domainBindingStatuses)[number];

export const domainVerificationAttemptStatuses = [
  "requested",
  "pending",
  "verified",
  "failed",
  "retry_scheduled",
] as const;

export type DomainVerificationAttemptStatus = (typeof domainVerificationAttemptStatuses)[number];

export const domainVerificationMethods = ["manual"] as const;

export type DomainVerificationMethod = (typeof domainVerificationMethods)[number];

export const certificatePolicies = ["auto", "manual", "disabled"] as const;

export type CertificatePolicy = (typeof certificatePolicies)[number];

function createLiteralValue<TValue extends string, TObject>(
  value: string,
  allowed: readonly TValue[],
  label: string,
  create: (validated: TValue) => TObject,
): Result<TObject> {
  if (allowed.includes(value as TValue)) {
    return ok(create(value as TValue));
  }

  return err(
    domainError.validation(`${label} must be one of ${allowed.join(", ")}`, {
      value,
    }),
  );
}

const domainBindingStatusBrand: unique symbol = Symbol("DomainBindingStatusValue");
export class DomainBindingStatusValue extends ScalarValueObject<DomainBindingStatus> {
  private [domainBindingStatusBrand]!: void;

  private constructor(value: DomainBindingStatus) {
    super(value);
  }

  static create(value: string): Result<DomainBindingStatusValue> {
    return createLiteralValue(
      value,
      domainBindingStatuses,
      "Domain binding status",
      (validated) => new DomainBindingStatusValue(validated),
    );
  }

  static rehydrate(value: DomainBindingStatus): DomainBindingStatusValue {
    return new DomainBindingStatusValue(value);
  }

  static pendingVerification(): DomainBindingStatusValue {
    return new DomainBindingStatusValue("pending_verification");
  }

  isActive(): boolean {
    return this.value !== "failed";
  }
}

const domainVerificationAttemptStatusBrand: unique symbol = Symbol(
  "DomainVerificationAttemptStatusValue",
);
export class DomainVerificationAttemptStatusValue extends ScalarValueObject<DomainVerificationAttemptStatus> {
  private [domainVerificationAttemptStatusBrand]!: void;

  private constructor(value: DomainVerificationAttemptStatus) {
    super(value);
  }

  static create(value: string): Result<DomainVerificationAttemptStatusValue> {
    return createLiteralValue(
      value,
      domainVerificationAttemptStatuses,
      "Domain verification attempt status",
      (validated) => new DomainVerificationAttemptStatusValue(validated),
    );
  }

  static rehydrate(value: DomainVerificationAttemptStatus): DomainVerificationAttemptStatusValue {
    return new DomainVerificationAttemptStatusValue(value);
  }

  static pending(): DomainVerificationAttemptStatusValue {
    return new DomainVerificationAttemptStatusValue("pending");
  }
}

const domainVerificationMethodBrand: unique symbol = Symbol("DomainVerificationMethodValue");
export class DomainVerificationMethodValue extends ScalarValueObject<DomainVerificationMethod> {
  private [domainVerificationMethodBrand]!: void;

  private constructor(value: DomainVerificationMethod) {
    super(value);
  }

  static create(value: string): Result<DomainVerificationMethodValue> {
    return createLiteralValue(
      value,
      domainVerificationMethods,
      "Domain verification method",
      (validated) => new DomainVerificationMethodValue(validated),
    );
  }

  static rehydrate(value: DomainVerificationMethod): DomainVerificationMethodValue {
    return new DomainVerificationMethodValue(value);
  }

  static manual(): DomainVerificationMethodValue {
    return new DomainVerificationMethodValue("manual");
  }
}

const certificatePolicyBrand: unique symbol = Symbol("CertificatePolicyValue");
export class CertificatePolicyValue extends ScalarValueObject<CertificatePolicy> {
  private [certificatePolicyBrand]!: void;

  private constructor(value: CertificatePolicy) {
    super(value);
  }

  static create(value: string): Result<CertificatePolicyValue> {
    return createLiteralValue(
      value,
      certificatePolicies,
      "Certificate policy",
      (validated) => new CertificatePolicyValue(validated),
    );
  }

  static rehydrate(value: CertificatePolicy): CertificatePolicyValue {
    return new CertificatePolicyValue(value);
  }

  static defaultForTlsMode(tlsMode: TlsModeValue): CertificatePolicyValue {
    return new CertificatePolicyValue(tlsMode.value === "disabled" ? "disabled" : "auto");
  }
}

const idempotencyKeyBrand: unique symbol = Symbol("IdempotencyKeyValue");
export class IdempotencyKeyValue extends ScalarValueObject<string> {
  private [idempotencyKeyBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<IdempotencyKeyValue> {
    const normalized = value.trim();

    if (!normalized) {
      return err(domainError.validation("Idempotency key is required"));
    }

    return ok(new IdempotencyKeyValue(normalized));
  }

  static rehydrate(value: string): IdempotencyKeyValue {
    return new IdempotencyKeyValue(value.trim());
  }

  static fromOptional(value?: string): Result<IdempotencyKeyValue | undefined> {
    const normalized = value?.trim();
    return normalized ? IdempotencyKeyValue.create(normalized) : ok(undefined);
  }
}

export interface DomainVerificationAttemptState {
  id: DomainVerificationAttemptId;
  method: DomainVerificationMethodValue;
  status: DomainVerificationAttemptStatusValue;
  expectedTarget: MessageText;
  createdAt: CreatedAt;
}

export interface DomainBindingState {
  id: DomainBindingId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  resourceId: ResourceId;
  serverId: DeploymentTargetId;
  destinationId: DestinationId;
  domainName: PublicDomainName;
  pathPrefix: RoutePathPrefix;
  proxyKind: EdgeProxyKindValue;
  tlsMode: TlsModeValue;
  certificatePolicy: CertificatePolicyValue;
  status: DomainBindingStatusValue;
  verificationAttempts: DomainVerificationAttemptState[];
  createdAt: CreatedAt;
  idempotencyKey?: IdempotencyKeyValue;
}

export interface DomainBindingVisitor<TContext, TResult> {
  visitDomainBinding(domainBinding: DomainBinding, context: TContext): TResult;
}

export class DomainBinding extends AggregateRoot<DomainBindingState> {
  private constructor(state: DomainBindingState) {
    super(state);
  }

  static create(input: {
    id: DomainBindingId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
    resourceId: ResourceId;
    serverId: DeploymentTargetId;
    destinationId: DestinationId;
    domainName: PublicDomainName;
    pathPrefix: RoutePathPrefix;
    proxyKind: EdgeProxyKindValue;
    tlsMode: TlsModeValue;
    certificatePolicy?: CertificatePolicyValue;
    verificationAttemptId: DomainVerificationAttemptId;
    verificationExpectedTarget: MessageText;
    createdAt: CreatedAt;
    idempotencyKey?: IdempotencyKeyValue;
    correlationId?: string;
    causationId?: string;
  }): Result<DomainBinding> {
    if (input.proxyKind.value === "none") {
      return err(
        domainError.domainBindingProxyRequired({
          phase: "domain-binding-admission",
          proxyKind: input.proxyKind.value,
        }),
      );
    }

    const certificatePolicy =
      input.certificatePolicy ?? CertificatePolicyValue.defaultForTlsMode(input.tlsMode);

    const domainBinding = new DomainBinding({
      id: input.id,
      projectId: input.projectId,
      environmentId: input.environmentId,
      resourceId: input.resourceId,
      serverId: input.serverId,
      destinationId: input.destinationId,
      domainName: input.domainName,
      pathPrefix: input.pathPrefix,
      proxyKind: input.proxyKind,
      tlsMode: input.tlsMode,
      certificatePolicy,
      status: DomainBindingStatusValue.pendingVerification(),
      verificationAttempts: [
        {
          id: input.verificationAttemptId,
          method: DomainVerificationMethodValue.manual(),
          status: DomainVerificationAttemptStatusValue.pending(),
          expectedTarget: input.verificationExpectedTarget,
          createdAt: input.createdAt,
        },
      ],
      createdAt: input.createdAt,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    });

    domainBinding.recordDomainEvent("domain-binding-requested", input.createdAt, {
      domainBindingId: input.id.value,
      projectId: input.projectId.value,
      environmentId: input.environmentId.value,
      resourceId: input.resourceId.value,
      serverId: input.serverId.value,
      destinationId: input.destinationId.value,
      domainName: input.domainName.value,
      pathPrefix: input.pathPrefix.value,
      proxyKind: input.proxyKind.value,
      tlsMode: input.tlsMode.value,
      certificatePolicy: certificatePolicy.value,
      verificationAttemptId: input.verificationAttemptId.value,
      requestedAt: input.createdAt.value,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });

    return ok(domainBinding);
  }

  static rehydrate(state: DomainBindingState): DomainBinding {
    return new DomainBinding({
      ...state,
      verificationAttempts: [...state.verificationAttempts],
    });
  }

  accept<TContext, TResult>(
    visitor: DomainBindingVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitDomainBinding(this, context);
  }

  toState(): DomainBindingState {
    return {
      ...this.state,
      verificationAttempts: [...this.state.verificationAttempts],
    };
  }
}
