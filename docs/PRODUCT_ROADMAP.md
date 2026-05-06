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
  line `0.6.x` because the current release is `0.6.0`.

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
- [x] On 2026-05-04, the latest public release is `v0.7.0`; root package
  and Release Please manifest on `main` are `0.7.0`; the release PR target is
  `0.8.0`.
- [x] On 2026-05-04, the roadmap gate allows `Release-As: 0.8.0` because
  Phase 0 through Phase 6 release rules, required items, and exit criteria are checked.
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
- [x] Future MCP/tool contracts can be generated from the same operation catalog without inventing
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
- [x] Runtime planner coverage exists for Next.js SSR, standalone output, and static export, Remix,
  Vite static, Angular static, Astro static, Nuxt generate static, SvelteKit adapter-static/static,
  FastAPI, Django, Flask, generic Node, generic Python, generic Java, and custom command fallback.
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
- [ ] Remaining non-resource lifecycle gaps are still major horizontal work. Resource profile drift
  visibility is active; configuration drift redaction remains a focused follow-up.
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
- [x] Docker Swarm support is specified and implemented as the first cluster runtime target backend.
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
- [x] Initial framework planner coverage exists for Next.js SSR, standalone output, and static export,
  Remix, Vite static, Angular static, Astro static, Nuxt generate static, SvelteKit
  adapter-static/static, FastAPI, Django, Flask, generic Node, generic Python, generic Java, and
  custom command fallback.

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
- Resource profile drift visibility was deferred from this Phase 4 resource detail/profile editing
  closure and is now tracked by the Phase 7 profile-drift entries below.

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

- [x] Select `0.7.0` only when all required Phase 5 items, earlier phase items, and exit criteria
  are checked. If any Phase 5 item remains unchecked, release a `0.6.x` patch instead.

Already done:

- [x] Static strategy, Vite static, Angular static, Astro static, Nuxt generate static, Next.js
  static export, SvelteKit adapter-static/static, and generic static server packaging have
  implementation coverage.
- [x] Next.js planner builds and starts with package manager defaults, standalone output, and static
  export metadata.
- [x] Remix, FastAPI, Django, Flask, generic Node, generic Python, generic Java, and custom command
  fallback planner coverage exists.
- [x] Dockerfile, Compose, and prebuilt image paths exist.
- [x] Local-shell and generic-SSH single-server backend registry coverage exists.
- [x] Repository config parser/entry-seed coverage exists for the current headless/CLI flow.
- [x] Web, CLI, and repository config now share the same Quick Deploy resource draft vocabulary for
  source/runtime/network/health profile fields, with acceptance coverage proving those fields enter
  `resources.create` or resource runtime configuration before ids-only deployment admission.
- [x] `deployments.plan` is active as a read-only deployment plan preview query across application,
  operation catalog, HTTP/oRPC, CLI, Web, and public docs/help.
- [x] Fixture-by-fixture headless deploy smoke now proves the current supported
  JavaScript/TypeScript/Python fixture catalog resource profiles resolve to Docker/OCI image plans,
  generated Dockerfiles, docker-container execution metadata, internal HTTP verification steps, and
  typed Docker build/run commands without adding framework-specific deployment input.
- [x] Representative opt-in real local Docker fixture smoke proves at least one static/frontend
  pair, one Node/server pair, and one Python/server pair can build, run, verify, and expose runtime
  metadata from the same resource profile vocabulary before ids-only deployment admission.

Required:

- [x] Finish CLI migration to the shared Quick Deploy workflow program.
- [x] Make deployment admission use the runtime target backend registry before acceptance.
- [x] Add unsupported-target rejection before acceptance.
- [x] Broaden local/generic-SSH Docker/Compose smoke coverage.
- [x] Harden generated Dockerfile, Compose, prebuilt image, static artifact, and workspace-command
  planning as Docker/OCI artifact paths.
- [x] Make Next.js first-class across SSR, standalone, and static-export modes.
- [x] Add useful Next.js app/pages router and output detection where it affects planning.
- [x] Implement `deployments.plan` across application, operation catalog, HTTP/oRPC, CLI, Web,
  public docs/help, and targeted tests so users can inspect detected evidence, planner selection,
  artifact kind, command specs, port/health/access plan, warnings, and unsupported reasons before
  execution.
- [x] Promote JavaScript/TypeScript support to a tested catalog: Next.js, Remix, Nuxt, SvelteKit,
  Astro, Vite, React, Vue, Svelte, Solid, Angular, Express, Fastify, NestJS, Hono, Koa, and generic
  package scripts.
- [x] Harden Python support for FastAPI, Django, Flask, generic ASGI/WSGI apps, `uv`, Poetry, pip,
  and explicit start-command fallback.
- [x] Add Spring Boot as the first named JVM web framework.
- [x] Add framework-family matrix rows for detection, base image policy, install/build/start/package
  commands, artifact outputs, internal port behavior, unsupported evidence, and Web/CLI draft
  parity.
- [x] Keep buildpack-style detection as an adapter-owned accelerator, not the only way Appaloft
  supports common frameworks. Spec Round artifact:
  [docs/specs/017-buildpack-accelerator-contract-and-preview-guardrails](./specs/017-buildpack-accelerator-contract-and-preview-guardrails/spec.md).
- [x] Add a shared runtime plan resolution unsupported/override contract so unsupported,
  ambiguous, and missing planner evidence returns a blocked preview with phase, reason code,
  evidence, fix path, override path, and affected profile field before execution. Spec Round
  artifact:
  [docs/specs/018-runtime-plan-resolution-unsupported-override-contract](./specs/018-runtime-plan-resolution-unsupported-override-contract/spec.md).

Exit criteria:

- [x] The zero-to-SSH loop works for at least: Next.js, Vite static SPA, Astro static, Nuxt
  generate, SvelteKit static, Remix, FastAPI, Django, Flask, generic Node, generic Python, generic
  Java, Dockerfile, Docker Compose, prebuilt image, and explicit custom commands.
- [x] Opt-in real Docker framework fixture smoke covers a representative local slice:
  Vite or Next static export plus Angular, React, or SvelteKit static, Next SSR or Remix plus a
  Node HTTP framework, and FastAPI plus Django or Flask when dependency installation is available.
- [x] Unsupported frameworks fail with structured `validation_error` in `runtime-plan-resolution`
  unless explicit custom commands make a Docker/OCI image plan possible.
- [x] Web and CLI can collect the same draft fields for source base directory, publish directory,
  Dockerfile path, Compose path, build target, install/build/start commands, and internal port.
- [x] JavaScript/TypeScript tested catalog closure binds Next.js SSR/standalone/static export,
  Remix, Nuxt generate, SvelteKit static/ambiguous mode, Astro static, Vite/React/Vue/Svelte/Solid/
  Angular static SPA, Express/Fastify/NestJS/Hono/Koa, and generic package scripts to stable
  matrix ids, headless Docker/OCI fixture readiness tests, and `deployments.plan/v1` contract
  coverage.
- [x] JVM/Spring Boot tested catalog closure binds Spring Boot Maven with wrapper, Spring Boot
  Maven without wrapper, Spring Boot Gradle with wrapper, Spring Boot Gradle Kotlin DSL, generic
  JVM explicit-command fallback, generic deterministic jar fallback, unsupported JVM frameworks,
  ambiguous build-tool evidence, missing build tool, missing runnable jar, actuator health
  defaults, and internal-port behavior to stable matrix ids, headless Docker/OCI fixture readiness
  tests, and `deployments.plan/v1` contract coverage.

Phase 5 release-gate verification notes from 2026-04-30:

- `0.7.0` is published as GitHub Release `v0.7.0`; the local package manifest, Release Please
  manifest, changelog, and latest fetched tag on `main` align on `0.7.0`.
- The supported catalog contract is closed by
  `docs/specs/019-zero-to-ssh-supported-catalog-acceptance-harness`, the
  `ZSSH-CATALOG-*`, `ZSSH-PREVIEW-*`, `ZSSH-CREATE-*`, and `ZSSH-RUNTIME-*` matrix rows, and the
  hermetic `zero-to-SSH supported catalog acceptance harness` test.
- `deployments.plan` remains the shared read-only preview contract for Web, CLI, HTTP/oRPC, and
  future MCP/tool surfaces. It does not persist deployment records, publish deployment events,
  execute runtime work, or add profile/framework/buildpack fields to ids-only
  `deployments.create`.
- Default release-gate confidence is hermetic: supported catalog acceptance, deployment plan
  preview schema, framework fixture readiness, shared draft parity, unsupported/ambiguous planner
  evidence, and public docs/help anchor checks. Real Docker and real SSH fixture smoke remain
  opt-in gates.
- Public docs/help coverage is anchored at `/docs/deploy/lifecycle/#deployment-plan-preview` and
  the resource profile docs. Users can see which catalog entries are supported, preview detected
  plan evidence before execution, and inspect blocked reasons, fixes, logs, health, access, and
  diagnostics when a first deploy fails.

## Phase 6: Access Policy, Domain/TLS Lifecycle, And Observability Hardening

Target: `0.8.0`.

Release rule:

- [x] Select `0.8.0` only when all required Phase 6 items, earlier phase items, and exit criteria
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
- [x] Verify no dedicated route intent/status read or repair surface is required for this slice
  because existing access, proxy, health, log, and diagnostic surfaces carry the shared descriptor;
  keep future route repair surfaces gated by a later Spec Round.
- [x] Close the shared route intent/status and access failure diagnostic contract across generated
  access, durable domain routes, server-applied routes, proxy preview, health, runtime logs,
  deployment logs, and diagnostic copy before adding domain/certificate mutation lifecycle
  surfaces.
- [x] Add domain binding show/configure-route/delete-check/delete/retry-verification lifecycle
  commands where specs allow mutation
  after creation.
- [x] Add certificate show/import/revoke/delete/retry semantics around provider-issued and imported
  certificates.
- [x] Broaden API/Web/CLI regression coverage for generated access display.
- [x] Broaden API/Web/CLI regression coverage for provider-rendered proxy configuration preview.
- [x] Broaden API/Web/CLI regression coverage for server-applied domains and durable domain routes.
- [x] Broaden API/Web/CLI regression coverage for diagnostic copy.
- [x] Close `resource-access-failure` diagnostics: real Traefik error-middleware e2e,
  automatic route/resource context lookup from applied provider metadata, and companion/static
  renderer support for one-shot CLI or remote SSH runtimes without a reachable Appaloft backend
  service.
- [x] Keep access/proxy/log/health failures visible through read models, proxy preview, and
  diagnostics.

Phase 6 verification notes from 2026-04-30:

- The first Phase 6 slice closed `docs/specs/020-route-intent-status-and-access-diagnostics`
  through a traceability table rather than introducing a new public route operation. The active
  surfaces remain `resources.show`, `resources.health`, `resources.proxy-configuration.preview`,
  `resources.runtime-logs`, `resources.diagnostic-summary`, and `deployments.logs`.
- This slice did not add deployment retry/redeploy/rollback, did not expand ids-only
  `deployments.create`, did not start domain binding update/delete/retry, and did not start
  certificate revoke/delete/retry lifecycle work.
