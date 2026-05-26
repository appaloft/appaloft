# Static Artifact Publishing Extension Point Spec

- Scope: provider-neutral public Appaloft extension point for direct static artifact publishing.
- Status: Active extension-point slice.
- Governing ADR: [ADR-079](../../decisions/ADR-079-static-artifact-publishing-extension-point.md).

## Summary

Public Appaloft must expose a neutral static artifact publishing boundary so adapters can publish a
prebuilt static artifact without requiring a per-site server runtime. This slice adds core domain
vocabulary, application ports, and a local filesystem adapter proving the payload boundary. It does
not add hosted default domain, object storage provider, CDN, cache purge, billing, abuse policy, or
Cloud strategy.

## Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| STATIC-ARTIFACT-EXT-001 | Static artifact manifest is content-addressed and internally consistent | A manifest includes file digests, file count, and byte total | The core model validates it | The manifest is accepted only when file count and total bytes match the file digest list. |
| STATIC-ARTIFACT-EXT-002 | Publication stays provider-neutral | A stored manifest and route activation come from any adapter | The publication is created | The publication records storage ref, provider key, optional route URL, project id, and resource id without naming Cloud, R2, S3, IPFS, CDN, or Pages. |
| STATIC-ARTIFACT-EXT-003 | Stored manifest identity must match manifest identity | A stored manifest references a different artifact id or digest | The publication is created | The publication is rejected before any adapter-specific behavior can treat mismatched content as published. |
| STATIC-ARTIFACT-EXT-004 | Application boundary exposes adapter ports | Future adapters need direct static publishing | Application ports are inspected | `StaticArtifactFilePayload`, `StaticArtifactPayloadReaderPort`, `StaticArtifactStorePort`, `StaticArtifactRouteProviderPort`, and `StaticArtifactPublisherPort` exist with neutral inputs/outputs and DI tokens. |
| STATIC-ARTIFACT-EXT-005 | Application publisher composes provider ports | A manifest, file payloads, and provider-neutral store/route adapters exist | The publisher is called | It forwards payloads to the store, activates an immutable or alias route, and returns a `StaticArtifactPublication` without provider-specific branching. |
| STATIC-ARTIFACT-EXT-006 | Local filesystem adapter proves payload storage boundary | A manifest and file payloads are published through the filesystem adapter | The publisher runs with filesystem store/route providers | Files are written under the configured storage root, unsafe relative paths are rejected before route activation, and the returned URL stays provider-neutral HTTP(S). |
| STATIC-ARTIFACT-EXT-007 | Application command publishes from a source path | A source path, project id, and resource id are supplied | `PublishStaticArtifactCommandHandler` runs | It asks `StaticArtifactPayloadReaderPort` to read the source path, then publishes the returned manifest and payloads through `StaticArtifactPublisherPort`. |
| STATIC-ARTIFACT-EXT-008 | Filesystem adapter publishes a dist directory through the command pipeline | A dist directory contains static files | `PublishStaticArtifactCommandHandler` runs with filesystem payload reader, store, and route provider adapters | The files are copied into the local artifact store, a manifest-backed immutable route is returned, and no Cloud/provider-specific behavior is required. |
| STATIC-ARTIFACT-EXT-009 | CLI exposes portable direct static artifact publishing | A user runs `appaloft static-artifacts publish <dist-or-zip>` with project and resource ids | The CLI parses the command | It turns a local dist directory into `PublishStaticArtifactPayloadCommand` or a local `.zip` into `PublishStaticArtifactArchiveCommand`, then dispatches through the shared command bus without selecting a Cloud/provider-specific adapter. |
| STATIC-ARTIFACT-EXT-010 | Server runtime wires local static artifact publishing and serving | Public server composition uses the filesystem payload reader, store, route provider, and publisher ports | A command publishes a dist directory and the immutable artifact URL is requested over HTTP | The dist files are stored under `dataDir/static-artifacts`, the returned immutable URL is served by the public HTTP adapter, and no Cloud/provider-specific behavior is required. |
| STATIC-ARTIFACT-EXT-011 | API exposes source-path static artifact publishing | An authenticated API caller supplies project id, resource id, and a server-local source path | `POST /api/static-artifacts/publish` runs | The route dispatches `PublishStaticArtifactCommand`, returns a provider-neutral publication response DTO, and does not select a Cloud/provider-specific adapter. |
| STATIC-ARTIFACT-EXT-012 | Local alias/current route serves the promoted static artifact | A local filesystem publication is created with `promoteAlias` | The returned current URL is requested over HTTP | The filesystem route provider records the current artifact pointer under `dataDir/static-artifacts`, and the public HTTP adapter serves the promoted artifact through `/static-artifacts/projects/{projectId}/resources/{resourceId}/current/`. |
| STATIC-ARTIFACT-EXT-013 | Filesystem payload reader accepts a zipped static artifact | A server-local source path points to a `.zip` archive containing static files | `PublishStaticArtifactCommandHandler` runs with the filesystem payload reader and local store/route providers | The archive entries are translated into the same manifest/file-payload model as a dist directory, unsafe archive paths are rejected before storage, and no Cloud/provider-specific behavior is required. |
| STATIC-ARTIFACT-EXT-014 | Published static artifacts can be listed through a provider-neutral read model | Static artifacts have been published through the local filesystem publisher | `GET /api/static-artifacts/publications` or `ListStaticArtifactPublicationsQuery` runs | The query returns provider-neutral publication summaries from a `StaticArtifactPublicationReadModelPort`, and the filesystem adapter records/readbacks publication journal entries without selecting Cloud/provider behavior. |
| STATIC-ARTIFACT-EXT-015 | API accepts direct inline static artifact payloads | A Web client, agent, or skill has prebuilt static files but no server-local source path | `POST /api/static-artifacts/publish-payload` runs with base64 file contents | The route dispatches `PublishStaticArtifactPayloadCommand`, builds the same content-addressed manifest/file-payload model as source-path publishing, publishes through `StaticArtifactPublisherPort`, and does not select Cloud/provider behavior. |
| STATIC-ARTIFACT-EXT-016 | API accepts a direct zipped static artifact payload | A Web client, agent, or skill has a prebuilt dist `.zip` but no server-local source path | `POST /api/static-artifacts/publish-archive` runs with a base64 zip archive | The route dispatches `PublishStaticArtifactArchiveCommand`, expands safe zip entries into the same content-addressed manifest/file-payload model, rejects unsafe archive paths before publishing, publishes through `StaticArtifactPublisherPort`, and does not select Cloud/provider behavior. |
| STATIC-ARTIFACT-EXT-017 | Public server runtime serves API-published archive artifacts | Public server composition uses filesystem store/route/publisher ports | `POST /api/static-artifacts/publish-archive` publishes a zipped dist with `promoteAlias` and the returned route URL is requested | The archive is stored under `dataDir/static-artifacts`, the current alias URL serves `index.html` and nested assets, and no hosted/provider behavior is required. |
| STATIC-ARTIFACT-EXT-018 | Remote CLI publish uploads local dist files through the neutral control-plane route | A user has an active remote control-plane profile and a local prebuilt dist directory | `appaloft static-artifacts publish <dist>` runs through remote CLI dispatch | The CLI sends file payloads to `POST /api/static-artifacts/publish-payload` through the generated SDK, receives a provider-neutral publication URL, and public code still does not name Cloud, R2/S3, IPFS, CDN, or Pages. |

