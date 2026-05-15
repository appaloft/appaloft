# Plan: Storage Volume Runtime Realization And Cleanup

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-012, ADR-023, ADR-047, ADR-050, ADR-064
- Local specs: `docs/workflows/storage-volume-lifecycle.md`,
  `docs/specs/032-storage-volume-lifecycle-and-resource-attachment/spec.md`
- Test matrix: `docs/testing/storage-volume-test-matrix.md`

## Architecture Approach

- Domain/application placement:
  - Keep `StorageVolume` provider-neutral.
  - Add `storage-volumes.cleanup-runtime` only after Test-First coverage exists.
  - Do not change `storage-volumes.create` to perform provider-native provisioning.
- Repository/specification/visitor impact:
  - Cleanup needs read evidence from StorageVolume, Resource attachments, deployment snapshots,
    rollback candidates, and backup relationship metadata.
  - Runtime target deletion remains behind an injected adapter port; repositories do not delete
    provider/runtime artifacts.
- Event/CQRS/read-model impact:
  - Cleanup is a command; dry-run returns diagnostics without mutation.
  - Destructive cleanup may record operator-work/process visibility and safe audit/process details.
- Entrypoint impact:
  - CLI and oRPC/HTTP must share the command schema when implemented.
  - Web Resource detail exposes cleanup only after dry-run preview and destructive confirmation.
- Runtime adapter impact:
  - Docker implementations must avoid broad prune commands and delete only named candidates that
    pass Appaloft ownership and safety evidence.
  - Docker Swarm Compose stack deployment uses a generated override plus `docker stack deploy`
    only during deployment execution, with target-service metadata required before rendering.
  - Bind-mount source path deletion stays unsupported.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: no release in this round.
- Compatibility impact: additive public CLI/API/oRPC command under `pre-1.0-policy`.
- Changelog/release-note: required for the next release that includes the cleanup command.

## Decision Record

- Decision state: ADR-064 accepted.
- Rationale: storage runtime cleanup can destroy user data and must not be hidden inside
  `servers.capacity.prune`, `storage-volumes.delete`, or deployment admission.

## Testing Strategy

- Matrix ids: `STOR-REALIZE-*` and `STOR-CLEANUP-*` rows in
  `docs/testing/storage-volume-test-matrix.md`.
- Test-first rows:
  - Runtime adapter tests proving existing deployment-driven realization remains deterministic.
  - Application tests proving `storage-volumes.create` has no runtime/provider side effects.
  - Cleanup command tests for dry-run default, explicit destructive confirmation, blockers, bind-mount
    exclusion, CLI dispatch, and HTTP/oRPC dispatch.
- Acceptance/e2e:
  - Use focused local Docker/generic-SSH smoke only after the command exists and can prove safe
    target ownership.
- Public docs:
  - Storage docs must keep provider-neutral delete and runtime cleanup distinct.

## Risks And Governed Follow-Ups

- `storage-volumes.cleanup-runtime` is implemented for local-shell and generic-SSH Docker
  named-volume inspection and cleanup through CLI, HTTP/oRPC, and Resource detail Web controls.
- `.github/workflows/storage-cleanup-e2e.yml` runs real local Docker and generic-SSH cleanup gates
  from nightly and release, with local explicit scripts for reproduction and
  `require_storage_cleanup_e2e=true` for fail-closed manual release SSH evidence.
- Docker Swarm Compose stack deployment realization is implemented for explicit target-service
  metadata, with an environment-gated real Swarm smoke covering generated storage mount override,
  named-volume creation, route reachability, and scoped cleanup.
- Provider-native storage backends beyond Docker runtime mounts remain future provider work.
- Bind-mount source path cleanup remains blocked by missing path ownership and backup-safety rules.