- Default confidence remains hermetic. Real Traefik, DNS, TLS, Docker, and SSH route smoke stays
  opt-in until its own gate is selected.
- The domain binding lifecycle slice added show/readback, route-behavior configuration,
  delete-check, guarded delete, ownership verification retry, and matching Web console affordances
  under `docs/specs/021-domain-binding-lifecycle`. It intentionally uses
  `domain-bindings.configure-route` instead of forbidden generic `domain-bindings.update`, keeps
  certificate readiness read-only, and does not start certificate revoke/delete/retry or deployment
  retry/redeploy/rollback.

Phase 6 verification notes from 2026-05-01:

- The access failure diagnostic baseline slice strengthened the existing
  `resource-access-failure/v1` envelope with safe affected request metadata, related domain binding
  id support, stable `nextAction`, and optional latest edge-failure composition through
  `ResourceAccessSummary`, `resources.health`, and `resources.diagnostic-summary`. It deliberately
  did not add a new public operation, route repair command, real Traefik error-middleware e2e, or
  companion/static renderer.
- The certificate lifecycle closure slice added `certificates.show`, `certificates.retry`,
  `certificates.revoke`, and `certificates.delete` across source-of-truth specs, operation catalog,
  application handlers, persistence safe read models, oRPC/OpenAPI, CLI, Web resource affordances,
  i18n, and public TLS docs under `docs/specs/023-certificate-lifecycle-closure`.
- Imported certificate import was already implemented; this slice verified and preserved
  `certificate-imported` semantics, then added imported retry rejection and Appaloft-local imported
  revoke behavior. Provider-issued revoke goes through the certificate provider boundary; imported
  revoke does not call provider revocation.
- Domain binding delete remains separate from certificate revoke/delete. Active certificate state
  still blocks domain binding delete until explicit certificate lifecycle actions are taken.
- The request-id evidence lookup slice added `resources.access-failure-evidence.lookup`, a
  short-retention PG/PGlite evidence projection/read model, renderer capture of sanitized
  `resource-access-failure/v1` envelopes, CLI `appaloft resource access-failure <requestId>`, and
  HTTP/oRPC `GET /api/resource-access-failures/{requestId}`. This closes the lookup baseline while
  leaving real Traefik middleware e2e, automatic route/resource context lookup from applied
  provider metadata, companion/static renderer support, and a Web lookup form as remaining Phase 6
  work.
- The automatic route context lookup baseline adds internal hostname/path resolution from existing
  generated access, durable domain binding, server-applied route, and deployment read state, and
  lets evidence capture fill safe related ids when provider input lacks them. It does not add a new
  public operation or real Traefik middleware e2e; provider-native metadata lookup, companion/static
  renderer support, and the Web lookup form remain future Phase 6 work.

Phase 6 verification notes from 2026-05-03:

- The access/proxy/health/diagnostic regression harness baseline closes the API/oRPC, CLI JSON, and
  Web helper coverage gap for generated access display, provider-rendered proxy preview routes,
  durable domain routes, server-applied routes, route intent descriptors, latest safe access failure
  context, and diagnostic copy parity across the existing read surfaces.
- The slice added no public operation, no public schema field, no route repair/redeploy/rollback
  behavior, and no real Traefik error-middleware e2e. `resources.show`, `resources.health`,
  `resources.proxy-configuration.preview`, `resources.diagnostic-summary`, `domain-bindings.show`,
  and the Web shared access-route helper remain the reused contract surfaces.
- `resources.access-failure-evidence.lookup` and the automatic route context lookup baseline remain
  reusable by evidence capture and diagnostics without exposing provider raw payloads, SSH
  credentials, auth headers, cookies, sensitive query strings, or remote raw logs.

Phase 6 verification notes from 2026-05-03 applied route context metadata baseline:

- The applied route context metadata slice adds `applied-route-context/v1` as a provider-neutral,
  copy-safe route ownership contract for existing proxy preview and diagnostic/evidence flows.
- Provider-rendered proxy preview can expose safe resource, deployment, optional domain binding,
  server, destination, route id, diagnostic id, source, hostname, path prefix, proxy kind/provider,
  and applied/observed timestamp metadata for generated access, durable domain, server-applied, and
  deployment-snapshot routes.
- Evidence capture now prefers supplied applied route metadata before falling back to automatic
  hostname/path route context lookup.
- The slice adds no public operation, no route repair/redeploy/rollback behavior, no Web lookup
  form, no provider-native raw metadata parsing, and no real Traefik error-middleware e2e.

Phase 6 verification notes from 2026-05-04 failure visibility baseline:

- The failure visibility baseline keeps proxy/log/health-adjacent source errors visible through
  existing `resources.diagnostic-summary` and `resources.health` read models while normalizing
  unsafe adjacent text before it reaches copyable JSON.
- Diagnostic and health source errors preserve stable source, code, category, phase, retryability,
  and related resource context, and continue to reuse latest safe `resource-access-failure/v1` and
  `applied-route-context/v1` metadata instead of parsing provider raw payloads.
- The slice adds no public operation, no public schema field, no route repair/redeploy/rollback
  behavior, no Web lookup form, no provider-native raw metadata parsing, and no real Traefik
  middleware e2e. At that point, the broader `resource-access-failure` row still needed real edge,
  companion/static renderer, provider-native metadata lookup, and Web lookup form work.

Phase 6 verification notes from 2026-05-04 companion/static access failure renderer baseline:

- The companion/static renderer baseline adds shared application rendering helpers and packages a
  provider-neutral static renderer asset into adapter-owned static-site Docker builds so one-shot
  CLI/SSH static runtimes can render safe `resource-access-failure/v1` diagnostics without a
  reachable backend renderer service.
- The renderer preserves request id, code, category, phase, retryability, next action, safe
  affected request fields, and safe route context including `applied-route-context/v1` diagnostic
  ids when supplied.
- The slice adds no public operation, no public schema field, no Web lookup form, no route
  repair/redeploy/rollback behavior, no provider-native raw metadata parsing, and no real Traefik
  middleware e2e. At that point, the broader `resource-access-failure` row still needed real edge,
  provider-native metadata lookup, and Web lookup form work.

Phase 6 verification notes from 2026-05-04 applied route context lookup baseline:

- The applied route context lookup baseline makes `applied-route-context/v1` metadata resolvable
  through the shared provider-neutral lookup core by diagnostic id, route id, resource id,
  deployment id, host, or path where current safe read state allows.
- Evidence capture now routes supplied applied metadata through that lookup core before falling
  back to hostname/path matching, preserving generated-default, durable-domain, server-applied, and
  deployment-snapshot route source language plus safe provider/proxy/timestamp fields.
- The slice adds no public operation, no public schema field, no Web lookup form, no route
  repair/redeploy/rollback behavior, no provider-native raw metadata parsing, and no real Traefik
  middleware e2e. At that point, the broader `resource-access-failure` row still needed real edge,
  provider-native metadata lookup beyond safe Appaloft-applied metadata, and Web lookup form work.

Phase 6 verification notes from 2026-05-04 real Traefik access failure middleware e2e baseline:

- The real Traefik baseline wires served-route `errors` middleware to the existing
  `resource-access-failure/v1` renderer for 404, 502, 503, and 504 class failures, carrying only
  sanitized `applied-route-context/v1` query parameters for route/resource/deployment/domain/server
  and destination ownership.
- The HTTP renderer now accepts real-proxy forwarded host/path/request-id metadata, strips unsafe
  request details, captures evidence, and lets the existing request-id lookup return the enriched
  Appaloft route context. The opt-in Docker e2e proves the real edge path can hit the renderer and
  then be explained through the existing lookup surface.
- The slice adds no public operation, no public schema field, no Web lookup form, no route
  repair/redeploy/rollback behavior, and no provider-native raw metadata parsing. Provider-native
  metadata lookup beyond safe Appaloft-applied metadata and a Web lookup form remain future
  enhancements rather than prerequisites for closing the required `resource-access-failure`
  diagnostics row.

Phase 6 release-gate verification notes from 2026-05-04:

- Release readiness is a Sync Round over already-merged behavior; no ADR, operation catalog,
  command/query schema, public operation, or implementation change is required.
- Generated and configured access remains exposed through `ResourceAccessSummary`, with coverage in
  resource access summary/projector, resource show/list, proxy preview, route intent/status, and
  Web helper tests. Durable domain and server-applied routes remain separate route sources and keep
  generated access available as fallback/context where specs require it.
- Default generated-access policy configuration and disablement are active through
  `default-access-domain-policies.configure`, `.list`, and `.show` in the operation catalog, CLI,
  HTTP/oRPC, Web, Core Operations, Business Operation Map, and default access policy test coverage.
- Custom domain and TLS lifecycle closure is active through domain binding create/confirm/show/
  configure-route/delete-check/delete/retry-verification plus certificate issue-or-renew/import/
  show/retry/revoke/delete. The governing routing/domain/TLS workflow, lifecycle specs, public docs,
  operation catalog entries, CLI/API/Web surfaces, and test matrix rows are synchronized.
- The merged real Traefik access failure middleware baseline closed the last required
  `resource-access-failure` diagnostic row. Provider-native metadata lookup beyond safe
  Appaloft-applied metadata and a Web lookup form remain future enhancements, not `0.8.0` release
  blockers.

Exit criteria:

- [x] A deployed HTTP app keeps exposing generated or configured access through
  `ResourceAccessSummary`.
- [x] Operators can configure or disable the default generated-access policy through explicit
  operations.
- [x] A custom domain can be created, verified, issued/renewed or imported for TLS, observed,
  retried, and removed through explicit operations.
- [x] Access/proxy/log/health failures remain visible through Appaloft operations, not screenshots
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

Current verification notes:

- 2026-05-04 Phase 7 baseline slice implemented resource-scoped `.env` import,
  resource secret classification/masking, and `resources.effective-config` override summaries. This
  does not satisfy the full `0.9.0` release rule while storage, dependency resources, recovery,
  auto-deploy, preview, and cluster runtime items remain open.
- 2026-05-04 Phase 7 baseline slice implemented provider-neutral storage volume
  create/list/show/rename/delete plus Resource storage attach/detach contracts, destination path
  validation, attachment read models, delete safety, and backup relationship metadata placeholders.
  This still does not satisfy the full `0.9.0` release rule while Postgres/Redis provisioning,
  dependency binding, backup/restore, recovery, auto-deploy, preview, and cluster runtime items
  remain open.
- 2026-05-04 Phase 7 Postgres dependency resource lifecycle baseline implemented
  provider-neutral provision/import/list/show/rename/delete over `ResourceInstance`, with masked
  connection read models, future binding readiness, backup relationship metadata placeholders,
  delete-safety blockers, CLI/oRPC/HTTP dispatch, and PG/PGlite persistence. This still does not
  satisfy the full `0.9.0` release rule while Redis, dependency binding, secret rotation,
  backup/restore, provider-native database realization, recovery, auto-deploy, preview, and cluster
  runtime items remain open.
