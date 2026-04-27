# Product Roadmap To 1.0.0

> Analysis date: 2026-04-24.
>
> Scope: Appaloft product, operation, workflow, framework-planner, day-two
> operations, and release gates through `1.0.0`.
>
> Status format:
>
> - `[x]` means implemented, accepted, or complete in the current roadmap state.
> - `[ ]` means not complete, still needs a Spec Round, still needs Code Round, or must be checked
>   again before release.

## Release Gate Checklist

This roadmap is the release gate for Appaloft versions before `1.0.0`.

- [x] Keep roadmap entries in Markdown todo format so completed and incomplete work is visible.
- [x] Keep external baseline research summarized without naming other products in this document.
- [x] Before every release, compare implementation, operation catalog, specs, tests, and migration
  notes against this roadmap.
- [x] Before every release, update this roadmap for work that was finished early, deferred, removed,
  or discovered as incomplete.
- [x] Include the current roadmap alignment in the Release Please PR before publishing a release.
- [x] Use this roadmap to choose the release version.
- [x] Before the next release, verify package manifests, Release Please state, and the latest
  published release agree on the current version line. The roadmap starts from the current public
  line `0.5.x` because the current release is `0.5.0`.

Version selection rules:

- [x] Use a target minor version only when every required item and exit criterion for that target
  phase, and all earlier phases, is checked.
- [x] If the current line is `0.2.x` and the `0.3.0` checklist is not fully checked, release the
  next patch version on `0.2.x` instead of claiming `0.3.0`.
- [x] Apply the same rule for every minor boundary before `1.0.0`: incomplete target-phase checklist
  means patch the current minor, unless the user explicitly asks for a prerelease.
- [x] If later-phase work is completed early, mark it `[x]` in its owning phase before release; do
  not move it into an earlier phase unless the product target actually changed.
- [x] If planned work is intentionally deferred, leave it unchecked and add or update the release
  note/migration gap that explains why the version can still ship.

Current release alignment:

<!-- release-alignment:start -->
- [x] On 2026-04-27, the latest public release is `v0.5.0`; root package
  and Release Please manifest on `main` are `0.5.0`; the release PR target is
  `0.6.0`.
- [x] On 2026-04-27, the roadmap gate allows `Release-As: 0.6.0` because
  Phase 0 through Phase 4 release rules, required items, and exit criteria are checked.
<!-- release-alignment:end -->

Historical alignment notes:

- [x] On 2026-04-23, the public docs app and standalone docs deployment workflow are merged on
  `origin/main`; `docs.appaloft.com` DNS and release deployment secrets/variables are configured,
  so the docs site should deploy after the next release publish run creates a GitHub Release.
- [x] On 2026-04-22, custom resource runtime/container naming for Quick Deploy, CLI config-driven
  deploys, and Web runtime profile editing is merged on `origin/main`, and the current preview
  runtime-name template variables on `main` are `{preview_id}` and `{pr_number}`.
- [x] On 2026-04-22, Action/CLI PR preview deploy profile flag support and explicit preview cleanup
  command support are implemented in the CLI/config bootstrap path, but the public
  deploy-action wrapper and product-grade GitHub App preview lifecycle remain incomplete.
- [x] On 2026-04-23, `deployments.stream-events` is active in the operation catalog, application
  query slice, HTTP/oRPC replay and stream routes, CLI events command, shell observer, and Web
  deployment detail timeline. Remaining work is reconnect/gap/CLI test hardening, not first-class
  query implementation.
- [x] On 2026-04-24, the `0.4.0` minimum console and deployment loop has a dedicated release-gate
  matrix, Quick Deploy new-resource sequencing remains `resources.create ->
  deployments.create(resourceId)`, and the local CLI smoke covers resource/deployment observation
  after deployment.
- [x] On 2026-04-24, the main repository has a docs PR preview workflow that uses the Appaloft CLI
  preview path for same-repository docs changes and runs explicit preview cleanup when the PR is
  closed; the public `appaloft/deploy-action` wrapper remains separate roadmap work.
- [x] Release Please keeps pre-`1.0.0` feature and minor bumps on the current patch line by
  default; the `release_as` workflow input is required only when the roadmap gate allows a target
  minor or explicit hotfix version.

## Source-Of-Truth Inputs

Internal governing sources:

- [x] [Business Operation Map](./BUSINESS_OPERATION_MAP.md)
- [x] [Core Operations](./CORE_OPERATIONS.md)
- [x] [Domain Model](./DOMAIN_MODEL.md)
- [x] [Error Model](./errors/model.md)
- [x] [neverthrow Conventions](./errors/neverthrow-conventions.md)
- [x] [Async Lifecycle And Acceptance](./architecture/async-lifecycle-and-acceptance.md)
- [x] [Workload Framework Detection And Planning](./workflows/workload-framework-detection-and-planning.md)
- [x] [Quick Deploy](./workflows/quick-deploy.md)
- [x] [Minimum Console And Deployment Loop Test Matrix](./testing/minimum-console-deployment-loop-test-matrix.md)
- [x] [deployments.create Test Matrix](./testing/deployments.create-test-matrix.md)
- [x] [Quick Deploy Test Matrix](./testing/quick-deploy-test-matrix.md)
- [x] [Deployment Runtime Substrate Plan](./implementation/deployment-runtime-substrate-plan.md)
- [x] [Static Site Deployment Plan](./implementation/static-site-deployment-plan.md)

Product constraints:

- [x] Treat Appaloft as a self-hosted deployment control plane, not a web-first CRUD app.
- [x] Keep `detect -> plan -> execute -> verify -> rollback` as the core product shape.
- [x] Keep CLI, HTTP/oRPC, Web, and future MCP/tool entrypoints aligned through the same operation
  catalog.
- [x] Treat Web as a static console over contracts, not a place to hide business behavior.
- [x] Treat "CRUD" as CRUD or explicit lifecycle equivalents for durable and internal state.

## 1.0.0 Definition Of Done

