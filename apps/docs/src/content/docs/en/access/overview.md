---
title: "Domains and access"
description: "Generated access URLs, server-applied routes, custom domains, certificates, and readiness."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "domain"
  - "tls"
  - "certificate"
  - "access route"
relatedOperations:
  - domain-bindings.create
  - domain-bindings.confirm-ownership
  - certificates.issue-or-renew
sidebar:
  label: "Domains and access"
  order: 7
---

<h2 id="access-generated-route">Generated access URL</h2>

Generated access URLs depend on server public address, proxy readiness, and resource network settings.

<h2 id="domain-binding-purpose">Custom domain binding</h2>

A domain binding means the user wants a domain to point at a resource. It is not deployment input.

<h2 id="domain-binding-ownership-check">Ownership check</h2>

Ownership checks prove the user controls the domain.

<h2 id="certificate-readiness">Certificate readiness</h2>

Certificate readiness describes whether TLS is usable separately from app runtime health.
