# certificate-revoked Event Spec

## Normative Contract

`certificate-revoked` means Appaloft has durably recorded that a certificate is no longer usable for
Appaloft-managed TLS.

For provider-issued certificates, it follows provider revocation when provider revocation is
required and available. For imported certificates, it records Appaloft-local TLS disablement only.

## Payload

```ts
type CertificateRevokedPayload = {
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  source: "managed" | "imported";
  revokedAt: string;
  providerKey?: string;
  reason?: string;
  externalRevocation: "provider" | "appaloft-local";
  correlationId?: string;
  causationId?: string;
};
```

Payload must not include private key material, raw certificate material, passphrases, secret refs,
provider credentials, or raw provider responses.

## Consumers

Expected consumers:

- certificate read-model projection;
- domain readiness/resource access summary projection;
- audit/notification;
- edge proxy route activation/reload process when TLS configuration changes require it.

## Idempotency

Consumers dedupe by `certificateId` and `revokedAt` or the event id when available.