The 1.0.0 product is ready only when all of these are checked:

- [ ] A new operator can install Appaloft, connect a single-server SSH/Docker target and a Docker
  Swarm cluster target, create/select a project/environment/resource, deploy an app, and observe
  status, logs, health, access, diagnostics, and failure reasons.
- [ ] The minimum loop is executable end to end: project -> environment -> target/server ->
  credential -> resource profile -> deployment -> resource health/logs/access -> optional
  domain/TLS.
- [ ] Every top-level resource has list and show.
- [ ] Every mutable profile has update/configure.
- [ ] Every removable resource has archive/delete/deactivate with a documented safety rule.
- [ ] Every long-running internal state has list/show plus retry/cancel/prune/recovery where it can
  block or confuse operators.
- [ ] Web, CLI, and HTTP/oRPC all dispatch the same command/query schemas.
- [ ] Future MCP/tool contracts can be generated from the same operation catalog without inventing
  parallel behavior.
- [ ] Framework/runtime detection covers the mainstream self-hosted web catalog with deterministic
  planners or explicit fallback errors.
- [ ] Detected unsupported frameworks fail clearly instead of silently becoming broken host-process
  deployments.
- [ ] Deployment artifacts are Docker/OCI-backed, resource-scoped, observable, and preserve enough
  metadata for rollback candidates, diagnostics, and future target backends.
- [ ] Specs, test matrices, implementation plans, and migration gaps agree.
- [ ] Rebuild-required public behaviors from ADR-016 are rebuilt by accepted specs or still absent
  from public surfaces.

## Current Baseline

Already implemented or materially present:

- [x] Core models projects, environments, deployment targets, destinations, resources, resource
  instances, bindings, releases, deployments, rollback plans, domain bindings, and runtime plans.
- [x] Active operations cover project create/list.
- [x] Active operations cover environment create/list/show/rename/set/unset/diff/promote.
- [x] Active operations cover resource create/list/show, source/runtime/network/health
  configuration, resource variables/effective config, archive/delete, health, logs, proxy preview,
  diagnostics, and Web detail observation.
- [x] Active operations cover server registration, credentials, connectivity, proxy repair, and
  terminal open.
- [x] Active operations cover deployment create/list/show/logs, standalone event replay/follow, and
  create-time progress streaming.
- [x] Active operations cover domain binding create/confirm/list.
- [x] Active operations cover certificate issue/list.
- [x] Active operations cover source-link relink and system diagnostics/migration.
- [x] `resources.create -> deployments.create` is the canonical first-deploy path.
- [x] Minimal static-site creation and deployment work through resource runtime/network profiles and
  Docker/OCI static-server packaging.
- [x] Generated default access is implemented as a read/projection surface.
- [x] Default access provider selection exists.
- [x] `ResourceAccessSummary` exposes planned and latest generated routes.
- [x] Resource read models/API and Web resource detail consume `ResourceAccessSummary`.
- [x] Quick Deploy completion refreshes the generated URL when available.
- [x] Server-applied config domains for pure CLI/SSH mode are implemented as target-local route
  desired/applied state.
- [x] Generated, managed durable, and server-applied routes are exposed separately through access,
  health, proxy, and diagnostic summaries.
- [x] `resources.proxy-configuration.preview` is active through API/oRPC, CLI, and Web resource
  detail.
- [x] Edge proxy providers render read-only proxy configuration sections from planned/latest/
  deployment-snapshot route input.
- [x] Runtime planner coverage exists for Next.js SSR and static export, Remix, Vite static,
  Angular static, Astro static, Nuxt generate static, SvelteKit adapter-static/static, FastAPI,
  Django, Flask, generic Node, generic Python, generic Java, and custom command fallback.
- [x] Runtime target backend selection has local-shell and generic-SSH single-server registry
  coverage.
- [x] Repository config, SSH-server PGlite state, source fingerprint links, server-applied route
  state, and headless entrypoints have governing specs and partial implementation.
- [x] CLI preview deploy profile flags can supply or override runtime commands, network profile,
  health path, non-secret env values, `ci-env:` secret references, preview custom route TLS mode,
  and required preview URL gating without adding fields to `deployments.create`.

Still blocking 1.0.0:

- [ ] Top-level resource CRUD/lifecycle is uneven across projects, servers, credentials, resources,
  deployments, domain bindings, certificates, default access policy, dependency resources, storage,
  webhooks, and internal process state.
- [ ] Resource profile drift handling and remaining non-resource lifecycle gaps are still major
  horizontal work. Resource detail/profile editing affordances are Phase 4 closure work.
- [ ] Retry/redeploy, cancel, and rollback are not public operations. `deployments.show` and
  `deployments.stream-events` are already active.
- [ ] `deployments.create` progress stream is still create-time observation; standalone replay/follow
  deployment observation is now owned by `deployments.stream-events`.
- [x] Default access policy editing is public through explicit configure/list/show operations.
- [x] Durable-domain and server-applied route precedence is hardened in deployment route resolution
  and current-route consumers.
- [ ] Provider-route projection/retention and route intent update/delete/reconcile surfaces are not
  complete.
- [ ] Generated access, proxy preview, server-applied domains, and durable domain routes still need
  broader API/Web/CLI regression coverage.
- [ ] Dependency resources and bindings exist in core but lack provisioning, binding, backup, and
  deletion commands.
- [ ] Framework coverage is narrower than the target product catalog.
- [ ] Docker Swarm support is not yet specified and implemented as a supported `1.0.0` runtime target
  backend.
- [ ] Durable outbox/inbox, job state, process attempts, dead-letter/retry state, remote-state
  recovery, and audit visibility are not a complete operator surface.

## Phase 0: Spec And Roadmap Alignment

Target: current worktree to the next planning checkpoint.

Required:

- [x] Create one roadmap owner document for `1.0.0`.
- [x] Keep roadmap status in checkbox form.
- [x] Align generated default access, `ResourceAccessSummary`, static-site, proxy-preview, and
  current framework planner status with actual implementation.
