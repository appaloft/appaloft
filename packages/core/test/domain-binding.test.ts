import { describe, expect, test } from "bun:test";
import {
  CanonicalRedirectStatusCode,
  CertificatePolicyValue,
  CreatedAt,
  DeploymentTargetId,
  DestinationId,
  DomainBinding,
  DomainBindingId,
  DomainBindingStatusValue,
  DomainVerificationAttemptId,
  DomainVerificationAttemptStatusValue,
  DomainVerificationMethodValue,
  EdgeProxyKindValue,
  EnvironmentId,
  MessageText,
  ProjectId,
  PublicDomainName,
  ResourceId,
  RoutePathPrefix,
  TlsModeValue,
} from "../src";

function domainBinding(input?: {
  status?: "bound" | "certificate_pending" | "ready" | "not_ready" | "pending_verification";
  tlsMode?: "auto" | "disabled";
  certificatePolicy?: "auto" | "manual" | "disabled";
  domainName?: string;
  redirectTo?: string;
}) {
  return DomainBinding.rehydrate({
    id: DomainBindingId.rehydrate("dom_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    resourceId: ResourceId.rehydrate("res_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    domainName: PublicDomainName.rehydrate(input?.domainName ?? "app.example.com"),
    pathPrefix: RoutePathPrefix.rehydrate("/"),
    proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
    tlsMode: TlsModeValue.rehydrate(input?.tlsMode ?? "auto"),
    certificatePolicy: CertificatePolicyValue.rehydrate(input?.certificatePolicy ?? "auto"),
    ...(input?.redirectTo
      ? {
          redirectTo: PublicDomainName.rehydrate(input.redirectTo),
          redirectStatus: CanonicalRedirectStatusCode.rehydrate(308),
        }
      : {}),
    status: DomainBindingStatusValue.rehydrate(input?.status ?? "bound"),
    verificationAttempts: [
      {
        id: DomainVerificationAttemptId.rehydrate("dva_demo"),
        method: DomainVerificationMethodValue.rehydrate("manual"),
        status: DomainVerificationAttemptStatusValue.rehydrate("verified"),
        expectedTarget: MessageText.rehydrate("Verify DNS ownership"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      },
    ],
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

describe("DomainBinding", () => {
  test("[DMBH-DOMAIN-001] answers certificate issue admission without caller-owned primitive checks", () => {
    const eligible = domainBinding({
      status: "bound",
      tlsMode: "auto",
      certificatePolicy: "auto",
    }).resolveCertificateIssueContext({ phase: "certificate-admission" });

    expect(eligible.isOk()).toBe(true);
    if (eligible.isOk()) {
      expect(eligible.value.domainBindingId.value).toBe("dom_demo");
      expect(eligible.value.domainName.value).toBe("app.example.com");
      expect(eligible.value.tlsMode.value).toBe("auto");
      expect(eligible.value.certificatePolicy.value).toBe("auto");
    }

    const tlsDisabled = domainBinding({
      status: "bound",
      tlsMode: "disabled",
      certificatePolicy: "disabled",
    }).resolveCertificateIssueContext({ phase: "certificate-admission" });

    expect(tlsDisabled.isErr()).toBe(true);
    if (tlsDisabled.isErr()) {
      expect(tlsDisabled.error.code).toBe("certificate_not_allowed");
      expect(tlsDisabled.error.details?.tlsMode).toBe("disabled");
      expect(tlsDisabled.error.details?.certificatePolicy).toBe("disabled");
    }

    const notOwned = domainBinding({
      status: "pending_verification",
      tlsMode: "auto",
      certificatePolicy: "auto",
    }).resolveCertificateIssueContext({ phase: "certificate-admission" });

    expect(notOwned.isErr()).toBe(true);
    if (notOwned.isErr()) {
      expect(notOwned.error.details?.relatedState).toBe("pending_verification");
    }
  });

  test("[DMBH-DOMAIN-001] answers manual certificate import admission without caller-owned primitive checks", () => {
    const eligible = domainBinding({
      status: "not_ready",
      tlsMode: "auto",
      certificatePolicy: "manual",
    }).resolveCertificateImportContext({ phase: "certificate-admission" });

    expect(eligible.isOk()).toBe(true);
    if (eligible.isOk()) {
      expect(eligible.value.domainBindingId.value).toBe("dom_demo");
      expect(eligible.value.domainName.value).toBe("app.example.com");
      expect(eligible.value.certificatePolicy.value).toBe("manual");
    }

    const autoPolicy = domainBinding({
      status: "bound",
      tlsMode: "auto",
      certificatePolicy: "auto",
    }).resolveCertificateImportContext({ phase: "certificate-admission" });

    expect(autoPolicy.isErr()).toBe(true);
    if (autoPolicy.isErr()) {
      expect(autoPolicy.error.code).toBe("certificate_import_not_allowed");
      expect(autoPolicy.error.details?.certificatePolicy).toBe("auto");
    }
  });

  test("[DMBH-DOMAIN-001] answers certificate and route readiness gates", () => {
    const tlsAuto = domainBinding({
      status: "bound",
      tlsMode: "auto",
      certificatePolicy: "auto",
    });
    expect(tlsAuto.requiresCertificateForReadiness()).toBe(true);
    expect(tlsAuto.canBecomeReadyWhenDomainBound()).toBe(false);
    expect(tlsAuto.canBecomeReadyAfterCertificateIssued()).toBe(true);
    expect(tlsAuto.canBecomeReadyAfterRouteRealization()).toBe(false);

    const manualCertificate = domainBinding({
      status: "certificate_pending",
      tlsMode: "auto",
      certificatePolicy: "manual",
    });
    expect(manualCertificate.canBecomeReadyAfterCertificateImported()).toBe(true);

    const tlsDisabled = domainBinding({
      status: "bound",
      tlsMode: "disabled",
      certificatePolicy: "disabled",
    });
    expect(tlsDisabled.requiresCertificateForReadiness()).toBe(false);
    expect(tlsDisabled.canBecomeReadyWhenDomainBound()).toBe(true);
    expect(tlsDisabled.canBecomeReadyAfterCertificateIssued()).toBe(false);

    const recoveredRoute = domainBinding({
      status: "not_ready",
      tlsMode: "disabled",
      certificatePolicy: "disabled",
    });
    expect(recoveredRoute.canBecomeReadyAfterRouteRealization()).toBe(true);
  });

  test("[DMBH-DOMAIN-002] answers canonical redirect target eligibility", () => {
    const servedTarget = domainBinding({ domainName: "app.example.com" });
    expect(servedTarget.canServeCanonicalRedirectTarget()).toBe(true);

    const redirectAlias = domainBinding({
      domainName: "www.example.com",
      redirectTo: "app.example.com",
    });
    expect(redirectAlias.canServeCanonicalRedirectTarget()).toBe(false);

    const source = domainBinding({ domainName: "docs.example.com" });
    const eligible = source.ensureCanonicalRedirectTarget({
      redirectTo: PublicDomainName.rehydrate("app.example.com"),
      target: servedTarget,
      phase: "domain-binding-route-configuration",
    });
    expect(eligible.isOk()).toBe(true);

    const missingTarget = source.ensureCanonicalRedirectTarget({
      redirectTo: PublicDomainName.rehydrate("missing.example.com"),
      phase: "domain-binding-route-configuration",
    });
    expect(missingTarget.isErr()).toBe(true);
    if (missingTarget.isErr()) {
      expect(missingTarget.error.details).toMatchObject({
        phase: "domain-binding-route-configuration",
        redirectTo: "missing.example.com",
      });
    }

    const redirectTarget = source.ensureCanonicalRedirectTarget({
      redirectTo: PublicDomainName.rehydrate("www.example.com"),
      target: redirectAlias,
      phase: "domain-binding-route-configuration",
    });
    expect(redirectTarget.isErr()).toBe(true);
  });
});
