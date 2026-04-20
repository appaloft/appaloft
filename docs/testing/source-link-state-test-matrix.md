# Source Link State Spec-Driven Test Matrix

## Normative Contract

Source link state is the durable mapping from a normalized source fingerprint to trusted Appaloft
identity. Pure CLI and GitHub Actions SSH deployments need it so repeated runs can reuse
project/environment/resource/server context without committing Appaloft ids.

Tests must prove:

- source fingerprints are stable, normalized, and secret-free;
- first-run deploy creates link state only after explicit project/environment/server/resource
  operations succeed;
- repeated deploy reuses the link;
- committed config cannot retarget an existing link;
- relink requires explicit `source-links.relink`;
- relink uses the same remote state lock and recovery contract as config deploy;
- diagnostics explain the chosen link without leaking secrets.

## Global References

This matrix inherits:

- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [source-links.relink Command Spec](../commands/source-links.relink.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md)
- [Deployment Config File Test Matrix](./deployment-config-file-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Test Layers

| Layer | Source link focus |
| --- | --- |
| Fingerprint normalization | Stable source identity, no runner temp paths, no secret-bearing URL content, branch/commit scope rules. |
| Remote state repository | Link create/read/update under SSH-server PGlite state. |
| Config workflow | First-run link creation, repeated reuse, retarget rejection. |
| Relink command | Explicit target change, idempotency, optimistic guards, error mapping. |
| CLI | `appaloft source-links relink` and config deploy failure guidance. |
| Diagnostics | Safe source/config origin and link mapping explanation. |

## Fingerprint Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error |
| --- | --- | --- | --- | --- | --- |
| SOURCE-LINK-STATE-001 | unit | Git source fingerprint is stable | Same provider repository, clone locator, base directory, and config path across two CI runs with different commits | Fingerprint matches; commit SHA remains last-observed metadata, not the default identity key | None |
| SOURCE-LINK-STATE-002 | unit | Fingerprint excludes secrets and runner paths | Source locator includes credential-bearing URL or runner temp checkout path | Fingerprint normalizer strips/rejects secret-bearing material and does not persist temp paths | `validation_error`, phase `source-link-validation` when safe normalization is impossible |
| SOURCE-LINK-STATE-003 | unit | Preview-capable scope is explicit | Source selector includes future PR/branch preview scope | Fingerprint includes preview scope only when the entrypoint explicitly selects preview mode | None |

## Workflow Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| SOURCE-LINK-STATE-004 | e2e-preferred | First-run config deploy creates link | SSH-targeted config deploy has no existing link and no Appaloft ids | Workflow creates project/environment/server/resource through explicit operations, then persists source link state in remote PGlite | None | Ensure/lock/migrate remote state -> explicit operations -> persist source link -> `deployments.create` |
| SOURCE-LINK-STATE-005 | e2e-preferred | Repeated config deploy reuses link | Existing source link points at project/environment/resource/server context | Workflow reuses linked ids and does not create duplicate context records | None | Ensure/lock/migrate remote state -> resolve source link -> profile/env operations as needed -> `deployments.create` |
| SOURCE-LINK-STATE-006 | integration | Config cannot retarget link | Existing source link points at one resource; committed config changes name, target, or identity-like fields | Workflow refuses retargeting and requires explicit relink | `validation_error`, phase `source-link-resolution` or `config-identity` | No accidental project/resource/server mutation |
| SOURCE-LINK-STATE-007 | integration | Ambiguous fingerprint requires explicit selection | Source selector cannot produce one stable fingerprint or matches multiple links | Workflow stops before mutation | `validation_error`, phase `source-link-resolution` | No write commands |

## Relink Command Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected state |
| --- | --- | --- | --- | --- | --- | --- |
| SOURCE-LINK-STATE-008 | e2e-preferred | Relink source to another resource | Existing source link and explicit target project/environment/resource ids | `source-links.relink` updates the link and later config deploy uses the new mapping | None | Link points at new resource; resource profiles/deployments unchanged |
| SOURCE-LINK-STATE-009 | integration | Relink idempotent same target | Existing link already matches requested target ids | Command returns ok with existing mapping | None | No duplicate link or audit event beyond idempotent record policy |
| SOURCE-LINK-STATE-010 | integration | Relink optimistic guard conflict | Command includes `expectedCurrentResourceId`, but current link points elsewhere | Command rejects without mutation | `source_link_conflict`, phase `source-link-resolution` | Existing link unchanged |
| SOURCE-LINK-STATE-011 | integration | Relink validates context | Target resource does not belong to target project/environment or destination does not belong to target server | Command rejects without mutation | `source_link_context_mismatch`, phase `source-link-admission` | Existing link unchanged |
| SOURCE-LINK-STATE-012 | integration | Relink uses remote state lock | Another deploy/relink owns remote mutation lock | Command waits or fails with retriable lock error according to policy | `infra_error`, phase `remote-state-lock` when lock cannot be acquired | Existing link unchanged |

## PostgreSQL / PGlite Persistence Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error |
| --- | --- | --- | --- | --- | --- |
| SOURCE-LINK-STATE-015 | integration | PG source link store persists and reads mapping | A PostgreSQL-compatible Appaloft backend is selected and `SourceLinkStore.createIfMissing` is called for a new fingerprint. | `source_links` persists project/environment/resource/server/destination ids, safe metadata, and `updatedAt`; read returns the same mapping. | None |
| SOURCE-LINK-STATE-016 | integration | PG source link relink is idempotent and guarded | Existing `source_links` row points at a resource and `source-links.relink` is called with same or guarded target ids. | Same target returns ok without duplicate rows; mismatched optimistic guard rejects and leaves the row unchanged. | `source_link_conflict`, phase `source-link-resolution` for guard mismatch |
| SOURCE-LINK-STATE-017 | integration | Resource delete sees PG source link blocker | `source_links.resource_id` points at an archived resource being deleted. | `ResourceDeletionBlockerReader` reports `source-link` with safe id/count details and `resources.delete` rejects before tombstoning. | `resource_delete_blocked`, phase `resource-deletion-guard` |
| SOURCE-LINK-STATE-018 | integration | PG source link migration blocks unsafe cascades | Schema migration creates `source_links` with resource reverse lookup and non-cascading resource reference. | Deleting/tombstoning a resource cannot erase source-link identity as a storage side effect; source links remain explicit relink/unlink state. | None |

## Diagnostics Matrix

| Test ID | Preferred automation | Case | Given | Expected result |
| --- | --- | --- | --- | --- |
| SOURCE-LINK-STATE-013 | integration | Source link diagnostics safe | Link state includes source/config origin and last-observed metadata | Diagnostics show fingerprint, target ids, config path/pointer, and last update metadata without raw secrets or credential-bearing URLs |
| SOURCE-LINK-STATE-014 | integration | Recovery marker visible | Failed relink or migration left a recovery marker | `system.doctor` or equivalent CLI diagnostic exposes recovery status and next action without continuing normal deploy mutation |

## Current Implementation Notes And Migration Gaps

Current implementation has resolver-level source fingerprint coverage for `SOURCE-LINK-STATE-001`
through `SOURCE-LINK-STATE-003` in
`packages/adapters/cli/test/deployment-state.test.ts`.

Current implementation has adapter-level source link store and recovery coverage for
`SOURCE-LINK-STATE-004` through `SOURCE-LINK-STATE-014` in
`packages/adapters/cli/test/deployment-remote-state.test.ts`.

Current implementation has config workflow coverage for first-run source link creation and repeated
config deploy reuse in `packages/adapters/cli/test/deployment-config.test.ts`.

Current implementation has application command and CLI dispatch coverage for `source-links.relink`
in `packages/application/test/relink-source-link.test.ts` and
`packages/adapters/cli/test/source-link-command.test.ts`. Shell startup plans the same SSH remote
PGlite mirror for relink in `apps/shell/test/remote-pglite-state-sync.test.ts`.

`SOURCE-LINK-STATE-015` through `SOURCE-LINK-STATE-018` are the next PG durable persistence slice.
They are specified but not implemented yet. The Code Round should add a PG `SourceLinkStore`
adapter, `source_links` migration, delete-blocker integration, and PGlite persistence tests before
treating `source-link` blockers as closed for `resources.delete`.

An opt-in external SSH e2e harness in
`apps/shell/test/e2e/github-action-ssh-state.workflow.e2e.ts` proves source link state across a
real GitHub Actions style process boundary when run with `APPALOFT_E2E_SSH_REMOTE_STATE=true`
against a provisioned SSH/Docker target. `.github/workflows/ssh-remote-state-e2e.yml` runs the same
harness manually, from nightly smoke, and before release artifact publication when
`APPALOFT_E2E_SSH_HOST` and `APPALOFT_E2E_SSH_PRIVATE_KEY` secrets are configured. Operational
secret/target provisioning remains outside the repository code.