- 2026-05-04 Phase 7 dependency resource binding baseline implemented provider-neutral Postgres
  bind/unbind/list/show binding metadata through Resource-scoped CLI/oRPC/HTTP operations, masked
  safe summaries, real active-binding delete-safety blockers, and PG/PGlite persistence. This still
  does not satisfy the full `0.9.0` release rule while secret rotation, runtime injection,
  deployment snapshot materialization, provider-native database realization, Redis, backup/restore,
  recovery, auto-deploy, preview, and cluster runtime items remain open.
- 2026-05-05 Phase 7 dependency binding deployment snapshot reference baseline implemented
  provider-neutral safe Postgres binding references on new deployment attempt snapshots, plus safe
  readiness summaries on `deployments.plan` and immutable snapshot output on `deployments.show`.
  This does not materialize raw connection secrets or runtime environment values, and runtime env
  injection remains deferred. This still does not satisfy the full `0.9.0` release rule while
  secret rotation, runtime injection, provider-native database realization, Redis, backup/restore,
  recovery, auto-deploy, preview, and cluster runtime items remain open.
- 2026-05-05 Phase 7 dependency binding secret rotation Spec Round positioned
  `resources.rotate-dependency-binding-secret` as the next ResourceBinding lifecycle candidate,
  with stable matrix rows for safe rotation metadata, snapshot immutability, and entrypoint
  dispatch. It does not implement the command yet, so the full `0.9.0` release rule remains
  blocked by binding secret rotation Code Round, runtime injection, provider-native database
  realization, Redis, backup/restore, recovery, auto-deploy, preview, and cluster runtime items.
- 2026-05-05 Phase 7 dependency binding secret rotation Code Round implemented
  `resources.rotate-dependency-binding-secret` across core `ResourceBinding`, application command
  handling, PG/PGlite persistence, CLI/oRPC/HTTP dispatch, contract schemas, and safe read-model
  metadata. It rotates only binding-scoped safe secret references for future deployment snapshots;
  runtime injection, provider-native database realization, Redis, backup/restore, recovery,
  auto-deploy, preview, and cluster runtime items remain open for the full `0.9.0` release rule.
- 2026-05-05 Phase 7 Redis dependency resource lifecycle Spec Round positioned
  `dependency-resources.provision-redis` and `dependency-resources.import-redis` as accepted
  candidates, with matrix rows for safe Redis metadata, secret masking, list/show/rename/delete
  inclusion, and CLI/oRPC/HTTP dispatch. It does not implement the Redis Code Round yet, so the
  full `0.9.0` release rule remains blocked by Redis, provider-native database realization,
  backup/restore, recovery, auto-deploy, preview, and cluster runtime items.
- 2026-05-05 Phase 7 Redis dependency resource lifecycle Code Round implemented
  provider-neutral Redis provision/import plus list/show/rename/delete inclusion across core,
  application, PG/PGlite persistence, contracts, CLI, and oRPC/HTTP dispatch. It does not create
  provider-native Redis infrastructure or bind Redis to workloads yet, so the full `0.9.0` release
  rule remains blocked by provider-native database realization, backup/restore, recovery,
  auto-deploy, preview, and cluster runtime items.
- 2026-05-05 Phase 7 Postgres provider-native realization Spec Round positioned
  `dependency-resources.provision-postgres`, `resources.bind-dependency`, and
  `dependency-resources.delete` for managed Postgres realization, bind readiness, and provider
  cleanup semantics. It does not implement the Code Round yet, so the full `0.9.0` release rule
  remains blocked by provider-native database realization, backup/restore, recovery, auto-deploy,
  preview, and cluster runtime items.
- 2026-05-05 Phase 7 Postgres provider-native realization Code Round implemented durable
  realization state, hermetic managed Postgres provider capability, safe provider handles and
  masked endpoint read models, bind readiness admission for managed Postgres, and managed provider
  cleanup before delete tombstone. Backup/restore remains a separate required slice, so the full
  `0.9.0` release rule remains blocked by backup/restore, recovery, auto-deploy, preview, and
  cluster runtime items.
- 2026-05-05 Phase 7 dependency resource backup/restore Spec Round positioned
  `dependency-resources.create-backup`, `dependency-resources.restore-backup`,
  `dependency-resources.list-backups`, and `dependency-resources.show-backup` under ADR-036 with
  safe restore point metadata, in-place restore acknowledgements, provider capability boundaries,
  delete-safety retention blockers, and lifecycle event specs. It does not implement the Code
  Round yet, so the full `0.9.0` release rule remains blocked by backup/restore Code Round,
  recovery, auto-deploy, preview, and cluster runtime items.
- 2026-05-05 Phase 7 dependency resource backup/restore Code Round implemented
  `DependencyResourceBackup` state, hermetic backup/restore provider capability, safe backup
  list/show read models, CLI and oRPC/HTTP entrypoints, lifecycle events, restore acknowledgements,
  and delete-safety blockers for retained backups. Web affordances and provider-native Redis remain
  separate gaps, so the full `0.9.0` release rule remains blocked by recovery, auto-deploy, preview,
  and cluster runtime items.
- 2026-05-05 Phase 7 deployment retry/redeploy Spec Round created
  [Deployment Retry And Redeploy](./specs/040-deployment-retry-redeploy/spec.md) to activate
  `deployments.retry` and `deployments.redeploy` under ADR-016/ADR-034. It narrows the next Code
  Round to new deployment attempts from retained snapshot intent or current Resource profile,
  shared deployment orchestration, recovery trigger metadata, resource-runtime coordination,
  explicit CLI/oRPC/HTTP/Web surfaces, and rollback remaining inactive. It does not implement the
  commands yet, so the full `0.9.0` release rule remains blocked by retry/redeploy Code Round,
  rollback, auto-deploy, preview, and cluster runtime items.
- 2026-05-05 Phase 7 deployment retry/redeploy Code Round implemented active
  `deployments.retry` and `deployments.redeploy` commands across core trigger/source metadata,
  application handlers/use cases, resource-runtime coordination, PG/PGlite metadata persistence,
  CLI, HTTP/oRPC, public docs, and Web recovery actions gated by readiness output. Rollback remains
  inactive, so the full `0.9.0` release rule remains blocked by rollback, auto-deploy, preview, and
  cluster runtime items.
- 2026-05-05 Phase 7 deployment rollback Spec Round created
  [Deployment Rollback](./specs/041-deployment-rollback/spec.md) to activate
  `deployments.rollback` under ADR-016/ADR-034. It narrows the next Code Round to a new deployment
  attempt from a selected retained successful candidate, explicit rollback trigger/source/candidate
  metadata, runtime artifact identity checks, resource-runtime coordination, CLI/oRPC/HTTP/Web
  surfaces, and no stateful data rollback. It does not implement the command yet, so the full
  `0.9.0` release rule remains blocked by rollback Code Round, auto-deploy, preview, and cluster
  runtime items.
- 2026-05-05 Phase 7 deployment rollback Code Round implemented active `deployments.rollback`
  across core/application command handling, PG/PGlite metadata persistence, operation catalog,
  CLI, HTTP/oRPC, public docs, and Web recovery candidate actions gated by readiness output. The
  full `0.9.0` release rule remains blocked by auto-deploy, preview, and cluster runtime items.
- 2026-05-05 Phase 7 source binding and auto-deploy Spec Round created
  [Source Binding And Auto Deploy](./specs/042-source-binding-auto-deploy/spec.md). It positions
  `resources.configure-auto-deploy`, `source-events.ingest`, `source-events.list`, and
  `source-events.show` as accepted candidates over existing Resource source binding and
  `deployments.create` admission semantics. It does not implement code yet, so the full `0.9.0`
  release rule remains blocked by auto-deploy Code Round, preview, and cluster runtime items.
- 2026-05-05 Phase 7 source event auto-deploy decision closure added
  [ADR-037](./decisions/ADR-037-source-event-auto-deploy-ownership.md), selecting Resource-owned
  auto-deploy policy, project/resource-scoped source event read models, Resource-scoped generic
  webhook secret references, and a Phase 7 durable source-event record plus synchronous dispatch
  baseline before Phase 8 outbox/inbox work.
- 2026-05-05 Phase 7 source auto-deploy local specs added command/query/error contracts and public
  docs/help anchors for setup, signatures, dedupe, ignored events, and recovery. The work remains in
  Test-First/Code Round preparation until matrix rows have automation bindings and the operations
  are activated in `CORE_OPERATIONS.md` and the operation catalog.
- 2026-05-05 Phase 7 public documentation sync added stable storage volume and dependency resource
  pages, and closed docs-registry coverage for active storage, dependency, backup/restore,
  dependency-binding, retry, redeploy, and rollback operations.
- 2026-05-05 Phase 7 resource runtime controls Spec Round added
  [ADR-038](./decisions/ADR-038-resource-runtime-control-ownership.md) and
  [Resource Runtime Controls](./specs/043-resource-runtime-controls/spec.md), positioning
  `resources.runtime.stop`, `resources.runtime.start`, and `resources.runtime.restart` as accepted
  candidates. Code Round remains blocked until local command/error/readback specs, tests, public
  docs/help, `CORE_OPERATIONS.md`, and the operation catalog are aligned.
- 2026-05-05 Phase 7 resource runtime controls local specs added stop/start/restart command
  contracts, runtime-control error vocabulary, `resources.health.latestRuntimeControl` readback,
  and public docs/help anchors. Code Round remains blocked until Test-First automation, command
  schemas/handlers, adapter ports, entrypoints, `CORE_OPERATIONS.md`, and the operation catalog are
  aligned.
- 2026-05-05 Phase 7 resource runtime controls Test-First slice bound
  `RUNTIME-CTRL-READ-001` to `resources.health.latestRuntimeControl` contract coverage and
  `RUNTIME-CTRL-DOCS-001` to docs-registry anchor coverage. Runtime stop/start/restart command
  activation remains blocked by command/use-case, coordination, adapter, CLI/HTTP/Web, and catalog
  slices.
- 2026-05-05 Phase 7 resource runtime controls application Code Round slice added
  stop/start/restart command schemas, handlers, shared use case orchestration, `resource-runtime`
  coordination policies, provider-neutral runtime target and attempt recorder ports, and
  command/use-case tests for `RUNTIME-CTRL-STOP-001`, `RUNTIME-CTRL-START-001`,
  `RUNTIME-CTRL-RESTART-001`, `RUNTIME-CTRL-BLOCK-001`, and `RUNTIME-CTRL-COORD-001`. The
  operations remain inactive until durable attempt persistence, real runtime adapters,
  CLI/HTTP/Web entrypoints, `CORE_OPERATIONS.md`, and operation catalog activation are aligned.
- 2026-05-05 Phase 7 resource runtime controls persistence Code Round slice added PG/PGlite
  runtime-control attempt storage, recorder upsert behavior, and `PgResourceReadModel` projection
  into `ResourceSummary.latestRuntimeControl`, with `RUNTIME-CTRL-READ-001` PGlite coverage. The
  operations remain inactive until real runtime adapters, CLI/HTTP/Web entrypoints,
  `CORE_OPERATIONS.md`, and operation catalog activation are aligned.
