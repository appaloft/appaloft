import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type CertificateAttemptId,
  type CertificateId,
  type DomainBindingId,
} from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { CreatedAt } from "../shared/temporal";
import { type ProviderKey, type PublicDomainName } from "../shared/text-values";
import { ScalarValueObject } from "../shared/value-object";

export const certificateStatuses = [
  "pending",
  "issuing",
  "active",
  "renewing",
  "failed",
  "expired",
  "disabled",
  "revoked",
  "deleted",
] as const;

export type CertificateStatus = (typeof certificateStatuses)[number];

export const certificateSources = ["managed", "imported"] as const;

export type CertificateSource = (typeof certificateSources)[number];

export const certificateAttemptStatuses = [
  "requested",
  "issuing",
  "issued",
  "failed",
  "retry_scheduled",
] as const;

export type CertificateAttemptStatus = (typeof certificateAttemptStatuses)[number];

export const certificateIssueReasons = ["issue", "renew", "replace"] as const;

export type CertificateIssueReason = (typeof certificateIssueReasons)[number];

export const certificateFailurePhases = [
  "certificate-admission",
  "challenge-preparation",
  "provider-request",
  "domain-validation",
  "certificate-storage",
  "renewal-window",
] as const;

export type CertificateFailurePhase = (typeof certificateFailurePhases)[number];

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

function createRequiredText<TObject>(
  value: string,
  label: string,
  create: (normalized: string) => TObject,
): Result<TObject> {
  const normalized = value.trim();

  if (!normalized) {
    return err(domainError.validation(`${label} is required`));
  }

  return ok(create(normalized));
}

function createDateTimeText<TObject>(
  value: string,
  _label: string,
  create: (normalized: string) => TObject,
): Result<TObject> {
  return CreatedAt.create(value).map((createdAt) => create(createdAt.value));
}

const certificateStatusBrand: unique symbol = Symbol("CertificateStatusValue");
export class CertificateStatusValue extends ScalarValueObject<CertificateStatus> {
  private [certificateStatusBrand]!: void;

  private constructor(value: CertificateStatus) {
    super(value);
  }

  static create(value: string): Result<CertificateStatusValue> {
    return createLiteralValue(
      value,
      certificateStatuses,
      "Certificate status",
      (validated) => new CertificateStatusValue(validated),
    );
  }

  static rehydrate(value: CertificateStatus): CertificateStatusValue {
    return new CertificateStatusValue(value);
  }
}

const certificateSourceBrand: unique symbol = Symbol("CertificateSourceValue");
export class CertificateSourceValue extends ScalarValueObject<CertificateSource> {
  private [certificateSourceBrand]!: void;

  private constructor(value: CertificateSource) {
    super(value);
  }

  static create(value: string): Result<CertificateSourceValue> {
    return createLiteralValue(
      value,
      certificateSources,
      "Certificate source",
      (validated) => new CertificateSourceValue(validated),
    );
  }

  static rehydrate(value: CertificateSource): CertificateSourceValue {
    return new CertificateSourceValue(value);
  }
}

const certificateAttemptStatusBrand: unique symbol = Symbol("CertificateAttemptStatusValue");
export class CertificateAttemptStatusValue extends ScalarValueObject<CertificateAttemptStatus> {
  private [certificateAttemptStatusBrand]!: void;

  private constructor(value: CertificateAttemptStatus) {
    super(value);
  }

  static create(value: string): Result<CertificateAttemptStatusValue> {
    return createLiteralValue(
      value,
      certificateAttemptStatuses,
      "Certificate attempt status",
      (validated) => new CertificateAttemptStatusValue(validated),
    );
  }

  static rehydrate(value: CertificateAttemptStatus): CertificateAttemptStatusValue {
    return new CertificateAttemptStatusValue(value);
  }

  isInFlight(): boolean {
    return this.value === "requested" || this.value === "issuing";
  }

  isIssuing(): boolean {
    return this.value === "issuing";
  }

  isIssued(): boolean {
    return this.value === "issued";
  }

  isFailedOutcome(): boolean {
    return this.value === "failed" || this.value === "retry_scheduled";
  }

  isTerminalForIssuanceWorker(): boolean {
    return this.isIssued() || this.isFailedOutcome();
  }
}

const certificateLifecycleReasonBrand: unique symbol = Symbol("CertificateLifecycleReasonValue");
export class CertificateLifecycleReasonValue extends ScalarValueObject<string> {
  private [certificateLifecycleReasonBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateLifecycleReasonValue> {
    return createRequiredText(
      value,
      "Certificate lifecycle reason",
      (normalized) => new CertificateLifecycleReasonValue(normalized),
    );
  }

  static fromOptional(value?: string): Result<CertificateLifecycleReasonValue | undefined> {
    const normalized = value?.trim();
    return normalized ? CertificateLifecycleReasonValue.create(normalized) : ok(undefined);
  }

  static rehydrate(value: string): CertificateLifecycleReasonValue {
    return new CertificateLifecycleReasonValue(value.trim());
  }
}

const certificateIssueReasonBrand: unique symbol = Symbol("CertificateIssueReasonValue");
export class CertificateIssueReasonValue extends ScalarValueObject<CertificateIssueReason> {
  private [certificateIssueReasonBrand]!: void;

