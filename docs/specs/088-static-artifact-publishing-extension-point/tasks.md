# Static Artifact Publishing Extension Point Tasks

## Source Of Truth

- [x] Add ADR-079 for the neutral extension-point boundary.
- [x] Add spec, plan, and tasks artifacts for the extension-point slice.
- [x] Keep hosted/private strategy out of public source-of-truth docs.

## Implementation

- [x] Add `StaticArtifactManifest`, `StaticArtifactStoredManifest`,
  `StaticArtifactRouteActivation`, and `StaticArtifactPublication` to public core.
- [x] Add `StaticArtifactStorePort`, `StaticArtifactRouteProviderPort`, and
  `StaticArtifactPublisherPort` to the application boundary.
- [x] Add `StaticArtifactFilePayload` so store adapters can receive deployable file bytes instead
  of manifest metadata only.
- [x] Add `StaticArtifactPayloadReaderPort` so entrypoints can pass a source path while adapters
  provide manifest/payload construction.
- [x] Add DI tokens for future adapter registration.
- [x] Add `PublishStaticArtifactCommand` and handler for source-path based direct static artifact
  publishing.
- [x] Add `appaloft static-artifacts publish <dist-or-zip>` CLI command that packages local
  directories as inline file payload commands and local `.zip` files as archive commands before
  dispatching the shared application boundary.
- [x] Add `POST /api/static-artifacts/publish` API route that dispatches the shared application
  command for server-local source paths.
- [x] Add `PublishStaticArtifactPayloadCommand` and `POST /api/static-artifacts/publish-payload`
  for direct inline file payload publishing without a server-local source path.
- [x] Add `PublishStaticArtifactArchiveCommand` and `POST /api/static-artifacts/publish-archive`
  for direct zipped static artifact publishing without a server-local source path.
- [x] Add `PortBackedStaticArtifactPublisher` application service to compose store and route
  provider adapters.
- [x] Add `StaticArtifactPublicationJournalPort` and `StaticArtifactPublicationReadModelPort`
  for provider-neutral publish readback.
- [x] Add `ListStaticArtifactPublicationsQuery` and `GET /api/static-artifacts/publications`.
- [x] Add `FileSystemStaticArtifactStore` and `FileSystemStaticArtifactRouteProvider` as a
  provider-neutral local/self-hosted adapter pair.
- [x] Add `FileSystemStaticArtifactPayloadReader` to read dist directories into manifests and
  payloads.
- [x] Extend `FileSystemStaticArtifactPayloadReader` to read server-local `.zip` archives into the
  same manifest and payload model.
- [x] Register the filesystem payload reader, store, route provider, and publisher ports in public
  server/shell runtime composition.
- [x] Serve immutable local static artifact URLs from the public HTTP adapter.
- [x] Persist and serve local filesystem alias/current routes for `promoteAlias` publications.
- [x] Do not change `deployments.create` or current static-server Docker/OCI execution.

## Verification

- [x] Add core tests `STATIC-ARTIFACT-EXT-001` through `STATIC-ARTIFACT-EXT-003`.
- [x] Add application boundary test `STATIC-ARTIFACT-EXT-004`.
- [x] Add application publisher composition test `STATIC-ARTIFACT-EXT-005`.
- [x] Add filesystem adapter test `STATIC-ARTIFACT-EXT-006`.
- [x] Add application command test `STATIC-ARTIFACT-EXT-007`.
- [x] Add dist-directory command pipeline test `STATIC-ARTIFACT-EXT-008`.
- [x] Add CLI dispatch test `STATIC-ARTIFACT-EXT-009`.
- [x] Add server runtime and immutable HTTP serving test `STATIC-ARTIFACT-EXT-010`.
- [x] Add API dispatch/response test `STATIC-ARTIFACT-EXT-011`.
- [x] Add local alias/current route activation and serving tests `STATIC-ARTIFACT-EXT-012`.
- [x] Add zipped source-path publish and unsafe archive path tests `STATIC-ARTIFACT-EXT-013`.
- [x] Add publication journal/read-model query and HTTP tests `STATIC-ARTIFACT-EXT-014`.
- [x] Add inline payload command and HTTP tests `STATIC-ARTIFACT-EXT-015`.
- [x] Add archive payload command and HTTP tests `STATIC-ARTIFACT-EXT-016`.
- [x] Add public server archive API publish-and-serve runtime test `STATIC-ARTIFACT-EXT-017`.
- [x] Add remote CLI payload dispatch test `STATIC-ARTIFACT-EXT-018`.
- [x] Run targeted public core/application/filesystem/CLI/server tests and typechecks.

## Deferred

- [x] Add direct static artifact publish application command.
- [x] Add CLI transport wiring for direct static artifact publish.
- [x] Add public server/shell runtime composition for local static artifact publishing.
- [x] Add API source-path transport wiring for direct static artifact publish.
- [x] Add local filesystem alias/current route state and serving for promoted static artifact aliases.
- [x] Add server-local `.zip` archive source-path support in the filesystem payload reader.
- [x] Add provider-neutral publication readback/listing for local filesystem publications.
- [x] Add JSON inline payload API transport wiring for direct static artifact publish.
- [x] Add JSON base64 zip archive API transport wiring for direct static artifact publish.
- [x] Make `static-artifacts` a remote control-plane capable CLI command and regenerate SDK
  operation metadata for the public payload/archive routes.
- [ ] Add Web/browser multipart transport wiring for direct static artifact publish.
- [ ] Add browser multipart, remote URL fetch, or staged upload support.
- [ ] Add hosted/provider alias/current route state and serving.
- [ ] Add S3-compatible, IPFS, Pages, or provider plugin adapter.
- [ ] Add hosted/provider persistence/read-model support for direct static artifact publications.
