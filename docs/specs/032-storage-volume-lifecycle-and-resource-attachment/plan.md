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
  - Web remains read-only/deferred unless existing Resource detail consumes the new field.
- Persistence/migration impact:
  - Add storage volume durable state and attachment durable state in `packages/persistence/pg`.
  - PGlite and PostgreSQL use the same Kysely migrations.
- Deployment snapshot impact:
  - Future deployment snapshot materialization may carry immutable mount metadata derived from
    resource storage attachments.
  - This slice should avoid provider-native provisioning and avoid adding deployment command fields.

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
  - Docs registry coverage must either link stable anchors or record explicit migration gaps.

## Risks And Migration Gaps

- Web write affordances are deferred unless the Code Round includes i18n and Web tests.
- Backup/restore is metadata-only; actual backup execution remains Phase 7 future work.
- Provider-native Docker/Compose/Swarm realization is deferred; mount metadata is provider-neutral.
- Runtime cleanup/prune remains out of scope.