- [x] Remove named external product references from the roadmap.
- [x] Keep this roadmap synchronized with `BUSINESS_OPERATION_MAP.md`, `CORE_OPERATIONS.md`, and
  implementation-plan migration notes before every release.
- [x] For each future capability, run a Spec Round before Code Round: operation-map placement, ADR
  decision when needed, command/query spec, workflow spec, error spec, test matrix, implementation
  plan, and migration notes.
- [x] Use the resource/internal-state ledger below as the release checklist for horizontal closure.

Exit criteria:

- [x] One roadmap owner document exists.
- [x] Product priority does not depend on `docs/ai/**`.
- [x] Every later phase has concrete source-of-truth docs updated before its implementation is
  treated as complete.

## Phase 1: Release-Gated Roadmap Baseline

Target: `0.3.0`.

Release rule:

- [x] Select `0.3.0` only when all required Phase 1 items and exit criteria are checked. If any
  Phase 1 item remains unchecked, release a `0.2.x` patch instead.

Already done:

- [x] `docs/PRODUCT_ROADMAP.md` exists.
- [x] The roadmap uses Markdown checkbox status.
- [x] The release skill requires roadmap alignment before release execution.
- [x] The release skill requires roadmap-based version selection.
- [x] Generated access, `ResourceAccessSummary`, proxy preview, static site, and current framework
  planner status are reflected as current baseline rather than future work.

Required:

- [x] Verify the latest public release, Release Please state, and package manifests agree on the
  current `0.2.x` line.
- [x] Commit the roadmap and release-skill alignment work before any `0.3.0` release.
- [x] Add or update the release checklist so `docs/PRODUCT_ROADMAP.md` is part of every release
  preflight.
- [x] Ensure `docs/PRODUCT_ROADMAP.md` is referenced by the release flow used by maintainers.
- [x] Confirm no release workflow can be intentionally triggered without explicit user confirmation.

Exit criteria:

- [x] Maintainers can decide between `0.2.x` patch and `0.3.0` by reading the roadmap checklist.
- [x] Release preparation includes roadmap alignment in the Release Please PR before merge.
- [x] No roadmap phase before `0.3.0` remains implicit.

## Phase 2: Minimum Console And Deployment Loop Baseline

Target: `0.4.0`.

Release rule:

- [x] Select `0.4.0` only when all required Phase 2 items, Phase 1 items, and exit criteria are
  checked. If any Phase 2 item remains unchecked, release a `0.3.x` patch instead.

Already done:

- [x] Projects can be created and listed.
- [x] Environments can be created, listed, shown, inspected for effective precedence, diffed,
  promoted, and updated through baseline variable set/unset operations.
- [x] Servers can be registered, listed, tested for connectivity, assigned credentials, and repaired
  for proxy bootstrap.
- [x] Resources can be created and listed.
- [x] Deployments can be created, listed, and inspected through logs.
- [x] Web Quick Deploy can create a first-deploy resource before `deployments.create`.
- [x] Web resource detail can read access, health, proxy preview, diagnostics, runtime logs, and
  resource-scoped domain actions.

Required:

- [x] Verify Web, CLI, and HTTP/oRPC all dispatch the active operation catalog entries for the
  minimum loop. Covered by `MIN-CONSOLE-OPS-001`.
- [x] Confirm Quick Deploy still dispatches `resources.create` before ids-only `deployments.create`
  for new first-deploy resources. Covered by `MIN-CONSOLE-QUICK-001`.
- [x] Add or update smoke coverage for the minimum console path from project/environment/server to
  resource/deployment observation. Covered by `MIN-CONSOLE-SMOKE-001`.
- [x] Document any intentionally missing show/update/delete commands as post-`0.4.0` gaps in this
  roadmap. Covered by `MIN-CONSOLE-GAPS-001`.

Exit criteria:

- [x] A user can complete a minimal first deployment loop from the console or CLI without relying on
  hidden Web-only behavior.
- [x] The current active operations are accurately checked in the resource/internal-state ledger.
- [x] Missing CRUD/lifecycle operations are explicitly assigned to later phases.

Post-`0.4.0` gaps assigned to later phases:

- Credential rotation, broad credential usage visibility, and delete-when-unused are active
  lifecycle slices.
- Remaining environment lock/history work remains Phase 4 work after effective-precedence, archive,
  and clone slices.
- Access policy editing, route precedence hardening, route intent repair, domain binding mutation
  lifecycle, and certificate import/revoke/retry/delete remain Phase 6 work.
- Deployment retry/redeploy, cancel, rollback, dependency resources, storage, secrets, webhooks,
  auto-deploy, and product-grade preview deployments remain Phase 7 work.
- Durable outbox/inbox/job state, recovery/prune commands, runtime target capacity diagnostics,
  audit/event history, remote SSH state diagnostics, and terminal session lifecycle closure remain
  Phase 8 work.

## Phase 3: Access, Static, SSH Config, And Planner Baseline

Target: `0.5.0`.

Release rule:

- [x] Select `0.5.0` only when all required Phase 3 items, earlier phase items, and exit criteria
  are checked. If any Phase 3 item remains unchecked, release a `0.4.x` patch instead.

Already done:

- [x] Minimal static-site deployment works through resource runtime/network profiles and Docker/OCI
  static-server packaging.
- [x] Generated default access is visible through `ResourceAccessSummary`.
- [x] Planned and latest generated routes are projected.
- [x] Latest durable domain routes and server-applied routes are exposed separately.
- [x] `resources.proxy-configuration.preview` is active.
- [x] Server-applied config domains for pure CLI/SSH mode have target-local desired/applied state.
- [x] Local-shell and generic-SSH single-server runtime target registry coverage exists.
- [x] Initial framework planner coverage exists for Next.js SSR and static export, Remix, Vite
  static, Angular static, Astro static, Nuxt generate static, SvelteKit adapter-static/static,
  FastAPI, Django, Flask, generic Node, generic Python, generic Java, and custom command fallback.