  private constructor(value: CertificateIssueReason) {
    super(value);
  }

  static create(value: string): Result<CertificateIssueReasonValue> {
    return createLiteralValue(
      value,
      certificateIssueReasons,
      "Certificate issue reason",
      (validated) => new CertificateIssueReasonValue(validated),
    );
  }

  static rehydrate(value: CertificateIssueReason): CertificateIssueReasonValue {
    return new CertificateIssueReasonValue(value);
  }

  isRenewal(): boolean {
    return this.value === "renew";
  }
}

const certificateChallengeTypeBrand: unique symbol = Symbol("CertificateChallengeTypeValue");
export class CertificateChallengeTypeValue extends ScalarValueObject<string> {
  private [certificateChallengeTypeBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateChallengeTypeValue> {
    return createRequiredText(
      value,
      "Certificate challenge type",
      (normalized) => new CertificateChallengeTypeValue(normalized),
    );
  }

  static rehydrate(value: string): CertificateChallengeTypeValue {
    return new CertificateChallengeTypeValue(value.trim());
  }
}

const certificateAttemptIdempotencyKeyBrand: unique symbol = Symbol(
  "CertificateAttemptIdempotencyKeyValue",
);
export class CertificateAttemptIdempotencyKeyValue extends ScalarValueObject<string> {
  private [certificateAttemptIdempotencyKeyBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateAttemptIdempotencyKeyValue> {
    return createRequiredText(
      value,
      "Certificate attempt idempotency key",
      (normalized) => new CertificateAttemptIdempotencyKeyValue(normalized),
    );
  }

  static rehydrate(value: string): CertificateAttemptIdempotencyKeyValue {
    return new CertificateAttemptIdempotencyKeyValue(value.trim());
  }

  static fromOptional(value?: string): Result<CertificateAttemptIdempotencyKeyValue | undefined> {
    const normalized = value?.trim();
    return normalized ? CertificateAttemptIdempotencyKeyValue.create(normalized) : ok(undefined);
  }
}

const certificateIssuedAtBrand: unique symbol = Symbol("CertificateIssuedAtValue");
export class CertificateIssuedAtValue extends ScalarValueObject<string> {
  private [certificateIssuedAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateIssuedAtValue> {
    return createDateTimeText(
      value,
      "Certificate issued at",
      (normalized) => new CertificateIssuedAtValue(normalized),
    );
  }

  static rehydrate(value: string): CertificateIssuedAtValue {
    return new CertificateIssuedAtValue(CreatedAt.rehydrate(value).value);
  }
}

const certificateNotBeforeBrand: unique symbol = Symbol("CertificateNotBeforeValue");
export class CertificateNotBeforeValue extends ScalarValueObject<string> {
  private [certificateNotBeforeBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateNotBeforeValue> {
    return createDateTimeText(
      value,
      "Certificate not before",
      (normalized) => new CertificateNotBeforeValue(normalized),
    );
  }

  static rehydrate(value: string): CertificateNotBeforeValue {
    return new CertificateNotBeforeValue(CreatedAt.rehydrate(value).value);
  }
}

const certificateExpiresAtBrand: unique symbol = Symbol("CertificateExpiresAtValue");
export class CertificateExpiresAtValue extends ScalarValueObject<string> {
  private [certificateExpiresAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateExpiresAtValue> {
    return createDateTimeText(
      value,
      "Certificate expires at",
      (normalized) => new CertificateExpiresAtValue(normalized),
    );
  }

  static rehydrate(value: string): CertificateExpiresAtValue {
    return new CertificateExpiresAtValue(CreatedAt.rehydrate(value).value);
  }
}

const certificateFailedAtBrand: unique symbol = Symbol("CertificateFailedAtValue");
export class CertificateFailedAtValue extends ScalarValueObject<string> {
  private [certificateFailedAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateFailedAtValue> {
    return createDateTimeText(
      value,
      "Certificate failed at",
      (normalized) => new CertificateFailedAtValue(normalized),
    );
  }

  static rehydrate(value: string): CertificateFailedAtValue {
    return new CertificateFailedAtValue(CreatedAt.rehydrate(value).value);
  }
}

const certificateRetryAfterBrand: unique symbol = Symbol("CertificateRetryAfterValue");
export class CertificateRetryAfterValue extends ScalarValueObject<string> {
  private [certificateRetryAfterBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateRetryAfterValue> {
    return createDateTimeText(
      value,
      "Certificate retry after",
      (normalized) => new CertificateRetryAfterValue(normalized),
    );
  }

  static rehydrate(value: string): CertificateRetryAfterValue {
    return new CertificateRetryAfterValue(CreatedAt.rehydrate(value).value);
  }
}

const certificateSecretRefBrand: unique symbol = Symbol("CertificateSecretRefValue");
export class CertificateSecretRefValue extends ScalarValueObject<string> {
  private [certificateSecretRefBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateSecretRefValue> {
    return createRequiredText(
      value,
      "Certificate secret ref",
      (normalized) => new CertificateSecretRefValue(normalized),
    );
  }

  static rehydrate(value: string): CertificateSecretRefValue {
    return new CertificateSecretRefValue(value.trim());
  }
}

const certificateFingerprintBrand: unique symbol = Symbol("CertificateFingerprintValue");
export class CertificateFingerprintValue extends ScalarValueObject<string> {
  private [certificateFingerprintBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateFingerprintValue> {
    return createRequiredText(
      value,
      "Certificate fingerprint",
      (normalized) => new CertificateFingerprintValue(normalized),
    );
  }

  static fromOptional(value?: string): Result<CertificateFingerprintValue | undefined> {
    const normalized = value?.trim();
    return normalized ? CertificateFingerprintValue.create(normalized) : ok(undefined);
  }

  static rehydrate(value: string): CertificateFingerprintValue {
    return new CertificateFingerprintValue(value.trim());
  }
}

const certificateFailureCodeBrand: unique symbol = Symbol("CertificateFailureCodeValue");
export class CertificateFailureCodeValue extends ScalarValueObject<string> {
  private [certificateFailureCodeBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateFailureCodeValue> {
    return createRequiredText(
      value,
      "Certificate failure code",
      (normalized) => new CertificateFailureCodeValue(normalized),
    );
  }

  static rehydrate(value: string): CertificateFailureCodeValue {
    return new CertificateFailureCodeValue(value.trim());
  }
}

const certificateFailurePhaseBrand: unique symbol = Symbol("CertificateFailurePhaseValue");
export class CertificateFailurePhaseValue extends ScalarValueObject<CertificateFailurePhase> {
  private [certificateFailurePhaseBrand]!: void;

