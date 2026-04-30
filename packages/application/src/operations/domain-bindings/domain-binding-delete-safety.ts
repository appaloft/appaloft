import { type CertificateSummary, type DomainBindingDeleteSafety } from "../../ports";

export function domainBindingDeleteSafety(input: {
  domainBindingId: string;
  certificates: CertificateSummary[];
}): DomainBindingDeleteSafety {
  const activeCertificates = input.certificates.filter(
    (certificate) => certificate.status === "active",
  );
  const blockers =
    activeCertificates.length > 0
      ? [
          {
            kind: "active-certificate" as const,
            severity: "blocking" as const,
            message:
              "Domain binding deletion is blocked while active certificate state is attached. Revoke/delete certificate lifecycle is a later explicit operation.",
            relatedEntityType: "certificate",
            ...(activeCertificates[0] ? { relatedEntityId: activeCertificates[0].id } : {}),
            count: activeCertificates.length,
          },
        ]
      : [];
  const warnings =
    input.certificates.length > activeCertificates.length
      ? [
          {
            kind: "certificate-history" as const,
            severity: "warning" as const,
            message:
              "Historical certificate attempts are retained for audit and are not revoked or removed by domain binding deletion.",
            relatedEntityType: "certificate",
            count: input.certificates.length - activeCertificates.length,
          },
        ]
      : [];

  return {
    domainBindingId: input.domainBindingId,
    safeToDelete: blockers.length === 0,
    blockers,
    warnings,
    preservesGeneratedAccess: true,
    preservesDeploymentSnapshots: true,
    preservesServerAppliedRouteAudit: true,
  };
}