- 2026-05-05 Phase 7 resource runtime controls adapter Code Round slice added provider-neutral
  Docker container and Docker Compose stop/start/restart command mapping with retained runtime
  metadata, target service scoping, sanitized blocked results, and injected executor boundaries.
  The operations remain inactive until local/generic-SSH executor wiring, CLI/HTTP/Web
  entrypoints, `CORE_OPERATIONS.md`, and operation catalog activation are aligned.
- 2026-05-05 Phase 7 resource runtime controls executor Code Round slice added bounded
  local-shell and generic-SSH command execution behind the runtime-control target, sanitized
  command failure details, and shell-internal DI registration for the target port, attempt
  recorder, use case, and handlers. The operations remain inactive until CLI/HTTP/Web
  entrypoints, `CORE_OPERATIONS.md`, and operation catalog activation are aligned.
- 2026-05-05 Phase 7 resource runtime controls activation Code Round slice activated
  `resources.runtime.stop`, `resources.runtime.start`, and `resources.runtime.restart` in
  `CORE_OPERATIONS.md`, the operation catalog, HTTP/oRPC, CLI, and Web Resource detail controls
  with public docs links and `RUNTIME-CTRL-SURFACE-001` HTTP coverage. Future MCP/tool descriptors
  remain deferred until the tool surface exists.
- 2026-05-05 Phase 7 source auto-deploy policy Code Round slice added Resource-owned
  auto-deploy policy state, source binding fingerprint binding, missing-source admission blockers,
  and source-binding-change blocking semantics with `SRC-AUTO-POLICY-001` through
  `SRC-AUTO-POLICY-003` core coverage. The operations remain inactive until application commands,
  durable source event ingestion/dedupe/read models, and CLI/HTTP/Web surfaces are aligned.
- 2026-05-05 Phase 7 source auto-deploy policy application/persistence slice added inactive
  `resources.configure-auto-deploy` command schema, handler, use case, and Resource repository
  persistence for policy JSON with application and PGlite coverage. The operation remains inactive
  until source event ingestion/dedupe/read models and CLI/HTTP/Web surfaces are aligned.
- 2026-05-05 Phase 7 source event application/persistence slice added inactive
  `source-events.ingest`, `source-events.list`, and `source-events.show` command/query schemas,
  handlers, use/query services, source event recorder/read-model ports, and PGlite-backed durable
  dedupe/read-model persistence. The operations remain inactive until provider verification,
  deployment dispatch, operation catalog/Core Operations, and CLI/HTTP/Web surfaces are aligned.
- 2026-05-05 Phase 7 source event verification slice added a provider-neutral verification port
  shape and generic signed HMAC verifier with `SRC-AUTO-EVENT-004` invalid-signature coverage. Git
  provider adapters, source event deployment dispatch, operation catalog/Core Operations, and
  CLI/HTTP/Web surfaces remain inactive.
- 2026-05-05 Phase 7 source event policy matching slice added Resource policy candidate lookup and
  ignored ref/disabled/blocked/no-match outcome evaluation with `SRC-AUTO-EVENT-003` application
  and PGlite coverage. Matching deployment dispatch, operation catalog/Core Operations, and
  CLI/HTTP/Web surfaces remain inactive.
- 2026-05-05 Phase 7 source event deployment dispatch slice added an application dispatcher that
  invokes existing `deployments.create` admission for matching source events and records dispatched
  or dispatch-failed source event outcomes with `SRC-AUTO-EVENT-001` application coverage.
  Operation catalog/Core Operations, provider ingestion routes, and CLI/HTTP/Web surfaces remain
  inactive.
- 2026-05-05 Phase 7 resource auto-deploy entrypoint slice activated
  `resources.configure-auto-deploy` in `CORE_OPERATIONS.md`, the operation catalog, shell DI,
  CLI, and HTTP/oRPC with `SRC-AUTO-ENTRY-001` catalog coverage. Web settings UI, provider
  ingestion routes, Web source event diagnostics, and future MCP/tool descriptors remain deferred.
- 2026-05-05 Phase 7 source event read surface slice activated `source-events.list` and
  `source-events.show` in `CORE_OPERATIONS.md`, the operation catalog, shell DI, CLI, and
  HTTP/oRPC with `SRC-AUTO-QUERY-001`/`SRC-AUTO-QUERY-002` catalog coverage. Provider ingestion
  routes, Web diagnostics, and future MCP/tool descriptors remain deferred.
- 2026-05-05 Phase 7 source event ingestion shell wiring slice registered the inactive
  `source-events.ingest` command handler/use case, generic signed verifier, source-event
  recorder/policy reader/read model, and deployment dispatcher in the shell composition root.
  Provider webhook routes, secret-value resolution for generic signed verification, Web
  diagnostics, and future MCP/tool descriptors remain deferred.
- 2026-05-05 Phase 7 generic signed webhook secret-resolution Spec Round fixed the
  `resource-secret:<KEY>` reference format, Resource-scoped generic signed route shape, and
  `scopeResourceId` matching requirement for `source-events.ingest`; the following route slice
  implements that contract.
- 2026-05-05 Phase 7 generic signed webhook route slice activated
  `POST /api/resources/{resourceId}/source-events/generic-signed` with Resource-scoped
  `resource-secret:<KEY>` resolution, `X-Appaloft-Signature` HMAC verification, scoped source-event
  ingestion, and `SRC-AUTO-ENTRY-002`/`SRC-AUTO-EVENT-006` automation. At that point Web
  diagnostics, provider Git ingestion, and future MCP/tool descriptors remained deferred.
- 2026-05-05 Phase 7 source-event coverage slice closed the remaining event matrix rows for
  dispatch dedupe, multi-Resource provider-signed fanout, and invalid generic signed HTTP
  signatures. At that point Web diagnostics, provider Git route adapters, and future MCP/tool
  descriptors remained deferred.
- 2026-05-05 Phase 7 source auto-deploy public help slice exposed setup, signatures, dedupe,
  ignored-event, and recovery anchors through API, CLI, and Web help registries with
  `SRC-AUTO-SURFACE-003` automation. At that point Web diagnostics, provider Git route adapters,
  and future MCP/tool descriptors remained deferred.
- 2026-05-05 Phase 7 source auto-deploy Web diagnostics slice added Resource detail source-event
  diagnostics backed by `source-events.list`, including safe created-deployment links, dedupe
  visibility, ignored-policy reasons, and `SRC-AUTO-ENTRY-003` Web automation. Provider Git route
  adapters and future MCP/tool descriptors remain deferred.
- 2026-05-05 Phase 7 GitHub push webhook Spec Round extended ADR-037 and source-event specs with
  the first provider Git route, `POST /api/integrations/github/source-events`, using
  `APPALOFT_GITHUB_WEBHOOK_SECRET`, `X-Hub-Signature-256`, `X-GitHub-Delivery`, and planned
  `SRC-AUTO-EVENT-007`/`SRC-AUTO-EVENT-008`/`SRC-AUTO-ENTRY-004` automation.
- 2026-05-05 Phase 7 GitHub push webhook route slice activated
  `POST /api/integrations/github/source-events` with provider signature verification,
  normalization of safe GitHub push facts, delivery id dedupe input, no-op `ping`, shell config
  wiring, and `SRC-AUTO-EVENT-007`/`SRC-AUTO-EVENT-008`/`SRC-AUTO-ENTRY-004` automation. The full
  source auto-deploy row remains unchecked until the `SRC-AUTO-ENTRY-001` Web settings/tool
  metadata gap is closed. The full `0.9.0` release rule remains blocked by that gap, preview,
  future MCP/tool descriptors, and cluster runtime items.
- 2026-05-05 Phase 7 source auto-deploy Web settings slice exposed the safe Resource detail
  auto-deploy policy summary and source binding fingerprint, added Web configure/disable/
  acknowledge actions through `resources.configure-auto-deploy`, and moved `SRC-AUTO-ENTRY-001` to
  Passing. Future MCP/tool descriptor generation remains governed by the operation catalog and the
  global future tool-surface milestone, not by a source auto-deploy transport-specific shape. The
  full `0.9.0` release rule remains blocked by the deploy-action wrapper, preview, and cluster
  runtime items.
- 2026-05-05 Phase 7 source auto-deploy public docs operation-coverage sync mapped
  `resources.configure-auto-deploy`, `source-events.ingest`, `source-events.list`, and
  `source-events.show` to their stable public docs topics in `@appaloft/docs-registry`.
- 2026-05-05 Phase 7 deploy-action reference wrapper slice added
  `.github/actions/deploy-action` with composite action metadata, release-archive install/checksum
  verification script, deploy invocation script, SSH private-key temp-file handling, PR preview flag
  mapping, and `scripts/test/deploy-action-wrapper.test.ts` coverage. The roadmap row remains open
  until this reference is promoted to the public `appaloft/deploy-action` repository with
  Marketplace docs/examples, public wrapper CI, and cleanup examples.
- 2026-05-05 Phase 7 deploy-action preview-output slice added CLI `--preview-output-file`
  handling and wrapper temp-file parsing so Action PR previews can publish generated/default or
  custom `preview-url` values from deployment read models instead of deriving only from templates.
  Public `appaloft/deploy-action` promotion remains open.
- 2026-05-05 Phase 7 existing-resource profile-drift help slice closed the stable public
  `resource.profile-drift` help topic, Web Resource diagnostics help link, CLI `resource show`
  help target, HTTP route description, docs traceability, and matrix/task sync. Default
  existing-resource drift remains fail-before-deploy; effective configuration drift redaction is
  retained as a focused follow-up under `RES-PROFILE-DRIFT-003`.
- 2026-05-05 Phase 7 generated MCP/tool descriptor slice replaced the stale hand-maintained
  `@appaloft/ai-mcp` tool list with descriptors generated from
  `packages/application/src/operation-catalog.ts`. `MCP-TOOL-DESC-001` through
  `MCP-TOOL-DESC-003` assert one descriptor per operation key, stable operation-key tool names,
  serializable CLI/API metadata, and high-value deployment/resource/source-event mappings. The full
  `0.9.0` release rule remains blocked by the public deploy-action promotion, product-grade preview
  deployments, and cluster runtime items.
- 2026-05-05 Phase 7 scheduled task resource Spec Round added ADR-039 and
  `docs/specs/044-scheduled-task-resource-shape` to position Resource-owned scheduled task
  definitions, run attempts, task-run logs, scheduler admission, and deployment-boundary separation.
  The roadmap row remains open until operation catalog entries, persistence, scheduler/runtime
  execution, entrypoints, and public docs are implemented.
- 2026-05-05 Phase 7 scheduled task core-domain slice added Resource-owned scheduled task
  definition value objects and state for schedule, timezone, command intent, timeout, retry, and
  lifecycle status, plus `forbid` concurrency validation. Run attempts, persistence,
  scheduler/runtime execution, entrypoints, and public docs remain open.
- 2026-05-05 Phase 7 scheduled task run-attempt core slice added Resource/task-owned run attempt
  state with manual/scheduled trigger kind, accepted/running/succeeded/failed/skipped transitions,
  safe exit/failure details, and no Deployment id. Application run admission, persistence,
  scheduler/runtime execution, entrypoints, and public docs remain open.
