# Applied Route Context Metadata Contract Baseline

## Status

- Round: Spec Round -> Test-First -> Code Round -> Post-Implementation Sync
- Artifact state: implemented
- Roadmap target: Phase 6 Access Policy, Domain/TLS Lifecycle, And Observability Hardening (`0.8.0` gate)
- Compatibility impact: `pre-1.0-policy`; additive safe read-model fields on existing proxy
  preview and diagnostic/evidence paths, with no new public operation

## Business Outcome

When a visitor cannot open a generated access URL, durable custom domain, server-applied route, or
deployment-snapshot route, Appaloft should explain which safe route context the failed URL belongs
to without reading screenshots, raw reverse-proxy config, SSH logs, credentials, provider-native
payloads, cookies, auth headers, or sensitive query strings.

This slice establishes a provider-neutral applied route context metadata contract that provider
renderers can attach to proxy preview output and that access-failure evidence capture can reuse
before falling back to hostname/path lookup.

## Applied Route Context Metadata Contract

```ts
type AppliedRouteContextMetadata = {
  schemaVersion: "applied-route-context/v1";
  resourceId: string;
  deploymentId?: string;
  domainBindingId?: string;
  serverId?: string;
  destinationId?: string;
  routeId: string;
  diagnosticId: string;
  routeSource: "generated-default" | "durable-domain" | "server-applied" | "deployment-snapshot";
  hostname: string;
  pathPrefix: string;
  proxyKind: "none" | "traefik" | "caddy";
  providerKey?: string;
  appliedAt?: string;
  observedAt?: string;
};
```

The metadata is copy-safe and provider-neutral. It may appear in provider-rendered proxy
configuration preview route views and diagnostics. It must not contain secrets, private keys,
provider raw payloads, SSH credentials, auth headers, cookies, sensitive query strings, raw remote
logs, internal upstream addresses, or unredacted command output.

## Lookup And Evidence Rules

Evidence capture prefers supplied `applied-route-context/v1` metadata when it is available and
safe. Hostname/path automatic route context lookup remains the fallback when provider-applied
metadata is absent.

Provider-rendered preview must expose enough metadata to validate generated access, durable domain,
server-applied, and deployment-snapshot route ownership in tests without applying real Traefik,
DNS, TLS, SSH, or route repair.

## Public Surface

- API/oRPC and CLI: existing `resources.proxy-configuration.preview` may return additive
  `appliedRouteContext` fields in route views and diagnostic context arrays.
- Access-failure renderer/evidence: no new route or operation; evidence capture enriches the
  existing `resource-access-failure/v1` envelope from supplied metadata or falls back to
  hostname/path lookup.
- Web/UI: no new lookup form and no Svelte-only diagnostic logic. Web continues to render shared
  contracts/read models.
- Public docs/help: existing access/proxy/diagnostics anchors remain sufficient because no new user
  workflow or help affordance is added.

## No ADR Needed

No new ADR is required. The behavior implements ADR-017 generated access routing, ADR-019
observable edge proxy configuration and access diagnostics, and ADR-024 server-applied route state.
It does not change route ownership, introduce a route aggregate, change evidence retention,
introduce route repair/redeploy/rollback, or create a new public operation.

## Non-Goals

- No real Traefik error-middleware e2e.
- No route repair, redeploy, rollback, or provider-native raw metadata parsing.
- No Web lookup form.
- No companion/static renderer for one-shot CLI remote SSH runtimes.