  private constructor(value: CertificateFailurePhase) {
    super(value);
  }

  static create(value: string): Result<CertificateFailurePhaseValue> {
    return createLiteralValue(
      value,
      certificateFailurePhases,
      "Certificate failure phase",
      (validated) => new CertificateFailurePhaseValue(validated),
    );
  }

  static rehydrate(value: CertificateFailurePhase): CertificateFailurePhaseValue {
    return new CertificateFailurePhaseValue(value);
  }
}

const certificateFailureMessageBrand: unique symbol = Symbol("CertificateFailureMessageValue");
export class CertificateFailureMessageValue extends ScalarValueObject<string> {
  private [certificateFailureMessageBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateFailureMessageValue> {
    return createRequiredText(
      value,
      "Certificate failure message",
      (normalized) => new CertificateFailureMessageValue(normalized),
    );
  }

  static rehydrate(value: string): CertificateFailureMessageValue {
    return new CertificateFailureMessageValue(value.trim());
  }
}

const certificateIssuerBrand: unique symbol = Symbol("CertificateIssuerValue");
export class CertificateIssuerValue extends ScalarValueObject<string> {
  private [certificateIssuerBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateIssuerValue> {
    return createRequiredText(
      value,
      "Certificate issuer",
      (normalized) => new CertificateIssuerValue(normalized),
    );
  }

  static fromOptional(value?: string): Result<CertificateIssuerValue | undefined> {
    const normalized = value?.trim();
    return normalized ? CertificateIssuerValue.create(normalized) : ok(undefined);
  }

  static rehydrate(value: string): CertificateIssuerValue {
    return new CertificateIssuerValue(value.trim());
  }
}

const certificateKeyAlgorithmBrand: unique symbol = Symbol("CertificateKeyAlgorithmValue");
export class CertificateKeyAlgorithmValue extends ScalarValueObject<string> {
  private [certificateKeyAlgorithmBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateKeyAlgorithmValue> {
    return createRequiredText(
      value,
      "Certificate key algorithm",
      (normalized) => new CertificateKeyAlgorithmValue(normalized),
    );
  }

  static rehydrate(value: string): CertificateKeyAlgorithmValue {
    return new CertificateKeyAlgorithmValue(value.trim());
  }
}

const certificateMaterialFingerprintBrand: unique symbol = Symbol(
  "CertificateMaterialFingerprintValue",
);
export class CertificateMaterialFingerprintValue extends ScalarValueObject<string> {
  private [certificateMaterialFingerprintBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<CertificateMaterialFingerprintValue> {
    return createRequiredText(
      value,
      "Certificate material fingerprint",
      (normalized) => new CertificateMaterialFingerprintValue(normalized),
    );
  }

  static rehydrate(value: string): CertificateMaterialFingerprintValue {
    return new CertificateMaterialFingerprintValue(value.trim());
  }
}

export interface CertificateAttemptState {
  id: CertificateAttemptId;
  reason: CertificateIssueReasonValue;
  status: CertificateAttemptStatusValue;
  providerKey: ProviderKey;
  challengeType: CertificateChallengeTypeValue;
  requestedAt: CreatedAt;
  issuedAt?: CertificateIssuedAtValue;
  expiresAt?: CertificateExpiresAtValue;
  failedAt?: CertificateFailedAtValue;
  failureCode?: CertificateFailureCodeValue;
  failurePhase?: CertificateFailurePhaseValue;
  failureMessage?: CertificateFailureMessageValue;
  retriable?: boolean;
  retryAfter?: CertificateRetryAfterValue;
  idempotencyKey?: CertificateAttemptIdempotencyKeyValue;
  materialFingerprint?: CertificateMaterialFingerprintValue;
}

export interface CertificateIssueAttemptContext {
  certificateId: CertificateId;
  domainBindingId: DomainBindingId;
  domainName: PublicDomainName;
  attemptId: CertificateAttemptId;
  reason: CertificateIssueReasonValue;
  providerKey: ProviderKey;
  challengeType: CertificateChallengeTypeValue;
  requestedAt: CreatedAt;
}

export interface CertificateRetryContext {
  certificateId: CertificateId;
  domainBindingId: DomainBindingId;
  attemptId: CertificateAttemptId;
  reason: CertificateIssueReasonValue;
  providerKey: ProviderKey;
  challengeType: CertificateChallengeTypeValue;
}

export type CertificateIssueAttemptClaim =
  | { kind: "claimed"; context: CertificateIssueAttemptContext }
  | { kind: "terminal" };

export interface ImportedCertificateMetadataState {
  subjectAlternativeNames: PublicDomainName[];
  notBefore: CertificateNotBeforeValue;
  keyAlgorithm: CertificateKeyAlgorithmValue;
  issuer?: CertificateIssuerValue;
}

export interface ImportedCertificateSecretRefsState {
  certificateChain: CertificateSecretRefValue;
  privateKey: CertificateSecretRefValue;
  passphrase?: CertificateSecretRefValue;
}

export interface CertificateState {
  id: CertificateId;
  domainBindingId: DomainBindingId;
  domainName: PublicDomainName;
  status: CertificateStatusValue;
  source: CertificateSourceValue;
  providerKey: ProviderKey;
  challengeType: CertificateChallengeTypeValue;
  issuedAt?: CertificateIssuedAtValue;
  expiresAt?: CertificateExpiresAtValue;
  fingerprint?: CertificateFingerprintValue;
  secretRef?: CertificateSecretRefValue;
  importedMetadata?: ImportedCertificateMetadataState;
  importedSecretRefs?: ImportedCertificateSecretRefsState;
  attempts: CertificateAttemptState[];
  createdAt: CreatedAt;
}

export interface CertificateVisitor<TContext, TResult> {
  visitCertificate(certificate: Certificate, context: TContext): TResult;
}

export class Certificate extends AggregateRoot<CertificateState> {
  private constructor(state: CertificateState) {
    super(state);
  }

