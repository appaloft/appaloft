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

## Generated access URL [#access-generated-route]

Generated access URLs depend on server public address, proxy readiness, and resource network settings.

## Custom domain binding [#domain-binding-purpose]

A domain binding means the user wants a domain to point at a resource. It is not deployment input.

## Ownership check [#domain-binding-ownership-check]

Ownership checks prove the user controls the domain.

## Certificate readiness [#certificate-readiness]

Certificate readiness describes whether TLS is usable separately from app runtime health.
