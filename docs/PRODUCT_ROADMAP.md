# Product Roadmap

> Analysis date: 2026-04-13.
>
> Scope: deployment platform product requirements, current Yundu implementation state, local
> self-hosted PaaS reference inspection, public self-hosted deployment product documentation, and
> comparable platform patterns. This is Yundu's product and platform roadmap.

## Why This Exists

Yundu's intended core is `detect -> plan -> execute -> verify -> rollback`, with CLI, HTTP API,
and future MCP/tool interfaces as first-class interfaces. This roadmap turns the expected day-two
application configuration surface for a self-hosted PaaS into Yundu-owned product work.

The key product direction from this review:

- Keep the Yundu domain model as the source of truth; do not hide deployment behavior in web forms.
- Add the missing resource configuration operations before adding many one-off UI tabs.
- Treat static site deployment as an early core resource type.
- Treat Nixpacks/buildpack support as an onboarding accelerator, not a prerequisite for the first
  credible deployment loop.

## Inputs

- Yundu source of truth:
  - [`docs/BUSINESS_OPERATION_MAP.md`](./BUSINESS_OPERATION_MAP.md)
  - [`docs/CORE_OPERATIONS.md`](./CORE_OPERATIONS.md)
  - [`docs/DOMAIN_MODEL.md`](./DOMAIN_MODEL.md)
  - [`docs/RESOURCES.md`](./RESOURCES.md)
  - [`packages/core/src/shared/enums.ts`](../packages/core/src/shared/enums.ts)
  - [`packages/adapters/runtime/src/index.ts`](../packages/adapters/runtime/src/index.ts)