  static request(input: {
    id: CertificateId;
    domainBindingId: DomainBindingId;
    domainName: PublicDomainName;
    attemptId: CertificateAttemptId;
    reason: CertificateIssueReasonValue;
    providerKey: ProviderKey;
    challengeType: CertificateChallengeTypeValue;
    requestedAt: CreatedAt;
    idempotencyKey?: CertificateAttemptIdempotencyKeyValue;
    correlationId?: string;
    causationId?: string;
  }): Result<Certificate> {
    const certificate = new Certificate({
      id: input.id,
      domainBindingId: input.domainBindingId,
      domainName: input.domainName,
      status: CertificateStatusValue.rehydrate("pending"),
      source: CertificateSourceValue.rehydrate("managed"),
      providerKey: input.providerKey,
      challengeType: input.challengeType,
      attempts: [
        {
          id: input.attemptId,
          reason: input.reason,
          status: CertificateAttemptStatusValue.rehydrate("requested"),
          providerKey: input.providerKey,
          challengeType: input.challengeType,
          requestedAt: input.requestedAt,
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        },
      ],
      createdAt: input.requestedAt,
    });

    certificate.recordRequested(input);
    return ok(certificate);
  }

  static importCertificate(input: {
    id: CertificateId;
    domainBindingId: DomainBindingId;
    domainName: PublicDomainName;
    attemptId: CertificateAttemptId;
    reason: CertificateIssueReasonValue;
    providerKey: ProviderKey;
    challengeType: CertificateChallengeTypeValue;
    importedAt: CreatedAt;
    notBefore: CertificateNotBeforeValue;
    expiresAt: CertificateExpiresAtValue;
    subjectAlternativeNames: PublicDomainName[];
    keyAlgorithm: CertificateKeyAlgorithmValue;
    certificateChainRef: CertificateSecretRefValue;
    privateKeyRef: CertificateSecretRefValue;
    fingerprint?: CertificateFingerprintValue;
    issuer?: CertificateIssuerValue;
    passphraseRef?: CertificateSecretRefValue;
    idempotencyKey?: CertificateAttemptIdempotencyKeyValue;
    materialFingerprint?: CertificateMaterialFingerprintValue;
    correlationId?: string;
    causationId?: string;
  }): Result<Certificate> {
    const certificate = new Certificate({
      id: input.id,
      domainBindingId: input.domainBindingId,
      domainName: input.domainName,
      status: CertificateStatusValue.rehydrate("active"),
      source: CertificateSourceValue.rehydrate("imported"),
      providerKey: input.providerKey,
      challengeType: input.challengeType,
      issuedAt: CertificateIssuedAtValue.rehydrate(input.importedAt.value),
      expiresAt: input.expiresAt,
      ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
      importedMetadata: {
        subjectAlternativeNames: [...input.subjectAlternativeNames],
        notBefore: input.notBefore,
        keyAlgorithm: input.keyAlgorithm,
        ...(input.issuer ? { issuer: input.issuer } : {}),
      },
      importedSecretRefs: {
        certificateChain: input.certificateChainRef,
        privateKey: input.privateKeyRef,
        ...(input.passphraseRef ? { passphrase: input.passphraseRef } : {}),
      },
      attempts: [
        {
          id: input.attemptId,
          reason: input.reason,
          status: CertificateAttemptStatusValue.rehydrate("issued"),
          providerKey: input.providerKey,
          challengeType: input.challengeType,
          requestedAt: input.importedAt,
          issuedAt: CertificateIssuedAtValue.rehydrate(input.importedAt.value),
          expiresAt: input.expiresAt,
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
          ...(input.materialFingerprint ? { materialFingerprint: input.materialFingerprint } : {}),
        },
      ],
      createdAt: input.importedAt,
    });

    certificate.recordImported(input);
    return ok(certificate);
  }

