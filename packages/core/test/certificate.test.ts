import { describe, expect, test } from "bun:test";
import {
  Certificate,
  CertificateAttemptId,
  CertificateChallengeTypeValue,
  CertificateExpiresAtValue,
  CertificateFailedAtValue,
  CertificateFailureCodeValue,
  CertificateFailureMessageValue,
  CertificateFailurePhaseValue,
  CertificateFingerprintValue,
  CertificateId,
  CertificateIssuedAtValue,
  CertificateIssueReasonValue,
  CertificateSecretRefValue,
  CreatedAt,
  DomainBindingId,
  ProviderKey,
  PublicDomainName,
} from "../src";

function requestedCertificate() {
  return Certificate.request({
    id: CertificateId.rehydrate("crt_demo"),
    domainBindingId: DomainBindingId.rehydrate("dom_demo"),
    domainName: PublicDomainName.rehydrate("secure.example.com"),
    attemptId: CertificateAttemptId.rehydrate("cat_demo"),
    reason: CertificateIssueReasonValue.rehydrate("issue"),
    providerKey: ProviderKey.rehydrate("acme"),
    challengeType: CertificateChallengeTypeValue.rehydrate("http-01"),
    requestedAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

function attemptId() {
  return CertificateAttemptId.rehydrate("cat_demo");
}

function markIssued(certificate: Certificate) {
  certificate.markAttemptIssuing({ attemptId: attemptId() })._unsafeUnwrap();
  certificate
    .markIssued({
      attemptId: attemptId(),
      issuedAt: CertificateIssuedAtValue.rehydrate("2026-01-01T00:01:00.000Z"),
      expiresAt: CertificateExpiresAtValue.rehydrate("2026-04-01T00:01:00.000Z"),
      secretRef: CertificateSecretRefValue.rehydrate("secret://certificates/crt_demo"),
      fingerprint: CertificateFingerprintValue.rehydrate("sha256:demo"),
    })
    ._unsafeUnwrap();
}

function markFailed(certificate: Certificate, retriable: boolean) {
  certificate.markAttemptIssuing({ attemptId: attemptId() })._unsafeUnwrap();
  certificate
    .markIssuanceFailed({
      attemptId: attemptId(),
      failedAt: CertificateFailedAtValue.rehydrate("2026-01-01T00:02:00.000Z"),
      failureCode: CertificateFailureCodeValue.rehydrate("certificate_provider_unavailable"),
      failurePhase: CertificateFailurePhaseValue.rehydrate("provider-request"),
      failureMessage: CertificateFailureMessageValue.rehydrate("Provider unavailable"),
      retriable,
      providerKey: ProviderKey.rehydrate("acme"),
    })
    ._unsafeUnwrap();
}

describe("Certificate", () => {
  test("[DMBH-CERT-001] claims requested and issuing attempts with issue context", () => {
    const requested = requestedCertificate();
    const claimed = requested.claimAttemptForIssuance({ attemptId: attemptId() });

    expect(claimed.isOk()).toBe(true);
    if (claimed.isOk()) {
      expect(claimed.value.kind).toBe("claimed");
      if (claimed.value.kind === "claimed") {
        expect(claimed.value.context.certificateId.value).toBe("crt_demo");
        expect(claimed.value.context.domainBindingId.value).toBe("dom_demo");
        expect(claimed.value.context.domainName.value).toBe("secure.example.com");
        expect(claimed.value.context.attemptId.value).toBe("cat_demo");
        expect(claimed.value.context.reason.value).toBe("issue");
        expect(claimed.value.context.providerKey.value).toBe("acme");
        expect(claimed.value.context.challengeType.value).toBe("http-01");
        expect(claimed.value.context.requestedAt.value).toBe("2026-01-01T00:00:00.000Z");
      }
    }
    expect(requested.toState().status.value).toBe("issuing");
    expect(requested.toState().attempts[0]?.status.value).toBe("issuing");

    const alreadyIssuing = requested.claimAttemptForIssuance({ attemptId: attemptId() });
    expect(alreadyIssuing.isOk()).toBe(true);
    if (alreadyIssuing.isOk()) {
      expect(alreadyIssuing.value.kind).toBe("claimed");
    }
    expect(requested.toState().attempts).toHaveLength(1);
  });

  test("[DMBH-CERT-001] skips terminal attempts without caller-owned status branching", () => {
    const issued = requestedCertificate();
    markIssued(issued);
    const issuedClaim = issued.claimAttemptForIssuance({ attemptId: attemptId() });
    expect(issuedClaim.isOk()).toBe(true);
    if (issuedClaim.isOk()) {
      expect(issuedClaim.value.kind).toBe("terminal");
    }
    expect(issued.toState().attempts[0]?.status.value).toBe("issued");

    const failed = requestedCertificate();
    markFailed(failed, false);
    const failedClaim = failed.claimAttemptForIssuance({ attemptId: attemptId() });
    expect(failedClaim.isOk()).toBe(true);
    if (failedClaim.isOk()) {
      expect(failedClaim.value.kind).toBe("terminal");
    }
    expect(failed.toState().attempts[0]?.status.value).toBe("failed");

    const retryScheduled = requestedCertificate();
    markFailed(retryScheduled, true);
    const retryClaim = retryScheduled.claimAttemptForIssuance({ attemptId: attemptId() });
    expect(retryClaim.isOk()).toBe(true);
    if (retryClaim.isOk()) {
      expect(retryClaim.value.kind).toBe("terminal");
    }
    expect(retryScheduled.toState().attempts[0]?.status.value).toBe("retry_scheduled");
  });

  test("[DMBH-CERT-001] reports missing attempts through the aggregate lookup", () => {
    const certificate = requestedCertificate();
    const missing = certificate.claimAttemptForIssuance({
      attemptId: CertificateAttemptId.rehydrate("cat_missing"),
    });

    expect(missing.isErr()).toBe(true);
    if (missing.isErr()) {
      expect(missing.error.code).toBe("not_found");
    }
    expect(certificate.toState().attempts[0]?.status.value).toBe("requested");
  });
});
