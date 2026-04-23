---
title: "Access troubleshooting"
description: "Troubleshoot default URLs, custom domains, DNS, and TLS failures."
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "dns"
  - "tls error"
  - "domain failed"
relatedOperations:
  - domain-bindings.create
  - certificates.issue-or-renew
sidebar:
  label: "Troubleshooting"
  order: 6
---

<h2 id="access-troubleshooting-order">Troubleshooting order</h2>

Check resource runtime state, then proxy readiness, then domain ownership, then certificate readiness.

<h2 id="access-dns-failures">DNS failures</h2>

Confirm record type, target value, TTL, and whether the record points at the current server or proxy entrypoint.
