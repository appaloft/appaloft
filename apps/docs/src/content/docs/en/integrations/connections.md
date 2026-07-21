---
title: "Connections and connectors"
description: "Understand how Appaloft connects source, DNS, infrastructure, and notification services."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "connector"
  - "connection"
  - "dns connector"
  - "cloudflare dns"
  - "source connector"
relatedOperations:
  - connections.catalog.list
  - connections.categories.list
  - connections.list
  - connections.show
  - connections.connect.start
  - connections.connect.callback
  - connections.revoke
  - connections.status.show
  - connections.capability.plan
  - connections.capability.accept
  - connections.capability.apply
sidebar:
  label: "Connections"
  order: 1
---

## Model [#connections-model]

A Connection is an authorization relationship that Appaloft stores for a user or operator. It can come from a GitHub App installation, DNS provider authorization, infrastructure provider credential, Slack webhook, or a future billing, identity, or observability provider.

A ConnectorDefinition is a concrete catalog item such as `github-source`, `cloudflare-dns`, `vultr-infrastructure`, or `slack-notification`. Users install, authorize, revoke, and audit these concrete connectors, not abstract categories.

A ConnectionCategory is a capability family such as `source`, `dns`, `infrastructure`, `notification`, or `billing`. Categories are for grouping pages, filtering, permission descriptions, and CLI convenience namespaces. `dns` is not an installable connector by itself; `cloudflare-dns` is the concrete DNS connector.

A ConnectionCapability is a deterministic action Appaloft can plan or execute, such as `dns.records.plan`, `dns.records.apply`, `source.repositories.list`, `infrastructure.servers.plan`, or `notification.messages.send`.

## Naming boundary [#connector-naming]

| Layer | Example | Purpose |
| --- | --- | --- |
| Primary model | Connection, ConnectorDefinition | Authorization lifecycle, readback, audit, revoke. |
| Category | `source`, `dns`, `infrastructure`, `notification` | Page grouping, capability filtering, convenience entrypoints. |
| Concrete connector | `github-source`, `cloudflare-dns`, `vultr-infrastructure`, `slack-notification` | Real installation, authorization, token or secret reference, provider adapter selection. |
| Capability | `dns.records.apply`, `infrastructure.servers.plan` | Deterministic plan, apply, verify, and cleanup actions. |

So "DNS connector" is shorthand for "a concrete connector in the DNS category." API payloads, CLI JSON, audit records, and tests should use a concrete key such as `cloudflare-dns`. Commands such as `appaloft dns ...` are DNS capability shortcuts; underneath they should translate to `connections.capability.*` and a concrete connector key.

## DNS connections [#dns-connections]

DNS connections are used to plan, apply, verify, and clean up Appaloft-managed DNS records. Appaloft can create these records automatically, but it should do so through deterministic provider adapters: generate a plan, detect conflicts, wait for acceptance, and then call the provider API. LLMs may explain the plan or help choose an entrypoint, but they should not hold tokens or directly mutate DNS.

DNS readiness has three layers:

| Layer | Authorization required | Purpose |
| --- | --- | --- |
| Public DNS discovery | No | Reduce a hostname to its base domain and query public NS or authoritative nameserver data to infer whether Cloudflare, GoDaddy, Route53, Namecheap, Vercel, DNSPod, Alibaba Cloud, Tencent Cloud, or an unknown provider probably hosts it. |
| Connector authorization | Yes | The user authorizes a concrete connector, such as `cloudflare-dns`. Authorization proves Appaloft can access that provider account; it does not prove that account owns the current hostname. |
| Zone ownership matching | Yes | Appaloft lists zones through the authorized account. Only a zone that covers the hostname can produce and apply a DNS plan. |

If public DNS discovery detects Cloudflare, the page can recommend connecting Cloudflare DNS. If the authorized Cloudflare account does not contain a zone that covers the hostname, Appaloft must block automatic setup and explain that the account does not cover the base domain. If GoDaddy is detected but no GoDaddy connector exists yet, Appaloft should show the manual DNS fallback.

