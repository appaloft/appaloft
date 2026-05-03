# Automatic Route Context Lookup Baseline

## Status

Accepted for Phase 6 / 0.8.0 implementation.

## Scope

This slice adds provider-neutral automatic route/resource context lookup for access failure
diagnostics. It resolves a safe route context from hostname and path using existing read models,
then lets evidence capture enrich `resource-access-failure/v1` envelopes when provider-injected
signals do not include related ids.

This is an internal read-model/query-service capability. It does not add a public operation,
transport route, CLI command, Web form, route repair command, or real Traefik error-middleware e2e
coverage.

## No ADR Needed

No new ADR is required because the behavior implements the existing ADR-019 observable proxy
configuration and access diagnostics direction without changing route ownership, request-id
semantics, retention semantics, or public error contracts. It uses existing resource access,
domain binding, deployment snapshot, proxy preview, and server-applied route read state.

## Input

The lookup accepts:

- `hostname`;
- `path`;
- optional `requestId`;
- optional `method`;
- optional `observedAt`;
- optional `routeSource` hint.

Hostnames are normalized case-insensitively. Paths are normalized to a safe path without query
strings or fragments.

## Output

The lookup returns a safe result with:

- `status`: `found` or `not-found`;
- `matchedSource`;
- `resourceId`;
- `deploymentId`;
- `domainBindingId`;
- `serverId`;
- `destinationId`;
- `routeId`;
- `routeSource`;
- `routeStatus`;
- `confidence`;
- `nextAction`.

The output must not contain secrets, private keys, provider raw payloads, SSH credentials, auth
headers, cookies, sensitive query values, internal command output, or raw remote logs.

## Matching Sources

The lookup must prefer existing read models before any new persistence API:

- generated access route summaries from `ResourceAccessSummary`;
- durable domain binding route summaries and `DomainBindingReadModel`;
- server-applied route summaries from `ResourceAccessSummary`;
- deployment snapshot route context from resource/deployment read state;
- proxy preview descriptors when an existing read surface already exposes them.

This slice intentionally avoids a new hostname/path repository method. If a later slice needs
indexed persistence lookup, it must introduce small composable specs such as `ByHostnameSpec`,
`ByPathSpec`, and `ObservedAtSpec`, with a persistence visitor translating the spec tree. It must
not add `findByHostname`, `findByRequestId`, or optional-parameter god specs.

## Precedence

When more than one read-model source matches the same hostname/path, precedence is stable:

1. ready durable domain binding route;
2. non-ready durable domain binding route when explaining a blocking access failure;
3. server-applied route;
4. latest generated access route;
5. planned generated access route;
6. deployment snapshot route when the observed context is explicitly historical;
7. safe not-found.

Within the same source, the longest matching path prefix wins. A route-source hint may increase
confidence for the matching source, but it must not override stable precedence.

## Evidence Capture

When the access-failure renderer captures evidence and the incoming provider-neutral diagnostic
does not include route context, it should call automatic route context lookup with the safe
affected hostname/path. If a context is found, capture stores the same sanitized diagnostic
envelope with safe related ids filled in.

If no context is found, capture still stores the safe diagnostic envelope without leaking other
resource ids.

## Public Surface

No new public operation is added. Existing public behavior remains:

- edge diagnostic renderer returns the same safe HTML/problem envelope;
- `resources.access-failure-evidence.lookup` returns the existing lookup schema;
- `resources.show`, `resources.health`, `resources.diagnostic-summary`,
  `resources.proxy-configuration.preview`, `resources.runtime-logs`, and `deployments.logs`
  remain the owner-facing diagnostic surfaces.

The user-visible improvement is that existing evidence and downstream diagnostics can include
safe related resource/deployment/domain/route ids when hostname/path can be resolved.

## Out Of Scope

- real Traefik error-middleware e2e coverage;
- provider-native raw metadata parsing;
- route repair, redeploy, rollback, or dependency resource mutation;
- Web lookup form;
- companion/static renderer for one-shot CLI remote SSH runtimes.