Required:

- [x] Verify the checked access/static/SSH/planner items above against current executable tests and
  migration notes before release.
- [x] Confirm generated, durable, and server-applied route states remain visually and semantically
  separate in Web/resource read models, with remaining Web assertion gaps recorded below.
- [x] Confirm proxy configuration preview still uses the edge proxy provider boundary and does not
  leak generated-access provider keys into proxy provider selection.
- [x] Add release notes for known remaining gaps: access policy editing, route precedence hardening,
  standalone deployment observation, and broader API/Web/CLI regression coverage.

Phase 3 release-gate verification notes from 2026-04-24:

- No operation catalog change is required for the checked Phase 3 baseline. First-class static site
  deployment remains an accepted workflow over `resources.create -> deployments.create`; framework
  planning, generated access resolution, edge proxy route realization, and pure CLI/SSH
  server-applied domain routing remain internal capabilities or entry/runtime workflows. The only
  active public Phase 3 query in this slice is the existing
  `resources.proxy-configuration.preview` catalog entry.
- Executable coverage exists for static-site resource/profile admission, static Docker/OCI
  packaging, local Docker static smoke, Quick Deploy static schema flow, planned/latest generated
  access projection, generated/durable/server-applied `ResourceAccessSummary` fields,
  server-applied desired/applied PG/PGlite state, local-shell/generic-SSH runtime target registry
  dispatch, and current framework planner fixtures.
- `ResourceAccessSummary`, resource health, diagnostics, and proxy configuration read models keep
  generated, durable, and server-applied routes as separate fields or labeled route sources. Web
  resource detail keeps generated access separate from durable domain bindings and renders
  provider-owned proxy configuration sections, but an explicit first-class Web access row for
  `latestServerAppliedDomainRoute` plus browser assertion coverage remains part of broader Web/API/CLI
  regression hardening.
- `resources.proxy-configuration.preview` continues to resolve route rendering through the edge proxy
  provider registry. Focused tests guard that generated default-access provider keys such as `sslip`
  do not override edge proxy provider selection.
- Framework planner verification covers pinned Next.js SSR/static export, Remix, Vite static, Angular
  static, Astro static, Nuxt generate static, SvelteKit adapter-static/static, FastAPI, Django, Flask,
  generic Node/Express, generic Python, and explicit workspace-command fallback paths. The generic
  Java planner code path exists, but a matrix-named executable Java fixture remains a documented test
  coverage gap rather than new Phase 3 behavior.
- Known remaining gaps for `0.5.0` release notes: access policy editing/readback hardening, route
  precedence hardening beyond focused read-model/query tests, standalone deployment observation
  reconnect/gap/CLI hardening, generic Java planner fixture coverage, and broader API/Web/CLI
  regression coverage for access, proxy preview, and server-applied route visuals.

Exit criteria:

- [x] `0.5.0` represents the access/static/SSH-config/planner baseline already present in the
  product, not the future policy/lifecycle closure work.
- [x] Any unchecked access/static/SSH/planner hardening work remains assigned to `0.6.0+` phases.

## Phase 4: Resource Ownership And CRUD Foundation

Target: `0.6.0`.

Release rule:

- [x] Select `0.6.0` only when all required Phase 4 items, earlier phase items, and exit criteria
  are checked. If any Phase 4 item remains unchecked, release a `0.5.x` patch instead.

Already done:

- [x] `resources.create` exists.
- [x] Resource read/list/show, source/runtime/network/health configuration, resource variable
  overrides/effective config, archive/delete, runtime logs, proxy preview, diagnostics, and Web
  resource detail observation exist.
- [x] Environment create/list/show/set/unset/diff/promote exists.
- [x] Environment effective-precedence query exists.
- [x] Environment archive exists.
- [x] Project create/list/show/rename/archive exists.
- [x] Project detail/settings reads `projects.show`, exposes rename/archive through the named
  commands, shows resource/environment/deployment/access rollups, and explains that project-level
  lifecycle changes do not create deployments, mutate historical deployment snapshots, or
  immediately affect runtime state.
- [x] Server register/list/show/rename/deactivate/delete safety/guarded delete/connectivity,
  proxy-repair, and credential baseline exist.

Required:

- [x] Add project show/rename/archive with Web detail/settings closure and side-effect clarity.
- [x] Add server show with proxy status and initial deployment/resource/domain rollups.
- [x] Add server rename.
- [x] Add server configure-edge-proxy.
- [x] Add broad credential usage visibility.
- [x] Add credential show/delete when unused.
- [x] Add `credentials.rotate-ssh` reusable SSH credential rotation across CLI, HTTP/oRPC, Web,
  public docs/help, and tests.
- [x] Add resource show/archive/delete.
- [x] Add separate resource source update semantics where specs require a separate command.
- [x] Add separate resource runtime update semantics where specs require a separate command.
- [x] Add separate resource network update semantics where specs require a separate command.
- [x] Add reusable access-profile update semantics where specs require a separate command.
- [x] Add environment archive.
- [x] Add environment lock/unlock lifecycle.
- [x] Add environment clone.
- [x] Add remaining named edit semantics.
- [x] Add environment effective-precedence query.
- [x] Complete resource detail editing affordances for source/runtime/network/access/health/
  configuration profile changes.
- [x] Ensure CLI, HTTP/oRPC, Web, and future MCP naming reuse the same command/query schemas.

Phase 4 resource profile editing verification notes from 2026-04-27:

- Resource detail source/runtime/network profile forms dispatch `resources.configure-source`,
  `resources.configure-runtime`, and `resources.configure-network` through the typed oRPC client,
  then invalidate the resource detail/list read paths instead of storing Web-only configuration.
- Resource detail access, health, and configuration forms dispatch `resources.configure-access`,
  `resources.configure-health`, `resources.set-variable`, and `resources.unset-variable` through
  the typed oRPC client, then invalidate the resource detail/health/effective-config/list read paths
  owned by those operations.
