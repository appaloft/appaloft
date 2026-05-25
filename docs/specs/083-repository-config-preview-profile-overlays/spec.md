# Repository Config Preview Profile Overlays

Artifact state: Implemented MVP

Governing decision:

- [ADR-074: Repository Config Preview Profile Overlays](../../decisions/ADR-074-repository-config-preview-profile-overlays.md)

## Purpose

Users can keep production defaults and PR preview differences in one `appaloft.yaml` without giving
the committed file authority to select preview identity or bypass Appaloft operations.

## Terms

| Term | Meaning |
| --- | --- |
| Preview Profile Overlay | `preview.pullRequest.profile` in repository config. |
| Trusted Preview Context | Entry context selected outside the committed file, such as GitHub PR number, preview id, repository facts, and source fingerprint. |
| Effective Config | Root config plus selected preview overlay after validation and before prompt seed/runtime/env normalization. |

## Scenarios

| Scenario ID | Scenario | Expected behavior |
| --- | --- | --- |
| CONFIG-PREVIEW-OVERLAY-001 | Parser accepts preview profile | Config declares `preview.pullRequest.profile.runtime`, `network`, `health`, `env`, or `access.generated` | Parser accepts strict safe fields and JSON schema exposes them. |
| CONFIG-PREVIEW-OVERLAY-002 | Identity or raw secret rejected | Overlay declares project/resource/server/provider/credential identity or raw secret material | Parser fails before mutation with sanitized validation details. |
| CONFIG-PREVIEW-OVERLAY-003 | Non-preview deploy ignores overlay | Ordinary config deploy reads a root config with a preview overlay | Root config values are used; preview-only profile values do not affect deployment. |
| CONFIG-PREVIEW-OVERLAY-004 | PR preview deploy applies overlay | Trusted PR preview context is present | Overlay is merged before seed/env normalization, existing operations receive the merged profile, and final deployment remains ids-only. |
| CONFIG-PREVIEW-OVERLAY-005 | Trusted flags override overlay | Preview overlay and CLI/Action flags both set the same profile field | Trusted flags win over the merged config profile. |

## Rules

- `preview.pullRequest.profile` is selected only when PR preview mode is active from trusted
  entrypoint context.
- The overlay can declare only profile fields that already have repository config support in this
  slice: `runtime`, `network`, `health`, `access.generated`, `monitoring`, `env`, and `secrets`.
- The overlay must not contain `controlPlane`, `source`, `access.domains`, `dependencies`,
  `storage`, `scheduledTasks`, `autoDeploy`, `retention`, or identity selectors in this MVP.
- Root config and overlay maps are merged with overlay values taking precedence for matching env or
  secret keys.
- CLI/Action flags are applied after the effective config and therefore override the overlay.
- Preview overlays must not add fields to `deployments.create`.

## Non-Goals

- Environment-specific overlays such as `environments.production`.
- Selecting preview project/environment/resource/server/destination identity from config.
- Reinterpreting production `access.domains[]` as preview hostnames.
- Resource sizing, replicas, autoscaling, restart/rollout policy, quotas, cleanup, alert routing,
  provider handles, or raw credentials.

## Verification

Automated coverage binds the implementation to:

- `CONFIG-FILE-PREVIEW-OVERLAY-001`
- `CONFIG-FILE-PREVIEW-OVERLAY-002`
- `CONFIG-FILE-PREVIEW-OVERLAY-003`
- `CONFIG-FILE-PREVIEW-OVERLAY-004`
