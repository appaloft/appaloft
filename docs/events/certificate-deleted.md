# certificate-deleted Event Spec

## Normative Contract

`certificate-deleted` means Appaloft has removed a certificate from the visible active lifecycle
while retaining necessary audit history.

It does not mean the certificate was revoked with an external CA.

## Payload

```ts
type CertificateDeletedPayload = {
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  source: "managed" | "imported";
  deletedAt: string;
  preservedAudit: true;
  correlationId?: string;
  causationId?: string;
};
```

Payload must not include private key material, raw certificate material, passphrases, secret refs,
provider credentials, or raw provider responses.

## Consumers

Expected consumers:

- certificate read-model projection;
- domain/readiness/resource access summary projection;
- audit/notification.

## Idempotency

Consumers dedupe by `certificateId` and `deletedAt` or the event id when available.
