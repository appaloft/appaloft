---
title: "Domain ownership"
description: "Verify that the user controls a custom domain."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "ownership"
  - "dns verification"
  - "domain verify"
relatedOperations:
  - domain-bindings.confirm-ownership
sidebar:
  label: "Ownership"
  order: 4
---

<h2 id="domain-binding-ownership-check">Domain ownership check</h2>

Ownership checks prove that the user controls a hostname. Appaloft should not mark a custom domain as ready until control is verified, and ownership failures should not be reported as deployment failures.

Ownership checks usually happen after creating or updating a custom domain binding. Add the DNS record Appaloft provides, then check again.

<h2 id="domain-binding-dns-records">DNS records</h2>

DNS instructions should include:

- Record type, such as `CNAME`, `A`, `AAAA`, or TXT.
- Host name, the record name to configure.
- Target value, such as proxy entrypoint or verification token.
- TTL or expected propagation window.

Copy the value Appaloft provides. Do not search logs for tokens or use secrets as DNS values.

<h2 id="domain-binding-ownership-status">Status meanings</h2>

Common states:

- `pending`: required DNS records have not been observed.
- `checking`: Appaloft is checking DNS or proxy observations.
- `verified`: control of the hostname is confirmed.
- `failed`: records exist but values do not match, or resolution failed.

After DNS changes, `pending` can simply mean propagation has not completed.

<h2 id="domain-binding-ownership-retry">When to retry</h2>

Retry when:

- DNS records were just added or changed.
- The DNS provider shows the record as saved.
- Appaloft reported timeout or temporary resolution failure.

Fix before retrying when:

- Record type is wrong.
- Host name is wrong.
- Target value does not match.
- The domain still points at an old server or proxy.

Next step: [TLS certificates](/docs/en/access/tls/certificates/).
