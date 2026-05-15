# Plan: Storage Volume Lifecycle And Resource Attachment

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-012, ADR-014, ADR-016, ADR-026, ADR-028
- Local specs: `docs/workflows/storage-volume-lifecycle.md`,
  `docs/workflows/resource-profile-lifecycle.md`, storage command/query specs
- Test matrix: `docs/testing/storage-volume-test-matrix.md`

## Architecture Approach

- Domain/application placement:
  - Add `StorageVolume` aggregate under `packages/core/src/workload-delivery`.
  - Extend `Resource` with `ResourceStorageAttachment` entries and destination-path behavior.
  - Add intention-revealing commands: `storage-volumes.create`,
    `storage-volumes.rename`, `storage-volumes.delete`, `resources.attach-storage`,
    `resources.detach-storage`.
  - Add queries: `storage-volumes.list`, `storage-volumes.show`.
- Repository/specification/visitor impact:
  - Add `StorageVolumeRepository`, selection specs, mutation specs, and PG adapter.
  - Keep attachment persistence in the Resource aggregate row/profile or a resource-owned attachment
    table; storage read models may join to summarize usage.
- Event/CQRS/read-model impact:
  - Commands mutate write-side aggregates and publish domain events after persistence.
  - Queries return read-optimized summaries and do not mutate state.
  - Read-your-own-write is expected inside one command/query process after persistence.
- Entrypoint impact:
  - CLI and oRPC/HTTP dispatch through CommandBus/QueryBus using shared application schemas.
  - Web Resource detail settings exposes storage attachment readback plus attach/detach controls
    and storage volume create/rename/delete management over the same oRPC client methods. It does
    not expose provider-native upfront volume provisioning. Runtime cleanup is exposed by the later
    `docs/specs/070-storage-volume-runtime-realization-and-cleanup/` slice as a separate
    dry-run-first operation.
- Persistence/migration impact:
  - Add storage volume durable state and attachment durable state in `packages/persistence/pg`.
  - PGlite and PostgreSQL use the same Kysely migrations.
- Deployment snapshot impact:
  - Deployment snapshot materialization carries immutable mount metadata derived from Resource
    storage attachments.
  - Storage lifecycle commands avoid provider-native upfront provisioning and avoid adding
    deployment command fields.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: no release in this round.
- Compatibility impact: additive public CLI/API/oRPC capability under `pre-1.0-policy`.
- Changelog/release-note: not required until a release preparation round.

## Decision Record

- Decision state: no-ADR-needed.
- Rationale: storage volume lifecycle is an additive Day-Two capability that fits the accepted
  Resource profile and immutable deployment snapshot boundary. It does not alter deployment
  admission, async acceptance, runtime ownership, provider contracts, or command coordination
  policy.

## Testing Strategy

- Matrix ids: `STOR-*` rows in `docs/testing/storage-volume-test-matrix.md`.
- Test-first rows:
  - Core aggregate/value object tests for create, bind path, destination path, attachment, delete
    blocker.
  - Application use-case/query tests for create/list/show/rename/delete/attach/detach.
  - Persistence PGlite tests for storage volumes, attachment summaries, and delete blockers.
  - CLI and oRPC/HTTP dispatch tests for each public operation.
  - Operation catalog boundary tests for no generic `storage-volumes.update`.
- Acceptance/e2e:
  - Not required beyond focused CLI/HTTP dispatch in this slice.
- Public docs:
  - Docs registry coverage links stable anchors or records governed not-applicable/follow-up
    decisions.

## Risks And Governed Follow-Ups

- Web storage-volume create/rename/delete management and the Resource detail attachment surface are
  implemented with i18n and source-level Web tests.
- Storage-volume backup/restore remains a separate governed extension. Dependency-resource
  backup/restore is handled by `docs/specs/039-dependency-resource-backup-restore/`.
- Docker, Docker Compose, Docker Swarm image-service, and Docker Swarm Compose stack runtime
  realization now consume provider-neutral mount metadata during deployment execution through
  `docs/specs/070-storage-volume-runtime-realization-and-cleanup/`.
- Runtime cleanup/prune is handled by the explicit dry-run-first
  `storage-volumes.cleanup-runtime` operation from the same 070 slice, not by
  `storage-volumes.delete`.