- Product reference inputs:
  - local self-hosted PaaS UI inspection at `http://127.0.0.1:8000`
  - [Dokploy providers](https://docs.dokploy.com/docs/core/providers)
  - [Dokploy domains](https://docs.dokploy.com/docs/core/domains/cloudflare)
  - [CapRover app configuration](https://caprover.com/docs/app-configuration.html)
  - [CapRover Docker Compose](https://caprover.com/docs/docker-compose.html)
  - [Dokku application deployment](https://dokku.com/docs/deployment/application-deployment/)
  - [Dokku Dockerfile deployment](https://dokku.com/docs/deployment/builders/dockerfiles/)
  - [Easypanel database backups](https://easypanel.io/docs/database-backups)

## Priority Rubric

| Priority | Meaning |
| --- | --- |
| P0 | Needed for the core deployment product to be coherent and usable beyond a demo. |
| P1 | Important for production use and expected by users deploying real services. |
| P2 | Valuable for team scale, operations, and smoother onboarding, but not blocking the core loop. |
| P3 | Nice-to-have, later differentiation, or product depth after the core is stable. |

| Necessity | Meaning |
| --- | --- |
| Core | Belongs in the main deployment capability surface. |
| Production | Needed for serious production use, but can follow the core deployment loop. |
| Optional | Convenience or advanced workflow; should not block basic product value. |

## Target Project And Application Surface

Yundu project/environment pages should expose these major surfaces:

- Environment resource list with Applications and Services, resource search, tags, clone, and delete
  environment.
- New resource catalog split into Git based, Docker based, Databases, and many service templates.
- Application detail top-level operations: configuration, deployments, logs, terminal, links,
  redeploy, restart, stop, status refresh, and unapplied-configuration warning.
- Application configuration sections: General, Advanced, Environment Variables, Persistent Storage,
  Git Source, Servers, Scheduled Tasks, Webhooks, Preview Deployments, Healthcheck, Rollback,
  Resource Limits, Resource Operations, Metrics, Tags, and Danger Zone.
- Build/source options:
  - Git: public repository, private repository through GitHub App, private repository through deploy
    key.
  - Docker: inline Dockerfile, empty Docker Compose, prebuilt Docker image.
  - Build packs: Nixpacks, Static, Dockerfile, Docker Compose.
- Day-two configuration:
  - domains, redirect direction, force HTTPS, gzip, basic auth, labels, build args, build server,
    Git submodules/LFS/shallow clone, healthcheck policy, rollback image retention, CPU/memory
    limits, clone/move resource, and metrics behind Sentinel.

## Current Yundu Baseline

Yundu already has a stronger domain foundation than a generic UI-only implementation would:

- Projects, environments, resources, destinations, deployment targets, deployments, releases, and
  rollback plans are modeled in core.
- Implemented active public operations include project create/list, environment
  create/list/show/set/unset/diff/promote, resource create/list, server/register/credential/
  connectivity operations, deployment create/list/logs, domain-binding create/list, and system
  provider/plugin/GitHub repository/doctor/database operations.
- Source kinds already include local folder/git, remote git, public git, GitHub App, deploy key,
  zip artifact, inline Dockerfile, inline Docker Compose, Docker image, and compose.
- Runtime planning now maps explicit deployment methods:
  - `dockerfile` -> Docker container.
  - `docker-compose` -> Docker Compose stack.
  - `prebuilt-image` -> Docker container.
  - `workspace-commands` -> host process.
- Static site and buildpack concepts exist in enums/value objects, but there is no complete
  static-artifact or buildpack runtime path yet.
- The web console is currently much narrower than the domain/API surface: it has quick deployment,
  project/server/resource/deployment/domain-binding pages and deployment logs/details, but not the
  full resource configuration surface.

## Roadmap Table

| Area | Product signal | Yundu state | Gap | Priority | Necessity | Roadmap action |
| --- | --- | --- | --- | --- | --- | --- |
| Resource create/show/update | Persistent resource configuration must be the center of the application page. | Only `resources.list` is a public operation; deployment can bootstrap a resource. | No first-class operation for creating/editing resource profile, source, build config, routing, storage, or lifecycle. | P0 | Core | Add `resources.create`, `resources.show`, `resources.update`, and `resources.archive`. Keep resource config in application/core slices, then expose in web. |
| Static site deployment | Static apps are a common first deployment and need explicit base/publish directory semantics. | `static-site`, `static-artifact`, and static workload/runtime value objects exist, but runtime resolver does not implement a static deployment method. | Static assets cannot be deployed as a first-class resource. | P0 | Core | Add `static-site` / `static-artifact` deployment method, `baseDirectory`, `publishDirectory`, SPA fallback, cache headers, static web server image, domain routing, and tests. |
| Git source binding | Resource redeploy/webhook behavior needs durable source ownership and credential references. | Deployment source can be supplied per deployment; Git source is not yet a persisted project/resource binding. | Redeploy and webhook flows depend on latest deployment state instead of a durable source binding. | P0 | Core | Model resource source binding and credential reference. UI should prefer connected GitHub repositories when available, but allow manual public/private URLs. |
| Deployment detail and events | Deployment history must show status, start/end/duration, commit, trigger, logs, and reconnectable state. | Yundu has list/logs/reattach and progress dialog, but explicit show/stream operations are still expected next operations. | UI cannot fully reconstruct or stream execution state as a stable business operation. | P0 | Core | Add `deployments.show` and `deployments.stream-events`; persist enough runtime metadata for reconnect, logs, access routes, and health checks. |
| Domain/TLS/access routing | Domains/TLS are core app configuration, not deployment form-only hints. | Runtime plans support access route hints and Traefik/Caddy proxy intent. | No durable resource-level routing config UI/API; proxy support is container-only for now. | P0 | Core | Add resource routing config: domains, path prefix, TLS mode, proxy kind, target port, redirect direction. Keep runtime adapter-specific labels outside core. |
| Environment variables and secrets | Build/runtime variables, shared variables, preview variables, secret handling, and Compose interpolation are production requirements. | Yundu environment config exists with scopes and deployment snapshots; web quick deploy has variable input. | Resource-specific, preview-specific, and shared variable surfaces are incomplete. | P1 | Production | Add resource env var operations/read models, secret masking, build/runtime exposure controls, `.env` paste/import, and preview scope later. |
| Healthcheck policy | Health checks need durable HTTP/CMD policy, expected response semantics, interval, timeout, retries, and start period. | Yundu can check deployment health after deployment using persisted route/runtime metadata. | Healthcheck policy is not yet a resource config with full HTTP/CMD semantics. | P1 | Production | Add resource healthcheck config and pass it into runtime plans. Start with HTTP path/code/timeout; add CMD later. |
| Persistent storage | Stateful workloads need Docker volumes, bind mounts, destination paths, and backup relationship metadata. | Resource binding concepts exist, but resource storage operations are not implemented. | Stateful apps/databases cannot safely preserve data through resource-level config. | P1 | Production | Add persistent storage config: named volume, bind mount, destination path, file/directory mode, secret-safe read models, and adapter implementation. |
| Rollback retention | Rollback needs retained artifact/image references and a user-visible candidate list. | Yundu has rollback plan concepts, but public rollback command behavior is rebuild-required under ADR-016. | Rollback UX, retention policy, and command semantics are not yet resource-level configuration. | P1 | Production | Store last successful artifacts/runtime image refs and rollback retention policy. Rebuild rollback as a spec-driven behavior before exposing it. |
| Auto deploy and webhooks | Push-to-deploy and signed webhooks are expected deployment automation capabilities. | No durable webhook operation surface yet. | Push-to-deploy and external CI/CD integrations are missing. | P1 | Production | Add integration webhook endpoints and resource-level auto-deploy policy. Start with GitHub App/push, then generic signed deploy webhook. |
| Static resource front-end UX | Static site deployment needs base/publish directory, web server, and domain routing inputs. | Web quick deploy has resource kind choices but no static deployment path. | Users cannot explicitly deploy static assets or understand output directory requirements. | P1 | Core | Add a "Static site" deployment flow with build command optionality, publish directory required, framework presets for Vite/SvelteKit/Next static, and generated command preview. |
| Databases and dependency resources | Databases, backups, and explicit binding injection are first-class self-hosted PaaS expectations. | `ResourceInstance` and `ResourceBinding` are modeled but provisioning commands are future. | No database provisioning, binding injection, or restore/backup workflow. | P1 | Production | Add minimal Postgres and Redis provisioning/binding first. Make connection injection explicit instead of plain env vars. |
| Scheduled tasks / cron | Background jobs and cron need durable workload/resource service semantics. | Workload kinds include scheduler/cron-like concepts, but no operation surface. | Background jobs and cron cannot be managed as deployment resources. | P2 | Production | Add scheduler workload/resource service type, cron expression validation, run history, logs, and manual trigger. |
| Preview deployments | PR-scoped preview URLs and scoped preview variables are required for mature Git automation. | Environments include `preview`; deployment model can represent separate resources/runs. | No PR ingestion, preview resource lifecycle, or scoped preview env vars. | P2 | Production | Implement after source binding and webhooks. Use GitHub App PR events, wildcard domain template, scoped secrets, and cleanup on PR close/merge. |
| Nixpacks / buildpack | Buildpack-style auto-detection improves onboarding when a repository has no Dockerfile. | `buildpack` enum exists, but no buildpack adapter. | "No Dockerfile" onboarding is weaker, but the core loop still works through Dockerfile/static/compose/prebuilt/workspace commands. | P2 | Optional | Add Nixpacks as an adapter-owned build strategy later. Do not block static-site or persisted resource config on it. |
| Build server / registry / cache | Large builds need build placement, registry image/tag, build cache, and commit metadata policy. | Runtime planning builds locally/over SSH; registry/build-cache policy is not first-class. | Large builds may load production servers and cache behavior is opaque. | P2 | Production | Add build placement policy, registry push/pull config, cache mode, and source-commit build arg policy. |
| Logs, metrics, notifications | Operators need streaming logs, filtering, metrics, health notifications, and stopped/restarted workload signals. | Yundu has deployment logs and health checks; metrics/notifications are not a full surface. | Operators lack proactive signals and richer log UX. | P2 | Production | Add log streaming, log drain config, metrics read models, and notifications for deploy/health/server events. |
| Resource limits and advanced Docker config | Production services need CPU/memory, labels, network aliases, basic auth, gzip, and selected advanced options. | Some runtime hints exist; no resource-level advanced config. | Advanced container tuning is unavailable or only implicit. | P2 | Optional | Add targeted fields only after core config is stable: CPU/memory first, then labels/options/network/basic auth. GPU is P3 unless a real target user needs it. |
| Clone/move resource and environment clone | Users need to duplicate resource and environment configuration safely. | `environments.promote` exists; clone operations are expected but not implemented. | Users cannot duplicate production config for staging/preview easily. | P2 | Production | Add clone operations once resource config is durable. Include copied env vars with secret handling rules. |
| Teams/RBAC/tags/audit | Team-scale deployments need tags, permissions, and audit trails. | Identity/governance models are foundational only. | Multi-user governance is incomplete. | P2 | Production | Add organization/member/role operations after single-user resource lifecycle is stable. Tags can come earlier as low-risk metadata. |
| Terminal / remote exec | Browser-side remote exec is useful but requires strong auth/RBAC/audit/redaction first. | Yundu has CLI/SSH runtime adapters but no terminal product surface. | Browser-side ad hoc operations are missing. | P3 | Optional | Keep CLI-first. Add terminal only after auth/RBAC/audit and redaction policy are clear. |
| Service template marketplace | One-click service templates need stable resource, variable, domain, mount, and backup models. | ResourceInstance/binding concepts exist; templates are not implemented. | Template breadth is missing. | P3 | Optional | Start with a small curated set after database/resource binding exists. Avoid building a large catalog before the resource model is stable. |
| Multi-server / Swarm / Kubernetes | Multi-node scheduling is important only after single-server resource lifecycle is reliable. | ADR-023 defines Swarm/Kubernetes as future runtime target backends behind the existing Docker/OCI workload substrate. Current support is single-server oriented. | Multi-node scheduling is not available, and the target backend registry is not implemented yet. | P3 | Optional | Defer until single-server resource lifecycle, storage, routing, rollback, and runtime target backend registry are reliable. |

## Static Site Deployment Proposal

Static site support should be pulled forward because it is a common first deployment and because
Yundu already has the vocabulary for it.

Minimum viable behavior:

- New deployment method: `static-site` or `static-artifact`.
- New/used resource kind: `static-site`.
- Required inputs:
  - source locator or source descriptor
  - base directory
  - publish directory
  - domain/routing hints
- Optional inputs:
  - install/build commands
  - SPA fallback
  - cache headers
  - custom static server config
- Runtime strategy:
  - produce a static-server Docker image or a deterministic static serving container
  - serve through Nginx/Caddy-like static server on port 80
  - route through the existing access route/proxy mechanism
- API/CLI shape:
  - do not hide this under `workspace-commands`
  - deployment plan should explicitly show "build static assets" and "serve static artifact"
- Front-end:
  - presets for Vite, SvelteKit static, Next static, Nuxt static, and generic `dist`
  - publish directory preview and validation
  - show generated route and deploy command before execution

This should happen before Nixpacks because it gives Yundu a simple, explicit resource type with
less magic and clearer failure modes.

## Nixpacks / Buildpack Position

Nixpacks is useful, but it should be a P2 optional accelerator for Yundu:

- It improves onboarding when a repository has no Dockerfile.
- It introduces opaque auto-detection behavior and generated Dockerfiles.
- It should live in an adapter/provider package, not in `core`.
- It should not replace explicit static, Dockerfile, Compose, prebuilt-image, or command-driven
  deployment methods.

Recommended sequence:

1. Implement first-class static site deployment.
2. Persist resource source/build/runtime configuration.
3. Add Nixpacks as a buildpack adapter with explicit plan output, logs, and override fields.

## Front-End Resource Detail Information

The web console should eventually show these items on a resource detail page:

| Section | Important information to show |
| --- | --- |
| Header | Resource name, kind, status, server/destination, current public URLs, active commit/image, last deploy time, and "configuration not applied" state. |
| Source | Source mode, repository URL, branch, commit SHA, credential type, base directory, Dockerfile/Compose path, or image reference. |
| Build | Deployment method, build strategy, install/build/start commands, publish directory for static sites, build server/registry/cache policy. |
| Routing | Domains, path prefix, TLS mode, proxy kind, target port, redirect direction, force HTTPS, and generated direct host-port fallback. |
| Environment | Effective variables, secret masking, build/runtime exposure, shared variable references, and preview overrides when previews exist. |
| Storage | Volumes/bind mounts, source/destination paths, mount type, backup relationship, and warning when data is not persistent. |
| Deployments | History with status, trigger, duration, commit/message, logs, current attempt progress, and rebuild-required future rollback/redeploy affordances. |
| Health | Health policy, latest check result, internal/public check status, and failure reason. |
| Operations | Future start, stop, restart, redeploy, rollback, clone/move, archive/delete, and danger-zone destructive actions after they are positioned in the business operation map and governed by specs. |
| Automation | Auto deploy state, signed webhook URLs, preview deployment settings, scheduled tasks, and notification/log-drain hooks. |

The UI should not ask users to pick "public vs private" as the primary mental model when they are
entering a GitHub source. The better product split is:

- choose from connected repositories when a GitHub integration exists
- enter a repository URL manually when deploying something outside the connected account
- let the backend/source adapter decide whether public HTTPS, GitHub App, or deploy key credentials
  are needed

## Next Four Milestones

| Milestone | Goal | Key deliverables |
| --- | --- | --- |
| M1 | Durable resource configuration | `resources.create/show/update/archive`, persisted source binding, static-site method, basic resource detail page. |
| M2 | Production app basics | domains/TLS config, env/secrets resource scope, storage, health policy, deployment show/stream, rollback candidates. |
| M3 | Git automation | GitHub App/webhooks, auto deploy, signed deploy webhook, preview deployments, scoped preview env vars. |
| M4 | Operations and scale | minimal Postgres/Redis provisioning, metrics/notifications/log drains, teams/tags, build server/registry policy. |

## Immediate Recommendation

Do next:

1. Add first-class static site deployment.
2. Add resource create/show/update operations so static/Docker/Git configuration has a durable home.
3. Add resource detail UI that shows source, build, routing, environment, deployment history, health,
   and storage placeholders.

Do not do next:

- a large service template marketplace
- full Nixpacks integration
- GPU/resource-limit-heavy UI
- browser terminal

Those are useful, but they are not the missing core. The missing core is a durable resource model
that can own source, build, runtime, routing, config, and operations across CLI/API/web.