- 2026-05-05 Phase 7 scheduled task application-contract slice added inactive command/query
  schemas, messages, result DTOs, and read-model ports for scheduled task definitions, run-now,
  run history, and run logs while keeping operation catalog entries inactive. Application handlers,
  use cases, persistence, scheduler/runtime execution, entrypoints, and public docs remain open.
- 2026-05-05 Phase 7 scheduled task run-now admission slice added the inactive application
  handler/use case and repository ports to accept manual task runs as accepted run attempts without
  synchronous execution, including disabled-task and archived-Resource admission blockers.
  Remaining handlers/use cases, persistence, scheduler/runtime execution, entrypoints, and public
  docs remain open.
- 2026-05-05 Phase 7 scheduled task create admission slice added the inactive application
  handler/use case and definition repository upsert contract to validate and store Resource-owned
  task definitions, including archived-Resource and unsafe-command blockers. Update/delete/list/show
  handlers, persistence/read models, scheduler/runtime execution, entrypoints, and public docs
  remain open.
- 2026-05-05 Phase 7 scheduled task read-query slice added inactive task list/show, run list/show,
  and run-log query handlers/services over scheduled-task read-model ports with stable envelopes.
  Update/delete handlers, persistence/read models, scheduler/runtime execution, entrypoints, and
  public docs remain open.
- 2026-05-05 Phase 7 scheduled task configure admission slice added the inactive application
  handler/use case plus core VO-based definition patching to validate and store Resource-owned task
  configures, including archived-Resource and unsafe-command blockers. Delete handler, persistence/read
  models, scheduler/runtime execution, entrypoints, and public docs remain open.
- 2026-05-05 Phase 7 scheduled task delete admission slice added the inactive application
  handler/use case and explicit definition delete mutation spec to remove Resource-owned task
  definitions after ownership checks. Persistence/read models, scheduler/runtime execution,
  entrypoints, and public docs remain open.
- 2026-05-05 Phase 7 scheduled task definition persistence slice added Postgres/PGlite storage and
  read models for Resource-owned task definitions, including find/upsert/delete repository specs and
  project/environment/Resource/status read filters. Run-attempt/log persistence,
  scheduler/runtime execution, entrypoints, and public docs remain open.
- 2026-05-05 Phase 7 scheduled task run-attempt persistence slice added Postgres/PGlite storage
  and read models for accepted/running/terminal task runs, plus latest-run summaries on task
  readbacks. Run-log persistence, scheduler/runtime execution, entrypoints, and public docs remain
  open.
- 2026-05-05 Phase 7 scheduled task run-log persistence slice added Postgres/PGlite storage and
  a run-scoped read model for scheduled task output with secret-looking message masking. Scheduler
  dispatch, runtime execution, entrypoints, and public docs remain open.
- 2026-05-05 Phase 7 scheduled task scheduler admission slice added an inactive application
  scheduler process manager, due-candidate reader port, and shared run admission service so due
  scheduled tasks record `scheduled` trigger run attempts through the same checks as run-now.
  Due-candidate persistence, shell runner, runtime execution, entrypoints, and public docs remain
  open.
- 2026-05-05 Phase 7 scheduled task runtime adapter slice added an inactive application
  scheduled-task runtime port and hermetic runtime adapter for one-off task command execution
  results, run-scoped stdout/stderr logs, exit codes, timestamps, and secret-looking output masking.
  Accepted-run worker wiring, due-candidate persistence, shell runner, entrypoints, and public docs
  remain open.
- 2026-05-05 Phase 7 scheduled task accepted-run worker slice added inactive application worker
  orchestration, run-attempt lookup, run-log recording, and Postgres/PGlite recorder support so
  accepted runs can transition through running to terminal state after runtime execution. Automatic
  shell/background runner wiring, due-candidate persistence, entrypoints, and public docs remain
  open.
- 2026-05-05 Phase 7 scheduled task due-candidate read-model slice added Postgres/PGlite
  scheduler candidate scanning for enabled tasks, timezone-aware current-minute schedule matching,
  and same-minute duplicate scheduled-run suppression. Automatic shell/background runner wiring,
  entrypoints, and public docs remain open.
- 2026-05-05 Phase 7 scheduled task shell composition slice registered the inactive scheduled-task
  repositories, read models, due-candidate reader, run-log recorder, runtime port, command/query
  handlers, use cases, scheduler, and accepted-run worker in the shell DI root. Automatic
  shell/background runner wiring, entrypoints, and public docs remain open.
- 2026-05-05 Phase 7 scheduled task shell runner slice added opt-in scheduled task runner config
  and long-running shell process wiring so enabled runners scan due tasks, admit scheduled runs,
  and drain admitted runs through the worker. Operation catalog entries, entrypoints, public docs,
  and broader secret masking coverage remain open.
- 2026-05-05 Phase 7 scheduled task operation entrypoint slice activated
  `scheduled-tasks.*` and `scheduled-task-runs.*` in `CORE_OPERATIONS.md`, the operation catalog,
  and HTTP/oRPC routes with `SCHED-TASK-CATALOG-001`/`SCHED-TASK-ENTRY-001` coverage. CLI commands,
  Web controls, public docs/help, generated MCP descriptor verification, and broader secret masking
  coverage remain open.
- 2026-05-05 Phase 7 scheduled task CLI entrypoint slice added the `appaloft scheduled-task`
  command group for create/list/show/configure/delete/run and run-history list/show/logs. CLI,
  HTTP/oRPC, operation catalog, and generated MCP descriptor paths are active; Web controls, public
  docs/help, and broader secret masking coverage remain open.
- 2026-05-05 Phase 7 scheduled task public docs/help slice added
  `/docs/resources/scheduled-tasks/#scheduled-task-resource-lifecycle`, registered
  `scheduled-task.resource-lifecycle`, and wired CLI/HTTP descriptions to the stable scheduled-task
  anchor. Web controls and broader secret masking coverage remain open.
- 2026-05-05 Phase 7 scheduled task secret redaction slice added shared scheduled-task secret
  detection/redaction for command intent, failure summaries, runtime output, runtime errors,
  persisted read models, and generated tool descriptors. Web controls remained open for the next
  scheduled-task entrypoint slice.
- 2026-05-05 Phase 7 scheduled task Web controls slice added Resource detail controls for
  scheduled-task list/create, run-now, enable/disable, delete, recent run history, run-scoped logs,
  and the stable scheduled-task public help anchor. Phase 7 remains open for Docker Swarm,
  preview/cluster runtime, and any remaining roadmap exit criteria.
- 2026-05-05 Phase 7 scheduled task roadmap sync marked the scheduled-task Code Round implemented
  after active operation catalog, HTTP/oRPC, CLI, Web, generated MCP descriptor, public docs/help,
  persistence, scheduler, worker, runtime, run history, logs, and secret-redaction coverage landed.
  The scheduled-task runner remains opt-in for long-running shell processes.
- 2026-05-05 Phase 7 Docker Swarm admission coverage slice bound `SWARM-TARGET-ADM-001` to
  command schema, public contract schema, HTTP route, repository config parser, and CLI
  config-dispatch tests. Swarm deployment fields remain rejected before deployment creation; Swarm
  manager readiness and execution were closed by later slices.
- 2026-05-05 Phase 7 Docker Swarm backend selection slice added the adapter-owned `docker-swarm`
  backend descriptor shape and `SWARM-TARGET-SELECT-001` registry coverage. Default activation,
  readiness, render/apply/observe/cleanup, and public help were closed by later slices.
- 2026-05-05 Phase 7 Docker Swarm unsupported-backend admission slice bound
  `SWARM-TARGET-ADM-002` to application coverage proving `deployments.create` returns
  `runtime_target_unsupported` before accepting a deployment when a Swarm target lacks required
  runtime backend capabilities.
- 2026-05-05 Phase 7 Docker Swarm public help slice added the
  `server.docker-swarm-target` help topic and bilingual
  `/docs/servers/register-connect/#docker-swarm-runtime-target` anchor. CLI/API descriptions, Web
  help links, readiness, and execution were closed by later slices.
- 2026-05-05 Phase 7 Docker Swarm help-link slice wired the Swarm target anchor into CLI
  `server register`, HTTP `POST /servers`, and Web server registration provider help. Swarm
  manager readiness and execution were closed by later slices.
- 2026-05-05 Phase 7 Docker Swarm manager readiness slice bound `SWARM-TARGET-REG-002` to
  `servers.test-connectivity` adapter coverage for SSH reachability, Docker daemon availability,
  active manager state, overlay network support, and edge proxy compatibility without mutating
  Swarm stacks, services, or networks. Swarm execution was closed by later slices.
- 2026-05-05 Phase 7 Docker Swarm render-intent slice bound `SWARM-TARGET-RENDER-001` and
  `SWARM-TARGET-RENDER-002` to adapter contract coverage for OCI image and Compose artifact render
  intent, including stack/service identity, runtime environment snapshots, health policy, access
  routes, Compose target-service disambiguation, and initial runtime secret masking. Swarm
  apply/verify/log/health/cleanup execution remains open.
- 2026-05-05 Phase 7 Docker Swarm cleanup-plan slice bound initial `SWARM-TARGET-CLEAN-001`
  coverage to adapter-owned service cleanup selectors scoped by Appaloft managed, resource,
  deployment, target, destination, and runtime-target labels. Active Swarm cleanup execution remains
  open with the backend.
- 2026-05-06 Phase 7 Docker Swarm image apply-plan slice made Swarm candidate service identity
  deployment-specific and bound initial `SWARM-TARGET-APPLY-001` / `SWARM-TARGET-ROUTE-001`
  coverage to an adapter-owned OCI image apply plan. The plan creates a candidate service on the
  Swarm network without public host-port publication, orders verification before route promotion and
  superseded-service cleanup, and keeps runtime secrets as Docker secret references. Active Swarm
  execution, failed-rollout rollback, persistence/read-model updates, logs, and health remained
  open for later slices.
- 2026-05-06 Phase 7 Docker Swarm fake backend slice added an opt-in
  `DockerSwarmExecutionBackend` with injected command-runner acceptance coverage for image apply
  and scoped cleanup. Default registry registration, real Swarm command execution, failed-rollout
  rollback behavior, logs, health, and read-model persistence remained open for later slices.
- 2026-05-06 Phase 7 Docker Swarm failed-candidate slice bound initial `SWARM-TARGET-APPLY-002`
  coverage to fake-runner verification failure: the backend records deployment failure metadata and
  runs only the deployment-scoped cleanup command for the failed candidate. Real Swarm rollback
  command behavior remains open.
- 2026-05-06 Phase 7 Docker Swarm logs slice bound initial `SWARM-TARGET-OBS-001` coverage to
  `resources.runtime-logs`: Swarm-backed OCI image deployments read `docker service logs` through
  sanitized `swarm.serviceName` metadata and return normalized redacted Appaloft runtime log lines.
  Swarm health observation remained open until the following health slice.