- Resource detail now states that source/runtime/network/access/health/configuration saves are
  durable resource-level profile or override edits for future deployments, verification, route
  planning, or deployment snapshot materialization only. They do not create deployments, mutate
  historical deployment snapshots, immediately restart running runtime state, bind domains, issue
  certificates, or apply proxy routes. Covered by `RES-PROFILE-ENTRY-012`,
  `RES-PROFILE-ENTRY-013`, and `RES-PROFILE-ENTRY-014`.
- CLI, HTTP/oRPC, Web help, and future MCP/tool naming all point at the existing operation keys,
  command/query schemas, and docs-registry topics for source/runtime/network/access/health/
  configuration profile editing. No generic `resources.update` surface is introduced.
- Resource profile drift visibility remains a later resource/internal-state ledger item; it is not
  part of this Phase 4 resource detail/profile editing closure.

Exit criteria:

- [x] A user can create, read, update, and archive/delete project, environment, server, credential,
  and resource configuration without creating a deployment as a side effect.
- [x] `resources.create` is no longer the only durable resource profile write.
- [x] Web resource configuration is a projection of resource-owned commands and queries, not a
  Svelte-only configuration store.
- [x] Resource detail/profile editing closure covers source, runtime, network, access, health, and
  resource-owned configuration without creating deployments, mutating historical deployment
  snapshots, immediately affecting runtime/workload state, binding domains, issuing certificates, or
  applying proxy routes.

## Phase 5: First-Deploy Engine And Framework Breadth

Target: `0.7.0`.

Release rule:

- [ ] Select `0.7.0` only when all required Phase 5 items, earlier phase items, and exit criteria
  are checked. If any Phase 5 item remains unchecked, release a `0.6.x` patch instead.

Already done:

- [x] Static strategy, Vite static, Angular static, Astro static, Nuxt generate static, Next.js
  static export, SvelteKit adapter-static/static, and generic static server packaging have
  implementation coverage.
- [x] Next.js baseline planner builds and starts with package manager defaults.
- [x] Remix, FastAPI, Django, Flask, generic Node, generic Python, generic Java, and custom command
  fallback planner coverage exists.
- [x] Dockerfile, Compose, and prebuilt image paths exist.
- [x] Local-shell and generic-SSH single-server backend registry coverage exists.
- [x] Repository config parser/entry-seed coverage exists for the current headless/CLI flow.

Required:

- [ ] Finish CLI migration to the shared Quick Deploy workflow program.
- [ ] Make deployment admission use the runtime target backend registry before acceptance.
- [ ] Add unsupported-target rejection before acceptance.
- [ ] Broaden local/generic-SSH Docker/Compose smoke coverage.
- [ ] Harden generated Dockerfile, Compose, prebuilt image, static artifact, and workspace-command
  planning as Docker/OCI artifact paths.
- [ ] Make Next.js first-class across SSR, standalone, and static-export modes.
- [ ] Add useful Next.js app/pages router and output detection where it affects planning.
- [ ] Promote JavaScript/TypeScript support to a tested catalog: Next.js, Remix, Nuxt, SvelteKit,
  Astro, Vite, React, Vue, Svelte, Solid, Angular, Express, Fastify, NestJS, Hono, Koa, and generic
  package scripts.
- [ ] Harden Python support for FastAPI, Django, Flask, generic ASGI/WSGI apps, `uv`, Poetry, pip,
  and explicit start-command fallback.
- [ ] Add Spring Boot as the first named JVM web framework.
- [ ] Add framework-family matrix rows for detection, base image policy, install/build/start/package
  commands, artifact outputs, internal port behavior, unsupported evidence, and Web/CLI draft
  parity.
- [ ] Keep buildpack-style detection as an adapter-owned accelerator, not the only way Appaloft
  supports common frameworks.

Exit criteria:

- [ ] The zero-to-SSH loop works for at least: Next.js, Vite static SPA, Astro static, Nuxt
  generate, SvelteKit static, Remix, FastAPI, Django, Flask, generic Node, generic Python, generic
  Java, Dockerfile, Docker Compose, prebuilt image, and explicit custom commands.
- [ ] Unsupported frameworks fail with structured `validation_error` in `runtime-plan-resolution`
  unless explicit custom commands make a Docker/OCI image plan possible.
- [ ] Web and CLI can collect the same draft fields for source base directory, publish directory,
  Dockerfile path, Compose path, build target, install/build/start commands, and internal port.

## Phase 6: Access Policy, Domain/TLS Lifecycle, And Observability Hardening

Target: `0.8.0`.

Release rule:

- [ ] Select `0.8.0` only when all required Phase 6 items, earlier phase items, and exit criteria
  are checked. If any Phase 6 item remains unchecked, release a `0.7.x` patch instead.

Already done:

- [x] Generated access is visible through `ResourceAccessSummary`.
- [x] Planned and latest generated routes are projected.
- [x] Latest durable domain routes and latest server-applied routes are exposed separately.
- [x] Web resource detail reads health, access, proxy configuration, diagnostics, runtime logs, and
  resource-scoped domain binding actions.
- [x] Quick Deploy displays latest or planned generated routes after resource refresh.
- [x] `resources.proxy-configuration.preview` is active.
- [x] Resource health, runtime logs, deployment logs, create-time deployment progress, and diagnostic
  summary exist as active observation surfaces.

Required:

- [x] Activate `default-access-domain-policies.configure`.
- [x] Add default access policy list/show/update/disable behavior.
- [x] Add operation catalog coverage for default access policy operations.
- [x] Harden `ResourceAccessSummary` route precedence so durable domain bindings and server-applied
  config routes consistently win where specs require it.
- [ ] Add dedicated route intent/status read or repair surfaces only where existing access, proxy,
  health, and diagnostic surfaces are insufficient.
- [ ] Add domain binding show/update/delete/retry lifecycle commands where specs allow mutation
  after creation.
