# Control-Plane Modes Roadmap

## Goal

Keep pure CLI/GitHub Actions deployment as a durable product line while creating a clean migration
path to Appaloft Cloud and self-hosted Appaloft control planes.

This roadmap is long-term. It records target concepts, phase boundaries, and required gaps so later
Spec, Test-First, and Code Rounds can implement slices without re-deciding the product model.

## Core Concept

Appaloft separates:

- execution owner: who runs the deploy work; and
- control-plane/state owner: who owns state, identity, locks, policy, audit, and managed workflows.

That distinction allows all of these to be valid:

| Product shape | Execution owner | State/control-plane owner | User value |
| --- | --- | --- | --- |
| Pure Action/CLI | GitHub Action or CLI | SSH-server `ssh-pglite` | No hosted service required. |
| Cloud-assisted Action | GitHub Action | Appaloft Cloud | Cloud UI/state/audit with user-controlled execution. |
| Self-hosted API mode | GitHub Action or CLI | User-operated Appaloft server | Private control plane with same action workflow. |
| Control-plane runner | Cloud/self-hosted runner | Cloud/self-hosted control plane | GitHub App/webhook previews and scheduled cleanup. |

Cloud must not make pure Action obsolete. Pure Action is the portable baseline. Cloud and
self-hosted add state, governance, and managed workflows.

## Target Config Shape

Repository config may choose connection policy, not identity:

```yaml
controlPlane:
  mode: none
```

Future self-hosted example:

```yaml
controlPlane:
  mode: self-hosted
  url: https://appaloft.example.com
```

The config file must not contain:

- Appaloft project/resource/server/destination ids;
- organization or tenant ids;
- SSH keys, deploy keys, tokens, or database URLs;
- credential ids or raw credential values;
- Cloud project slug as a durable selector.

Trusted identity comes from token scope, GitHub repository identity, source link state, local login,
explicit CLI/action inputs, or future relink/adoption operations.

## Phase Plan

### Phase 0: Pure CLI/GitHub Actions Baseline

State: current product direction.

Deliverables:

- SSH-targeted CLI/Action uses `ssh-pglite` by default.
- `appaloft.yml` can express resource profile, env references, and server-applied domains.
- Repeated CI deploys reuse source link state from the SSH server.
- No `DATABASE_URL`, Cloud token, or resident Appaloft server is required.
- GitHub Actions may deploy PR previews from a user-authored `pull_request` workflow by deriving
  trusted preview context from the GitHub event, creating preview-scoped source links and
  environment/resource identity, and relying on generated/default access or user-owned wildcard DNS
  for preview URLs.
- Action PR preview examples should use an explicit preview config path when root `appaloft.yml` is
  production-oriented. Pure Action must not assume root config domains or environment values are
  preview-safe, and future overlay support must apply only after trusted PR context has selected
  the preview environment.

Remaining gaps:

- host fingerprint pinning and recovery UX need hardening;
- public docs must clearly explain DNS, SSH key, and route/TLS responsibilities;
- Action-only PR preview cleanup uses explicit `deployments.cleanup-preview` from a user-authored
  close workflow; product docs must still not imply PR close events are reliably cleaned up without
  that workflow succeeding or a control-plane retry loop;
- direct `ssh-pglite` is single-writer through Appaloft locks, not multi-process shared DB.

### Phase 1: Control-Plane Selection Parser And Diagnostics

Purpose: make the mode vocabulary real without pretending Cloud exists.

Deliverables:

- Config parser accepts `controlPlane.mode` and optional non-secret `controlPlane.url`.
- CLI accepts mode and URL flags/env overrides.
- Deploy action exposes mode and URL inputs.
- Resolver returns sanitized diagnostics: execution owner, selected mode, state backend, URL origin,
  identity source, and whether remote SSH state lifecycle is required.
- Invalid modes, unsafe URLs, identity selectors, raw tokens, and database URLs in config are
  rejected before mutation.

Exit criteria:

- `controlPlane.mode: none` behaves exactly like the current pure SSH default.
- `controlPlane.mode: auto` falls back to `none` when no trusted endpoint/login/adoption marker is
  present.
- `cloud` and `self-hosted` may return clear unsupported/handshake-not-implemented errors until
  Phase 2/3, but they must fail before mutation.

### Phase 2: Cloud-Assisted Action

Purpose: Cloud owns state while GitHub Action still executes.

Deliverables:

- Cloud handshake endpoint with client/API/schema/feature compatibility.
- GitHub Action authentication using the first accepted auth mechanism.
- Cloud source link lookup/create by GitHub repository identity and token scope.
- Cloud-owned project/environment/resource/server identity resolution.
- Cloud-owned deployment lock/workflow lease.
- Action executes deployment with either GitHub-custodied SSH credentials or accepted temporary
  credential material.
- Action reports deployment acceptance, progress summary, final status, route state, logs pointer,
  and diagnostics to Cloud.
- Config `access.domains[]` maps to managed domain intent only after Cloud has trusted context.

Exit criteria:

- A repository can use `appaloft/deploy-action@v1` with `control-plane-mode: cloud` while still
  keeping SSH key material in GitHub Secrets.
- A new CLI release does not require a new action wrapper release unless wrapper inputs or security
  behavior changed.
- Incompatible client/API versions fail in phase `control-plane-handshake` before mutation.

