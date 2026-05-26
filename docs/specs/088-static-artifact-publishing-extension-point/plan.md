# Static Artifact Publishing Extension Point Plan

## Architecture

- Add neutral static artifact value objects under `packages/core/src/workload-delivery`.
- Export the model through `@appaloft/core`.
- Add application ports, file payload DTOs, and DI tokens in `packages/application` for future
  adapters.
- Add `StaticArtifactPayloadReaderPort` and `PublishStaticArtifactCommand` so CLI/API entrypoints
  can publish a source path without depending on filesystem code directly.
- Add a CLI command that dispatches `PublishStaticArtifactCommand` through the command bus.
- Add an API source-path route that dispatches `PublishStaticArtifactCommand` through the same
  command bus and returns a stable publication DTO.
- Add an API inline-payload route that dispatches `PublishStaticArtifactPayloadCommand` through the
  same command bus for Web, agent, or skill callers that have file bytes but no server-local source
  path.
- Add an API archive-payload route that dispatches `PublishStaticArtifactArchiveCommand` through
  the same command bus for Web, agent, or skill callers that have a zipped dist artifact but no
  server-local source path.
- Add a provider-neutral application publisher service that composes the store and route provider
  ports.
- Add provider-neutral publication journal/read-model ports and a list query so published artifacts
  can be read back without knowing the storage provider.
- Add a public filesystem adapter that stores static artifact payloads under a configured local
  root, reads dist directories or server-local `.zip` archives into manifests/payloads, and returns a neutral route URL for
  local/self-hosted composition.
- Register the filesystem adapter ports in public server/shell composition so the shared command bus
  can publish static artifacts without private provider code.
- Serve immutable local static artifact URLs from the public HTTP adapter. Alias/current routes need
- Persist local filesystem alias/current pointers for `promoteAlias` publications and serve them
  from the public HTTP adapter. Hosted/provider alias routing remains adapter-specific follow-up
  work.
- Keep existing static-server Docker/OCI deployment unchanged.
- Keep all provider and hosted behavior out of public core.

## Test Strategy

- Core unit tests cover manifest count/byte validation.
- Core unit tests cover provider-neutral storage and route publication.
- Core unit tests cover mismatched manifest/storage identity rejection.
- Application tests cover port exposure and publisher composition.
- Application command tests cover source-path-to-publisher orchestration.
- Application command tests cover inline file payload-to-publisher orchestration.
- Application command tests cover zipped archive payload-to-publisher orchestration.
- CLI tests cover `appaloft static-artifacts publish <dist-or-zip>` dispatching the shared command.
- oRPC tests cover `POST /api/static-artifacts/publish` dispatching the shared command and
  returning a provider-neutral publication DTO.
- oRPC tests cover `POST /api/static-artifacts/publish-payload` dispatching the inline payload
  command and returning a provider-neutral publication DTO.
- oRPC tests cover `POST /api/static-artifacts/publish-archive` dispatching the archive payload
  command and returning a provider-neutral publication DTO.
- oRPC tests cover `GET /api/static-artifacts/publications` dispatching the shared query and
  returning provider-neutral publication summaries.
- Server tests cover runtime composition plus immutable HTTP serving from `dataDir/static-artifacts`.
- Filesystem and server tests cover local alias/current route activation and serving.
- Server tests cover archive API publish through public runtime composition plus local alias/current
  HTTP serving.
- Filesystem adapter tests cover payload writes, manifest persistence, route activation, and unsafe
  relative path rejection, plus dist-directory and zipped-source command pipelines.
- Filesystem adapter tests cover publication journal write/readback for local publications.
- Typecheck verifies application port imports, token exposure, and publisher wiring.

## Follow-Up Rounds

- A Web/upload round can add browser multipart upload, remote URL fetch upload, or staged upload
  commands.
- A provider routing round can add hosted alias/current route state, custom/default domains, and
  CDN/gateway activation through adapters.
- Adapter rounds can add user-owned S3-compatible, IPFS, Pages, or provider plugin implementations.
- Private hosted distributions can inject default-domain, billing, entitlement, abuse, and CDN adapters through the same ports.
