import { type CertificateId, type DomainBindingId } from "../shared/identifiers";
import { type Certificate, type CertificateState } from "./certificate";

export interface CertificateSelectionSpecVisitor<TResult> {
  visitCertificateById(query: TResult, spec: CertificateByIdSpec): TResult;
  visitCertificateByDomainBindingId(
    query: TResult,
    spec: CertificateByDomainBindingIdSpec,
  ): TResult;
  visitCertificateByAttemptIdempotencyKey(
    query: TResult,
    spec: CertificateByAttemptIdempotencyKeySpec,
  ): TResult;
}

export interface CertificateMutationSpecVisitor<TResult> {
  visitUpsertCertificate(spec: UpsertCertificateSpec): TResult;
}

export interface CertificateSelectionSpec {
  isSatisfiedBy(candidate: Certificate): boolean;
  accept<TResult>(query: TResult, visitor: CertificateSelectionSpecVisitor<TResult>): TResult;
}

export interface CertificateMutationSpec {
  accept<TResult>(visitor: CertificateMutationSpecVisitor<TResult>): TResult;
}

export class CertificateByIdSpec implements CertificateSelectionSpec {
  private constructor(private readonly expectedId: CertificateId) {}

  static create(id: CertificateId): CertificateByIdSpec {
    return new CertificateByIdSpec(id);
  }

  get id(): CertificateId {
    return this.expectedId;
  }

  isSatisfiedBy(candidate: Certificate): boolean {
    return candidate.toState().id.equals(this.expectedId);
  }

  accept<TResult>(query: TResult, visitor: CertificateSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitCertificateById(query, this);
  }
}

export class CertificateByDomainBindingIdSpec implements CertificateSelectionSpec {
  private constructor(private readonly expectedDomainBindingId: DomainBindingId) {}

  static create(domainBindingId: DomainBindingId): CertificateByDomainBindingIdSpec {
    return new CertificateByDomainBindingIdSpec(domainBindingId);
  }

  get domainBindingId(): DomainBindingId {
    return this.expectedDomainBindingId;
  }

  isSatisfiedBy(candidate: Certificate): boolean {
    return candidate.toState().domainBindingId.equals(this.expectedDomainBindingId);
  }

  accept<TResult>(query: TResult, visitor: CertificateSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitCertificateByDomainBindingId(query, this);
  }
}

export class CertificateByAttemptIdempotencyKeySpec implements CertificateSelectionSpec {
  private constructor(private readonly expectedIdempotencyKey: string) {}

  static create(idempotencyKey: string): CertificateByAttemptIdempotencyKeySpec {
    return new CertificateByAttemptIdempotencyKeySpec(idempotencyKey);
  }

  get idempotencyKey(): string {
    return this.expectedIdempotencyKey;
  }

  isSatisfiedBy(candidate: Certificate): boolean {
    return candidate
      .toState()
      .attempts.some((attempt) => attempt.idempotencyKey?.value === this.expectedIdempotencyKey);
  }

  accept<TResult>(query: TResult, visitor: CertificateSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitCertificateByAttemptIdempotencyKey(query, this);
  }
}

export class UpsertCertificateSpec implements CertificateMutationSpec {
  private constructor(private readonly nextState: CertificateState) {}

  static fromCertificate(certificate: Certificate): UpsertCertificateSpec {
    return new UpsertCertificateSpec(certificate.toState());
  }

  get state(): CertificateState {
    return this.nextState;
  }

  accept<TResult>(visitor: CertificateMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertCertificate(this);
  }
}