### Phase 3: Self-Hosted Control Plane And Adoption

Purpose: users can run Appaloft as their own control plane.

Deliverables:

- The public website `install.sh` provisions the basic single-node Docker Compose control plane.
  Future `appaloft install` work can add richer operator workflows on top of that bootstrap path.
- Production self-hosted stack uses PostgreSQL by default.
- The self-hosted server exposes the same control-plane handshake as Cloud.
- Adoption command imports SSH-server `ssh-pglite` source links, identities, deployments, and
  server-applied route state.
- Adoption writes a controller marker to the SSH server.
- GitHub Action/CLI detects a compatible adoption marker in `auto` mode and switches to API mode.
- Web surfaces can maintain project/resource/domain/deployment state through the self-hosted API.

Exit criteria:

- A server first deployed by pure Action can be adopted into self-hosted Appaloft without losing
  source link identity or route state.
- After adoption, default deploy-action behavior uses API mode and does not directly replace the
  same PGlite directory.
- Break-glass direct SSH state mutation requires an explicit flag and diagnostics.

### Phase 4: Control-Plane-Owned Execution

Purpose: Cloud/self-hosted can run deploys without a user-maintained GitHub Action.

Deliverables:

- GitHub App/webhook source event handling.
- Product-grade preview environment creation, policy, status/comments, and cleanup.
- Runner/agent model for build/deploy execution.
- Scheduler for DNS observation, certificate retries, route repair, cleanup, and background
  verification.
- Credential custody and temporary credential handoff model.

Exit criteria:

- Users can choose between GitHub Action execution and control-plane execution.
- The same repository config and operation contracts apply to both.
- Preview environments no longer require a custom workflow file when GitHub App execution is
  selected.
- PR close cleanup is retried by a control-plane scheduler or agent instead of depending only on a
  single GitHub Actions close-event run.

### Phase 5: Enterprise And Advanced Backends

Purpose: deepen governance and operational flexibility.

Deliverables:

- Direct external PostgreSQL mode with explicit migration/lock/audit/version gates.
- Multi-tenant policy, SSO, audit exports, org/team RBAC.
- Server agents for continuous reconcile without GitHub Actions.
- Managed DNS provider integrations where control-plane ownership is explicit.
- Fleet-level diagnostics and update orchestration.

## Required Gap Classification

| Gap | Phase | Required before public docs say supported | Notes |
| --- | --- | --- | --- |
| Config `controlPlane` schema | 1 | Yes | Must reject identity and secret fields. |
| CLI flags/env overrides | 1 | Yes | Flags win over config; env wins over config. |
| Deploy-action control-plane inputs | 1 | Yes | Keep pure SSH default when absent. |
| Mode diagnostics | 1 | Yes | Needed for support and CI logs. |
| Control-plane handshake | 2 | Yes for Cloud/self-hosted | Version, schema, feature, auth, and source policy gate. |
| Cloud auth | 2 | Yes for Cloud | Decide token/OIDC/GitHub App shape. |
| Cloud source links | 2 | Yes for Cloud | Replaces SSH source-link state for Cloud-owned mode. |
| Cloud deployment report API | 2 | Yes for Cloud-assisted Action | Action remains execution owner. |
| Managed domain mapping | 2 or 3 | Required before config domains are promised in control-plane mode | Maps `access.domains[]` to explicit domain workflows. |
| Self-host install | 3 | Yes for self-hosted | Prefer Postgres in production. |
| SSH PGlite adoption | 3 | Yes for migration story | Explicit workflow, not deploy side effect. |
| Adoption marker | 3 | Yes for coexistence | Prevents accidental double writers. |
| API mode deploy-action | 3 | Yes after adoption | Action calls control-plane API, not direct PGlite mutation. |
| GitHub App runner | 4 | Yes for no-action preview UX | Separate from Cloud-assisted Action. |
| Scheduler/agent | 4 | Yes for cleanup and continuous DNS/cert behavior | Not needed for pure Action. |
| Preview policy/read model operations | 4 | Yes for product-grade previews | Needed for list/show/update/delete policy, scoped env, cleanup status, and audit. |
| External Postgres direct mode | 5 | No | Advanced, not default product path. |

## Non-Goals For Early Phases

- Do not make Cloud required for GitHub Action deployments.
- Do not make a resident Appaloft server required for domain routes in pure SSH mode.
- Do not store tokens, SSH keys, or database URLs in `appaloft.yml`.
- Do not put `controlPlane` fields on `deployments.create`.
- Do not let `auto` mode adopt or upload state silently.
- Do not let an Action and a resident Appaloft server concurrently mutate the same PGlite files.

## Current Implementation Notes And Migration Gaps

Current implementation is between Phase 0 and Phase 1:

- pure SSH Action/CLI remote state exists;
- config domains and canonical redirects have provider route support;
- `APPALOFT_CONTROL_PLANE_URL` and `APPALOFT_DATABASE_URL` skip SSH PGlite sync as a backend
  selection hint;
- config `controlPlane` schema does not exist;
- Cloud/self-hosted API handshake does not exist;
- adoption import/marker does not exist;
- Web mode selection does not exist;
- deploy-action has no control-plane inputs yet.

Future Code Rounds should start with Phase 1 before any Cloud/self-hosted behavior is made
user-visible.