## Non-Goals

- No browser multipart upload, remote URL fetch upload, hosted alias/default-domain route serving, or repository config field.
- No hosted object storage, CDN, IPFS, Pages, or provider SDK implementation.
- No hosted default domain, wildcard TLS, billing, entitlement, abuse, takedown, or cache-purge behavior.
- No change to existing static-server Docker/OCI deployment behavior.

## Public Boundary

Neutral public concepts:

- `StaticArtifactManifest`
- `StaticArtifactFilePayload`
- `StaticArtifactStoredManifest`
- `StaticArtifactRouteActivation`
- `StaticArtifactPublication`
- `StaticArtifactPayloadReaderPort`
- `StaticArtifactStorePort`
- `StaticArtifactRouteProviderPort`
- `StaticArtifactPublisherPort`
- `StaticArtifactPublicationJournalPort`
- `StaticArtifactPublicationReadModelPort`
- `PublishStaticArtifactCommand`
- `PublishStaticArtifactPayloadCommand`
- `PublishStaticArtifactArchiveCommand`
- `ListStaticArtifactPublicationsQuery`
- `appaloft static-artifacts publish <dist-or-zip>`
- `POST /api/static-artifacts/publish`
- `POST /api/static-artifacts/publish-payload`
- `POST /api/static-artifacts/publish-archive`
- `GET /api/static-artifacts/publications`

Provider/private concepts stay outside public core:

- hosted default domain strategy;
- storage provider choice;
- CDN/gateway behavior;
- hosted alias/default-domain route behavior;
- abuse scanner and takedown policy;
- billing and quota policy.
