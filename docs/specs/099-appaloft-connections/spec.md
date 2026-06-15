# Appaloft Connections Spec

- Scope: provider-neutral public Appaloft connection model for external systems used by deploy,
  domains, source providers, infrastructure onboarding, notifications, billing adapters, identity,
  observability, storage, and future tool runtimes.
- Status: Proposed spec-only slice.
- Governing docs: [Operations](../../OPERATIONS.md), [Providers](../../PROVIDERS.md),
  [External Edge Access And DNS](../075-external-edge-access-and-dns/spec.md),
  [SSH Onboarding Provider](../092-ssh-onboarding-provider/spec.md).

## Summary

Appaloft needs one neutral model for connecting external systems without turning each provider into
a special case. A connection can represent a GitHub App installation, a one-click DNS setup flow, a
long-lived DNS provider credential, an infrastructure provider account, a notification destination,
or a billing adapter. The connection model is not AI-specific and not hosted-service-specific.
AI agents, CLI commands, Web flows, deployment workflows, and future tool runtimes are consumers of
the same operation catalog and provider ports.

The core rule is simple:

```text
human or operator authorization
  -> Appaloft connection record and capabilities
  -> deterministic Appaloft command/service plan
  -> provider adapter execution
  -> safe readback, audit, revoke, and cleanup
```

LLMs may explain, request, or choose from safe plans, but they must not hold long-lived credentials
or directly mutate provider resources.

## Ubiquitous Language

| Term | Meaning | Notes |
| --- | --- | --- |
| ConnectorDefinition | A provider-neutral catalog item describing one supported category/provider/capability set. | Example: `github-source`, `cloudflare-dns`. |
| Connection | An authorized instance of a connector for an owner such as an account, organization, project, environment, resource, or operator scope. | This is the user/operator-owned thing. |
| ConnectionCategory | A second-level capability family such as `source`, `dns`, `infrastructure`, `notification`, `billing`, `identity`, `observability`, or `storage`. | Categories are not provider brands. |
| ConnectionCapability | A deterministic action Appaloft can plan, accept, apply, observe, or revoke through a connection. | Example: `dns.records.apply`. |
| CredentialGrant | The grant or credential lifecycle behind a connection. | It may be temporary, persistent, provider-app based, or a manual secret reference. |
| ProviderAdapter | A concrete adapter that translates Appaloft connection capabilities into provider API calls. | Vendor DTOs and SDKs stay behind this boundary. |
| Temporary setup | A one-time provider consent or template flow that does not leave Appaloft with a reusable token. | Domain Connect synchronous DNS flow is the model example. |
| Persistent connection | A connection backed by an encrypted credential, refresh token, provider app installation, or secret reference. | Used for ongoing management and cleanup. |
| Source connection | A connection used for repository browsing, source events, commit metadata, deployment statuses, or similar source-provider work. | GitHub App installation is the model example. |
| Identity connection | A sign-in/authentication provider connection. | A GitHub login is not automatically source access. |
| Infrastructure connection | A connection that can plan or apply external infrastructure onboarding such as creating a VPS and returning a generic SSH target proposal. | High-cost actions require explicit confirmation. |
| Notification connection | A connection that can send or route deployment/resource/workflow notifications. | Slack/email are examples. |
| Billing connection | A connection to a billing or payment provider. | Billing facts are downstream policy; domain events are not billing events. |

## Credential Grant Kinds

| Grant kind | Long-lived secret stored by Appaloft | Example | Expected use |
| --- | --- | --- | --- |
| `temporary-domain-connect` | No | Domain Connect synchronous DNS setup | One-click DNS template apply followed by Appaloft verification. |
| `limited-oauth-grant` | Optional, provider-scoped | Domain Connect async, infrastructure OAuth | Scoped capability access such as applying a template or reading server inventory. |
| `persistent-provider-credential` | Yes, encrypted or secret-ref backed | Cloudflare DNS API token, Route53 credential | Ongoing DNS record management, verification, cleanup, and drift checks. |
| `provider-app-installation` | Installation id plus app-owned secret material | GitHub App installation | Short-lived installation token exchange for repo access and webhooks. |
| `manual-secret-reference` | Appaloft stores only a reference | Operator-managed or enterprise deployments | Self-hosted/operator-provided credential material. |

## Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| APP-CONN-001 | Neutral model exists | Appaloft needs source, DNS, infra, notification, identity, billing, observability, and storage integrations | A spec/code round defines Connections | It uses `ConnectorDefinition`, `Connection`, `ConnectionCategory`, `ConnectionCapability`, `CredentialGrant`, and `ProviderAdapter` without hosted-service-only language. |
| APP-CONN-002 | Category support is explicit | A category has only a few implemented providers | Catalog/UI/API lists the category | It marks supported, setup-required, unavailable, and deferred providers without implying every app in a category can connect. |
| APP-CONN-003 | DNS one-click setup is temporary | A DNS provider supports Domain Connect-style synchronous setup | User starts DNS setup | Appaloft generates a deterministic DNS template/plan, redirects to provider consent, verifies completion, and does not store a reusable provider token. |
| APP-CONN-004 | Persistent DNS connection manages only accepted records | A DNS provider credential is installed | Appaloft needs to apply domain verification, CNAME/A/AAAA, or cleanup records | Appaloft plans records, detects conflicts, applies accepted Appaloft-owned records, records provider ids when available, and deletes only managed/adopted records. |
| APP-CONN-005 | DNS conflicts fail closed | A provider has user-owned records on the same hostname | Appaloft plans/apply DNS records | Default behavior returns a conflict and manual/override path; it does not silently overwrite unmanaged records. |
| APP-CONN-006 | GitHub login is identity-only | A user signed in with GitHub OAuth | Source access is requested | Appaloft requires a source connection or explicit repo scope/install authorization; it does not infer repo access from login. |
| APP-CONN-007 | GitHub App maps to source connection | A GitHub App installation exists | Appaloft lists source connections or repositories | Installation id, account, repository selection, permissions, webhook state, and safe readback are represented as a `source/github` connection. |
| APP-CONN-008 | Provider app tokens are short lived | A GitHub App source connection needs API access | Appaloft lists repositories or updates deployment status | Appaloft exchanges app auth for a short-lived installation token, narrows scope when possible, and never logs or returns the token value. |
| APP-CONN-009 | Infrastructure connection returns proposals | An onboarding provider creates or imports infrastructure | A user wants an SSH deployment target | The adapter returns a reviewable generic SSH target proposal and requires explicit confirmation before saving a server. |
| APP-CONN-010 | High-cost provider mutation requires explicit acceptance | A capability would create paid or scarce provider resources | A user or operator accepts a plan | The command records actor, owner, plan id, cost/risk summary, cleanup path, and provider readback before treating the result as ready. |
| APP-CONN-011 | Notification connections stay capability scoped | A deployment or workflow wants to send a message | Notification provider is connected | Appaloft sends through a deterministic adapter and redacts provider credentials and sensitive payload fields from read models. |
| APP-CONN-012 | Billing connections do not own domain facts | A resource/deployment/connection event occurs | Billing policy observes it | Billing may derive usage through explicit metering policy; connection or deployment commands never write billing ledgers directly. |
| APP-CONN-013 | AI consumers use operations, not secrets | An agent needs an external action | It calls an Appaloft tool/operation | The tool invokes Appaloft commands and never exposes long-lived provider secrets to the model. |
| APP-CONN-014 | HTTP and CLI expose the same semantics | A user, tool, or automation manages connections | It uses API or CLI | Catalog, list, show, connect, callback, plan, accept, apply, revoke, and status surfaces share the same operation contract. |
| APP-CONN-015 | Web surfaces are contextual and central | A user binds a domain, chooses a source, registers a server, or configures notifications | Web needs a connection | Web can enter from a central Connections area or contextual workflow and still uses the same application services. |
| APP-CONN-016 | Provider adapters are mockable | Tests run without network or paid provider access | Connection flows execute | Fake providers simulate success, conflict, token expiry, revoke, callback/webhook, rate limit, and provider errors. |

## Public Surfaces

Candidate operation names for a later code round:

- `connections.catalog.list`
- `connections.categories.list`
- `connections.list`
- `connections.show`
- `connections.connect.start`
- `connections.connect.callback`
- `connections.revoke`
- `connections.capability.plan`
- `connections.capability.accept`
- `connections.status.show`

Candidate CLI forms:

```text
appaloft connections catalog
appaloft connections categories
appaloft connections list
appaloft connections show <connectionId>
appaloft connections connect <provider> --category <category>
appaloft connections revoke <connectionId>
appaloft connections plan <connectionId> --capability <key> --json
appaloft connections accept <planId> --json
appaloft dns connect <domain>
appaloft dns plan <domain> --hostname <host> --target <target> --json
appaloft dns apply <planId> --json
```

Candidate HTTP routes may be shaped as REST/oRPC equivalents of the same operations. Exact transport
schemas belong in the future operation catalog/code round.

## Provider Boundary

Provider-specific concerns stay behind adapters:

- token format, refresh, revocation, and expiry;
- provider account, team, zone, project, server, repository, or webhook ids;
- conflict detection and provider-native error codes;
- provider API pagination, rate limits, retries, and backoff;
- provider SDK request/response DTOs;
- provider-specific record tags, comments, metadata, and audit ids.

Core/application surfaces should expose only Appaloft terms: connection id, provider key, category,
capabilities, owner, grant kind, status, safe readback, plan, acceptance, and audit references.

## Mock Provider Requirements

Future implementation should provide fake provider adapters before real provider adapters:

- fake Domain Connect provider: discovery, settings, supported template, consent success/cancel/error;
- fake DNS provider: list/create/update/delete records, conflicts, revoked credentials, rate limit;
- fake GitHub provider: installation callback/webhook, repository list, token expiry, permission narrowing;
- fake infrastructure provider: region/size/image catalog, cost estimate, accepted fake create, cleanup evidence;
- fake notification provider: payload capture and redaction;
- fake billing provider: no-op proof that billing is not mutated by connection commands.

## Non-Goals

- No provider-specific implementation in this spec-only slice.
- No hosted-service-only terminology in public contracts.
- No general-purpose DNS zone editor.
- No implicit DNS mutation from deployment creation.
- No silent upgrade from identity login to source access.
- No LLM/browser automation as the provider mutation mechanism.
- No billing ledger mutation from connection commands.
- No raw provider tokens, private keys, API keys, refresh tokens, webhook secrets, or provider raw
  responses in read models, logs, errors, public docs, or support bundles.

## Follow-Up Rounds

- Add public neutral connection model and operation catalog entries.
- Add fake provider adapters and contract tests.
- Integrate GitHub App source-provider records into `source/github` connection read models.
- Add Domain Connect temporary DNS setup and persistent DNS provider boundary.
- Add Web/CLI/API surfaces using the same operation names.
- Add hosted/private distribution overlays outside public core for official provider apps, commercial
  policy, credential stores, and provider availability.