DNS can use two authorization shapes:

| Grant | Long-lived secret stored | Typical use |
| --- | --- | --- |
| Temporary setup | No | One-time Domain Connect style provider window where the user confirms a template and Appaloft verifies the result. |
| Persistent provider credential | Yes, encrypted or referenced through a controlled secret | Ongoing Cloudflare/Route53 style record management, verification, cleanup, and drift checks. |

The current Cloudflare DNS connector uses Temporary setup by default through Domain Connect:

1. The user clicks Configure DNS from a resource's Custom domains area or from a domain binding detail page.
2. Appaloft uses public DNS discovery to detect the provider and builds the DNS plan required for the binding.
3. When Cloudflare is detected, the user clicks Connect Cloudflare DNS and Appaloft opens Cloudflare's Domain Connect apply page.
4. The user confirms the template records in Cloudflare. Appaloft does not store a long-lived Cloudflare token and does not gain permission to change DNS later.
5. The user returns to Appaloft, then refreshes the plan or retries verification. Appaloft confirms the result through public DNS readback.
6. If the provider cannot be connected automatically, the authorized account does not cover the zone, or the user does not want Domain Connect, Appaloft keeps showing the Manual DNS table.

This flow still belongs to the concrete `cloudflare-dns` connector; `dns` is only the capability category. Audit, plan, and status records should store the concrete connector, Domain Connect operation, target hostname, record types, and readback result.

## Source connections [#source-connections]

GitHub login is identity, not automatic source access. Repository access, repository listing, webhooks, and deployment status writes need a source connector such as `github-source`. Existing GitHub App installations can be presented as source connection readback while keeping provider-app permissions and short-lived token exchange boundaries.

## Infrastructure connections [#infrastructure-connections]

Infrastructure connectors can plan or import external runtime targets, such as asking Vultr, DigitalOcean, Hetzner, or another provider for a reviewable SSH server proposal. Paid or scarce resource creation must first return a plan, cost/risk summary, cleanup path, and provider readback, then require explicit user or operator acceptance.

## Notification connections [#notification-connections]

Notification connectors route deployment, resource, or workflow status to external systems such as a Slack channel or webhook. Readback should show the destination and safe status only; it must not return webhook URLs, tokens, or raw provider payloads.

## Billing connections [#billing-connections]

Billing is a connection category, but billing policy does not own Appaloft domain facts. Deployment, resource, and connection lifecycle events may be observed by billing policy and converted into metering facts; connection commands should not directly write invoices, subscriptions, or ledgers.

## AI boundary [#connections-ai-boundary]

Connectors are not AI-specific. Humans, CLI, Web, API, and agents all use the same operation catalog. An AI agent may call Appaloft operations to request a plan, show risk, wait for user confirmation, or read status. Long-lived provider tokens, private keys, webhook secrets, and raw provider responses should not enter model context, logs, error messages, or public read models.

## Entrypoints [#connections-entrypoints]

Generic entrypoints use connector or connection semantics:

```text
appaloft connectors catalog
appaloft connectors categories
appaloft connectors list
appaloft connectors connect <connector>
appaloft connectors plan --connector <connector> --capability <key> --parameters-json <json>
appaloft connectors apply --connector <connector> --capability <key> --parameters-json <json> --accepted-plan-id <acceptedPlanId>
appaloft connectors revoke <connectionId>
```

Capability-specific shortcuts can exist, but they are not a separate model:

```text
appaloft dns plan <domain> --hostname <host> --target <target> --connector cloudflare-dns
appaloft dns apply <domain> --hostname <host> --target <target> --connector cloudflare-dns --accepted-plan-id <acceptedPlanId>
appaloft infrastructure propose <target> --provider vultr --region <region> --size <size> --image <image>
```

HTTP, SDK, Web, and future tool runtimes should expose the same semantics: catalog, categories, list, show, connect, callback, plan, accept, apply, status, and revoke. Different entrypoints can have different UI, but they must not bypass the connection lifecycle, accepted plan, tenant scope, secret redaction, or audit.
