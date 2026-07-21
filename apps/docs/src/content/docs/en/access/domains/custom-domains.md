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
  - domain-bindings.show
  - domain-bindings.configure-route
  - domain-bindings.delete-check
  - domain-bindings.delete
sidebar:
  label: "Custom domains"
  order: 3
---

## Custom domain binding [#domain-binding-purpose]

A domain binding means the user wants a hostname to point at a resource. It is not deployment input or an implicit certificate side effect.

Make the generated access URL work before binding a custom domain. That keeps app/proxy troubleshooting separate from DNS and TLS troubleshooting.

Use custom domains when:

- A production hostname should point at a resource.
- Staging, preview, or customer environments need separate hostnames.
- External access should be added after deployment is stable.

## Binding inputs [#domain-binding-inputs]

Choose:

- Resource: which resource the hostname should reach.
- Environment: where the binding applies.
- Hostname: the full domain, such as `app.example.com`.
- Access policy: proxy/default entrypoint and HTTPS expectations.
- Certificate policy: automatic issue, imported certificate, or TLS later.

A domain name should not replace resource, server, or environment identifiers.

## Web, CLI, and API [#domain-binding-surfaces]

The Web console should allow binding from a resource or access page and immediately show ownership, route readiness, proxy readiness, diagnostics, and TLS next steps.

The CLI fits automation and release scripts. Use `appaloft domain-binding show <domainBindingId>` to read one binding, `configure-route` to switch between serving traffic and redirecting to a canonical binding, `delete-check` before deletion, and `delete --confirm <domainBindingId>` only after blockers are clear.

The HTTP API uses the same operation contracts. DNS/TLS semantics should not be hidden inside deployment status.

## What you see after creation [#domain-binding-output]

Typical states:

- `pending_ownership`: waiting for DNS or ownership verification.
- `pending_certificate`: ownership is verified but TLS is not ready.
- `ready`: domain and certificate are usable.
- `failed`: DNS, certificate material, or proxy entrypoint needs action.

## Provider DNS automation [#domain-binding-provider-dns]

When a user enters a hostname such as `pocketbase.example.com`, Appaloft first reduces it to the base domain, such as `example.com`, and checks public DNS for NS and authoritative nameserver data. This discovery does not require authorization. It only indicates which DNS provider probably hosts the domain, such as Cloudflare, GoDaddy, Route53, Namecheap, Vercel, DNSPod, Alibaba Cloud, Tencent Cloud, or an unknown provider.

Public DNS discovery does not prove ownership and does not grant Appaloft permission to write DNS. Automatic DNS setup still requires the user to authorize a concrete connector, and Appaloft must find a zone in that authorized account that covers the hostname:

- If Cloudflare is detected and the Cloudflare connector is available, the page recommends connecting Cloudflare DNS.
- After authorization, if the account contains the `example.com` zone, Appaloft can show a DNS plan and apply records after the user confirms.
- After authorization, if the account does not contain the `example.com` zone, Appaloft blocks automatic apply and explains that the authorized account does not cover the base domain.
- If another provider is detected but no connector exists yet, the page shows the manual DNS fallback.
- If the provider is unknown, the user can use manual DNS and later choose another connector.

### DNS connector workflow [#domain-binding-dns-connector-flow]

From a resource's Networking > Custom domains page or a domain binding detail page, the DNS connector flow is:

1. Create or open a domain binding that is still waiting for ownership.
2. Click Configure DNS. Appaloft detects the base domain, DNS provider, current resolution, and the DNS records this binding needs.
3. If Cloudflare is detected and Domain Connect is available, click Connect Cloudflare DNS. Appaloft builds a signed Domain Connect apply URL and opens the Cloudflare authorization window in the browser.
4. Confirm the records in Cloudflare. This is a one-time authorization flow; Appaloft does not store a long-lived Cloudflare token.
5. Return to Appaloft, then refresh the DNS plan or retry verification. Appaloft rechecks public DNS and ownership readiness; propagation can take a little time.
6. If the provider does not support automatic connection, the authorized account does not cover the zone, or Domain Connect is temporarily unavailable, copy the records from the Manual DNS table into the current DNS provider.

## Recovery [#domain-binding-recovery]

If binding fails, do not redeploy first. Check:

1. Whether generated access works.
2. Whether DNS points to the current server or proxy entrypoint.
3. Whether ownership verification records exist.
4. Whether certificate issue or import failed.

Deleting a binding removes managed custom-domain route intent only. It does not revoke certificates, erase certificate history, delete generated access, rewrite deployment snapshots, or remove server-applied route audit. If active certificate state is attached, delete is blocked until certificate lifecycle operations exist.

Related pages: [Domain ownership](/docs/en/access/domains/ownership/), [TLS certificates](/docs/en/access/tls/certificates/), and [Access troubleshooting](/docs/en/access/troubleshooting/).