- 2026-05-06 Phase 7 Docker Swarm health slice bound initial `SWARM-TARGET-OBS-002` coverage to
  `resources.health`: Swarm-backed OCI image deployments can request opt-in live runtime inspection
  from sanitized `swarm.serviceName` metadata, and the runtime adapter normalizes `docker service
  ps` task state into Appaloft runtime health/check fields without exposing raw Docker payloads.
  Remote-manager probing remained open until the later remote-health observation slice; local real
  Swarm smoke coverage was added by a later slice.
- 2026-05-06 Phase 7 Docker Swarm route-label slice bound initial `SWARM-TARGET-ROUTE-001`
  coverage to image apply planning: Traefik route labels are absent from candidate service
  creation, promoted only after candidate verification, and target the Swarm edge network without
  public workload host-port publication. Real edge-proxy route realization was closed by the later
  route smoke slice.
- 2026-05-06 Phase 7 Docker Swarm failure-redaction slice bound initial
  `SWARM-TARGET-SECRET-001` coverage to the Swarm execution backend: command failure output
  is redacted before deployment logs and execution metadata capture common auth headers, cookies,
  key/value secrets, URL credentials, private-key blocks, or exact deployment snapshot secret
  values. Registry/pull-secret smoke coverage was closed by the later registry-auth smoke slice.
- 2026-05-06 Phase 7 Docker Swarm shell-runner slice added `DockerSwarmShellCommandRunner` for the
  opt-in backend, with bounded command execution, stdout/stderr capture, nonzero exit preservation,
  and timeout handling. Default composition was closed by the later default-activation slice.
- 2026-05-06 Phase 7 Docker Swarm runtime-identity readback slice bound initial
  `SWARM-TARGET-APPLY-001` / `SWARM-TARGET-OBS-001` / `SWARM-TARGET-OBS-002` persistence coverage
  to PGlite deployment repository and read-model tests. Sanitized Swarm stack/service/schema
  metadata now round-trips through execution metadata; raw commands, provider payloads, and
  registry-secret fields remain outside the readback contract.
- 2026-05-06 Phase 7 Docker Swarm rollout-preservation sync marked `SWARM-TARGET-APPLY-001`
  covered by existing adapter and fake-backend tests: candidate services are created before
  verification, route promotion, and superseded-service cleanup; failed candidate verification
  records failure, skips superseded-service cleanup, and cleans only the deployment-scoped
  candidate. Default activation was closed by the later default-activation slice.
- 2026-05-06 Phase 7 Docker Swarm display-command redaction slice added apply-plan display command
  redaction for non-secret runtime environment values while keeping executable runner commands
  intact. Registry/pull-secret smoke coverage was closed by the later registry-auth smoke slice;
  default activation was closed by the later default-activation slice.
- 2026-05-06 Phase 7 Docker Swarm registry-auth render slice made image apply plans honor internal
  registry-auth/pull-secret metadata with Docker's `--with-registry-auth` flag while keeping raw
  registry secret references out of rendered intent, executable command, and display command
  payloads. Registry-login/pull-secret smoke coverage was closed by the later registry-auth smoke
  slice; default activation was closed by the later default-activation slice.
- 2026-05-06 Phase 7 Docker Swarm opt-in composition slice added disabled-by-default shell
  configuration for the real Swarm execution backend. `APPALOFT_DOCKER_SWARM_EXECUTION_ENABLED`
  composes the `DockerSwarmExecutionBackend` into the runtime target registry with bounded command
  timeout configuration; default-on activation was closed by the later default-activation slice.
- 2026-05-06 Phase 7 Docker Swarm real-smoke harness slice added an environment-gated adapter
  smoke test for real Swarm apply, post-verification route-label promotion, secret metadata
  redaction, and scoped cleanup through `DockerSwarmExecutionBackend` and
  `DockerSwarmShellCommandRunner`. The smoke is skipped by default and requires
  `APPALOFT_DOCKER_SWARM_SMOKE=1`, an active local Swarm manager, and an `appaloft-edge` overlay
  network before mutating Docker state. `bun run smoke:swarm` is the first-class opt-in command for
  that harness; running it against a real manager remains environment-gated.
- 2026-05-06 Phase 7 Docker Swarm edge-network config slice added
  `APPALOFT_DOCKER_SWARM_EDGE_NETWORK` so Swarm execution and `bun run smoke:swarm` can
  target a prepared overlay network without colliding with an existing local bridge named
  `appaloft-edge`. The default remains `appaloft-edge`; running the real smoke still requires an
  active manager and overlay network.
- 2026-05-06 Phase 7 Docker Swarm real-smoke slice fixed generated superseded-service cleanup shell
  separators and made the opt-in real smoke provision a smoke-specific Docker secret reference and
  use an nginx-compatible health check. `bun run smoke:swarm` passed against a temporary local Swarm
  manager with `APPALOFT_DOCKER_SWARM_EDGE_NETWORK=appaloft-smoke-edge`, then returned Docker to
  inactive Swarm state. Real edge-proxy route realization and registry-auth smoke coverage were
  closed by later smoke slices; default activation was closed by the later default-activation slice.
- 2026-05-06 Phase 7 Docker Swarm registry-auth smoke slice extended `bun run smoke:swarm` to
  provision a temporary authenticated registry, push a smoke image, deploy that private image
  through `DockerSwarmExecutionBackend` with `--with-registry-auth`, and assert registry secret
  material, secret references, and runtime env secret values stay out of deployment logs/metadata.
  The smoke passed against a temporary local Swarm manager with
  `APPALOFT_DOCKER_SWARM_EDGE_NETWORK=appaloft-smoke-edge`, then returned Docker to inactive Swarm
  state. Real edge-proxy route realization was closed by the later route smoke slice; default
  activation was closed by the later default-activation slice.
- 2026-05-06 Phase 7 Docker Swarm route-realization smoke slice extended `bun run smoke:swarm` to
  provision a temporary Traefik Swarm edge proxy on the smoke overlay network, deploy the nginx
  workload without publishing the workload service port, promote Appaloft Traefik route labels after
  candidate verification, and verify `Host: api.example.com` reaches nginx through the published
  proxy entrypoint. The smoke passed against a temporary local Swarm manager with
  `APPALOFT_DOCKER_SWARM_EDGE_NETWORK=appaloft-smoke-edge`, then returned Docker to inactive Swarm
  state. Default activation was closed by the later default-activation slice.
- 2026-05-06 Phase 7 Docker Swarm default-activation slice made shell composition register the
  `DockerSwarmExecutionBackend` by default, kept bounded command timeout and edge-network
  configuration, and retained `APPALOFT_DOCKER_SWARM_EXECUTION_ENABLED=false` as the explicit
  opt-out for installations that are not ready to execute Swarm deployments.
- 2026-05-06 Phase 7 Docker Swarm remote-log observation slice made `resources.runtime-logs` execute
  Swarm service log reads through the resolved Swarm manager SSH target when available, while
  preserving the local Docker fallback for local smoke runs. Remote-manager health observation
  remained open until the following slice.
- 2026-05-06 Phase 7 Docker Swarm remote-health observation slice passed the deployment target
  server id into Swarm runtime health inspection and made `resources.health` execute
  `docker service ps` through the resolved Swarm manager SSH target when available, while preserving
  the local Docker fallback for local smoke runs.
- 2026-05-05 Phase 7 product-grade preview deployment Spec Round positioned GitHub
  App/control-plane previews as a separate workflow from Action-only previews, with
  `docs/specs/046-product-grade-preview-deployments` and
  `docs/testing/product-grade-preview-deployments-test-matrix.md` covering preview policy,
  environment identity, scoped preview config, ids-only deployment dispatch, feedback,
  cleanup retries, quotas, and public-surface requirements. Code Round remains open.
- 2026-05-06 Phase 7 product-grade preview policy evaluator slice added initial normalized
  GitHub pull-request policy evaluation for verified same-repository events, unverified events,
  default fork blocking, secret-backed fork blocking, and opt-in fork previews without secrets.
  Preview environment state, deployment dispatch, read models, GitHub App ingestion, feedback,
  cleanup retry, and entrypoints remain open.
- 2026-05-06 Phase 7 product-grade preview environment domain slice added foundational core
  `PreviewEnvironment` state for scoped project/environment/resource/target placement, safe source
  fingerprint and pull-request context, expiry checks, and cleanup-request transition. Persistence,
  read models, deployment dispatch, GitHub App ingestion, feedback, cleanup retry, and entrypoints
  remain open.
- 2026-05-06 Phase 7 product-grade preview environment persistence slice added Postgres/PGlite
  preview environment storage, lookup by id/source scope, safe list/show read models, lifecycle
  status readback, and scoped delete while retaining owner Resource state. Deployment dispatch,
  GitHub App ingestion, feedback, cleanup retry, and entrypoints remain open.
- 2026-05-06 Phase 7 product-grade preview lifecycle application slice added initial
  `PreviewLifecycleService` coverage for eligible pull-request policy results creating/updating
  preview environments and dispatching one ids-only deployment request. GitHub App ingestion,
  blocked-event read models, feedback, cleanup retry, and entrypoints remain open.
- 2026-05-06 Phase 7 preview policy operation-contract slice added inactive
  `preview-policies.configure` and `preview-policies.show` command/query schemas, handlers,
  repository/read-model ports, operation catalog entries, and tests. Durable policy persistence,
  active transports, GitHub App ingestion, feedback, cleanup retry, and preview environment
  entrypoints remain open.
- 2026-05-06 Phase 7 preview policy persistence slice added Postgres/PGlite storage and shell
  wiring for inactive `preview-policies.configure` / `preview-policies.show` operation contracts.
  Safe read models now return configured or default project/Resource policy summaries without
  exposing idempotency keys, provider payloads, or secret material. Active transports, GitHub App
  ingestion, feedback, cleanup retry, and preview environment entrypoints remain open.
- 2026-05-06 Phase 7 preview blocked-policy projection slice added application and Postgres/PGlite
  projection of blocked preview policy decisions by source event id. Fork policy blocks now expose
  safe reason/readback details and requested secret scope counts without dispatching deployments or
  storing secret names/provider tokens. GitHub App ingestion, feedback, cleanup retry, and active
  preview environment entrypoints remain open.
- 2026-05-06 Phase 7 preview policy quota/TTL slice added active preview quota settings,
  `preview_quota_exceeded` blocking, preview TTL-derived environment expiry, and Postgres/PGlite
  readback for safe quota/expiry policy decision details. Scheduler cleanup for expired previews,
  GitHub App ingestion, feedback, cleanup retry, and active preview environment entrypoints remain
  open.
- 2026-05-06 Phase 7 preview GitHub pull-request event slice added an integration-boundary
  verifier/normalizer for signed `pull_request` webhooks. It emits only safe preview lifecycle
  facts, rejects invalid signatures, unsupported actions, and unsafe payloads, and keeps actual
  GitHub App route wiring, dedupe/idempotency, feedback, cleanup retry, and active preview
  environment entrypoints open.
- 2026-05-06 Phase 7 preview duplicate-event slice added source-event-id dedupe to the preview
  lifecycle service. Duplicate deliveries now return the stored preview policy decision without
  mutating preview environment state or dispatching another ids-only deployment request. Feedback
  and cleanup idempotency remain tied to their future process-state slices.