  static rehydrate(state: CertificateState): Certificate {
    return new Certificate({
      ...state,
      attempts: [...state.attempts],
      ...(state.importedMetadata
        ? {
            importedMetadata: {
              ...state.importedMetadata,
              subjectAlternativeNames: [...state.importedMetadata.subjectAlternativeNames],
            },
          }
        : {}),
    });
  }

  requestAttempt(input: {
    attemptId: CertificateAttemptId;
    reason: CertificateIssueReasonValue;
    providerKey: ProviderKey;
    challengeType: CertificateChallengeTypeValue;
    requestedAt: CreatedAt;
    idempotencyKey?: CertificateAttemptIdempotencyKeyValue;
    correlationId?: string;
    causationId?: string;
  }): Result<{ attemptId: CertificateAttemptId }> {
    const conflictingAttempt = this.state.attempts.find(
      (attempt) => attempt.reason.equals(input.reason) && attempt.status.isInFlight(),
    );

    if (conflictingAttempt) {
      return err(
        domainError.certificateAttemptConflict(
          "Certificate already has an in-flight attempt for this reason",
          {
            phase: "certificate-admission",
            certificateId: this.state.id.value,
            attemptId: conflictingAttempt.id.value,
            reason: input.reason.value,
          },
        ),
      );
    }

    this.state.status = input.reason.isRenewal()
      ? CertificateStatusValue.rehydrate("renewing")
      : CertificateStatusValue.rehydrate("pending");
    this.state.providerKey = input.providerKey;
    this.state.challengeType = input.challengeType;
    this.state.attempts = [
      ...this.state.attempts,
      {
        id: input.attemptId,
        reason: input.reason,
        status: CertificateAttemptStatusValue.rehydrate("requested"),
        providerKey: input.providerKey,
        challengeType: input.challengeType,
        requestedAt: input.requestedAt,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      },
    ];

    this.recordRequested({
      ...input,
      id: this.state.id,
      domainBindingId: this.state.domainBindingId,
      domainName: this.state.domainName,
    });

    return ok({ attemptId: input.attemptId });
  }

  findAttemptByIdempotencyKey(
    idempotencyKey: CertificateAttemptIdempotencyKeyValue,
  ): CertificateAttemptState | undefined {
    return this.state.attempts.find(
      (attempt) => attempt.idempotencyKey?.equals(idempotencyKey) ?? false,
    );
  }

  hasInFlightAttemptFor(reason: CertificateIssueReasonValue): boolean {
    return this.state.attempts.some(
      (attempt) => attempt.reason.equals(reason) && attempt.status.isInFlight(),
    );
  }

  resolveRetryContext(): Result<CertificateRetryContext> {
    if (this.state.source.value === "imported") {
      return err(
        domainError.certificateRetryNotAllowed("Imported certificates must be replaced by import", {
          phase: "certificate-admission",
          certificateId: this.state.id.value,
          certificateSource: this.state.source.value,
          relatedState: this.state.status.value,
        }),
      );
    }

    const latestAttempt = this.state.attempts[this.state.attempts.length - 1];
    if (!latestAttempt || latestAttempt.status.value !== "retry_scheduled") {
      return err(
        domainError.certificateRetryNotAllowed("Certificate has no retryable latest attempt", {
          phase: "certificate-admission",
          certificateId: this.state.id.value,
          relatedState: this.state.status.value,
        }),
      );
    }

    return ok({
      certificateId: this.state.id,
      domainBindingId: this.state.domainBindingId,
      attemptId: latestAttempt.id,
      reason: latestAttempt.reason,
      providerKey: latestAttempt.providerKey,
      challengeType: latestAttempt.challengeType,
    });
  }