- [ ] Add certificate show/import/revoke/delete/retry semantics around provider-issued and imported
  certificates.
- [ ] Broaden API/Web/CLI regression coverage for generated access display.
- [ ] Broaden API/Web/CLI regression coverage for provider-rendered proxy configuration preview.
- [ ] Broaden API/Web/CLI regression coverage for server-applied domains and durable domain routes.
- [ ] Broaden API/Web/CLI regression coverage for diagnostic copy.
- [ ] Close `resource-access-failure` diagnostics: real Traefik error-middleware e2e, request-id
  envelope lookup, health/diagnostic-summary composition, and companion/static renderer support for
  one-shot CLI or remote SSH runtimes without a reachable Appaloft backend service.
- [ ] Keep access/proxy/log/health failures visible through read models, proxy preview, and
  diagnostics.

Exit criteria:

- [ ] A deployed HTTP app keeps exposing generated or configured access through
  `ResourceAccessSummary`.
- [ ] Operators can configure or disable the default generated-access policy through explicit
  operations.
- [ ] A custom domain can be created, verified, issued/renewed or imported for TLS, observed,
  retried, and removed through explicit operations.
- [ ] Access/proxy/log/health failures remain visible through Appaloft operations, not screenshots
  or raw server commands.

## Phase 7: Day-Two Production Controls

Target: `0.9.0` beta.

Release rule:

- [ ] Select `0.9.0` only when all required Phase 7 items, earlier phase items, and exit criteria
  are checked. If any Phase 7 item remains unchecked, release a `0.8.x` patch instead.

Already done:

- [x] Environment set/unset variable baseline exists.
- [x] Core contains dependency resource and binding concepts.
- [x] Deployment list/logs and resource health/log/diagnostic read surfaces exist.

Required:

- [ ] Add resource-scoped environment variable operations.
- [ ] Add secret operations with build/runtime exposure rules, masking, `.env` import/paste, and
  effective config queries.
- [ ] Add storage/volume create/list/show/update/delete.
- [ ] Add storage attach/detach, bind mount versus named volume, destination path validation, and
  backup relationship metadata.
- [ ] Add Postgres provisioning/import/list/show/update/delete.
- [ ] Add Redis provisioning/import/list/show/update/delete.
- [ ] Add dependency bind/unbind and binding secret rotation.
- [ ] Add backup/restore for the minimum useful dependency-resource loop.
- [x] Rebuild deployment show as a first-class query.
- [x] Rebuild deployment stream-events as a first-class query.
- [ ] Rebuild deployment retry/redeploy under ADR-016.
- [ ] Rebuild rollback under ADR-016 with retained artifacts, rollback candidates, lifecycle
  transitions, events, errors, Web/API/CLI affordances, and tests.
- [ ] Add resource restart/stop/start only after runtime ownership and state semantics are
  specified.
- [ ] Add source binding and auto-deploy.
- [ ] Add push webhook and generic signed deploy webhook.
- [ ] Add deploy-action wrapper behavior, including PR preview deploy/update from a user-authored
  GitHub Actions workflow.
- [ ] Add existing-resource profile-drift handling.
- [ ] Add product-grade preview deployments after source binding and webhook ingestion are durable,
  including GitHub App/webhook triggers, scoped preview env, list/show/policy/delete, and cleanup
  retries.
- [ ] Add scheduled task/cron resource shape with run history and logs after workload service
  semantics are specified.
- [ ] Complete the Docker Swarm Spec Round and Code Round as the first cluster runtime target:
  target registration/readiness, placement, registry/secret handling, rollout/health/log/cleanup
  semantics, normalized read surfaces, and contract tests.

Exit criteria:

- [ ] A user can manage config, secrets, storage, dependencies, auto-deploy, deployment history, and
  rollback candidates without editing files on the server.
- [ ] Postgres has a closed provision -> bind -> deploy -> observe -> backup/restore or delete loop.
- [ ] Redis has a closed provision -> bind -> deploy -> observe -> backup/restore or delete loop.
- [ ] Operators can deploy through both the single-server Docker/Compose path and the Docker Swarm
  cluster path without changing the public deployment admission surface.
- [ ] Rollback/redeploy are no longer rebuild-required if they are exposed.

## Phase 8: Operator/Internal State Closure And Interface Parity

Target: `1.0.0-rc`.

Release rule:

- [ ] Select `1.0.0-rc` only when all required Phase 8 items, earlier phase items, and exit criteria
  are checked. If any Phase 8 item remains unchecked, release a `0.9.x` patch or an explicitly
  requested prerelease instead.

Already done:

- [x] System provider/plugin/doctor/db status/db migrate baseline exists.
- [x] Terminal session open baseline exists.
- [x] Remote SSH state and migration/recovery concepts have partial implementation.

Required:

- [ ] Add durable outbox/inbox or equivalent process state for long-running workflows.
- [ ] Add retry, dedupe, and failure visibility for long-running workflows.
- [ ] Add operator queries for deployment attempts.
- [ ] Add operator queries for proxy bootstrap attempts.
- [ ] Add operator queries for certificate attempts.
- [ ] Add operator queries for remote SSH state locks, migrations, backups, and recovery markers.
- [ ] Add operator queries for source links, route realization attempts, and worker/job status.
- [ ] Add runtime target capacity diagnostics for disk, inode, memory, CPU, Docker image usage,
  build-cache usage, source workspace usage, and safe reclaimable estimates.
- [ ] Add lifecycle commands for retry, cancel, mark-recovered, dead-letter, and prune where state
  can block deployments or create support load.
- [ ] Add runtime artifact/workspace prune with dry-run, active-runtime preservation, rollback
  candidate retention, preview-owned artifact cleanup, no-volume-by-default safety, and audit and
  diagnostic output.