- 2026-05-06 Phase 7 preview scoped-config slice added an application resolver over
  `resources.effective-config` that defaults to copying no production secrets or durable routes,
  resolves only explicit preview variables/secret references, and keeps raw or masked secret values
  out of preview resolution output. Full lifecycle process-manager wiring, GitHub App routes,
  feedback, cleanup retry, and active preview environment entrypoints remain open.
- 2026-05-06 Phase 7 preview deployment-dispatch slice bound preview dispatch to the existing
  `deployments.create` admission adapter and added explicit `PG-PREVIEW-DEPLOY-001` coverage that
  only ids cross the deployment boundary. Pull-request/source/route/preview details remain
  read-model or process context. GitHub App routes, feedback, cleanup retry, and active preview
  environment entrypoints remain open.
- 2026-05-06 Phase 7 preview pull-request ingestion slice added an application service that routes
  safe normalized GitHub pull-request preview facts into preview lifecycle using selected
  control-plane context. This initial slice left closed-event cleanup ignored until cleanup process
  state existed. GitHub App HTTP routes, feedback, cleanup retry, and active preview environment
  entrypoints remained open at that point.
- 2026-05-06 Phase 7 preview deployment process-manager slice composed policy evaluation,
  preview environment state, ids-only deployment dispatch, and PR-comment feedback. Accepted
  preview deployments now publish idempotent source-event-keyed `github-pr-comment` feedback, and
  retryable feedback failures preserve the accepted deployment result while recording safe feedback
  state. GitHub check/deployment-status writers, GitHub App HTTP routes, cleanup adapters, and
  active preview environment entrypoints remain open.
- 2026-05-06 Phase 7 preview feedback application slice added initial feedback writer/recorder
  ports and a service for idempotent PR comment/check/status updates. Existing provider feedback
  ids are reused for update-in-place, and retryable provider failures are recorded as safe feedback
  state without turning the accepted deployment path into `err`. Durable feedback persistence,
  GitHub App HTTP routes, cleanup retry, and active preview environment entrypoints remain open.
- 2026-05-06 Phase 7 preview feedback persistence slice added Postgres/PGlite storage and shell
  wiring for idempotent provider feedback state keyed by feedback key. The record keeps provider
  feedback ids, channel/status, safe error codes, retryable state, and update timestamps without
  persisting feedback body text, provider payloads, tokens, or secret-shaped values. GitHub
  feedback writer adapters, GitHub App HTTP routes, cleanup retry, and active preview environment
  entrypoints remain open.
- 2026-05-06 Phase 7 preview GitHub PR comment feedback slice added a hermetic GitHub integration
  writer for product-grade preview PR comments. It creates comments, updates existing comments by
  provider feedback id, classifies retryable provider failures safely, and omits response bodies,
  tokens, and feedback body text from returned errors. Check/deployment-status writers, shell
  wiring, GitHub App HTTP routes, cleanup retry, and active preview environment entrypoints remain
  open.
- 2026-05-06 Phase 7 preview GitHub check-run feedback slice added a hermetic GitHub integration
  writer for product-grade preview check runs plus composite GitHub feedback routing for comments
  and checks. It resolves pull-request head SHA safely, creates check runs, updates existing check
  runs by provider feedback id, and keeps deployment-status feedback unsupported until the feedback
  input carries the required provider deployment identity. GitHub App HTTP routes, cleanup adapters,
  and active preview environment entrypoints remain open.
- 2026-05-06 Phase 7 preview feedback shell-wiring slice registered a request-scoped GitHub
  preview feedback writer in the shell composition. It obtains the GitHub token through the
  existing integration auth port per publish call, returns a safe validation error when GitHub is
  not connected, and delegates supported PR comment/check feedback to the GitHub integration
  writer. Deployment-status feedback, GitHub App HTTP routes, cleanup retry, and active preview
  environment entrypoints remain open.
- 2026-05-06 Phase 7 preview cleanup application slice added a service that marks durable preview
  environment cleanup requested without deleting preview history, then delegates runtime, route,
  source-link, provider metadata, and feedback cleanup to a safe source-scope port. Concrete
  cleanup adapters, cleanup retry state, GitHub App HTTP routes, and active preview environment
  entrypoints remain open.
- 2026-05-06 Phase 7 preview cleanup retry slice added application attempt state for cleanup
  retries. Each cleanup run gets a fresh `pcln_*` attempt id, retryable provider/adapter failures
  record safe owner, phase, error code, and next retry time, and responses omit provider error text.
  Durable cleanup attempt persistence, scheduler dispatch, concrete cleanup adapters, GitHub App
  HTTP routes, and active preview environment entrypoints remain open.
- 2026-05-06 Phase 7 preview cleanup attempt persistence slice added Postgres/PGlite storage and
  shell wiring for durable cleanup retry records keyed by `pcln_*` attempt id. Stored state keeps
  preview environment id, Resource id, source fingerprint, owner, status, phase, retry timing, and
  safe error code without provider error text, tokens, or secret-shaped values. Scheduler dispatch,
  concrete cleanup adapters, GitHub App HTTP routes, and active preview environment entrypoints
  remain open.
- 2026-05-06 Phase 7 preview cleanup retry scheduler slice added an application scheduler and
  durable due-candidate reader for `preview_cleanup_attempts`. The reader returns latest due
  `retry-scheduled` attempts only, and the scheduler dispatches them through the cleanup service so
  retries create fresh `pcln_*` attempt ids. Concrete cleanup adapters, GitHub App HTTP routes, and
  active preview environment entrypoints remain open.
- 2026-05-06 Phase 7 preview cleanup retry runner slice added a disabled-by-default shell runner
  and config block for `previewCleanupRetryScheduler`. The runner is only resolved when explicitly
  enabled so normal boot does not require the future concrete cleanup adapter. Concrete cleanup
  adapters, GitHub App HTTP routes, and active preview environment entrypoints remain open.
- 2026-05-06 Phase 7 preview cleanup retry runner coverage slice added shell runner tests for
  disabled startup, system actor context, batch-size forwarding, and the in-process non-overlap
  guard that skips interval ticks while a scheduler run is active.
- 2026-05-06 Phase 7 preview environment surface-contract slice added inactive
  `preview-environments.list`, `preview-environments.show`, and `preview-environments.delete`
  application contracts plus operation catalog entries. List/show read from the safe preview
  environment read model, delete uses cleanup-service input, and CLI/API/Web/future MCP transports
  remain inactive until the product-grade control-plane route is wired.
- 2026-05-06 Phase 7 preview GitHub pull-request HTTP route slice wired signed
  `pull_request` deliveries on `/api/integrations/github/source-events` to
  `IngestPreviewPullRequestEventCommand` through `CommandBus`, using trusted Appaloft preview
  context headers for project/environment/Resource/server/destination/source-fingerprint selection.
  Follow-up repository and installation mapping was still required before active GitHub App worker
  transports.
- 2026-05-06 Phase 7 preview closed-event cleanup slice routed GitHub `pull_request.closed`
  ingestion through source-scope preview environment lookup into the preview cleanup service.
  Existing previews now preserve history while requesting runtime/route/source-link/provider/
  feedback cleanup, and missing previews return an idempotent ignored result. Active GitHub App
  preview worker transports remained open.
- 2026-05-06 Phase 7 preview cleanup feedback slice added latest-feedback lookup by preview
  environment/channel, cleanup-side PR-comment updates through the existing idempotent feedback
  writer path, skipped cleanup feedback when no prior feedback exists, and safe retryable failure
  propagation into cleanup retry handling. Active GitHub App preview worker transports remained
  open.
- 2026-05-06 Phase 7 preview deployment-status publication slice made the preview deployment
  process manager publish idempotent `github-deployment-status` feedback after accepted ids-only
  deployment dispatch. The GitHub feedback writer now creates a transient GitHub preview deployment
  from the pull-request head SHA when automatic feedback has no provider deployment id yet, records
  that deployment id for later append-only status updates, and keeps retryable provider failures in
  safe feedback state without rewriting the accepted deployment result. Active GitHub App preview
  worker transports remained open.
- 2026-05-06 Phase 7 preview cleanup scheduler lease slice wrapped enabled shell
  `previewCleanupRetryScheduler` ticks in the existing durable mutation coordinator under the
  `preview-lifecycle` coordination scope. Multiple shell processes now share a bounded lease for
  cleanup retry scans while the in-process non-overlap guard remains as local protection.
  Active GitHub App preview worker transports remained open.
- 2026-05-06 Phase 7 preview terminal metadata cleanup slice made cleanup-side feedback mark the
  latest GitHub deployment-status feedback `inactive` when a provider deployment record exists.
  The shell cleaner now reports that inactive status append as provider metadata removal while
  retaining retryable provider failures in safe cleanup retry state. Active GitHub App preview
  worker transports remained open.
- 2026-05-06 Phase 7 preview GitHub repository-context mapping slice made the signed
  `pull_request` HTTP route resolve preview context from the source-event policy reader when trusted
  Appaloft headers are absent. The route maps GitHub repository full name/provider repository id and
  base ref to project/environment/Resource/server/destination/source-fingerprint context, carries
  GitHub installation id only as safe verification detail, and still rejects ambiguous or missing
  policy matches before command dispatch. Active GitHub App preview worker transports remain open.
- 2026-05-06 Phase 7 preview GitHub safe-metadata propagation slice ensured the
  `IngestPreviewPullRequestEventCommandHandler` preserves safe provider repository id and
  installation id facts when handing signed GitHub preview events to the application ingest service.
  Active GitHub App preview worker transports remain open.
- 2026-05-06 Phase 7 preview worker feedback transport slice added an explicit
  `APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN` runtime configuration path for webhook and cleanup
  scheduler contexts where no request-scoped GitHub OAuth token exists. The shell feedback writer
  still prefers request-scoped GitHub auth when present, falls back to the worker token for system
  contexts, and returns safe `preview-feedback` validation errors when neither token source exists.
  Full GitHub App installation-token onboarding and provider smoke tests remain future public
  enablement work rather than a Phase 7 Code Round blocker.
- 2026-05-05 Phase 7 preview deployment Docs Round added bilingual
  `/docs/deploy/previews/` content and registered public help topics for Action-only PR previews
  and future product-grade previews. The public `appaloft/deploy-action` wrapper repository,
  Marketplace README, and public wrapper tests remain open.
- 2026-05-05 Phase 7 deploy-action wrapper cleanup/README slice added `command:
  preview-cleanup` to the reference composite action, a Marketplace-facing README with deploy, PR
  preview, close-event cleanup, fork-safety, minimal config, and reserved control-plane examples,
  plus wrapper tests for cleanup mapping and README safety examples. The public
  `appaloft/deploy-action` repository and public wrapper CI/layout tests remain open.
- 2026-05-06 Phase 7 deploy-action wrapper export slice added a deterministic export script for
  mirroring the reference `action.yml`, Marketplace README, and install/deploy scripts into the
  future public `appaloft/deploy-action` repository, with a layout test proving exported files match
  the reference and shell scripts keep executable bits. Creating the public repository and wiring
  public wrapper CI remain open.
