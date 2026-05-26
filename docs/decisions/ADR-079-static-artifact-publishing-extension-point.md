# ADR-079: Static Artifact Publishing Extension Point

Status: Accepted

## Context

Appaloft already supports first-class static site deployment through the public `static` runtime
strategy: a static publish directory is packaged as an adapter-owned Docker/OCI static-server
artifact and deployed to a user runtime target.

Future hosted, self-hosted, and plugin deployments also need a lower-friction path where prebuilt
static files can be published as immutable artifacts and optionally routed through a provider
without creating a per-site server runtime. That capability must remain provider-neutral in public
Appaloft. Hosted default domains, billing, abuse policy, storage provider choice, CDN strategy, and
Cloud product packaging belong to private or provider adapters.

## Decision

Public Appaloft defines a neutral static artifact publishing extension point:

- `StaticArtifactManifest` models content-addressed static file metadata.
- `StaticArtifactStoredManifest` models a provider-neutral storage reference.
- `StaticArtifactRouteActivation` models a provider-neutral URL activation result.
- `StaticArtifactPublication` binds a Resource to a stored manifest and optional route activation.
- `StaticArtifactFilePayload` is an application-layer DTO for file bytes supplied to store
  adapters.
- `StaticArtifactPayloadReaderPort` translates a source path, directory, upload staging area, or
  future provider source into a manifest plus file payloads.
- `StaticArtifactStorePort`, `StaticArtifactRouteProviderPort`, and
  `StaticArtifactPublisherPort` live in the application boundary for future adapters.
- `StaticArtifactPublicationJournalPort` and `StaticArtifactPublicationReadModelPort` expose
  provider-neutral publication readback without tying public Appaloft to a hosted database.
- `PortBackedStaticArtifactPublisher` composes those ports without provider-specific branching.
- `PublishStaticArtifactCommand` owns the application intent for source-path based direct static
  publishing and composes the payload reader and publisher ports.
- `PublishStaticArtifactPayloadCommand` owns the application intent for JSON inline-file payload
  publishing, building the same manifest and file-payload model without requiring a server-local
  source path.
- `PublishStaticArtifactArchiveCommand` owns the application intent for JSON base64 zip archive
  publishing, expanding safe archive entries into the same manifest and file-payload model without
  requiring a server-local source path.
- `ListStaticArtifactPublicationsQuery` owns provider-neutral publication listing through the read
  model port.
- `appaloft static-artifacts publish <dist-or-zip>` packages local directories as inline payload
  commands and local `.zip` files as archive commands before dispatching the shared command bus,
  so local and remote CLI execution do not depend on a server-local source path.
- `POST /api/static-artifacts/publish` dispatches the same command for authenticated API callers
  that supply a server-local source path, returning a provider-neutral publication response DTO.
- `POST /api/static-artifacts/publish-payload` dispatches inline base64 file payloads through the
  same provider-neutral publisher boundary for Web, agent, or skill callers that already have a
  prebuilt dist artifact in memory.
- `POST /api/static-artifacts/publish-archive` dispatches a base64 `.zip` archive through the same
  provider-neutral publisher boundary for callers that can upload a packaged dist artifact.
- `GET /api/static-artifacts/publications` dispatches the listing query and returns
  provider-neutral publication summaries.
- `@appaloft/adapter-filesystem` may provide a local filesystem store/route adapter pair for
  local and self-hosted composition, plus a filesystem payload reader for dist directories and
  server-local `.zip` archives, while hosted provider choices stay out of public core.
- Public server/shell composition registers the filesystem payload reader, store, route provider,
  and publisher ports as the local/self-hosted default.
- The public HTTP adapter serves immutable local static artifact URLs backed by
  `dataDir/static-artifacts`.
- The local filesystem route provider records `promoteAlias` current pointers under
  `dataDir/static-artifacts`, and the public HTTP adapter serves the promoted artifact from
  `/static-artifacts/projects/{projectId}/resources/{resourceId}/current/`. Hosted/default-domain
  alias routing remains provider-specific adapter work.
- The local filesystem adapter records publication journal entries under `dataDir/static-artifacts`
  so local/self-hosted users can list published artifacts after the publish response is gone.

This extension point does not replace the existing Docker/OCI static-server deployment path and
does not add browser multipart upload, remote URL fetch upload, or staged upload sessions in this
decision. A future Web/upload round may wire richer browser upload or remote prebuilt publishing
through these ports after auth, persistence, read-model, and public documentation specs are
accepted.

## Consequences

- Public core can model static artifact manifests, publication identity, storage references, and
  route activation without naming S3, R2, IPFS, Pages, CDN, or hosted default domains.
- Provider packages, plugins, self-hosted adapters, and private hosted distributions can implement
  the application ports independently.
- The public filesystem adapter proves that the extension point can carry deployable file payloads,
  not only manifest metadata.
- CLI, API, Web, or future MCP transports can dispatch source-path, inline-payload, or archive
  commands without knowing whether the payload reader/store/route providers are filesystem,
  S3-compatible, IPFS, or private hosted adapters.
- Existing `resources.create -> deployments.create` static-site behavior remains unchanged.
- Cloud/private implementations must inject their adapters through the public ports instead of
  importing private behavior into public core or monkey-patching runtime internals.

## Non-Goals

- No hosted default domain behavior.
- No public billing, entitlement, abuse scanning, takedown, or cache-purge policy.
- No provider SDK type in `packages/core` or `packages/application`.
- No change to current static-server Docker/OCI deployment execution.
