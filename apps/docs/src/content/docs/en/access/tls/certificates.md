---
title: "TLS certificates"
description: "Understand certificate readiness, issuing, importing, and renewal."
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "certificate"
  - "tls"
  - "https"
relatedOperations:
  - certificates.issue-or-renew
sidebar:
  label: "Certificates"
  order: 5
---

<h2 id="certificate-readiness">Certificate readiness</h2>

Certificate readiness describes whether HTTPS is usable. It is separate from application deployment state, generated access readiness, and domain ownership.

A resource can deploy successfully while the certificate is still pending. A ready certificate also does not guarantee the application health check passes.

Certificate readiness should answer:

- Does Appaloft have certificate material for this hostname?
- Does the certificate cover the hostname and remain valid?
- Is the proxy serving this certificate for HTTPS traffic?

<h2 id="certificate-inputs">Certificate inputs</h2>

Existing flows should cover:

- Automatic issue or renewal, where the user provides hostname and ownership proof.
- Imported certificates, where the user provides certificate chain, private key, and metadata.

Imported private keys are secrets. Web, CLI, API, logs, and diagnostics must not echo full key material.

<h2 id="certificate-validation">Validation</h2>

Readiness checks should validate:

- Certificate chain parses.
- Private key matches the certificate.
- Hostname is covered.
- Certificate is not expired or near expiry.
- Algorithm and key size meet runtime requirements.

<h2 id="certificate-renewal">Renewal</h2>

Renewal status should be observable and point to DNS, ownership, or certificate material issues when it fails.

If renewal fails, do not redeploy the app first. Check:

1. Domain ownership is still valid.
2. DNS still points to the current proxy entrypoint.
3. Certificate material is not expired, incomplete, or mismatched.
4. The proxy reloaded the new certificate.

Related pages: [Domain ownership](/docs/en/access/domains/ownership/) and [Access troubleshooting](/docs/en/access/troubleshooting/).
