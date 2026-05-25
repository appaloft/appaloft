# Repository Config Named Profile Overlays Spec

## Governing Decision

- [ADR-075: Repository Config Named Profile Overlays](../../decisions/ADR-075-repository-config-named-profile-overlays.md)

## Problem

Users need reviewable config differences for targets such as staging, production, smoke, or
temporary rollout workflows. The config file must not select Appaloft Environment identity or
smuggle credentials and provider handles into the repository.

## Canonical Terms

| Term | Meaning |
| --- | --- |
| Named Config Profile | `profiles.<key>` in repository config. |
| Selected Config Profile | The one named profile selected by trusted entrypoint input. |
| Profile Overlay | A safe merge over root repository config before existing operations are derived. |

## Scenarios

| Scenario ID | Name | Given | Then |
| --- | --- | --- | --- |
| CONFIG-NAMED-PROFILE-001 | Parser accepts named profile | Config declares `profiles.staging.runtime`, `network`, `health`, `access`, `monitoring`, `env`, or `secrets` | Parser accepts strict safe fields and JSON schema exposes them. |
| CONFIG-NAMED-PROFILE-002 | Parser rejects unsafe profile fields | Config declares identity, provider handles, raw secrets, dependency/storage/scheduled-task graph deltas, auto-deploy, control-plane, retention, or unsupported sizing under `profiles.<key>` | Parser fails before mutation with sanitized diagnostics. |
| CONFIG-NAMED-PROFILE-003 | Unselected profile is inert | Ordinary config deploy reads a config with `profiles.staging` but no trusted selection | Root config values are used and profile overlay does not affect commands. |
| CONFIG-NAMED-PROFILE-004 | Selected profile applies | Trusted CLI/Action input selects `staging` | Overlay merges before prompt seed/env normalization, existing operations receive merged values, and final deployment remains ids-only. |
| CONFIG-NAMED-PROFILE-005 | Missing profile fails | Trusted input selects a profile not declared in config | Workflow fails before mutation in `config-profile-resolution`. |
| CONFIG-NAMED-PROFILE-006 | Trusted flags win | Selected profile and CLI/Action flags both set a field | Trusted flags override the selected profile. |

## Rules

- `profiles.<key>` keys use lowercase letters, digits, dash, and underscore, and start with a
  lowercase letter.
- A profile is selected only by trusted entrypoint input.
- A selected profile must not change Appaloft identity. It cannot set project, environment,
  resource, server, destination, tenant, organization, provider account, or credential fields.
- A selected profile can change safe profile fields already supported at root:
  runtime/network/health/access/monitoring/env/secrets.
- Preview overlays still apply after named config profiles when PR preview mode is selected.
- CLI and Action flags override the selected profile.
- Named profiles do not add fields to `deployments.create`.

## Public Surfaces

- `appaloft.yaml`: top-level `profiles.<key>`.
- CLI: `appaloft deploy --config-profile <key>`.
- GitHub Action: `config-profile`.
- Public docs: config file reference named profile anchor.
- AI-facing deploy skill: named config profile boundary and trusted selection.

## Explicitly Deferred

- Environment-keyed syntax such as `environments.production` that appears to select identity.
- Dependency, storage, scheduled task, auto-deploy, retention, and control-plane deltas inside
  named profiles.
- Resource sizing, replicas, restart policy, and rollout policy fields.