- [ ] Add audit/event read surfaces with retention policy and redaction rules.
- [ ] Add terminal session list/show/attach/close/expire if terminal sessions remain public.
- [ ] Ensure provider/plugin/system operations expose capability details and configuration
  diagnostics without leaking provider SDK types or secrets.
- [ ] Verify CLI, HTTP/oRPC, Web, and generated MCP/tool contracts against `operation-catalog.ts`.
- [ ] Harden install/upgrade/release: migrations, backup/recovery, all-in-one packaging, binary
  release, static console asset serving, and smoke tests.

Exit criteria:

- [ ] Operators can see and repair stuck work through Appaloft operations.
- [ ] Historical attempts, logs, events, remote state backups, runtime artifacts, source
  workspaces, and build cache have documented retention/prune behavior.
- [ ] The release candidate passes local, PGlite, PostgreSQL, Docker, and opt-in SSH smoke suites.

## 1.0.0 GA

Release rule:

- [ ] Select `1.0.0` only when the full `1.0.0 Definition Of Done`, every phase exit criterion, and
  every release gate item are checked.

Required:

- [ ] Freeze the `1.0.0` active operation catalog.
- [ ] Close or explicitly defer every temporary implementation gap.
- [ ] Verify every active operation has command/query docs.
- [ ] Verify every active operation has workflow/error docs where needed.
- [ ] Verify every active operation has test matrix rows.
- [ ] Verify every active operation has executable tests or an explicit accepted gap.
- [ ] Verify every active operation has Web/API/CLI surface decisions.
- [ ] Verify every active operation has operation catalog entries.
- [ ] Publish release notes describing supported deployment strategies, framework tiers, resource
  lifecycles, known unsupported behavior, and migration constraints.

Exit criteria:

- [ ] No active `1.0.0` feature relies on an undocumented migration gap.
- [ ] New users can complete the v1 minimum loop from install to reachable deployed app and day-two
  recovery without private workarounds.

## Resource And Internal State Coverage Ledger

This ledger is the horizontal closure checklist. Each resource or internal state needs the unchecked
work below before GA.

- [x] Project: `projects.create`, `projects.list`.
- [x] Project: show, rename, archive safety, Web detail/settings closure, and
  resource/environment/deployment/access rollups.
- [ ] Project post-Phase 4: description editing through a future `projects.set-description`
  command, and delete/restore safety through future explicit specs if accepted.
- [x] Environment: create/list/show, set/unset variable, diff, promote.
- [x] Environment: effective precedence query.
- [x] Environment: archive.
- [x] Environment: clone.
- [ ] Environment: lock, remaining named edit semantics, history.
- [x] Deployment target/server: register, list, show, configure credential, deactivate, delete
  safety, guarded soft delete, connectivity, proxy repair, terminal open.
- [x] Deployment target/server: rename.
- [x] Deployment target/server: configure-edge-proxy.
- [x] Deployment target/server: broad credential usage visibility.
- [x] SSH credential: create/list, attach to server.
- [x] SSH credential: show, delete when unused, usage visibility.
- [x] SSH credential: `credentials.rotate-ssh` in-place rotation with usage acknowledgement.
- [x] Resource: create/list/show, configure source/runtime/network/health, set/unset variables,
  effective config, health, logs, proxy preview, diagnostics, archive/delete, and Web detail
  observation.
- [x] Resource: reusable access-profile mutation semantics where specs require separate commands.
- [ ] Resource: profile drift visibility.
- [x] Source link: relink through CLI.
- [ ] Source link: list/show/delete or archive, PostgreSQL/control-plane persistence before API/Web.
- [x] Deployment attempt: create/list/show/logs.
- [x] Deployment attempt: stream events.
- [ ] Deployment attempt: retry/redeploy, cancel, rollback candidate/readiness, archive/prune.
- [x] Runtime artifact/instance: internal snapshot and resource/deployment diagnostic context.
- [ ] Runtime artifact/instance: capacity diagnostics, cleanup/prune, preview artifact cleanup, and
  rollback-candidate retention.
- [x] Default access policy: static/shell configuration selects provider; generated routes are
  visible through `ResourceAccessSummary`.
- [x] Default access policy: configure, show, update/disable, preserve resource access projection.
- [x] Generated/server-applied route state: planned/latest generated routes, latest server-applied
  routes, latest durable routes, proxy status, and proxy preview are visible through read models.
- [x] Generated/server-applied route state: precedence hardening.
- [ ] Generated/server-applied route state: route intent update/delete/reconcile where needed,
  admin repair/prune diagnostics.
- [x] Domain binding: create, confirm ownership, list, ready routes projected into resource access
  summary.
- [ ] Domain binding: show, update route behavior where allowed, retry verification, delete/archive.
- [x] Certificate: issue/renew, list.
- [ ] Certificate: show, import, retry, revoke/delete, renewal attempt visibility.
- [x] Resource health policy: configure, health query.
- [ ] Resource health policy: update/delete/reset policy, effective health observation, history.
- [x] Runtime logs: resource logs/stream and deployment logs.
- [ ] Runtime logs: bounded logs, unavailable-state diagnostics, retention/prune.
- [x] Environment/resource secrets: environment set/unset variable baseline.
- [ ] Environment/resource secrets: secret reference create/list/show/update/delete, masking,
  build/runtime scope.
- [ ] Storage volume: create/list/show/update/delete, attach/detach, backup relationship.
- [ ] Dependency resource instance: provision/import/list/show/update/delete for Postgres and Redis.
- [ ] Resource binding: bind/unbind/list/show/rotate, immutable deployment snapshot.
- [ ] Webhook/auto-deploy: create/list/show/update/delete, delivery attempts, replay, secret
  rotation.
- [ ] Action PR preview: deploy/update from a user-authored GitHub Actions workflow with generated
  or user-owned wildcard preview access.
- [ ] Product-grade preview deployment: create from PR event, list/show/update policy/delete on
  close, scoped env, GitHub App status/comments, and cleanup retries.