  revoke(input: {
    revokedAt: CreatedAt;
    externalRevocation: "provider" | "appaloft-local";
    reason?: CertificateLifecycleReasonValue;
    correlationId?: string;
    causationId?: string;
  }): Result<{ changed: boolean }> {
    if (this.state.status.value === "revoked" || this.state.status.value === "deleted") {
      return ok({ changed: false });
    }

    if (this.state.status.value !== "active") {
      return err(
        domainError.certificateRevokeNotAllowed("Certificate is not active for TLS", {
          phase: "certificate-admission",
          certificateId: this.state.id.value,
          relatedState: this.state.status.value,
        }),
      );
    }

    this.state.status = CertificateStatusValue.rehydrate("revoked");
    this.recordDomainEvent("certificate-revoked", input.revokedAt, {
      certificateId: this.state.id.value,
      domainBindingId: this.state.domainBindingId.value,
      domainName: this.state.domainName.value,
      source: this.state.source.value,
      revokedAt: input.revokedAt.value,
      providerKey: this.state.providerKey.value,
      externalRevocation: input.externalRevocation,
      ...(input.reason ? { reason: input.reason.value } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });

    return ok({ changed: true });
  }

  delete(input: {
    deletedAt: CreatedAt;
    correlationId?: string;
    causationId?: string;
  }): Result<{ changed: boolean }> {
    if (this.state.status.value === "deleted") {
      return ok({ changed: false });
    }

    if (this.state.status.value === "active") {
      return err(
        domainError.certificateDeleteNotAllowed(
          "Active certificate must be revoked before delete",
          {
            phase: "certificate-delete",
            certificateId: this.state.id.value,
            relatedState: this.state.status.value,
          },
        ),
      );
    }

    if (this.state.status.value === "pending" || this.state.status.value === "issuing") {
      return err(
        domainError.certificateDeleteNotAllowed("In-flight certificate cannot be deleted", {
          phase: "certificate-delete",
          certificateId: this.state.id.value,
          relatedState: this.state.status.value,
        }),
      );
    }

    this.state.status = CertificateStatusValue.rehydrate("deleted");
    this.recordDomainEvent("certificate-deleted", input.deletedAt, {
      certificateId: this.state.id.value,
      domainBindingId: this.state.domainBindingId.value,
      domainName: this.state.domainName.value,
      source: this.state.source.value,
      deletedAt: input.deletedAt.value,
      preservedAudit: true,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });

    return ok({ changed: true });
  }

  claimAttemptForIssuance(input: {
    attemptId: CertificateAttemptId;
  }): Result<CertificateIssueAttemptClaim> {
    const attemptIndex = this.findAttemptIndex(input.attemptId);
    if (attemptIndex < 0) {
      return err(domainError.notFound("Certificate attempt", input.attemptId.value));
    }

    const attempt = this.state.attempts[attemptIndex];
    if (!attempt) {
      return err(domainError.invariant("Certificate attempt is missing after lookup"));
    }

    if (attempt.status.isTerminalForIssuanceWorker()) {
      return ok({ kind: "terminal" });
    }

    const context = this.createIssueAttemptContext(attempt);
    if (attempt.status.isIssuing()) {
      return ok({ kind: "claimed", context });
    }

    this.state.status = attempt.reason.isRenewal()
      ? CertificateStatusValue.rehydrate("renewing")
      : CertificateStatusValue.rehydrate("issuing");
    this.state.attempts = this.replaceAttempt(attemptIndex, {
      ...attempt,
      status: CertificateAttemptStatusValue.rehydrate("issuing"),
    });

    return ok({ kind: "claimed", context });
  }

  markAttemptIssuing(input: { attemptId: CertificateAttemptId }): Result<{ terminal: boolean }> {
    return this.claimAttemptForIssuance(input).map((claim) => ({
      terminal: claim.kind === "terminal",
    }));
  }

  markIssued(input: {
    attemptId: CertificateAttemptId;
    issuedAt: CertificateIssuedAtValue;
    expiresAt: CertificateExpiresAtValue;
    secretRef: CertificateSecretRefValue;
    fingerprint?: CertificateFingerprintValue;
    correlationId?: string;
    causationId?: string;
  }): Result<void> {
    const attemptIndex = this.findAttemptIndex(input.attemptId);
    if (attemptIndex < 0) {
      return err(domainError.notFound("Certificate attempt", input.attemptId.value));
    }

    const attempt = this.state.attempts[attemptIndex];
    if (!attempt) {
      return err(domainError.invariant("Certificate attempt is missing after lookup"));
    }

    if (attempt.status.isIssued()) {
      return ok(undefined);
    }

    if (attempt.status.isFailedOutcome()) {
      return err(
        domainError.invariant("Failed certificate attempt cannot be marked issued", {
          certificateId: this.state.id.value,
          attemptId: input.attemptId.value,
          relatedState: attempt.status.value,
        }),
      );
    }

    this.state.status = CertificateStatusValue.rehydrate("active");
    this.state.source = CertificateSourceValue.rehydrate("managed");
    this.state.issuedAt = input.issuedAt;
    this.state.expiresAt = input.expiresAt;
    this.state.secretRef = input.secretRef;
    delete this.state.importedMetadata;
    delete this.state.importedSecretRefs;
    if (input.fingerprint) {
      this.state.fingerprint = input.fingerprint;
    }
    this.state.providerKey = attempt.providerKey;
    this.state.challengeType = attempt.challengeType;
    this.state.attempts = this.replaceAttempt(attemptIndex, {
      ...attempt,
      status: CertificateAttemptStatusValue.rehydrate("issued"),
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    });

    this.recordDomainEvent("certificate-issued", input.issuedAt, {
      certificateId: this.state.id.value,
      domainBindingId: this.state.domainBindingId.value,
      domainName: this.state.domainName.value,
      attemptId: input.attemptId.value,
      issuedAt: input.issuedAt.value,
      expiresAt: input.expiresAt.value,
      providerKey: attempt.providerKey.value,
      ...(input.fingerprint ? { fingerprint: input.fingerprint.value } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });

    return ok(undefined);
  }

  markImported(input: {
    attemptId: CertificateAttemptId;
    reason: CertificateIssueReasonValue;
    providerKey: ProviderKey;
    challengeType: CertificateChallengeTypeValue;
    importedAt: CreatedAt;
    notBefore: CertificateNotBeforeValue;
    expiresAt: CertificateExpiresAtValue;
    subjectAlternativeNames: PublicDomainName[];
    keyAlgorithm: CertificateKeyAlgorithmValue;
    certificateChainRef: CertificateSecretRefValue;
    privateKeyRef: CertificateSecretRefValue;
    fingerprint?: CertificateFingerprintValue;
    issuer?: CertificateIssuerValue;
    passphraseRef?: CertificateSecretRefValue;
    idempotencyKey?: CertificateAttemptIdempotencyKeyValue;
    materialFingerprint?: CertificateMaterialFingerprintValue;
    correlationId?: string;
    causationId?: string;
  }): Result<void> {
    const conflictingAttempt = this.state.attempts.find(
      (attempt) => attempt.reason.equals(input.reason) && attempt.status.isInFlight(),
    );

    if (conflictingAttempt) {
      return err(
        domainError.certificateAttemptConflict(
          "Certificate already has an in-flight attempt for this reason",
          {
            phase: "certificate-admission",
            certificateId: this.state.id.value,
            attemptId: conflictingAttempt.id.value,
            reason: input.reason.value,
          },
        ),
      );
    }

    this.state.status = CertificateStatusValue.rehydrate("active");
    this.state.source = CertificateSourceValue.rehydrate("imported");
    this.state.providerKey = input.providerKey;
    this.state.challengeType = input.challengeType;
    this.state.issuedAt = CertificateIssuedAtValue.rehydrate(input.importedAt.value);
    this.state.expiresAt = input.expiresAt;
    delete this.state.secretRef;
    this.state.importedMetadata = {
      subjectAlternativeNames: [...input.subjectAlternativeNames],
      notBefore: input.notBefore,
      keyAlgorithm: input.keyAlgorithm,
      ...(input.issuer ? { issuer: input.issuer } : {}),
    };
    this.state.importedSecretRefs = {
      certificateChain: input.certificateChainRef,
      privateKey: input.privateKeyRef,
      ...(input.passphraseRef ? { passphrase: input.passphraseRef } : {}),
    };
    if (input.fingerprint) {
      this.state.fingerprint = input.fingerprint;
    }

    this.state.attempts = [
      ...this.state.attempts,
      {
        id: input.attemptId,
        reason: input.reason,
        status: CertificateAttemptStatusValue.rehydrate("issued"),
        providerKey: input.providerKey,
        challengeType: input.challengeType,
        requestedAt: input.importedAt,
        issuedAt: CertificateIssuedAtValue.rehydrate(input.importedAt.value),
        expiresAt: input.expiresAt,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        ...(input.materialFingerprint ? { materialFingerprint: input.materialFingerprint } : {}),
      },
    ];

    this.recordImported(input);
    return ok(undefined);
  }

  markIssuanceFailed(input: {
    attemptId: CertificateAttemptId;
    failedAt: CertificateFailedAtValue;
    failureCode: CertificateFailureCodeValue;
    failurePhase: CertificateFailurePhaseValue;
    failureMessage?: CertificateFailureMessageValue;
    retriable: boolean;
    retryAfter?: CertificateRetryAfterValue;
    providerKey?: ProviderKey;
    correlationId?: string;
    causationId?: string;
  }): Result<void> {
    const attemptIndex = this.findAttemptIndex(input.attemptId);
    if (attemptIndex < 0) {
      return err(domainError.notFound("Certificate attempt", input.attemptId.value));
    }

    const attempt = this.state.attempts[attemptIndex];
    if (!attempt) {
      return err(domainError.invariant("Certificate attempt is missing after lookup"));
    }

    if (attempt.status.isIssued()) {
      return err(
        domainError.invariant("Issued certificate attempt cannot be marked failed", {
          certificateId: this.state.id.value,
          attemptId: input.attemptId.value,
          relatedState: attempt.status.value,
        }),
      );
    }

    if (attempt.status.isFailedOutcome()) {
      return ok(undefined);
    }

    this.state.status = CertificateStatusValue.rehydrate("failed");
    this.state.providerKey = input.providerKey ?? attempt.providerKey;
    this.state.challengeType = attempt.challengeType;
    this.state.attempts = this.replaceAttempt(attemptIndex, {
      ...attempt,
      status: CertificateAttemptStatusValue.rehydrate(
        input.retriable ? "retry_scheduled" : "failed",
      ),
      failedAt: input.failedAt,
      failureCode: input.failureCode,
      failurePhase: input.failurePhase,
      ...(input.failureMessage ? { failureMessage: input.failureMessage } : {}),
      retriable: input.retriable,
      ...(input.retryAfter ? { retryAfter: input.retryAfter } : {}),
    });

    const providerKey = input.providerKey ?? attempt.providerKey;
    this.recordDomainEvent("certificate-issuance-failed", input.failedAt, {
      certificateId: this.state.id.value,
      domainBindingId: this.state.domainBindingId.value,
      domainName: this.state.domainName.value,
      attemptId: input.attemptId.value,
      failedAt: input.failedAt.value,
      errorCode: input.failureCode.value,
      failurePhase: input.failurePhase.value,
      retriable: input.retriable,
      ...(input.retryAfter ? { retryAfter: input.retryAfter.value } : {}),
      providerKey: providerKey.value,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });

    return ok(undefined);
  }

  accept<TContext, TResult>(visitor: CertificateVisitor<TContext, TResult>, context: TContext) {
    return visitor.visitCertificate(this, context);
  }

  toState(): CertificateState {
    return {
      ...this.state,
      attempts: [...this.state.attempts],
      ...(this.state.importedMetadata
        ? {
            importedMetadata: {
              ...this.state.importedMetadata,
              subjectAlternativeNames: [...this.state.importedMetadata.subjectAlternativeNames],
            },
          }
        : {}),
    };
  }

  private recordRequested(input: {
    id: CertificateId;
    domainBindingId: DomainBindingId;
    domainName: PublicDomainName;
    attemptId: CertificateAttemptId;
    reason: CertificateIssueReasonValue;
    providerKey: ProviderKey;
    challengeType: CertificateChallengeTypeValue;
    requestedAt: CreatedAt;
    correlationId?: string;
    causationId?: string;
  }): void {
    this.recordDomainEvent("certificate-requested", input.requestedAt, {
      certificateId: input.id.value,
      domainBindingId: input.domainBindingId.value,
      domainName: input.domainName.value,
      attemptId: input.attemptId.value,
      reason: input.reason.value,
      providerKey: input.providerKey.value,
      challengeType: input.challengeType.value,
      requestedAt: input.requestedAt.value,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });
  }

  private recordImported(input: {
    attemptId: CertificateAttemptId;
    importedAt: CreatedAt;
    notBefore: CertificateNotBeforeValue;
    expiresAt: CertificateExpiresAtValue;
    subjectAlternativeNames: PublicDomainName[];
    keyAlgorithm: CertificateKeyAlgorithmValue;
    fingerprint?: CertificateFingerprintValue;
    issuer?: CertificateIssuerValue;
    correlationId?: string;
    causationId?: string;
  }): void {
    this.recordDomainEvent("certificate-imported", input.importedAt, {
      certificateId: this.state.id.value,
      domainBindingId: this.state.domainBindingId.value,
      domainName: this.state.domainName.value,
      attemptId: input.attemptId.value,
      importedAt: input.importedAt.value,
      source: "imported",
      notBefore: input.notBefore.value,
      expiresAt: input.expiresAt.value,
      subjectAlternativeNames: input.subjectAlternativeNames.map((domain) => domain.value),
      keyAlgorithm: input.keyAlgorithm.value,
      ...(input.issuer ? { issuer: input.issuer.value } : {}),
      ...(input.fingerprint ? { fingerprint: input.fingerprint.value } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });
  }

  private findAttemptIndex(attemptId: CertificateAttemptId): number {
    return this.state.attempts.findIndex((attempt) => attempt.id.equals(attemptId));
  }

  private createIssueAttemptContext(
    attempt: CertificateAttemptState,
  ): CertificateIssueAttemptContext {
    return {
      certificateId: this.state.id,
      domainBindingId: this.state.domainBindingId,
      domainName: this.state.domainName,
      attemptId: attempt.id,
      reason: attempt.reason,
      providerKey: attempt.providerKey,
      challengeType: attempt.challengeType,
      requestedAt: attempt.requestedAt,
    };
  }

  private replaceAttempt(
    attemptIndex: number,
    nextAttempt: CertificateAttemptState,
  ): CertificateAttemptState[] {
    return this.state.attempts.map((attempt, index) =>
      index === attemptIndex ? nextAttempt : attempt,
    );
  }
}
