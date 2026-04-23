---
title: "Custom domains"
description: "Bind a custom domain to a resource."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "custom domain"
  - "domain binding"
  - "hostname"
relatedOperations:
  - domain-bindings.create
sidebar:
  label: "Custom domains"
  order: 3
---

<h2 id="domain-binding-purpose">Custom domain binding</h2>

A domain binding means the user wants a hostname to point at a resource. It is not deployment input or an implicit certificate side effect.

Make the generated access URL work before binding a custom domain. That keeps app/proxy troubleshooting separate from DNS and TLS troubleshooting.

Use custom domains when:

- A production hostname should point at a resource.
- Staging, preview, or customer environments need separate hostnames.
- External access should be added after deployment is stable.

<h2 id="domain-binding-inputs">Binding inputs</h2>

Choose:

- Resource: which resource the hostname should reach.
- Environment: where the binding applies.
- Hostname: the full domain, such as `app.example.com`.
- Access policy: proxy/default entrypoint and HTTPS expectations.
- Certificate policy: automatic issue, imported certificate, or TLS later.

A domain name should not replace resource, server, or environment identifiers.

<h2 id="domain-binding-surfaces">Web, CLI, and API</h2>

The Web console should allow binding from a resource or access page and immediately show ownership and TLS next steps.

The CLI fits automation and release scripts. CLI output should include binding id, hostname, current status, and next action.

The HTTP API should return binding status, ownership status, certificate status, and recoverable errors. DNS/TLS semantics should not be hidden inside deployment status.

<h2 id="domain-binding-output">What you see after creation</h2>

Typical states:

- `pending_ownership`: waiting for DNS or ownership verification.
- `pending_certificate`: ownership is verified but TLS is not ready.
- `ready`: domain and certificate are usable.
- `failed`: DNS, certificate material, or proxy entrypoint needs action.

<h2 id="domain-binding-recovery">Recovery</h2>

If binding fails, do not redeploy first. Check:

1. Whether generated access works.
2. Whether DNS points to the current server or proxy entrypoint.
3. Whether ownership verification records exist.
4. Whether certificate issue or import failed.

Related pages: [Domain ownership](/docs/en/access/domains/ownership/), [TLS certificates](/docs/en/access/tls/certificates/), and [Access troubleshooting](/docs/en/access/troubleshooting/).