- [ ] Scheduled task: create/list/show/update/delete, run now, run history/logs.
- [x] Terminal session: open.
- [ ] Terminal session: list/show/attach/close/expire, audit and redaction.
- [ ] Outbox/inbox/job/process state: list/show/retry/cancel/dead-letter/prune, attempt ownership.
- [x] Remote SSH PGlite state: partial config workflow.
- [ ] Remote SSH PGlite state: show locks/migrations/backups/recovery, retry/repair/prune.
- [x] Audit/event history: event specs and partial runtime events.
- [ ] Audit/event history: list/show/filter/export, retention and redaction.
- [x] Providers/plugins/system: list providers/plugins, doctor, db status/migrate.
- [ ] Providers/plugins/system: show capabilities/config diagnostics, safe enable/disable only when
  specs exist.

## Framework And Runtime Support Checklist

A framework family is first-class only when detection, planner output, Docker/OCI execution, error
mapping, matrix rows, and Web/CLI draft parity are all checked.

- [x] Container-native: Dockerfile, Compose, and prebuilt image paths exist.
- [ ] Container-native: harden path/build-target/profile updates, Compose target service selection,
  and image digest visibility.
- [x] Static sites: static strategy, Vite static, Angular static, Astro static, Nuxt generate,
  Next static export, SvelteKit adapter-static/static, and generic static server packaging exist.
- [ ] Static sites: add common static generators and generic static generator fallback with explicit
  publish directory.
- [x] Next.js: baseline `nextjs` planner builds and starts with package manager defaults.
- [ ] Next.js: complete first-class SSR/standalone/static-export support with app/pages/output
  detection, package manager parity, internal port defaults, and Docker/SSH smoke.
- [x] Angular SPA: detects `angular.json` output path and routes static output through the
  `angular-static` planner.
- [x] React/Vue/Svelte/Solid/Angular SPA baseline: Vite static and generic Node/static coverage
  exist.
- [ ] React/Vue/Svelte/Solid SPA: detect framework-specific outputs and route static output through
  static-server artifacts where Vite evidence is not sufficient.
- [x] Nuxt/SvelteKit/Astro/Remix: Nuxt generate static, SvelteKit adapter-static/static, Astro
  static, and Remix server planner exist.
- [ ] Nuxt/SvelteKit/Astro/Remix: add SSR/server modes where Docker/OCI start command is
  deterministic.
- [x] Node API frameworks: generic Node and framework metadata baseline exist.
- [ ] Node API frameworks: add explicit Express, Fastify, NestJS, Hono, and Koa detection/start
  defaults with internal port behavior.
- [x] Python: FastAPI, Django, Flask, generic Python, `uv`, Poetry, and pip baseline exist.
- [ ] Python: harden ASGI/WSGI app discovery, module/app target selection, collectstatic/static
  handling, and Docker/SSH smoke.
- [x] Java/JVM: generic Maven/Gradle planner exists.
- [ ] Java/JVM: add Spring Boot first, then Quarkus/Micronaut if demand justifies it.
- [ ] Ruby: add Rails and generic Rack/Sinatra planners or explicit fallback errors.
- [ ] PHP: add Composer app planner with PHP-FPM or app-server policy.
- [ ] Go: add generic Go build plus common HTTP framework detection as metadata/defaults.
- [ ] .NET: add ASP.NET Core planner with `dotnet publish` artifact rules.
- [ ] Rust: add generic Cargo build plus common HTTP framework metadata/defaults.
- [ ] Elixir: add Phoenix release planner with `mix` and runtime image policy.
- [ ] Buildpack-style auto-detection: add only after explicit planners remain deterministic; expose
  generated plan, logs, overrides, and unsupported-field errors.

## External Baseline Gap Checklist

External baseline research points to this practical minimum:

- [x] Docker substrate with Dockerfile, Compose, and prebuilt image paths.
- [ ] Buildpack/auto-detect option with explicit plan output.
- [x] Static site packaging and first-class publish-directory semantics.
- [x] Generated domains and custom domains as separate concepts.
- [ ] Full HTTPS/ACME, force HTTPS, and redirect lifecycle closure.
- [ ] Environment variables, build-time arguments, build secrets, and secret masking.
- [ ] Persistent storage and databases with service binding, backup/restore, and deletion behavior.
- [ ] Git source binding, webhooks, auto-deploy, Action PR previews, and product-grade preview
  deployments.
- [ ] Deployment history, standalone event stream, health checks, rollbacks, and resource limits.
- [ ] Framework auto-detection broad enough for modern frontend frameworks and common backend
  frameworks.

## Immediate Spec-Round Todo

Recommended next Spec Rounds before broad Code Rounds:

- [ ] Resource profile lifecycle: remaining profile drift visibility, reset/delete policy
  semantics, and test matrix coverage after source/runtime/network/access profile configuration.
- [x] SSH credential lifecycle: `credentials.show` masked detail and usage visibility plus
  `credentials.delete-ssh` delete-when-unused safety across CLI, API, and Web typed confirmation.
- [x] Framework support tier matrix: fixed-version detector/planner fixtures cover the current
  Next.js, Vite, Angular, SvelteKit, Nuxt, Astro, Remix, Express, FastAPI, Django, and Flask slice.
- [ ] Framework support tier matrix: promote Web/CLI draft-field parity and real deploy smoke rows
  for the JavaScript/TypeScript/Python catalog.
- [ ] Deployment observation and recovery: harden `deployments.stream-events` reconnect/gap/CLI
  coverage, then rebuild retry/redeploy, rollback candidate/readiness, and ADR-016 recovery
  decisions.
- [ ] Access/domain/TLS closure: domain binding show/update/delete/retry and certificate
  import/revoke/retry.
- [ ] Dependency resource lifecycle: Postgres/Redis provision/import, bind/unbind, secret rotation,
  backup/restore, and delete.
- [ ] Operator state closure: outbox/inbox/jobs, remote SSH state diagnostics, runtime target
  capacity diagnostics, audit/event retention, and prune/recovery commands.
