import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type DeploymentId,
  type DeploymentTargetId,
  type DestinationId,
  type DomainBindingId,
  type DomainVerificationAttemptId,
  type EnvironmentId,
  type ProjectId,
  type ResourceId,
} from "../shared/identifiers";
import { CanonicalRedirectStatusCode } from "../shared/numeric-values";
import { err, ok, type Result } from "../shared/result";
import { type EdgeProxyKindValue, type TlsModeValue } from "../shared/state-machine";
import { type CreatedAt } from "../shared/temporal";
import {
  type ErrorCodeText,
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
  "deleted",
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

export const domainDnsObservationStatuses = [
  "pending",
  "matched",
  "mismatch",
  "unresolved",
  "lookup_failed",
  "skipped",
] as const;

export type DomainDnsObservationStatus = (typeof domainDnsObservationStatuses)[number];

export const certificatePolicies = ["auto", "manual", "disabled"] as const;

export type CertificatePolicy = (typeof certificatePolicies)[number];

export const domainRouteFailurePhases = [
  "proxy-route-realization",
  "proxy-reload",
  "public-route-verification",
] as const;

export type DomainRouteFailurePhase = (typeof domainRouteFailurePhases)[number];

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
    return this.value !== "failed" && this.value !== "deleted";
  }

  isDeleted(): boolean {
    return this.value === "deleted";
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

const domainDnsObservationStatusBrand: unique symbol = Symbol("DomainDnsObservationStatusValue");
export class DomainDnsObservationStatusValue extends ScalarValueObject<DomainDnsObservationStatus> {
  private [domainDnsObservationStatusBrand]!: void;

  private constructor(value: DomainDnsObservationStatus) {
    super(value);
  }

  static create(value: string): Result<DomainDnsObservationStatusValue> {
    return createLiteralValue(
      value,
      domainDnsObservationStatuses,
      "Domain DNS observation status",
      (validated) => new DomainDnsObservationStatusValue(validated),
    );
  }

  static rehydrate(value: DomainDnsObservationStatus): DomainDnsObservationStatusValue {
    return new DomainDnsObservationStatusValue(value);
  }

  static pending(): DomainDnsObservationStatusValue {
    return new DomainDnsObservationStatusValue("pending");
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

const domainRouteFailurePhaseBrand: unique symbol = Symbol("DomainRouteFailurePhaseValue");
export class DomainRouteFailurePhaseValue extends ScalarValueObject<DomainRouteFailurePhase> {
  private [domainRouteFailurePhaseBrand]!: void;

  private constructor(value: DomainRouteFailurePhase) {
    super(value);
  }

  static create(value: string): Result<DomainRouteFailurePhaseValue> {
    return createLiteralValue(
      value,
      domainRouteFailurePhases,
      "Domain route failure phase",
      (validated) => new DomainRouteFailurePhaseValue(validated),
    );
  }

  static rehydrate(value: DomainRouteFailurePhase): DomainRouteFailurePhaseValue {
    return new DomainRouteFailurePhaseValue(value);
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

export interface DomainRouteFailureState {
  deploymentId: DeploymentId;
  failedAt: CreatedAt;
  errorCode: ErrorCodeText;
  failurePhase: DomainRouteFailurePhaseValue;
  retriable: boolean;
  errorMessage?: MessageText;
}

export interface DomainDnsObservationState {
  status: DomainDnsObservationStatusValue;
  expectedTargets: MessageText[];
  observedTargets: MessageText[];
  checkedAt?: CreatedAt;
  message?: MessageText;
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
  redirectTo?: PublicDomainName;
  redirectStatus?: CanonicalRedirectStatusCode;
  certificatePolicy: CertificatePolicyValue;
  status: DomainBindingStatusValue;
  verificationAttempts: DomainVerificationAttemptState[];
  dnsObservation?: DomainDnsObservationState;
  routeFailure?: DomainRouteFailureState;
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
    redirectTo?: PublicDomainName;
    redirectStatus?: CanonicalRedirectStatusCode;
    certificatePolicy?: CertificatePolicyValue;
    verificationAttemptId: DomainVerificationAttemptId;
    verificationExpectedTarget: MessageText;
    dnsExpectedTargets?: MessageText[];
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

    if (input.redirectStatus && !input.redirectTo) {
      return err(
        domainError.validation("Domain binding redirect status requires redirect target", {
          phase: "domain-binding-admission",
          domainName: input.domainName.value,
        }),
      );
    }

    if (input.redirectTo && input.redirectTo.value === input.domainName.value) {
      return err(
        domainError.validation("Domain binding canonical redirect cannot point to itself", {
          phase: "domain-binding-admission",
          domainName: input.domainName.value,
          redirectTo: input.redirectTo.value,
        }),
      );
    }

    const certificatePolicy =
      input.certificatePolicy ?? CertificatePolicyValue.defaultForTlsMode(input.tlsMode);
    const redirectStatus = input.redirectTo
      ? (input.redirectStatus ?? CanonicalRedirectStatusCode.rehydrate(308))
      : undefined;

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
      ...(input.redirectTo ? { redirectTo: input.redirectTo } : {}),
      ...(redirectStatus ? { redirectStatus } : {}),
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
      ...(input.dnsExpectedTargets
        ? {
            dnsObservation: {
              status: DomainDnsObservationStatusValue.pending(),
              expectedTargets: [...input.dnsExpectedTargets],
              observedTargets: [],
              checkedAt: input.createdAt,
            },
          }
        : {}),
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
      ...(input.redirectTo
        ? {
            redirectTo: input.redirectTo.value,
            redirectStatus: redirectStatus?.value ?? 308,
          }
        : {}),
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
      ...(state.dnsObservation
        ? {
            dnsObservation: {
              ...state.dnsObservation,
              expectedTargets: [...state.dnsObservation.expectedTargets],
              observedTargets: [...state.dnsObservation.observedTargets],
            },
          }
        : {}),
    });
  }

  recordDnsObservation(input: {
    status: DomainDnsObservationStatusValue;
    observedTargets?: MessageText[];
    checkedAt: CreatedAt;
    expectedTargets?: MessageText[];
    message?: MessageText;
  }): Result<void> {
    const current = this.state.dnsObservation;
    const expectedTargets = input.expectedTargets ?? current?.expectedTargets ?? [];

    this.state.dnsObservation = {
      status: input.status,
      expectedTargets: [...expectedTargets],
      observedTargets: [...(input.observedTargets ?? [])],
      checkedAt: input.checkedAt,
      ...(input.message ? { message: input.message } : {}),
    };

    return ok(undefined);
  }

  confirmOwnership(input: {
    confirmedAt: CreatedAt;
    verificationAttemptId?: DomainVerificationAttemptId;
    correlationId?: string;
    causationId?: string;
  }): Result<{ verificationAttemptId: DomainVerificationAttemptId }> {
    let existingAttemptIndex = -1;
    const requestedAttemptId = input.verificationAttemptId;

    if (requestedAttemptId) {
      existingAttemptIndex = this.state.verificationAttempts.findIndex((attempt) =>
        attempt.id.equals(requestedAttemptId),
      );
    } else {
      for (let index = this.state.verificationAttempts.length - 1; index >= 0; index -= 1) {
        const attempt = this.state.verificationAttempts[index];
        if (attempt?.method.value === "manual" && attempt.status.value === "pending") {
          existingAttemptIndex = index;
          break;
        }
      }
    }

    if (existingAttemptIndex < 0) {
      return err(
        domainError.domainVerificationNotPending("No pending manual verification attempt exists", {
          phase: "domain-verification",
          domainBindingId: this.state.id.value,
          ...(requestedAttemptId ? { verificationAttemptId: requestedAttemptId.value } : {}),
          relatedState: this.state.status.value,
        }),
      );
    }

    const attempt = this.state.verificationAttempts[existingAttemptIndex];
    if (!attempt) {
      return err(
        domainError.domainVerificationNotPending("No pending manual verification attempt exists", {
          phase: "domain-verification",
          domainBindingId: this.state.id.value,
          relatedState: this.state.status.value,
        }),
      );
    }

    if (attempt.status.value === "verified" && this.state.status.value === "bound") {
      return ok({ verificationAttemptId: attempt.id });
    }

    if (attempt.status.value !== "pending" || attempt.method.value !== "manual") {
      return err(
        domainError.domainVerificationNotPending(
          "Verification attempt is not pending manual confirmation",
          {
            phase: "domain-verification",
            domainBindingId: this.state.id.value,
            verificationAttemptId: attempt.id.value,
            relatedState: attempt.status.value,
          },
        ),
      );
    }

    if (this.state.status.value !== "pending_verification") {
      return err(
        domainError.invariant("Domain binding cannot be marked bound from its current state", {
          phase: "domain-verification",
          domainBindingId: this.state.id.value,
          verificationAttemptId: attempt.id.value,
          relatedState: this.state.status.value,
        }),
      );
    }

    const nextVerificationAttempts = this.state.verificationAttempts.map((candidate, index) =>
      index === existingAttemptIndex
        ? {
            ...candidate,
            status: DomainVerificationAttemptStatusValue.rehydrate("verified"),
          }
        : candidate,
    );

    this.state.status = DomainBindingStatusValue.rehydrate("bound");
    this.state.verificationAttempts = nextVerificationAttempts;

    this.recordDomainEvent("domain-bound", input.confirmedAt, {
      domainBindingId: this.state.id.value,
      domainName: this.state.domainName.value,
      pathPrefix: this.state.pathPrefix.value,
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      resourceId: this.state.resourceId.value,
      serverId: this.state.serverId.value,
      destinationId: this.state.destinationId.value,
      proxyKind: this.state.proxyKind.value,
      tlsMode: this.state.tlsMode.value,
      certificatePolicy: this.state.certificatePolicy.value,
      boundAt: input.confirmedAt.value,
      verificationAttemptId: attempt.id.value,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });

    return ok({ verificationAttemptId: attempt.id });
  }

  markReady(input: {
    readyAt: CreatedAt;
    correlationId?: string;
    causationId?: string;
  }): Result<void> {
    if (this.state.status.value === "ready") {
      return ok(undefined);
    }

    if (
      this.state.status.value !== "bound" &&
      this.state.status.value !== "certificate_pending" &&
      this.state.status.value !== "not_ready"
    ) {
      return err(
        domainError.invariant("Domain binding cannot be marked ready from its current state", {
          phase: "domain-ready",
          domainBindingId: this.state.id.value,
          relatedState: this.state.status.value,
        }),
      );
    }

    this.state.status = DomainBindingStatusValue.rehydrate("ready");
    delete this.state.routeFailure;

    this.recordDomainEvent("domain-ready", input.readyAt, {
      domainBindingId: this.state.id.value,
      domainName: this.state.domainName.value,
      pathPrefix: this.state.pathPrefix.value,
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      resourceId: this.state.resourceId.value,
      serverId: this.state.serverId.value,
      destinationId: this.state.destinationId.value,
      proxyKind: this.state.proxyKind.value,
      tlsMode: this.state.tlsMode.value,
      certificatePolicy: this.state.certificatePolicy.value,
      readyAt: input.readyAt.value,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });

    return ok(undefined);
  }

  markRouteRealizationFailed(input: {
    deploymentId: DeploymentId;
    failedAt: CreatedAt;
    errorCode: ErrorCodeText;
    failurePhase: DomainRouteFailurePhaseValue;
    retriable: boolean;
    errorMessage?: MessageText;
    correlationId?: string;
    causationId?: string;
  }): Result<void> {
    if (
      this.state.status.value !== "bound" &&
      this.state.status.value !== "certificate_pending" &&
      this.state.status.value !== "ready" &&
      this.state.status.value !== "not_ready"
    ) {
      return ok(undefined);
    }

    const existingFailure = this.state.routeFailure;
    if (
      this.state.status.value === "not_ready" &&
      existingFailure?.deploymentId.equals(input.deploymentId) &&
      existingFailure.failurePhase.equals(input.failurePhase)
    ) {
      return ok(undefined);
    }

    this.state.status = DomainBindingStatusValue.rehydrate("not_ready");
    this.state.routeFailure = {
      deploymentId: input.deploymentId,
      failedAt: input.failedAt,
      errorCode: input.errorCode,
      failurePhase: input.failurePhase,
      retriable: input.retriable,
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
    };

    this.recordDomainEvent("domain-route-realization-failed", input.failedAt, {
      domainBindingId: this.state.id.value,
      domainName: this.state.domainName.value,
      pathPrefix: this.state.pathPrefix.value,
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      resourceId: this.state.resourceId.value,
      serverId: this.state.serverId.value,
      destinationId: this.state.destinationId.value,
      deploymentId: input.deploymentId.value,
      failedAt: input.failedAt.value,
      errorCode: input.errorCode.value,
      failurePhase: input.failurePhase.value,
      retriable: input.retriable,
      ...(input.errorMessage ? { errorMessage: input.errorMessage.value } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });

    return ok(undefined);
  }

  configureRoute(input: {
    redirectTo?: PublicDomainName;
    redirectStatus?: CanonicalRedirectStatusCode;
    configuredAt: CreatedAt;
    correlationId?: string;
    causationId?: string;
  }): Result<{ changed: boolean }> {
    if (this.state.status.isDeleted()) {
      return err(domainError.notFound("DomainBinding", this.state.id.value));
    }

    if (input.redirectStatus && !input.redirectTo) {
      return err(
        domainError.validation("Domain binding redirect status requires redirect target", {
          phase: "domain-binding-route-configuration",
          domainBindingId: this.state.id.value,
        }),
      );
    }

    if (input.redirectTo && input.redirectTo.value === this.state.domainName.value) {
      return err(
        domainError.validation("Domain binding canonical redirect cannot point to itself", {
          phase: "domain-binding-route-configuration",
          domainBindingId: this.state.id.value,
          domainName: this.state.domainName.value,
          redirectTo: input.redirectTo.value,
        }),
      );
    }

    const nextRedirectStatus = input.redirectTo
      ? (input.redirectStatus ?? CanonicalRedirectStatusCode.rehydrate(308))
      : undefined;
    const changed =
      this.state.redirectTo?.value !== input.redirectTo?.value ||
      this.state.redirectStatus?.value !== nextRedirectStatus?.value;

    if (!changed) {
      return ok({ changed: false });
    }

    if (input.redirectTo) {
      this.state.redirectTo = input.redirectTo;
      this.state.redirectStatus =
        input.redirectStatus ?? CanonicalRedirectStatusCode.rehydrate(308);
    } else {
      delete this.state.redirectTo;
      delete this.state.redirectStatus;
    }

    this.recordDomainEvent("domain-binding-route-configured", input.configuredAt, {
      domainBindingId: this.state.id.value,
      domainName: this.state.domainName.value,
      pathPrefix: this.state.pathPrefix.value,
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      resourceId: this.state.resourceId.value,
      serverId: this.state.serverId.value,
      destinationId: this.state.destinationId.value,
      ...(this.state.redirectTo
        ? {
            redirectTo: this.state.redirectTo.value,
            redirectStatus: this.state.redirectStatus?.value ?? 308,
          }
        : {}),
      configuredAt: input.configuredAt.value,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });

    return ok({ changed: true });
  }

  retryVerification(input: {
    verificationAttemptId: DomainVerificationAttemptId;
    verificationExpectedTarget: MessageText;
    dnsExpectedTargets?: MessageText[];
    retryAt: CreatedAt;
    correlationId?: string;
    causationId?: string;
  }): Result<{ verificationAttemptId: DomainVerificationAttemptId }> {
    if (this.state.status.isDeleted()) {
      return err(domainError.notFound("DomainBinding", this.state.id.value));
    }

    if (
      this.state.status.value !== "pending_verification" &&
      this.state.status.value !== "not_ready"
    ) {
      return err(
        domainError.domainVerificationNotPending(
          "Domain binding verification can only be retried while ownership or route readiness is not ready",
          {
            phase: "domain-verification",
            domainBindingId: this.state.id.value,
            relatedState: this.state.status.value,
          },
        ),
      );
    }

    this.state.status = DomainBindingStatusValue.pendingVerification();
    this.state.verificationAttempts = [
      ...this.state.verificationAttempts,
      {
        id: input.verificationAttemptId,
        method: DomainVerificationMethodValue.manual(),
        status: DomainVerificationAttemptStatusValue.pending(),
        expectedTarget: input.verificationExpectedTarget,
        createdAt: input.retryAt,
      },
    ];
    delete this.state.routeFailure;

    if (input.dnsExpectedTargets) {
      this.state.dnsObservation = {
        status: DomainDnsObservationStatusValue.pending(),
        expectedTargets: [...input.dnsExpectedTargets],
        observedTargets: [],
        checkedAt: input.retryAt,
      };
    }

    this.recordDomainEvent("domain-binding-verification-retried", input.retryAt, {
      domainBindingId: this.state.id.value,
      domainName: this.state.domainName.value,
      pathPrefix: this.state.pathPrefix.value,
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      resourceId: this.state.resourceId.value,
      serverId: this.state.serverId.value,
      destinationId: this.state.destinationId.value,
      verificationAttemptId: input.verificationAttemptId.value,
      retryAt: input.retryAt.value,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });

    return ok({ verificationAttemptId: input.verificationAttemptId });
  }

  delete(input: {
    deletedAt: CreatedAt;
    correlationId?: string;
    causationId?: string;
  }): Result<{ changed: boolean }> {
    if (this.state.status.isDeleted()) {
      return ok({ changed: false });
    }

    this.state.status = DomainBindingStatusValue.rehydrate("deleted");

    this.recordDomainEvent("domain-binding-deleted", input.deletedAt, {
      domainBindingId: this.state.id.value,
      domainName: this.state.domainName.value,
      pathPrefix: this.state.pathPrefix.value,
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      resourceId: this.state.resourceId.value,
      serverId: this.state.serverId.value,
      destinationId: this.state.destinationId.value,
      deletedAt: input.deletedAt.value,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });

    return ok({ changed: true });
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
      ...(this.state.dnsObservation
        ? {
            dnsObservation: {
              ...this.state.dnsObservation,
              expectedTargets: [...this.state.dnsObservation.expectedTargets],
              observedTargets: [...this.state.dnsObservation.observedTargets],
            },
          }
        : {}),
    };
  }
}