- 2026-05-06 Phase 7 deploy-action public CI export slice added the wrapper repository CI workflow
  to the exported layout. The workflow validates shell syntax, dry-run PR preview mapping and
  outputs, and an opt-in exact-version install smoke controlled by the future public repository's
  `APPALOFT_INSTALL_SMOKE_VERSION` variable. Creating the public repository and enabling that
  exported CI remain external release/publishing work.

Required:

- [x] Add resource-scoped environment variable operations.
- [x] Add secret operations with build/runtime exposure rules, masking, `.env` import/paste, and
  effective config queries.
- [x] Add storage/volume create/list/show/update/delete.
- [x] Add storage attach/detach, bind mount versus named volume, destination path validation, and
  backup relationship metadata.
- [x] Add provider-neutral Postgres dependency resource provision/import/list/show/rename/delete
  baseline.
- [x] Add provider-neutral Postgres dependency resource bind/unbind/list/show binding metadata
  baseline.
- [x] Add provider-native Postgres database realization and closed bind/backup/delete lifecycle.
- [x] Add Redis provisioning/import/list/show/update/delete.
- [x] Add dependency bind/unbind and binding secret rotation.
- [x] Add backup/restore for the minimum useful dependency-resource loop.
- [x] Rebuild deployment show as a first-class query.
- [x] Rebuild deployment stream-events as a first-class query.
- [x] Rebuild deployment retry/redeploy under ADR-016.
- [x] Rebuild rollback under ADR-016 with retained artifacts, rollback candidates, lifecycle
  transitions, events, errors, Web/API/CLI affordances, and tests.
- [x] Add resource restart/stop/start only after runtime ownership and state semantics are
  specified.
- [x] Add source binding and auto-deploy.
- [x] Add push webhook and generic signed deploy webhook.
- [ ] Add deploy-action wrapper behavior, including PR preview deploy/update from a user-authored
  GitHub Actions workflow. Public docs now distinguish Action-only workflow-file previews from
  future product-grade control-plane previews, but the public `appaloft/deploy-action` wrapper
  repository remains open; reference action asset export and the exported public wrapper CI workflow
  are implemented and layout-tested locally.
- [x] Add existing-resource profile-drift handling.
- [x] Add product-grade preview deployments after source binding and webhook ingestion are durable,
  including GitHub App/webhook triggers, scoped preview env, list/show/policy/delete, and cleanup
  retries. Spec Round is positioned in
  [docs/specs/046-product-grade-preview-deployments](./specs/046-product-grade-preview-deployments/spec.md)
  with a dedicated test matrix; preview policy/environment operations, feedback, cleanup retry,
  Web/API/CLI/future MCP surfaces, public docs, an initial signed GitHub pull-request HTTP route,
  close-event cleanup routing, cleanup-side feedback update, and automatic deployment-status
  feedback publication, plus repository-context mapping from signed GitHub events and
  request-or-worker-token GitHub feedback transport, are implemented. Full GitHub App installation
  onboarding and provider smoke tests remain outside this Phase 7 Code Round.
- [x] Add scheduled task/cron resource shape with run history and logs after workload service
  semantics are specified. ADR-039/spec matrix now position ownership and target operations.
- [x] Complete the Docker Swarm Spec Round as the first cluster runtime target:
  target registration/readiness, placement, registry/secret handling, rollout/health/log/cleanup
  semantics, normalized read surfaces, and contract test matrix are specified.
- [x] Complete the Docker Swarm Code Round as the first cluster runtime target:
  target registration/readiness, placement, registry/secret handling, rollout/health/log/cleanup
  semantics, normalized read surfaces, public docs/help, and contract tests are implemented.
  Target-kind registration metadata, unsupported-backend admission, backend descriptor selection,
  Swarm manager readiness, adapter-owned OCI/Compose render intent, OCI image apply-plan rendering,
  label-scoped cleanup plan rendering, opt-in fake backend acceptance coverage, Swarm runtime-log
  observation, Swarm health observation, initial Traefik route label promotion, the public docs
  anchor, command-failure redaction, sanitized runtime identity readback, and CLI/API/Web help
  links are implemented; default shell composition and `bun run smoke:swarm` real smoke harness
  exist, and the local real smoke passed against a temporary Swarm manager; Swarm service log and
  health reads can run through the resolved manager over SSH; registry-authenticated image pull is
  covered by the opt-in real smoke; real edge-proxy route realization is covered by the opt-in real
  smoke.

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
- [x] Add operator queries for deployment attempts.
- [x] Add operator queries for proxy bootstrap attempts.
- [x] Add operator queries for certificate attempts.
- [ ] Add operator queries for remote SSH state locks, migrations, backups, and recovery markers.
- [ ] Add operator queries for source links, route realization attempts, and worker/job status.
- [x] Add runtime target capacity diagnostics for disk, inode, memory, CPU, Docker image usage,
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
- [x] Verify CLI, HTTP/oRPC, Web, and generated MCP/tool contracts against `operation-catalog.ts`.
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
- [x] Resource: profile drift visibility.
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
- [ ] Scheduled task: create/list/show/update/delete, run now, run history/logs. Spec Round
  positioned by ADR-039 and `docs/specs/044-scheduled-task-resource-shape`.
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
- [x] Web/CLI/repository config draft parity: source base directory, publish directory, Dockerfile
  path, Compose path, build target, install/build/start commands, runtime name, internal port,
  network exposure, and health fields map to resource profiles before ids-only deployment.
- [x] Static sites: static strategy, Vite static, Angular static, Astro static, Nuxt generate,
  Next static export, SvelteKit adapter-static/static, and generic static server packaging exist.
- [ ] Static sites: add common static generators and generic static generator fallback with explicit
  publish directory.
- [x] Next.js: baseline `nextjs` planner builds and starts with package manager defaults.
- [x] Next.js: complete tested SSR/standalone/static-export support with app/pages/output
  detection, package manager parity, internal port defaults, headless Docker/OCI readiness, and
  representative opt-in Docker smoke.
- [x] Angular SPA: detects `angular.json` output path and routes static output through the
  `angular-static` planner.
- [x] React/Vue/Svelte/Solid/Angular SPA baseline: Vite static and generic Node/static coverage
  exist.
- [x] React/Vue/Svelte/Solid SPA: detect framework-specific outputs and route static output through
  static-server artifacts where Vite evidence is not sufficient.
- [x] Static/Node/Python fixture smoke: current supported JavaScript/TypeScript/Python catalog
  resource profiles produce Docker/OCI image artifact plans and headless execution evidence.
- [x] Static/Node/Python real fixture smoke: representative opt-in local Docker slice builds, runs,
  verifies internal HTTP, and records runtime metadata/logs from the same resource profile
  vocabulary.
- [x] Nuxt/SvelteKit/Astro/Remix: Nuxt generate static, SvelteKit adapter-static/static, Astro
  static, and Remix server planner exist.
- [ ] Nuxt/SvelteKit/Astro/Remix: add SSR/server modes where Docker/OCI start command is
  deterministic.
- [x] Node API frameworks: generic Node and framework metadata baseline exist.
- [x] Node API frameworks: add explicit Express, Fastify, NestJS, Hono, and Koa detection/start
  defaults with internal port behavior, plus generic package-script fixture coverage.
- [x] Python: FastAPI, Django, Flask, generic Python, `uv`, Poetry, and pip baseline exist.
- [x] Python: harden ASGI/WSGI app discovery, module/app target selection, package-tool command
  rendering, explicit fallback, and headless Docker/OCI fixture readiness.
- [ ] Python: harden collectstatic/static handling and broaden real Docker/SSH smoke beyond the
  representative slice.
- [x] Java/JVM: generic Maven/Gradle planner exists.
- [x] Java/JVM: add Spring Boot first.
- [ ] Java/JVM: add Quarkus/Micronaut if demand justifies it.
- [ ] Ruby: add Rails and generic Rack/Sinatra planners or explicit fallback errors.
- [ ] PHP: add Composer app planner with PHP-FPM or app-server policy.
- [ ] Go: add generic Go build plus common HTTP framework detection as metadata/defaults.
- [ ] .NET: add ASP.NET Core planner with `dotnet publish` artifact rules.
- [ ] Rust: add generic Cargo build plus common HTTP framework metadata/defaults.
- [ ] Elixir: add Phoenix release planner with `mix` and runtime image policy.
- [ ] Buildpack-style auto-detection: add only after explicit planners remain deterministic; expose
  generated plan, builder policy, limitations, overrides/fix paths, and unsupported-field errors.
  The current Spec Round limits this to adapter-owned accelerator preview/contract guardrails and
  does not claim real `pack`/lifecycle execution.

## External Baseline Gap Checklist

External baseline research points to this practical minimum:

- [x] Docker substrate with Dockerfile, Compose, and prebuilt image paths.
- [ ] Buildpack/auto-detect option with explicit plan output. The contract now has a Phase 5
  feature artifact and stable matrix ids; Code Round still needs executable preview parity.
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

- [ ] Resource profile lifecycle: reset/delete policy semantics and remaining profile/config drift
  redaction coverage after source/runtime/network/access profile configuration. Resource profile
  drift visibility now has a Spec Round artifact at
  [docs/specs/011-resource-profile-drift-visibility](./specs/011-resource-profile-drift-visibility/spec.md);
  Code Round and public docs/help are active, while reset/delete policy semantics remain unchecked.
- [x] SSH credential lifecycle: `credentials.show` masked detail and usage visibility plus
  `credentials.delete-ssh` delete-when-unused safety across CLI, API, and Web typed confirmation.
- [x] Framework support tier matrix: fixed-version detector/planner fixtures cover the current
  Next.js, Vite, Angular, SvelteKit, Nuxt, Astro, Remix, Express, FastAPI, Django, and Flask slice.
- [x] Framework support tier matrix: promote Web/CLI/repository config draft-field parity and
  equivalent Quick Deploy smoke/acceptance rows for the current JavaScript/TypeScript/Python slice.
- [x] Framework support tier matrix: add fixture-by-fixture Docker/OCI smoke rows and executable
  headless coverage for the current supported JavaScript/TypeScript/Python catalog.
- [x] Framework support tier matrix: add and run the first representative opt-in real local Docker
  fixture smoke slice for static/frontend, Node/server, and Python/server fixtures.
- [x] Framework support tier matrix: promote JavaScript/TypeScript catalog closure rows and
  `deployments.plan/v1` catalog preview contract rows for tested headless Docker/OCI readiness.
- [ ] Framework support tier matrix: broaden fixture-by-fixture real Docker/SSH deployment smoke
  rows for the full JavaScript/TypeScript/Python catalog.
- [ ] Deployment observation and recovery: harden `deployments.stream-events` reconnect/gap/CLI
  coverage, then rebuild retry/redeploy, rollback candidate/readiness, and ADR-016 recovery
  decisions.
- [ ] Access/domain/TLS closure: domain binding show/update/delete/retry and certificate
  import/revoke/retry.
- [ ] Dependency resource lifecycle: Postgres/Redis provision/import, bind/unbind, secret rotation,
  backup/restore, and delete.
- [ ] Operator state closure: outbox/inbox/jobs, remote SSH state diagnostics, runtime target
  capacity diagnostics, audit/event retention, and prune/recovery commands.
