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
  published release agree on the current version line.

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

Version plan:
- [x] `0.10.0` is Phase 8: Self-Hosted Auth And Organization Bootstrap.
- [x] `0.10.x` is the Phase 8 hardening line: installer/auth fixes, release packaging fixes, and
  backwards-compatible corrections only.
- [x] `0.11.0` is Phase 9: Operator/Internal State Closure And Interface Parity.
- [x] `0.12.0` is Phase 10: Runtime Usage Attribution And Monitoring.
- [x] `1.0.0-rc` is the GA release-candidate gate after `0.12.0`, not a separate feature phase.
- [ ] `1.0.0` is GA.
- [x] Post-`1.0.0` tracks do not reserve `0.x` versions. If maintainers deliberately pull a
  post-`1.0.0` track before GA, first retarget this roadmap by adding or replacing an explicit
  pre-GA phase; do not leave contradictory `post-1.0` and `0.x` labels on the same work.

Current release alignment:

<!-- release-alignment:start -->
- [x] On 2026-05-18, the latest public release is `v1.0.0-rc.10`; root package
  and Release Please manifest on `main` are `1.0.0-rc.10`; the release PR target is
  `1.0.0-rc.11`.
- [x] On 2026-05-18, the roadmap gate allows `Release-As: 1.0.0-rc.11` because
  Phase 0 through Phase 11 release rules, required items, and exit criteria are checked.
<!-- release-alignment:end -->

Historical alignment notes:
- [x] On 2026-04-23, the public docs app and standalone docs deployment workflow are merged on
  `origin/main`; `docs.appaloft.com` DNS and release deployment secrets/variables are configured,
  so the docs site should deploy after the next release publish run creates a GitHub Release.
- [x] On 2026-04-22, custom resource runtime/container naming for Quick Deploy, CLI config-driven
  deploys, and Web runtime profile editing is merged on `origin/main`, and the current preview
  runtime-name template variables on `main` are `{preview_id}` and `{pr_number}`.
- [x] On 2026-04-22, Action/CLI PR preview deploy profile flag support and explicit preview cleanup
  command support are implemented in the CLI/config bootstrap path. The public deploy-action
  wrapper is now published; product-grade GitHub App preview lifecycle work is tracked separately.
- [x] On 2026-04-23, `deployments.stream-events` is active in the operation catalog, application
  query slice, HTTP/oRPC replay and stream routes, CLI events command, shell observer, and Web
  deployment detail timeline. Remaining work is reconnect/gap/CLI test hardening, not first-class
  query implementation.
- [x] On 2026-05-15, deployment observation and recovery pre-rc work is classified as `0.12.x`
  patch hardening, not a `1.0.0-rc` release. The governing coordination artifact is
  [Deployment Observation And Recovery Hardening](./specs/071-deployment-observation-and-recovery/spec.md).
- [x] On 2026-04-24, the `0.4.0` minimum console and deployment loop has a dedicated release-gate
  matrix, Quick Deploy new-resource sequencing remains `resources.create ->
  deployments.create(resourceId)`, and the local CLI smoke covers resource/deployment observation
  after deployment.
- [x] On 2026-04-24, the main repository has a docs PR preview workflow that uses the Appaloft CLI
  preview path for same-repository docs changes and runs explicit preview cleanup when the PR is
  closed; the public `appaloft/deploy-action` wrapper is now published from the reference export.
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
- [x] [AI-Native Resource Template And MCP Roadmap](./implementation/ai-native-resource-template-roadmap.md)

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
- [ ] A published TypeScript SDK consumes the same HTTP/oRPC operation contracts as Web and
  external automation, without importing `core`, `application`, repositories, handlers, or use
  cases.
- [ ] A v1 Appaloft skill is installable with `npx skills add appaloft/appaloft`, covers every CLI
  operation entrypoint plus CLI/HTTP/API/Web/repository-config/future-MCP surface selection as an
  AI-facing Appaloft entrypoint, and keeps deploy as an internal subprotocol of the full skill
  before MCP is required.
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
  webhooks, and internal process state. Source-link list/show/delete now have application, CLI,
  HTTP-oRPC, catalog, docs-registry, OpenAPI, and SDK evidence. Project restore is active through
  `projects.restore` with application, CLI, HTTP-oRPC, Web, catalog, docs-registry, OpenAPI, and SDK
  evidence. Project delete safety and guarded tombstone delete are active through
  `projects.delete-check` and `projects.delete`, with application, CLI, HTTP-oRPC, Web, PGlite,
  catalog, docs-registry, OpenAPI, SDK, and public docs evidence. Source-link archive is still not
  implemented because source links remain mappings rather than lifecycle aggregates.
- [x] Remaining non-resource lifecycle gaps are closed for the pre-RC blocker set. Resource profile drift
  visibility is active; Resource-vs-latest-snapshot configuration drift redaction is covered, and
  config deploy now blocks entry config keys shadowed by resource-scoped effective config overrides
  without leaking raw values. Active auto-deploy/webhook/source-event and health-policy
  configure/observe baselines have executable evidence. Generic signed webhook credential rotation
  is covered by Resource-owned secret reference rotate, and source-event delivery replay is active
  through `source-events.replay` with CLI, HTTP/oRPC, catalog, docs-registry, OpenAPI, and SDK
  evidence. Resource health-history is active with application, persistence, CLI, HTTP/oRPC,
  catalog, docs-registry, OpenAPI, SDK, and public docs evidence. Broader webhook day-two
  management is covered for the current pre-RC scope by dry-run-first `source-events.prune`
  retention cleanup with application, PGlite, CLI, HTTP/oRPC, catalog, docs-registry, public docs,
  OpenAPI, and SDK evidence; provider-specific webhook control planes beyond the active GitHub and
  generic-signed routes remain future provider scope, not hidden RC scope.
- [x] Deployment observation and recovery pre-rc hardening is closed for the `0.12.x` blocker. `deployments.show`,
  `deployments.stream-events`, `deployments.recovery-readiness`, `deployments.retry`,
  `deployments.redeploy`, `deployments.rollback`, and `deployments.cancel` are active;
  reconnect/gap/CLI coverage, recovery edge-case coverage, rollback candidate target
  compatibility, and active-attempt cancel evidence are synchronized in
  [Deployment Observation And Recovery Hardening](./specs/071-deployment-observation-and-recovery/spec.md)
  and [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md).
- [x] `deployments.create` progress stream remains create-time observation, and standalone
  replay/follow deployment observation is owned by `deployments.stream-events` with application,
  HTTP/oRPC, OpenAPI, SDK generator, and SDK executable evidence recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md).
- [x] Default access policy editing is public through explicit configure/list/show operations.
- [x] Durable-domain and server-applied route precedence is hardened in deployment route resolution
  and current-route consumers.
- [x] Provider-route projection/retention and route intent update/delete/reconcile surfaces are
  covered by active domain-binding route operations, server-applied route persistence/cleanup, and
  edge-proxy provider projection tests recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md).
- [x] Generated access, proxy preview, server-applied domains, and durable domain route API/Web/CLI
  regression coverage is closed by the access/domain/TLS and Web evidence recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md).
- [x] Dependency resources and bindings have Postgres/Redis provision/import, binding, backup/restore,
  runtime injection, deletion-safety command coverage, and opt-in scheduled backup policy surfaces.
  Remaining work is prune/export automation and broader provider catalog coverage.
- [x] Framework coverage is broadened for the target catalog through JavaScript/TypeScript/Python/JVM
  plus Ruby/PHP/Go/.NET/Rust/Elixir detector, planner, fixture, and docs evidence recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md). Real buildpack execution
  remains a separate unchecked buildpack row and is not claimed by this blocker.
- [x] Docker Swarm support is specified and implemented as the first cluster runtime target backend.
- [x] Durable outbox/inbox-equivalent process delivery, job state, process attempts,
  dead-letter/retry state, remote-state recovery, and audit visibility are closed for the pre-RC
  blocker set. Active `operator-work.*`, process-attempt claim/retry/generation, scheduled worker
  handoff, dependency backup/restore process-attempt claim/completion, runtime capacity, retention,
  audit/event, scheduled retention, SSH diagnostics/recovery/migration evidence, and explicit old
  remote-state marker prune evidence are recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md). Real destructive local/SSH
  prune smokes remain opt-in CI/secret-gated verification.

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
- Deployment retry/redeploy, rollback, dependency resources, storage, secrets, webhooks,
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
- [x] Representative GitHub Actions/local explicit real local Docker fixture smoke proves at least
  one static/frontend pair, one Node/server pair, and one Python/server pair can build, run, verify,
  and expose runtime metadata from the same resource profile vocabulary before ids-only deployment
  admission.

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
- [x] Add Spring Boot as the first named JVM web framework and Quarkus Maven JVM jar mode as the
  next deterministic JVM planner slice.
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
  Java, Quarkus Maven, Dockerfile, Docker Compose, prebuilt image, and explicit custom commands.
- [x] GitHub Actions/local explicit real Docker framework fixture smoke covers the active local slice:
  Next static export, Vite, React, Vue, Svelte, Solid, Angular, Astro, Nuxt generate, and SvelteKit
  static; Next SSR, Next standalone, Remix, Express, Fastify, NestJS, Hono, Koa, and generic Node;
  and FastAPI, generic ASGI, generic WSGI, Poetry Flask, Django, Flask, explicit custom Python,
  generic Java jar, Spring Boot Maven wrapper/no-wrapper, Quarkus Maven JVM jar mode, Spring Boot
  Gradle, and explicit-start JVM when dependency installation is available.
- [x] Unsupported frameworks fail with structured `validation_error` in `runtime-plan-resolution`
  unless explicit custom commands make a Docker/OCI image plan possible.
- [x] Web and CLI can collect the same draft fields for source base directory, publish directory,
  Dockerfile path, Compose path, build target, install/build/start commands, and internal port.
- [x] JavaScript/TypeScript tested catalog closure binds Next.js SSR/standalone/static export,
  Remix, Nuxt generate, SvelteKit static/ambiguous mode, Astro static, Vite/React/Vue/Svelte/Solid/
  Angular static SPA, Express/Fastify/NestJS/Hono/Koa, and generic package scripts to stable
  matrix ids, headless Docker/OCI fixture readiness tests, and `deployments.plan/v1` contract
  coverage.
- [x] JVM/Spring Boot/Quarkus tested catalog closure binds Spring Boot Maven with wrapper, Spring Boot
  Maven without wrapper, Spring Boot Gradle with wrapper, Spring Boot Gradle Kotlin DSL, generic
  JVM explicit-command fallback, generic deterministic jar fallback, Quarkus Maven JVM jar mode,
  unsupported JVM frameworks, ambiguous build-tool evidence, missing build tool, missing runnable
  jar, actuator health defaults, and internal-port behavior to stable matrix ids, headless
  Docker/OCI fixture readiness tests, and `deployments.plan/v1` contract coverage.

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
- Release-gate confidence is layered: fast hermetic checks cover supported catalog acceptance,
  deployment plan preview schema, framework fixture readiness, shared draft parity,
  unsupported/ambiguous planner evidence, and public docs/help anchor checks, while nightly and
  release workflows also call the shared real local Docker and generic-SSH fixture smoke gates.
  The real local Docker matrix runs on GitHub runners by default; generic-SSH evidence is
  secret-gated and can fail closed on release dispatch when maintainers require it.
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
- [x] Select `0.9.0` only when all required Phase 7 items, earlier phase items, and exit criteria
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
- 2026-05-14 Phase 7 storage runtime slice extended Resource attachment snapshots with volume
  kind/source metadata and taught local/generic-SSH Docker container execution to render
  `storage.mounts` as deterministic Docker `--mount` flags.
- 2026-05-14 Phase 7 storage Compose realization slice taught local/generic-SSH Docker Compose
  execution to consume the same `storage.mounts` metadata through the generated Appaloft Compose
  override file.
- 2026-05-14 Phase 7 storage Swarm image-service realization slice taught Docker Swarm image
  service apply plans to consume `storage.mounts` as deterministic `docker service create --mount`
  flags. Web Resource detail can now create/rename/delete provider-neutral storage volume records
  and attach/detach them from Resource profiles.
- 2026-05-15 Phase 7 storage runtime cleanup slice implemented the dry-run-first
  `storage-volumes.cleanup-runtime` command for local-shell and generic-SSH Docker named-volume
  inspection/cleanup through CLI and HTTP/oRPC, separate from both `storage-volumes.delete` and
  `servers.capacity.prune`.
- 2026-05-15 Phase 7 storage runtime cleanup safety-evidence slice connected retained deployment
  snapshot and rollback-candidate read-model evidence into `storage-volumes.cleanup-runtime`, so
  destructive cleanup now blocks when selected Docker named-volume data is still referenced by
  retained deployment snapshots or rollback candidates on the same server. Backup/restore,
  provider-native storage handles, and bind-mount path cleanup remain open.
- 2026-05-15 Phase 7 storage runtime cleanup backup-safety slice added a storage backup safety
  reader seam and `backup-restore-in-flight` runtime blocker so future storage backup/restore work
  can prevent destructive Docker named-volume cleanup through the same command. Storage
  backup/restore operations themselves, provider-native storage handles, and bind-mount path
  cleanup remain open.
- 2026-05-15 Phase 7 storage runtime cleanup Web slice added Resource detail controls for
  dry-run-first scoped runtime cleanup through `storage-volumes.cleanup-runtime`, including
  server-scoped preview, bounded result diagnostics, and destructive confirmation before
  `dryRun = false`.
- 2026-05-15 Phase 7 Swarm Compose storage realization slice implemented bounded Docker Swarm
  Compose candidate stack deploy planning with generated Appaloft overrides for storage mounts,
  runtime env/secret references, identity labels, and edge network attachment. Superseded
  Appaloft-labeled stacks/services are cleaned during deployment execution.
- 2026-05-15 Phase 7 Swarm Compose storage smoke slice added an environment-gated real Docker
  Swarm smoke for Compose stack deployment with generated storage mount override, Traefik route
  verification, Appaloft named-volume creation proof, scoped stack cleanup, and volume cleanup.
  The smoke remains skipped by default and runs through `APPALOFT_DOCKER_SWARM_SMOKE=1` /
  `bun run smoke:swarm`.
- 2026-05-15 Phase 7 storage runtime ownership-evidence slice made deployment execution label
  Docker named-volume realizations with Appaloft ownership metadata for Docker run and
  Compose/Swarm stack paths. Runtime cleanup now requires matching ownership labels and reports
  `ownership-unproven` for unlabeled or mismatched named volumes, while target-mutating proof stays
  in GitHub Actions/local explicit smoke gates rather than default local checks.
- 2026-05-14 Phase 7 dependency backup/restore provider-context slice extended the provider port
  inputs with safe execution context (`providerResourceHandle`, masked endpoint, and safe
  `secretRef`) for create-backup and restore-backup and aligned shell/test support for
  Appaloft-managed Redis backups with the managed Redis closed-loop contract. The shell provider
  now writes safe local backup/restore artifact metadata under the configured data directory and
  validates backup artifacts during restore. A later 2026-05-15 native Postgres backup slice taught
  the shell provider to resolve Appaloft-owned Postgres connection refs and run bounded
  provider-native `pg_dump`/`pg_restore` commands while keeping raw connection values out of
  artifacts, read models, events, errors, and transport contracts. A follow-up Redis slice added
  shell-native logical Redis backup/restore for resolvable Appaloft-owned Redis connection refs;
  provider-specific Redis snapshot substrates remain governed follow-up work for providers that
  need snapshot-native restore semantics beyond the shell logical path.
- 2026-05-15 Phase 7 dependency-resource Web affordance slice added Resource detail Settings
  controls for managed Postgres/Redis provision, project/environment dependency list, ready
  dependency bind as runtime-only env targets, active binding list, unbind, and public help links
  through the typed oRPC client with i18n coverage. Import, backup/restore, scheduled backup
  policy, backup prune/delete, and cross-resource restore remained future Web work at that point.
- 2026-05-15 Phase 7 dependency-resource Web administration slice added Resource detail
  rename/delete controls for dependency resource records through the typed oRPC client. Delete stays
  disabled when dependency delete-safety blockers are present, and the remaining Web administration
  gap was import, backup/restore, scheduled backup policy, backup prune/delete, and cross-resource
  restore at that point.
- 2026-05-15 Phase 7 dependency-resource backup/restore Web slice added Resource detail controls
  for backup create, safe restore-point list, and acknowledged in-place restore through the typed
  oRPC client. Restore requires explicit overwrite and no-runtime-restart acknowledgements, and the
  remaining Web administration gap was import, scheduled backup policy, backup prune/delete,
  export/download, and cross-resource restore at that point.
- 2026-05-15 Phase 7 dependency-resource import Web slice added Resource detail controls for
  importing external Postgres/Redis dependency resources through the typed oRPC client and safe
  connection boundary. The remaining Web administration gap is scheduled backup policy, backup
  prune/delete, export/download, and cross-resource restore.
- 2026-05-15 Phase 7 dependency binding secret rotation Web slice added Resource detail controls
  for rotating active binding secret references through the typed oRPC client. The form requires
  exactly one safe secret input and the historical-snapshot acknowledgement before submit; provider
  native credential rotation, runtime restart/redeploy, scheduled backup policy, backup
  prune/delete, export/download, and cross-resource restore remain separate work.
- 2026-05-15 runtime monitoring Project detail rollup slice added project-scope and selected
  environment-scope rollup-only readback through the typed oRPC client. Server/resource Monitor tabs
  still own retained samples, links, and exact-scope CPU/memory/disk threshold configuration.
  WebView Observe verification, sample-evidence-based threshold inheritance, and MCP/tool handler
  dispatch are active; cross-window log/event filtering and richer observability navigation remain
  governed follow-up slices.
- 2026-05-04 Phase 7 Postgres dependency resource lifecycle baseline implemented
  provider-neutral provision/import/list/show/rename/delete over `ResourceInstance`, with masked
  connection read models, later binding readiness, backup relationship metadata placeholders,
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
  provider-native Redis infrastructure or materialize Redis runtime environment injection yet, so
  the full `0.9.0` release rule remains blocked by provider-native database realization,
  backup/restore, recovery, auto-deploy, preview, and cluster runtime items.
- 2026-05-06 Phase 7 Redis dependency binding safe snapshot reference Code Round allowed ready
  imported Redis dependency resources to bind to Resources and appear in safe deployment snapshot
  references with kind `redis`. Managed Redis binding, provider-native Redis infrastructure, and
  store-backed runtime secret value resolution were still open at that point, so the Redis closed
  loop exit criterion was not closed by this slice.
- 2026-05-06 Phase 7 dependency binding runtime injection Spec Round added ADR-040 plus
  `docs/specs/047-dependency-binding-runtime-injection` to govern how active ready Postgres and
  imported Redis bindings become runtime environment inputs through `deployments.plan`,
  `deployments.create`, and runtime target adapters.
- 2026-05-06 Phase 7 dependency binding runtime injection Code Round slice materialized safe
  runtime secret references into deployment snapshots, changed plan/show contracts to
  `ready | blocked | not-applicable`, rejected active non-injectable bindings before deployment
  acceptance with `dependency_runtime_injection_blocked`, and routed safe dependency secret handles
  through single-server and Swarm adapters. Store-backed resolution of Appaloft secret references
  into raw dependency connection values and public docs were still open at that point, so
  Postgres/Redis closed-loop exit criteria were not yet closed by this slice.
- 2026-05-06 Phase 7 dependency runtime secret value resolution Spec Round added
  [ADR-041](./decisions/ADR-041-dependency-runtime-secret-value-resolution.md) plus
  [Dependency Runtime Secret Value Resolution](./specs/048-dependency-runtime-secret-value-resolution/spec.md)
  to govern imported Postgres/Redis connection value storage, managed Postgres reference
  validation, deployment blocked readiness for unresolved refs, single-server runtime env
  resolution, and Docker Swarm secret materialization. It did not implement the Code Round yet, so
  Postgres/Redis closed-loop exit criteria were not yet closed by this slice.
- 2026-05-06 Phase 7 dependency secret value storage Code Round slice added a
  `DependencyResourceSecretStore` application port, PG/PGlite-backed `dependency_resource_secrets`
  storage/resolution, shell DI wiring, and import use-case integration so imported Postgres and
  Redis connection URLs are stored behind safe `appaloft://dependency-resources/.../connection`
  refs. Deployment unresolved-ref blocking, managed Postgres reference validation, and runtime
  target value materialization were still open at that point, so Postgres/Redis closed-loop exit
  criteria were not yet closed by this slice.
- 2026-05-06 Phase 7 managed Postgres secret reference validation Code Round slice now validates
  Appaloft-owned provider realization refs through the dependency resource secret store before
  marking binding readiness ready; unresolved refs keep provider realization ready but binding
  readiness blocked with safe reason metadata. Deployment plan/create unresolved-ref blocking and
  runtime target value materialization were still open at that point, so Postgres/Redis closed-loop
  exit criteria were not yet closed by this slice.
- 2026-05-06 Phase 7 dependency runtime unresolved-ref blocking Code Round slice now validates
  captured Appaloft-owned dependency runtime refs during `deployments.plan` and
  `deployments.create`, reports `dependency_runtime_secret_unresolved` safely in plan output, and
  rejects create before deployment acceptance when resolution fails. Runtime target value
  materialization was still open at that point, so Postgres/Redis closed-loop exit criteria were not
  yet closed by this slice.
- 2026-05-06 Phase 7 single-server dependency runtime secret materialization Code Round slice now
  resolves Appaloft-owned dependency refs into execution-only environment values for local-shell
  and generic-SSH runtimes, includes dependency target env vars in Docker container launch specs,
  and redacts resolved values in display/output paths. At that point, Docker Swarm secret
  materialization and historical rotated-ref execution coverage remained open, so Postgres/Redis
  closed-loop exit criteria remained open.
- 2026-05-06 Phase 7 Docker Swarm dependency runtime secret materialization Code Round slice now
  resolves Appaloft-owned dependency refs into deployment-scoped Docker secrets before Swarm
  service update and keeps sanitized service intent on Docker secret handles. Historical
  rotated-ref execution coverage was still open at that point, so Postgres/Redis closed-loop exit
  criteria were not yet closed by this slice.
- 2026-05-06 Phase 7 historical rotated dependency ref resolution Code Round slice now resolves
  retained `appaloft+pg://resource-binding/...` binding secret refs through the runtime resolver,
  keeps old deployment snapshots on their captured refs, and verifies new deployments can use a
  rotated ref only after it is resolvable. Final Postgres/Redis closed-loop exit verification was
  completed by later managed Redis and managed Postgres closed-loop verification slices.
- 2026-05-06 Phase 7 Redis provider-native realization Spec Round added
  [Redis Provider-Native Realization](./specs/049-redis-provider-native-realization/spec.md) to
  position `dependency-resources.provision-redis`, `resources.bind-dependency`, and
  `dependency-resources.delete` for managed Redis realization, binding readiness, runtime secret
  resolvability, and provider cleanup. It does not implement the Code Round yet, so the Redis
  closed-loop exit criterion remains open.
- 2026-05-06 Phase 7 Redis provider-native realization Code Round implemented application-level
  managed Redis realization through an injected provider capability, including acceptance-first
  provision, safe realization success/failure read models, realized-ready binding admission,
  unsupported-provider rejection, and provider cleanup during delete. Persistence/contract/runtime
  materialization coverage and final Redis closed-loop verification were completed by later managed
  Redis materialization, delete-safety, entrypoint, and closed-loop verification slices.
- 2026-05-06 Phase 7 managed Redis runtime materialization coverage slice removed the old
  deployment-snapshot source-mode block for realized managed Redis, added deployment snapshot,
  single-server runtime resolver, Docker Swarm secret-handle, PGlite read-model, and contract tests
  for managed Redis safe realization metadata and `REDIS_URL` delivery. Final Redis observe and
  backup/restore-or-delete closed-loop verification was completed by later Redis safety and
  closed-loop verification slices.
- 2026-05-06 Phase 7 managed Redis delete safety coverage slice verified realized managed Redis
  delete is blocked by active binding, backup retention, and retained deployment snapshot/reference
  blockers before provider cleanup runs. Final Redis observe and closed-loop verification was
  completed by later Redis closed-loop verification slices.
- 2026-05-06 Phase 7 managed Redis entrypoint contract coverage slice verified provider-native
  Redis realization reuses the existing operation catalog entries, CLI commands, and HTTP/oRPC
  routes for provision, bind, and delete without leaking provider SDK shapes or raw secret fields.
  Final Redis observe and closed-loop verification was completed by later Redis closed-loop
  verification slices.
- 2026-05-06 Phase 7 managed Redis bind blocker coverage slice verified pending, failed, deleted,
  and unresolved Appaloft-owned connection-ref managed Redis resources cannot create
  `REDIS_URL` bindings. Final Redis observe and closed-loop verification was completed by later
  Redis closed-loop verification slices.
- 2026-05-06 Phase 7 managed Redis secret-value storage slice stores provider-returned raw Redis
  connection values through `DependencyResourceSecretStore` before marking binding readiness ready.
  Final Redis observe and closed-loop verification was completed by the later Redis closed-loop
  verification slice.
- 2026-05-06 Phase 7 managed Redis closed-loop verification slice proved provision -> bind ->
  deploy -> observe logs/status -> backup/restore for a store-backed Appaloft-owned Redis
  connection ref without exposing raw Redis material. The Redis closed-loop exit criterion is now
  closed; the Postgres closed-loop exit criterion was still open until the following Postgres
  closed-loop verification slice.
- 2026-05-06 Phase 7 managed Postgres closed-loop verification slice proved provision -> bind ->
  deploy -> observe logs/status -> backup/restore for managed Postgres without exposing raw
  Postgres material. The Postgres closed-loop exit criterion is now closed.
- 2026-05-05 Phase 7 Postgres provider-native realization Spec Round positioned
  `dependency-resources.provision-postgres`, `resources.bind-dependency`, and
  `dependency-resources.delete` for managed Postgres realization, bind readiness, and provider
  cleanup semantics. It does not implement the Code Round yet, so the full `0.9.0` release rule
  remains blocked by provider-native database realization, backup/restore, recovery, auto-deploy,
  preview, and cluster runtime items.
- 2026-05-05 Phase 7 Postgres provider-native realization Code Round implemented durable
  realization state, injected managed Postgres provider capability, safe provider handles and
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
  `DependencyResourceBackup` state, injected backup/restore provider capability, safe backup
  list/show read models, CLI and oRPC/HTTP entrypoints, lifecycle events, restore acknowledgements,
  and delete-safety blockers for retained backups. Later Resource-detail Web slices added managed
  Postgres/Redis provision, dependency rename/delete, ready binding, active binding list, unbind,
  backup create/list/acknowledged restore, and help affordances; import administration and
  provider-native Redis were separate follow-up slices, so the full `0.9.0` release rule remained
  blocked by recovery, auto-deploy, preview, and cluster runtime items at that point.
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
- 2026-05-06 Phase 7 deployment recovery rebuild-required sync closed the exposed recovery-command
  exit criterion: `deployments.retry`, `deployments.redeploy`, and `deployments.rollback` are active
  under ADR-034 with readiness, command specs, operation catalog, CLI, HTTP/oRPC, Web recovery
  affordances, public docs/help, and targeted tests aligned. Cancel, deployment-scoped manual health
  check, and write-side reattach remain rebuild-required because they are not exposed.
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
  mapping, and `scripts/test/deploy-action-wrapper.test.ts` coverage. The reference is now
  promoted to the public `appaloft/deploy-action` repository with Marketplace docs/examples, public
  wrapper CI, and cleanup examples.
- 2026-05-05 Phase 7 deploy-action preview-output slice added CLI `--preview-output-file`
  handling and wrapper temp-file parsing so Action PR previews can publish generated/default or
  custom `preview-url` values from deployment read models instead of deriving only from templates.
  Public `appaloft/deploy-action` promotion is now complete.
- 2026-05-05 Phase 7 existing-resource profile-drift help slice closed the stable public
  `resource.profile-drift` help topic, Web Resource diagnostics help link, CLI `resource show`
  help target, HTTP route description, docs traceability, and matrix/task sync. Default
  existing-resource drift remains fail-before-deploy; effective configuration drift redaction is
  retained as a focused follow-up under `RES-PROFILE-DRIFT-003`.
- 2026-05-05 Phase 7 generated MCP/tool descriptor slice replaced the stale hand-maintained
  `@appaloft/ai-mcp` tool list with descriptors generated from
  `packages/application/src/operation-catalog.ts`. `MCP-TOOL-DESC-001` through
  `MCP-TOOL-DESC-003` assert one descriptor per operation key, stable operation-key tool names,
  serializable CLI/API metadata, and high-value deployment/resource/source-event mappings.
- 2026-05-05 Phase 7 scheduled task resource Spec Round added ADR-039 and
  `docs/specs/044-scheduled-task-resource-shape` to position Resource-owned scheduled task
  definitions, run attempts, task-run logs, scheduler admission, and deployment-boundary separation.
  Operation catalog entries, persistence, scheduler/runtime execution, entrypoints, and public docs
  were still open at that point and are implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task core-domain slice added Resource-owned scheduled task
  definition value objects and state for schedule, timezone, command intent, timeout, retry, and
  lifecycle status, plus `forbid` concurrency validation. Run attempts, persistence,
  scheduler/runtime execution, entrypoints, and public docs were still open at that point and are
  implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task run-attempt core slice added Resource/task-owned run attempt
  state with manual/scheduled trigger kind, accepted/running/succeeded/failed/skipped transitions,
  safe exit/failure details, and no Deployment id. Application run admission, persistence,
  scheduler/runtime execution, entrypoints, and public docs were still open at that point and are
  implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task application-contract slice added inactive command/query
  schemas, messages, result DTOs, and read-model ports for scheduled task definitions, run-now,
  run history, and run logs while keeping operation catalog entries inactive. Application handlers,
  use cases, persistence, scheduler/runtime execution, entrypoints, and public docs were still open
  at that point and are implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task run-now admission slice added the inactive application
  handler/use case and repository ports to accept manual task runs as accepted run attempts without
  synchronous execution, including disabled-task and archived-Resource admission blockers. Remaining
  handlers/use cases, persistence, scheduler/runtime execution, entrypoints, and public docs were
  still open at that point and are implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task create admission slice added the inactive application
  handler/use case and definition repository upsert contract to validate and store Resource-owned
  task definitions, including archived-Resource and unsafe-command blockers. Update/delete/list/show
  handlers, persistence/read models, scheduler/runtime execution, entrypoints, and public docs were
  still open at that point and are implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task read-query slice added inactive task list/show, run list/show,
  and run-log query handlers/services over scheduled-task read-model ports with stable envelopes.
  Update/delete handlers, persistence/read models, scheduler/runtime execution, entrypoints, and
  public docs were still open at that point and are implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task configure admission slice added the inactive application
  handler/use case plus core VO-based definition patching to validate and store Resource-owned task
  configures, including archived-Resource and unsafe-command blockers. Delete handler,
  persistence/read models, scheduler/runtime execution, entrypoints, and public docs were still open
  at that point and are implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task delete admission slice added the inactive application
  handler/use case and explicit definition delete mutation spec to remove Resource-owned task
  definitions after ownership checks. Persistence/read models, scheduler/runtime execution,
  entrypoints, and public docs were still open at that point and are implemented by later
  scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task definition persistence slice added Postgres/PGlite storage and
  read models for Resource-owned task definitions, including find/upsert/delete repository specs and
  project/environment/Resource/status read filters. Run-attempt/log persistence,
  scheduler/runtime execution, entrypoints, and public docs were still open at that point and are
  implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task run-attempt persistence slice added Postgres/PGlite storage
  and read models for accepted/running/terminal task runs, plus latest-run summaries on task
  readbacks. Run-log persistence, scheduler/runtime execution, entrypoints, and public docs were
  still open at that point and are implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task run-log persistence slice added Postgres/PGlite storage and
  a run-scoped read model for scheduled task output with secret-looking message masking. Scheduler
  dispatch, runtime execution, entrypoints, and public docs were still open at that point and are
  implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task scheduler admission slice added an inactive application
  scheduler process manager, due-candidate reader port, and shared run admission service so due
  scheduled tasks record `scheduled` trigger run attempts through the same checks as run-now.
  Due-candidate persistence, shell runner, runtime execution, entrypoints, and public docs were
  still open at that point and are implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task runtime adapter slice added an inactive application
  scheduled-task runtime port and hermetic runtime adapter for one-off task command execution
  results, run-scoped stdout/stderr logs, exit codes, timestamps, and secret-looking output masking.
  Accepted-run worker wiring, due-candidate persistence, shell runner, entrypoints, and public docs
  were still open at that point and are implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task accepted-run worker slice added inactive application worker
  orchestration, run-attempt lookup, run-log recording, and Postgres/PGlite recorder support so
  accepted runs can transition through running to terminal state after runtime execution. Automatic
  shell/background runner wiring, due-candidate persistence, entrypoints, and public docs were still
  open at that point and are implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task due-candidate read-model slice added Postgres/PGlite
  scheduler candidate scanning for enabled tasks, timezone-aware current-minute schedule matching,
  and same-minute duplicate scheduled-run suppression. Automatic shell/background runner wiring,
  entrypoints, and public docs were still open at that point and are implemented by later
  scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task shell composition slice registered the inactive scheduled-task
  repositories, read models, due-candidate reader, run-log recorder, runtime port, command/query
  handlers, use cases, scheduler, and accepted-run worker in the shell DI root. Automatic
  shell/background runner wiring, entrypoints, and public docs were still open at that point and are
  implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task shell runner slice added explicitly enabled scheduled task
  runner config
  and long-running shell process wiring so enabled runners scan due tasks, admit scheduled runs,
  and drain admitted runs through the worker. Operation catalog entries, entrypoints, public docs,
  and broader secret masking coverage were still open at that point and are implemented by later
  scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task operation entrypoint slice activated
  `scheduled-tasks.*` and `scheduled-task-runs.*` in `CORE_OPERATIONS.md`, the operation catalog,
  and HTTP/oRPC routes with `SCHED-TASK-CATALOG-001`/`SCHED-TASK-ENTRY-001` coverage. CLI commands,
  Web controls, public docs/help, generated MCP descriptor verification, and broader secret masking
  coverage were still open at that point and are implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task CLI entrypoint slice added the `appaloft scheduled-task`
  command group for create/list/show/configure/delete/run and run-history list/show/logs. CLI,
  HTTP/oRPC, operation catalog, and generated MCP descriptor paths are active; Web controls, public
  docs/help, and broader secret masking coverage were still open at that point and are implemented
  by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task public docs/help slice added
  `/docs/resources/scheduled-tasks/#scheduled-task-resource-lifecycle`, registered
  `scheduled-task.resource-lifecycle`, and wired CLI/HTTP descriptions to the stable scheduled-task
  anchor. Web controls and broader secret masking coverage were still open at that point and are
  implemented by later scheduled-task slices.
- 2026-05-05 Phase 7 scheduled task secret redaction slice added shared scheduled-task secret
  detection/redaction for command intent, failure summaries, runtime output, runtime errors,
  persisted read models, and generated tool descriptors. Web controls remained open for the next
  scheduled-task entrypoint slice.
- 2026-05-05 Phase 7 scheduled task Web controls slice added Resource detail controls for
  scheduled-task list/create, run-now, enable/disable, delete, recent run history, run-scoped logs,
  and the stable scheduled-task public help anchor. Provider-native scheduled jobs are tracked as a
  future provider-extension slice rather than a blocker for the current Appaloft-owned runtime
  baseline.
- 2026-05-05 Phase 7 scheduled task roadmap sync marked the scheduled-task Code Round implemented
  after active operation catalog, HTTP/oRPC, CLI, Web, generated MCP descriptor, public docs/help,
  persistence, scheduler, worker, runtime, run history, logs, and secret-redaction coverage landed.
  The scheduled-task runner is disabled by default and starts only when shell processes explicitly
  enable it.
- 2026-05-14 Phase 7 scheduled task local Docker runtime slice extended the real scheduled-task
  runtime port from generic-SSH Docker containers to local-shell Docker containers as well, keeping
  task output run-scoped and leaving Docker Compose, Swarm, provider-native scheduled jobs, and
  richer workload context injection as the remaining runtime gaps at that point.
- 2026-05-14 Phase 7 scheduled task Docker Compose runtime slice extended the same real runtime
  port to local-shell and generic-SSH Docker Compose deployments. Compose task runs now render
  `docker compose run --rm --no-deps` against retained compose file/project/target-service metadata
  and keep stdout/stderr run-scoped. Docker Swarm and system-owned workload context injection were
  completed by later scheduled-task runtime slices; provider-native scheduled jobs remain a governed
  provider-extension follow-up.
- 2026-05-14 Phase 7 scheduled task Docker Swarm runtime slice extended the real runtime port to
  Swarm OCI-image services. Swarm task runs create a temporary Appaloft-labeled replicated-job
  service on the retained Swarm network, stream `docker service logs` into the scheduled task run,
  and remove the temporary service after success, failure, or timeout. System-owned workload context
  injection was completed by a later scheduled-task runtime slice; provider-native scheduled jobs
  remain a governed provider-extension follow-up.
- 2026-05-15 Phase 7 scheduled task real-runtime confidence sync wired the local Docker and
  generic-SSH scheduled-task smoke proofs into `.github/workflows/scheduled-task-e2e.yml` for
  nightly/release gates. Local developer runs remain explicit through
  `bun run smoke:scheduled-task:docker`, `bun run smoke:scheduled-task:ssh`, and
  `bun run smoke:scheduled-task`; release dispatch can require SSH evidence and fail closed when
  target secrets are absent.
- 2026-05-14 Phase 7 scheduled task runtime context slice injects stable system-owned
  `APPALOFT_*` variables into hermetic, Docker container, Docker Compose, and Docker Swarm task
  processes. The injected context covers run/task/resource identity and runtime-owning deployment
  identity, and reserved system values override user-supplied same-name variables. Provider-native
  scheduled jobs remain future provider-extension work.
- 2026-05-14 Phase 7 terminal container exec slice taught resource terminal sessions on
  `local-shell` targets to use retained Docker `containerName` metadata and open the terminal
  through `docker exec` instead of the host workspace. Generic SSH Docker exec is wired in the
  runtime gateway; later slices closed focused SSH adapter coverage, Compose service shells,
  explicit interactive CLI TTY attach, deployment-detail deep links, WebView attach coverage,
  resize-frame forwarding, and safe audit metadata. Local true PTY resize and provider-native
  terminals remain governed runtime/provider follow-ups.
- 2026-05-14 Phase 7 terminal runtime exec coverage slice closed the focused runtime adapter
  coverage gap for generic-SSH Docker `exec` and added Docker Compose service `exec` command
  construction for both local-shell and generic-SSH targets when retained runtime metadata resolves
  the Compose file/project and service. Later terminal slices closed direct interactive CLI TTY
  attach, deployment-detail deep links, and WebView terminal attach coverage; local true PTY resize
  remains a governed runtime backend follow-up.
- 2026-05-14 Phase 7 terminal CLI attach slice added explicit `--attach` handling for
  `server terminal` and `resource terminal`, bridging local stdin/stdout/stderr to the accepted
  gateway session, forwarding initial rows/cols to the session, and restoring raw-mode state on
  close. Descriptor-only output remains the default for scriptable workflows. Later terminal slices
  closed deployment-detail deep links and WebView attach coverage; local true PTY resize and
  provider-native terminals remain governed follow-ups.
- 2026-05-15 Phase 7 terminal deployment deep-link slice added Web deployment-detail links to the
  Resource terminal tab with the selected `deploymentId`, and Resource terminal now passes that
  deployment id to the existing resource-owned `terminal-sessions.open` command. WebView terminal
  attach coverage, close-frame cleanup, resize-frame forwarding, and audit metadata are active;
  local true PTY resize and provider-native terminals remain governed follow-ups.
- 2026-05-15 Phase 7 terminal resize-frame sync covered HTTP WebSocket resize routing and CLI
  attach initial-size forwarding under `TERM-SESSION-TRANSPORT-003`. Local true PTY resize remains a
  runtime backend follow-up because the Bun pipe-backed runtime session still has no PTY resize
  primitive.
- 2026-05-15 Phase 7 terminal audit metadata slice wired the runtime gateway to the configured
  audit recorder so terminal opens and closes write durable safe audit rows under
  `TERM-SESSION-LIFE-006`. Terminal input/output, raw commands, private keys, access tokens, and
  environment secret values are not retained.
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
- 2026-05-06 Phase 7 deployment target parity sync closed the target-surface exit criterion:
  single-server Docker/Compose remains covered by the zero-to-SSH supported catalog harness, and
  the Docker Swarm backend is active by default with real smoke evidence for apply, route
  realization, registry-authenticated image pull, secret-safe metadata, and scoped cleanup. Both
  paths use the same ids-only `deployments.create` admission boundary.
- 2026-05-05 Phase 7 product-grade preview deployment Spec Round positioned GitHub
  App/control-plane previews as a separate workflow from Action-only previews, with
  `docs/specs/046-product-grade-preview-deployments` and
  `docs/testing/product-grade-preview-deployments-test-matrix.md` covering preview policy,
  environment identity, scoped preview config, ids-only deployment dispatch, feedback,
  cleanup retries, quotas, and public-surface requirements. Subsequent incremental Code Rounds closed the active baseline; remaining work is public enablement and provider hardening.
- 2026-05-06 Phase 7 product-grade preview policy evaluator slice added initial normalized
  GitHub pull-request policy evaluation for verified same-repository events, unverified events,
  default fork blocking, secret-backed fork blocking, and opt-in fork previews without secrets.
  Preview environment state, deployment dispatch, read models, GitHub App ingestion, feedback,
  cleanup retry, and entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 product-grade preview environment domain slice added foundational core
  `PreviewEnvironment` state for scoped project/environment/resource/target placement, safe source
  fingerprint and pull-request context, expiry checks, and cleanup-request transition. Persistence,
  read models, deployment dispatch, GitHub App ingestion, feedback, cleanup retry, and entrypoints
  remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 product-grade preview environment persistence slice added Postgres/PGlite
  preview environment storage, lookup by id/source scope, safe list/show read models, lifecycle
  status readback, and scoped delete while retaining owner Resource state. Deployment dispatch,
  GitHub App ingestion, feedback, cleanup retry, and entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 product-grade preview lifecycle application slice added initial
  `PreviewLifecycleService` coverage for eligible pull-request policy results creating/updating
  preview environments and dispatching one ids-only deployment request. GitHub App ingestion,
  blocked-event read models, feedback, cleanup retry, and entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview policy operation-contract slice added inactive
  `preview-policies.configure` and `preview-policies.show` command/query schemas, handlers,
  repository/read-model ports, operation catalog entries, and tests. Durable policy persistence,
  active transports, GitHub App ingestion, feedback, cleanup retry, and preview environment
  entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview policy persistence slice added Postgres/PGlite storage and shell
  wiring for inactive `preview-policies.configure` / `preview-policies.show` operation contracts.
  Safe read models now return configured or default project/Resource policy summaries without
  exposing idempotency keys, provider payloads, or secret material. Active transports, GitHub App
  ingestion, feedback, cleanup retry, and preview environment entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview blocked-policy projection slice added application and Postgres/PGlite
  projection of blocked preview policy decisions by source event id. Fork policy blocks now expose
  safe reason/readback details and requested secret scope counts without dispatching deployments or
  storing secret names/provider tokens. GitHub App ingestion, feedback, cleanup retry, and active
  preview environment entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview policy quota/TTL slice added active preview quota settings,
  `preview_quota_exceeded` blocking, preview TTL-derived environment expiry, and Postgres/PGlite
  readback for safe quota/expiry policy decision details. Scheduler cleanup for expired previews,
  GitHub App ingestion, feedback, cleanup retry, and active preview environment entrypoints
  remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview GitHub pull-request event slice added an integration-boundary
  verifier/normalizer for signed `pull_request` webhooks. It emits only safe preview lifecycle
  facts, rejects invalid signatures, unsupported actions, and unsafe payloads. Actual GitHub App
  route wiring, dedupe/idempotency, feedback, cleanup retry, and active preview environment
  entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview duplicate-event slice added source-event-id dedupe to the preview
  lifecycle service. Duplicate deliveries now return the stored preview policy decision without
  mutating preview environment state or dispatching another ids-only deployment request. Feedback
  and cleanup idempotency remain tied to their future process-state slices.
- 2026-05-06 Phase 7 preview scoped-config slice added an application resolver over
  `resources.effective-config` that defaults to copying no production secrets or durable routes,
  resolves only explicit preview variables/secret references, and keeps raw or masked secret values
  out of preview resolution output. Full lifecycle process-manager wiring, GitHub App routes,
  feedback, cleanup retry, and active preview environment entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview deployment-dispatch slice bound preview dispatch to the existing
  `deployments.create` admission adapter and added explicit `PG-PREVIEW-DEPLOY-001` coverage that
  only ids cross the deployment boundary. Pull-request/source/route/preview details remain
  read-model or process context. GitHub App routes, feedback, cleanup retry, and active preview
  environment entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview pull-request ingestion slice added an application service that routes
  safe normalized GitHub pull-request preview facts into preview lifecycle using selected
  control-plane context. This initial slice left closed-event cleanup ignored until cleanup process
  state existed. GitHub App HTTP routes, feedback, cleanup retry, and active preview environment
  entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview deployment process-manager slice composed policy evaluation,
  preview environment state, ids-only deployment dispatch, and PR-comment feedback. Accepted
  preview deployments now publish idempotent source-event-keyed `github-pr-comment` feedback, and
  retryable feedback failures preserve the accepted deployment result while recording safe feedback
  state. GitHub check/deployment-status writers, GitHub App HTTP routes, cleanup adapters, and
  active preview environment entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview feedback application slice added initial feedback writer/recorder
  ports and a service for idempotent PR comment/check/status updates. Existing provider feedback
  ids are reused for update-in-place, and retryable provider failures are recorded as safe feedback
  state without turning the accepted deployment path into `err`. Durable feedback persistence,
  GitHub App HTTP routes, cleanup retry, and active preview environment entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview feedback persistence slice added Postgres/PGlite storage and shell
  wiring for idempotent provider feedback state keyed by feedback key. The record keeps provider
  feedback ids, channel/status, safe error codes, retryable state, and update timestamps without
  persisting feedback body text, provider payloads, tokens, or secret-shaped values. GitHub
  feedback writer adapters, GitHub App HTTP routes, cleanup retry, and active preview environment
  entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview GitHub PR comment feedback slice added a hermetic GitHub integration
  writer for product-grade preview PR comments. It creates comments, updates existing comments by
  provider feedback id, classifies retryable provider failures safely, and omits response bodies,
  tokens, and feedback body text from returned errors. Check/deployment-status writers, shell
  wiring, GitHub App HTTP routes, cleanup retry, and active preview environment entrypoints
  remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview GitHub check-run feedback slice added a hermetic GitHub integration
  writer for product-grade preview check runs plus composite GitHub feedback routing for comments
  and checks. It resolves pull-request head SHA safely, creates check runs, updates existing check
  runs by provider feedback id, and keeps deployment-status feedback unsupported until the feedback
  input carries the required provider deployment identity. GitHub App HTTP routes, cleanup adapters,
  and active preview environment entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview feedback shell-wiring slice registered a request-scoped GitHub
  preview feedback writer in the shell composition. It obtains the GitHub token through the
  existing integration auth port per publish call, returns a safe validation error when GitHub is
  not connected, and delegates supported PR comment/check feedback to the GitHub integration
  writer. Deployment-status feedback, GitHub App HTTP routes, cleanup retry, and active preview
  environment entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview cleanup application slice added a service that marks durable preview
  environment cleanup requested without deleting preview history, then delegates runtime, route,
  source-link, provider metadata, and feedback cleanup to a safe source-scope port. Concrete
  cleanup adapters, cleanup retry state, GitHub App HTTP routes, and active preview environment
  entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview cleanup retry slice added application attempt state for cleanup
  retries. Each cleanup run gets a fresh `pcln_*` attempt id, retryable provider/adapter failures
  record safe owner, phase, error code, and next retry time, and responses omit provider error text.
  Durable cleanup attempt persistence, scheduler dispatch, concrete cleanup adapters, GitHub App
  HTTP routes, and active preview environment entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview cleanup attempt persistence slice added Postgres/PGlite storage and
  shell wiring for durable cleanup retry records keyed by `pcln_*` attempt id. Stored state keeps
  preview environment id, Resource id, source fingerprint, owner, status, phase, retry timing, and
  safe error code without provider error text, tokens, or secret-shaped values. Scheduler dispatch,
  concrete cleanup adapters, GitHub App HTTP routes, and active preview environment entrypoints
  remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview cleanup retry scheduler slice added an application scheduler and
  durable due-candidate reader for `preview_cleanup_attempts`. The reader returns latest due
  `retry-scheduled` attempts only, and the scheduler dispatches them through the cleanup service so
  retries create fresh `pcln_*` attempt ids. Concrete cleanup adapters, GitHub App HTTP routes, and
  active preview environment entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview cleanup retry runner slice added a disabled-by-default shell runner
  and config block for `previewCleanupRetryScheduler`. The runner is only resolved when explicitly
  enabled so normal boot does not require the future concrete cleanup adapter. Concrete cleanup
  adapters, GitHub App HTTP routes, and active preview environment entrypoints remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview cleanup retry runner coverage slice added shell runner tests for
  disabled startup, system actor context, batch-size forwarding, and the in-process non-overlap
  guard that skips interval ticks while a scheduler run is active.
- 2026-05-06 Phase 7 preview environment surface-contract slice added inactive
  `preview-environments.list`, `preview-environments.show`, and `preview-environments.delete`
  application contracts plus operation catalog entries. List/show read from the safe preview
  environment read model, delete uses cleanup-service input, and the transports were introduced as
  inactive contracts at that point. Later slices wired the active CLI/API/Web/future MCP surfaces
  through the product-grade control-plane route.
- 2026-05-06 Phase 7 preview GitHub pull-request HTTP route slice wired signed
  `pull_request` deliveries on `/api/integrations/github/source-events` to
  `IngestPreviewPullRequestEventCommand` through `CommandBus`, using trusted Appaloft preview
  context headers for project/environment/Resource/server/destination/source-fingerprint selection.
  Follow-up repository and installation mapping was still required at that point before active
  GitHub App worker transports; later slices closed that baseline with safe repository-context
  mapping and worker-token feedback transport.
- 2026-05-06 Phase 7 preview closed-event cleanup slice routed GitHub `pull_request.closed`
  ingestion through source-scope preview environment lookup into the preview cleanup service.
  Existing previews now preserve history while requesting runtime/route/source-link/provider/
  feedback cleanup, and missing previews return an idempotent ignored result. Active GitHub App
  preview worker transports remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview cleanup feedback slice added latest-feedback lookup by preview
  environment/channel, cleanup-side PR-comment updates through the existing idempotent feedback
  writer path, skipped cleanup feedback when no prior feedback exists, and safe retryable failure
  propagation into cleanup retry handling. Active GitHub App preview worker transports remained
  open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview deployment-status publication slice made the preview deployment
  process manager publish idempotent `github-deployment-status` feedback after accepted ids-only
  deployment dispatch. The GitHub feedback writer now creates a transient GitHub preview deployment
  from the pull-request head SHA when automatic feedback has no provider deployment id yet, records
  that deployment id for later append-only status updates, and keeps retryable provider failures in
  safe feedback state without rewriting the accepted deployment result. Active GitHub App preview
  worker transports remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview cleanup scheduler lease slice wrapped enabled shell
  `previewCleanupRetryScheduler` ticks in the existing durable mutation coordinator under the
  `preview-lifecycle` coordination scope. Multiple shell processes now share a bounded lease for
  cleanup retry scans while the in-process non-overlap guard remains as local protection.
  Active GitHub App preview worker transports were closed by later slices.
- 2026-05-06 Phase 7 preview terminal metadata cleanup slice made cleanup-side feedback mark the
  latest GitHub deployment-status feedback `inactive` when a provider deployment record exists.
  The shell cleaner now reports that inactive status append as provider metadata removal while
  retaining retryable provider failures in safe cleanup retry state. Active GitHub App preview
  worker transports remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview GitHub repository-context mapping slice made the signed
  `pull_request` HTTP route resolve preview context from the source-event policy reader when trusted
  Appaloft headers are absent. The route maps GitHub repository full name/provider repository id and
  base ref to project/environment/Resource/server/destination/source-fingerprint context, carries
  GitHub installation id only as safe verification detail, and still rejects ambiguous or missing
  policy matches before command dispatch. Active GitHub App preview worker transports remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview GitHub safe-metadata propagation slice ensured the
  `IngestPreviewPullRequestEventCommandHandler` preserves safe provider repository id and
  installation id facts when handing signed GitHub preview events to the application ingest service.
  Active GitHub App preview worker transports remained open at that point and were closed by later slices.
- 2026-05-06 Phase 7 preview worker feedback transport slice added an explicit
  `APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN` runtime configuration path for webhook and cleanup
  scheduler contexts where no request-scoped GitHub OAuth token exists. The shell feedback writer
  still prefers request-scoped GitHub auth when present, falls back to the worker token for system
  contexts, and returns safe `preview-feedback` validation errors when neither token source exists.
  Full GitHub App installation-token onboarding and broader hosted provider smoke coverage remain
  future public enablement work rather than a Phase 7 Code Round blocker.
- 2026-05-15 Phase 7 preview provider smoke gate added a secret-gated live GitHub PR-comment
  feedback probe. `bun run smoke:preview-provider:github` updates a marker comment on a configured
  pull request, `.github/workflows/preview-provider-e2e.yml` runs the same gate for nightly/release,
  and manual releases can require it with `require_preview_provider_e2e=true`.
- 2026-05-05 Phase 7 preview deployment Docs Round added bilingual
  `/docs/deploy/previews/` content and registered public help topics for Action-only PR previews
  and control-plane product-grade previews. The public `appaloft/deploy-action` wrapper repository,
  Marketplace README, and public wrapper CI are now published.
- 2026-05-05 Phase 7 deploy-action wrapper cleanup/README slice added `command:
  preview-cleanup` to the reference composite action, a Marketplace-facing README with deploy, PR
  preview, close-event cleanup, fork-safety, minimal config, and reserved control-plane examples,
  plus wrapper tests for cleanup mapping and README safety examples. The public
  `appaloft/deploy-action` repository and public wrapper CI/layout tests are now published.
- 2026-05-06 Phase 7 deploy-action wrapper export slice added a deterministic export script for
  mirroring the reference `action.yml`, Marketplace README, and install/deploy scripts into the
  public `appaloft/deploy-action` repository, with a layout test proving exported files match the
  reference and shell scripts keep executable bits.
- 2026-05-06 Phase 7 deploy-action public CI export slice added the wrapper repository CI workflow
  to the exported layout. The workflow validates shell syntax, dry-run PR preview mapping and
  outputs, and a GitHub Actions variable-gated exact-version install smoke controlled by the public
  repository's `APPALOFT_INSTALL_SMOKE_VERSION` variable.
- 2026-05-06 Phase 7 deploy-action public repository publication slice merged
  `appaloft/deploy-action#1`, making the public `main` branch match the deterministic reference
  export plus the repository license. Public wrapper CI `validate` passed before merge, and
  post-merge comparison confirmed the exported `README.md`, `action.yml`, install/deploy scripts,
  and `.github/workflows/ci.yml` match byte-for-byte.
- 2026-05-06 Phase 7 day-two management exit audit added `PHASE7-DAY2-MGMT-001` catalog coverage
  proving resource config/secrets, storage, dependency resources/bindings/backups, auto-deploy
  diagnostics, deployment history, recovery-readiness, and rollback expose explicit CLI and
  HTTP/oRPC operations with shared schemas. This closes the no-server-file-edit exit criterion.
- 2026-05-06 Phase 7 `0.9.0` release target selection is now checked after all required Phase 7
  items, earlier phase release rules, and Phase 7 exit criteria are checked. This records roadmap
  eligibility only; an actual release run remains governed by the release workflow.

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
- [x] Add deploy-action wrapper behavior, including PR preview deploy/update from a user-authored
  GitHub Actions workflow. Public docs now distinguish Action-only workflow-file previews from
  control-plane product-grade previews; the public `appaloft/deploy-action` repository is
  published from the deterministic reference export with Marketplace README examples, preview
  cleanup mapping, and public wrapper CI.
- [x] Add existing-resource profile-drift handling.
- [x] Add product-grade preview deployments after source binding and webhook ingestion are durable,
  including GitHub App/webhook triggers, scoped preview env, list/show/policy/delete, and cleanup
  retries. Spec Round is positioned in
  [docs/specs/046-product-grade-preview-deployments](./specs/046-product-grade-preview-deployments/spec.md)
  with a dedicated test matrix; preview policy/environment operations, feedback, cleanup retry,
  Web/API/CLI/future MCP surfaces, public docs, an initial signed GitHub pull-request HTTP route,
  close-event cleanup routing, cleanup-side feedback update, and automatic deployment-status
  feedback publication, plus repository-context mapping from signed GitHub events and
  request-or-worker-token GitHub feedback transport, are implemented. A secret-gated live GitHub
  PR-comment feedback provider smoke gate is active. Full GitHub App installation onboarding and
  broader hosted provider smoke coverage remain outside this Phase 7 Code Round.
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
- [x] A user can manage config, secrets, storage, dependencies, auto-deploy, deployment history, and
  rollback candidates without editing files on the server.
- [x] Postgres has a closed provision -> bind -> deploy -> observe -> backup/restore or delete loop.
- [x] Redis has a closed provision -> bind -> deploy -> observe -> backup/restore or delete loop.
- [x] Operators can deploy through both the single-server Docker/Compose path and the Docker Swarm
  cluster path without changing the public deployment admission surface.
- [x] Rollback/redeploy are no longer rebuild-required if they are exposed.

## Phase 8: Self-Hosted Auth And Organization Bootstrap

Target: `0.10.0`.

Release rule:
- [x] Select `0.10.0` only when all required Phase 8 items, earlier phase items, and exit criteria
  are checked. If any Phase 8 item remains unchecked, release a `0.9.x` patch or an explicitly
  requested prerelease instead.

Already done:
- [x] Better Auth compatible user, session, account, verification, organization, member, and
  invitation tables exist in the PostgreSQL/PGlite migration set.
- [x] Web already has an auth-session query surface and UI test fixtures for Better Auth session
  responses.
- [x] The identity governance test matrix exists for foundational organization membership behavior
  before public organization operations are exposed.

Current verification notes:
- 2026-05-10 Phase 8 self-hosted Action deploy-token auth Spec Round added ADR-043 and
  [docs/specs/052-self-hosted-action-deploy-token-auth](./specs/052-self-hosted-action-deploy-token-auth/spec.md)
  to position deploy tokens as the machine-to-machine authorization boundary for self-hosted Action
  mutation endpoints. That Spec Round did not implement endpoint guards yet, so the `0.10.0`
  release rule was still blocked at that point by deploy-token Code Round, scoped token lifecycle, first-admin bootstrap,
  optional OAuth, organization/team operations, authorization gates, Web onboarding, CLI, and public
  docs coverage.
- 2026-05-10 Phase 8 first Code Round slice added bearer-token admission for self-hosted Action
  source-link and server-config deployment endpoints, plus static `APPALOFT_ACTION_DEPLOY_TOKEN`
  verification for self-hosted shell composition. A follow-up in the same slice added safe
  requested-scope checks, static env-based token scope settings, and `action_auth_forbidden` 403
  rejection before Action command dispatch. It also protected self-hosted Action preview cleanup
  requests by having the deploy-action wrapper send an Action command marker and bearer token before
  the cleanup command dispatches. A follow-up deploy-token model/persistence slice added the core
  `DeployToken` aggregate plus PG/PGlite `deploy_tokens` verifier storage and safe read models, and
  added a persisted-verifier Action authorization port behind `@appaloft/auth-better`; shell now
  uses persisted verifier storage by default while preserving the static bootstrap fallback when
  `APPALOFT_ACTION_DEPLOY_TOKEN` is configured. A follow-up application lifecycle slice added
  `CreateDeployTokenUseCase` plus a `DeployTokenMaterialIssuer` port so raw token material is
  returned once, verifier/suffix metadata is persisted, and `@appaloft/auth-better` remains a
  swappable implementation detail behind application-owned abstractions. A follow-up rotate/revoke
  slice added `RotateDeployTokenUseCase` and `RevokeDeployTokenUseCase`, preserving scopes on
  rotation, returning new raw material once, immediately invalidating old verifiers, and blocking
  revoked verifier lookup. A follow-up application command slice added `deploy-tokens.create`,
  `deploy-tokens.rotate`, and `deploy-tokens.revoke` command/handler classes plus operation-catalog
  entries. A read-side slice added `deploy-tokens.list` and `deploy-tokens.show` query/handler
  classes plus safe read-model catalog entries. A follow-up installer bootstrap slice added
  optional `APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE` handoff support so Docker self-host installs
  can explicitly create an initial deploy token through application command/query dispatch with
  `--bootstrap-deploy-token`, print the raw token once from trusted install output, and stay
  idempotent after an active token exists. Plain SSH install does not create a deploy token by
  default. A follow-up lifecycle
  transport slice activated admin-protected HTTP/oRPC routes for deploy-token create/list/show/
  rotate/revoke, updated operation-catalog transport declarations, typed client contracts, public
  docs, and entrypoint tests. A follow-up CLI lifecycle slice added
  `appaloft deploy-token create/list/show/rotate/revoke` over the same application command/query
  messages with CLI tests and docs/help alignment. At that point the `0.10.0` release rule was
  still blocked by a full `install.sh` plus printed-console-url smoke and remaining cross-surface
  parity checks.
- 2026-05-10 Phase 8 first-admin bootstrap Spec Round added ADR-044 and
  [docs/specs/053-self-hosted-first-admin-bootstrap](./specs/053-self-hosted-first-admin-bootstrap/spec.md)
  to define local first-admin creation, initial organization ownership, generated one-time password
  handling, optional OAuth sequencing, product-auth errors, and the Better Auth adapter boundary.
  The first Code Round slice added Appaloft-owned application ports, command/query messages,
  handlers, generated-password boundary, operation-catalog entries without public transports, and a
  Better Auth adapter that creates the local user plus initial organization owner behind the
  `FirstAdminBootstrapper` port. A follow-up persistence slice added a PG/PGlite
  `AuthBootstrapStatusReader` over Better Auth-compatible user/organization/member tables so
  bootstrap status can distinguish required versus complete without exposing secrets. Installer
  shell composition now also supports a trusted first-admin handoff output file plus
  `APPALOFT_FIRST_ADMIN_EMAIL`, optional display name, and optional supplied password; it writes a
  generated password once when needed, suppresses supplied-password echo, and no-ops after the first
  admin exists. A follow-up installer UX slice wired those first-admin settings into Docker Compose
  and Swarm app containers, reads the first-admin handoff output after health readiness, prints the
  generated password only from trusted output, suppresses supplied-password echo, and keeps the
  deploy-token handoff separate for GitHub Actions. A follow-up product authorization gate slice
  added an Appaloft-owned `ProductSessionAuthorizationPort`, wired HTTP/oRPC command dispatch to
  authorize product mutations before `CommandBus` dispatch, mapped missing sessions to
  `product_auth_missing`/`401`, insufficient organization roles to `product_auth_forbidden`/`403`,
  and implemented the port in `@appaloft/auth-better` through Better Auth session plus organization
  role APIs. A follow-up public bootstrap transport slice exposed `GET /api/bootstrap/auth/status`
  and `POST /api/bootstrap/auth/first-admin`, kept both outside the product session gate by design,
  and left one-time/idempotent setup enforcement in the application bootstrap use case. A follow-up
  public docs slice added `self-hosting.first-admin-bootstrap` coverage for first install login,
  local admin bootstrap, generated one-time passwords, OAuth optionality, bootstrap endpoints, and
  product auth 401/403 recovery. A follow-up Web onboarding slice added `/bootstrap/auth/first-admin`
  and `/login` local-password pages using shared i18n keys. A follow-up first-admin CLI slice added
  `appaloft auth bootstrap-status` and `appaloft auth bootstrap-first-admin` over the same
  application query/command messages.
- 2026-05-11 Phase 8 organization/team operations Spec Round added ADR-045 and
  [docs/specs/054-self-hosted-organization-team-operations](./specs/054-self-hosted-organization-team-operations/spec.md)
  to define current user/current organization context, member list, invitation list, member invite,
  role update, member removal, at-least-one-owner policy, and the Better Auth adapter boundary. The
  first Code Round slice added `Organization` aggregate role/removal rules plus application-owned
  organization/team ports, command/query messages, handlers, use cases/query services, and
  operation-catalog entries without public transports. A follow-up adapter slice implemented those
  organization/team ports in `@appaloft/auth-better`; Better Auth remains behind Appaloft-owned
  application abstractions, with Better Auth `member` currently adapted back to Appaloft
  `developer` until richer custom-role persistence is added. A follow-up HTTP/oRPC slice exposed
  current context, member list, invitation list, invite, role update, and removal routes behind the
  product-session authorization gate while preserving CommandBus/QueryBus dispatch. A follow-up CLI
  slice added `appaloft organization context`, member/invitation list, invite, role update, and
  removal commands over those same application messages. A follow-up Docs Round added the
  `self-hosting.organization-team-management` public help anchor for current context, member list,
  invitations, invite, role update, removal, session input, and safe output rules. A follow-up Web
  slice added `/organization` current context, safe member/invitation reads, invite, role update,
  remove, deploy-token list/create/rotate/revoke, shared public help, and i18n-backed UI over the
  existing oRPC contracts. A follow-up switch-current slice activated `organizations.switch-current`
  through application, HTTP/oRPC, CLI, Web `/organization`, public docs, and
  `ORG-TEAM-SWITCH-001` automation. A follow-up optional OAuth config slice added GitHub, Google, and
  generic OIDC runtime config/status behind the Better Auth adapter boundary; provider login is
  reported disabled unless client id, client secret, callback URL, and trusted browser origin are
  configured. A follow-up WebView e2e slice added `SELF-HOSTED-AUTH-E2E-001` for first-admin
  browser bootstrap, local password sign-in, and console deployment submission. A follow-up
  installer script-contract slice added `SELF-HOSTED-AUTH-E2E-002` for complete first-use auth
  handoff output: printed console URL, first-admin login URL/password, Action token, next-step
  guidance, and no raw secret persistence. A follow-up product read authorization slice made
  project, environment, resource, deployment-target, and deployment read models require member-level
  product sessions on HTTP/oRPC before query dispatch, while deploy-token and organization/team read
  models remain admin-only. A follow-up opt-in install smoke harness added
  `SELF-HOSTED-AUTH-E2E-003` and `bun run smoke:install-auth` for a real PGlite Docker install that
  opens the printed console URL, verifies `/api/health`, reads bootstrap status, signs in with the
  generated first-admin password through the local login API, verifies the session API, and probes
  the console page. A follow-up session-hardening slice made `install.sh` generate a stable
  `APPALOFT_BETTER_AUTH_SECRET` for new installs, reuse an existing `.env` value on rerun, inject it
  into the app container, and keep it out of installer stdout. A follow-up install-smoke slice made
  local candidate image verification practical by shrinking Docker build context, adding
  `--skip-image-pull`/`APPALOFT_SKIP_IMAGE_PULL=1` for preloaded Compose images, and passing
  `SELF-HOSTED-AUTH-E2E-003` on 2026-05-11 against both a local overlay candidate image and a
  current-source Dockerfile image built by the smoke harness with runtime OpenSSH installation
  disabled. Both images carried the current shell/Web/docs artifacts and PGlite runtime assets. A
  follow-up Action
  server-mode deploy probe in the same smoke signs in with the bootstrapped first-admin session,
  switches to the bootstrapped organization, creates project/environment/local-shell target/resource
  context through the product HTTP API, submits a console deployment, then uses the explicitly
  enabled installer-generated deploy token against the self-hosted Action source-link endpoint and
  verifies it returns `202 Accepted` with a `dep_...` deployment id instead of an
  `action_auth_*` failure.
  The smoke build skips runtime OpenSSH installation through a test-only Docker build argument. A
  normal default Dockerfile build was attempted on 2026-05-11 and reached shell/Web/docs/PGlite
  packaging, then was cancelled after the runtime `apt-get install openssh-client` layer stayed
  silent at the Debian `trixie/main arm64 Packages` download. A standalone Bun Debian base-image
  `apt-get update && apt-get install --no-install-recommends openssh-client` probe also timed out
  after 240 seconds at the same package index download, so the release candidate still needs the
  normal release-environment image verification gate.

Required:
- [x] Add self-hosted Action API authentication: optional installer-generated deploy token,
  bearer-token verification on action mutation endpoints, token rotation/revocation, and clear
  401/403 errors.
- [x] Add scoped deploy tokens that can be limited to a project, environment, resource, source
  repository, or preview workflow, so multiple repositories can share one self-hosted instance
  without sharing a global mutation secret.
- [x] Add product auth baseline: first admin account bootstrap, login/session hardening, and
  organization/team membership for multiple operators sharing one Appaloft instance.
- [x] Make first self-hosted install usable without any external OAuth provider: support an
  installer-driven local admin bootstrap through explicit flags, config file, or environment input;
  support a generated one-time admin password when no password is supplied; redact bootstrap
  secrets from logs; and require the bootstrap path to be idempotent after the first admin exists.
- [x] Add optional OAuth login configuration for self-hosted installs, including Google, GitHub, and
  generic OIDC provider settings; provider login must be disabled unless the required client id,
  client secret, callback URL, and trusted origin are configured.
- [x] Add an install/update UX that prints the console login URL, first-admin bootstrap status,
  configured login methods, and safe next steps for adding OAuth later without requiring users to
  understand Better Auth internals.
- [x] Add organization/team operations and read models for first organization creation, member list,
  invitation, role update, remove member, and current-user/current-organization context.
- [x] Add authorization policy gates for console and HTTP/oRPC mutation endpoints: unauthenticated
  users get 401, authenticated users outside the organization or without the required role get 403,
  and public health/version/readiness endpoints remain explicitly public.
- [x] Add Web onboarding surfaces for first admin setup, login, current organization switch/context,
  member invitation, and token management without hardcoded UI copy.
- [x] Add CLI and public docs coverage for first install login, local admin bootstrap, OAuth setup,
  deploy token rotation, and GitHub Action self-hosted server mode configuration.

Exit criteria:
- [x] A new self-hosted user can run `install.sh`, open the printed console URL, log in with a
  local first-admin account, and deploy through the console or GitHub Action server mode without
  manually editing database rows. The default-skipped `SELF-HOSTED-AUTH-E2E-003` harness now passes
  for install, local first-admin login/session, active organization selection, product API context
  creation, console deployment creation, Action server-mode `202 Accepted` deployment-id creation,
  and console page readiness against a current-source Dockerfile image built by the smoke harness
  with runtime OpenSSH installation disabled.
- [x] OAuth is optional rather than required: users can add Google/GitHub/OIDC later, and missing
  OAuth config never blocks first login through the local bootstrap path.
- [x] GitHub Actions can no longer mutate a self-hosted server endpoint without a valid deploy
  token, and failures include actionable 401/403 messages.
- [x] Multiple operators can share one Appaloft instance through organization/team membership with
  role-aware access to projects, environments, resources, deployment targets, and tokens.
- [x] Install, upgrade, HTTP/oRPC, Web, CLI, docs, and test matrices agree on the first-admin,
  OAuth, organization/team, and deploy-token behavior. `PRODUCT-AUTH-PARITY-001` now asserts the
  Phase 8 auth operation catalog, CLI transports, HTTP/oRPC transports, and public docs topics stay
  aligned; installer script-contract, Web source/WebView, CLI, HTTP/oRPC, and matrix tests cover
  the remaining surfaces, with `SELF-HOSTED-AUTH-E2E-003` covering the opt-in real Docker install
  path.

## Phase 9: Operator/Internal State Closure And Interface Parity

Target: `0.11.0`.

Release rule:
- [x] Select `0.11.0` only when all required Phase 9 items, earlier phase items, and exit criteria
  are checked and required real-execution confidence is represented by explicit local scripts or
  GitHub Actions gates. If any Phase 9 item remains unchecked, release a `0.10.x` patch or an
  explicitly requested prerelease instead.
- [x] Do not select `1.0.0-rc` directly for Phase 9 work. The `0.12.0` runtime usage attribution
  line starts only after Phase 9 has shipped or has been explicitly retargeted as complete, and the
  release-candidate line starts only after `0.12.0` is complete or explicitly deferred.

Already done:
- [x] System provider/plugin/doctor/db status/db migrate baseline exists.
- [x] Terminal session open baseline exists.
- [x] Remote SSH state and migration/recovery concepts have partial implementation.
- [x] Operator-work can aggregate safe remote SSH state read-model rows for locks, migrations,
  backups, and recovery markers when a producer supplies them.
- [x] SSH remote-state diagnostics producer can read lock, migration journal, backup, and recovery
  marker metadata into operator-work rows without mutating remote state.
- [x] Durable process attempt journal can list due retry candidates with dedupe authority for
  future schedulers and lifecycle commands.

Required:
- [x] Complete durable outbox/inbox or equivalent process-state coverage for long-running workflows.
  ADR-054 and `docs/specs/060-durable-process-delivery-baseline` now define durable process
  delivery as the outbox/inbox-equivalent baseline. Scheduled-task runs are the first worker
  binding with accepted-state recording, atomic claim/completion, retry-generation persistence, and
  generated retry handoff. Scheduled runtime prune is the second worker binding with accepted
  maintenance recording, atomic claim/completion, command-bus dispatch of `servers.capacity.prune`,
  retry-scheduled failure visibility, and safe operator-work details. Scheduled history retention is
  the third worker binding with retention-default category attempt recording, atomic
  claim/completion, command-bus dispatch of existing history prune commands or governed direct
  retention stores, retry-scheduled failure visibility, disabled-by-default shell runner wiring,
  and safe operator-work details. Preview
  cleanup is the fourth process-attempt worker binding with successful and retry-scheduled cleanup
  outcomes mirrored into the process attempt journal for `operator-work.*` visibility and repair;
  its retry scheduler now generates retry attempts from the process attempt journal and executes
  cleanup through atomic process-attempt claim/completion while preview cleanup attempt rows remain
  compatibility cleanup history. Certificate issuance is the fifth
  operator-visible binding with request, provider issuance, success, and retry-scheduled provider
  failure outcomes mirrored into the process attempt journal; its retry scheduler still uses
  certificate aggregate attempt state rather than process-attempt atomic claim/completion.
  Certificate import is the sixth operator-visible binding with successful manual import outcomes
  mirrored into the process attempt journal without PEM, private-key, or passphrase material.
  Managed certificate revocation is the seventh operator-visible binding with running, success, and
  retriable provider failure outcomes mirrored into the process attempt journal for
  `certificates.revoke`; imported certificate revocation remains Appaloft-local lifecycle state
  without provider work. Proxy bootstrap is the eighth operator-visible binding with running,
  success, and failure outcomes
  mirrored into the process attempt journal; repair execution still runs inline through
  `servers.bootstrap-proxy` and post-register bootstrap remains event-driven rather than
  process-attempt atomic claim/completion. Resource runtime control is the ninth
  operator-visible binding with running, success, and failure outcomes mirrored into the process
  attempt journal for `resources.runtime.stop`, `resources.runtime.start`, and
  `resources.runtime.restart`; execution still runs inline through the command use case rather than
  process-attempt atomic claim/completion. Source-event auto-deploy is the tenth operator-visible
  binding with accepted, dispatched, and failed `source-events.ingest` outcomes mirrored into the
  process attempt journal; deployment dispatch still runs inline through the source-event command
  path rather than process-attempt atomic claim/completion. Dependency resource backup/restore is
  the eleventh operator-visible binding with running, success, and failure outcomes mirrored into the
  process attempt journal for `dependency-resources.create-backup` and
  `dependency-resources.restore-backup`; provider execution still runs inline through command use
  cases rather than process-attempt atomic claim/completion. Provider-native dependency resource
  realization/delete is the twelfth operator-visible binding with running, success, and failure
  outcomes mirrored into the process attempt journal for
  `dependency-resources.provision-postgres`, `dependency-resources.provision-redis`, and
  provider-managed `dependency-resources.delete`; provider execution still runs inline through
  command use cases rather than process-attempt atomic claim/completion. Deployment create
  execution is the thirteenth operator-visible binding with running, success, and failure outcomes
  mirrored into the process attempt journal for `deployments.create`; runtime execution still runs
  inline through the create use case rather than process-attempt atomic claim/completion. Domain
  binding verification retry is the fourteenth operator-visible binding with accepted ownership
  verification retry attempts mirrored into the process attempt journal for
  `domain-bindings.retry-verification`; DNS recheck, certificate retry, route repair, deployment
  retry, redeploy, and rollback remain separate governed workflows, and verification retry still
  runs inline through the command use case rather than process-attempt atomic claim/completion.
  Domain binding create is the fifteenth operator-visible binding with initial ownership
  verification attempts mirrored into the process attempt journal for `domain-bindings.create`;
  idempotency replays return the existing binding without duplicate process rows, and DNS recheck,
  ownership confirmation, certificate issuance/import, route repair, deployment retry, redeploy,
  and rollback remain separate governed workflows. Deployment retry execution is the sixteenth
  operator-visible binding with running, success, and failure outcomes mirrored into the process
  attempt journal for `deployments.retry`; `deployments.redeploy` already delegates through
  `deployments.create` and uses the create-deployment projection path with operation key
  `deployments.redeploy`. Deployment rollback execution is the seventeenth operator-visible binding
  with running, success, and failure outcomes mirrored into the process attempt journal for
  `deployments.rollback`, including source deployment lineage, rollback candidate lineage, runtime
  plan, and target backend metadata. Remaining long-running workflow workers require governed
  explicitly-enabled worker slices under ADR-054 rather than Phase 9 release blockers.
- [x] Add retry execution, dedupe enforcement, and failure visibility for long-running workflows.
  Scheduled-task retry generation and handoff are implemented with process-attempt dedupe
  authority and safe failure visibility. Scheduled runtime prune records retry-scheduled failure
  visibility and relies on fresh policy ticks for new attempts rather than generic retry
  generation. Scheduled history retention records retry-scheduled failure visibility and relies on
  fresh retention-default policy ticks for new attempts rather than generic retry generation.
  Preview cleanup records retry-scheduled process-attempt visibility for transient cleanup
  failures and relies on the existing product-grade preview cleanup retry scheduler for retry
  dispatch. Certificate issuance records retry-scheduled process-attempt visibility for provider
  failures and relies on the existing certificate retry scheduler for retry dispatch. Managed
  certificate revocation records retriable process-attempt failure visibility for provider
  revocation failures while retry execution still requires a fresh `certificates.revoke` call or a
  later governed worker. Proxy bootstrap records retriable process-attempt failure visibility for
  repair attempts while retry execution still requires a fresh `servers.bootstrap-proxy` call or a
  later governed worker.
  Resource runtime control records retriable process-attempt failure visibility for runtime target
  adapter failures while retry execution still requires a fresh `resources.runtime.*` command or a
  later governed worker. Source-event auto-deploy records retriable process-attempt failure
  visibility for deployment dispatch failures while retry execution still requires a fresh
  source-event delivery or a later governed worker. Dependency resource backup/restore records
  retriable process-attempt failure visibility for provider backup/restore failures while retry
  execution still requires a fresh backup/restore command or a later governed worker.
  Provider-native dependency resource realization/delete records retriable process-attempt failure
  visibility for provider realization/delete failures while retry execution still requires a fresh
  provision/delete command or a later governed worker. Deployment create records retriable
  process-attempt failure visibility for post-acceptance runtime execution failures while retry
  execution still requires `deployments.retry`/`deployments.redeploy`, a fresh create request, or a
  later governed deployment worker. Deployment retry records retriable process-attempt failure
  visibility for post-acceptance retry execution failures while retry execution itself still runs
  inline through `deployments.retry` rather than a process-attempt worker. Deployment rollback
  records retriable process-attempt failure visibility for post-acceptance rollback execution
  failures while rollback execution itself still runs inline through `deployments.rollback` rather
  than a process-attempt worker. Broader automatic workflow retry execution remains governed future
  work and requires explicit local specs before provider/runtime work is executed by a worker.
- [x] Add operator queries for deployment attempts.
- [x] Add operator queries for proxy bootstrap attempts.
- [x] Add operator queries for certificate attempts.
- [x] Add a concrete remote SSH state diagnostics producer/read model for locks, migrations,
  backups, and recovery markers.
- [x] Add operator queries for source links, route realization attempts, and worker/job status.
- [x] Add runtime target capacity diagnostics for disk, inode, memory, CPU, Docker image usage,
  build-cache usage, source workspace usage, and safe reclaimable estimates.
- [x] Add aggregate-scoped audit event list/show read surfaces with redacted payload output.
- [x] Add first operator lifecycle repair command: `operator-work.mark-recovered` for durable
  failed, retry-scheduled, or dead-lettered process attempt rows.
- [x] Add operator dead-letter command: `operator-work.dead-letter` for durable failed or
  retry-scheduled process attempt rows that must stop retry selection.
- [x] Add operator cancel command: `operator-work.cancel` for durable pending or retry-scheduled
  process attempt rows that should not continue.
- [x] Add operator retry command: `operator-work.retry` for creating a fresh pending durable
  process attempt from failed or retry-scheduled retriable rows without executing provider/runtime
  work.
- [x] Add operator prune command: `operator-work.prune` for dry-running and deleting old terminal
  durable process attempt journal rows without pruning runtime artifacts, audit/events, remote
  state, or compatibility ledger rows.
- [x] Add lifecycle commands for retry, cancel, mark-recovered, dead-letter, and prune where state
  can block deployments or create support load.
- [x] Add manual runtime artifact/workspace prune with dry-run, active-runtime preservation,
  rollback candidate retention, preview-owned artifact cleanup, no-volume-by-default safety, and
  audit and diagnostic output.
  `servers.capacity.prune` is active with dry-run default, safe category selection, explicit
  Docker build-cache/unused-image opt-in, CLI and HTTP/oRPC dispatch, runtime adapter exclusions,
  and retained audit output for destructive prunes.
- [x] Add scheduled runtime prune automation and broader retention-policy integration for runtime
  artifacts/workspaces.
  ADR-055 and `docs/specs/061-scheduled-runtime-prune-automation` now define the policy-gated,
  command-bus, durable-process boundary for scheduled runtime prune automation. The implementation
  can resolve configured policy records by precedence, including `deployment-snapshot` scope,
  dispatch selected work through durable process state and `servers.capacity.prune`, reuse
  scheduled-boundary audit output for destructive runs, discover enabled policies through the shell
  runner's injected read model, and materialize repository config `retention.runtimePrune` as a
  `deployment-snapshot` scoped policy for the selected target. CLI and HTTP/oRPC policy
  configure/list/show entrypoints, public docs/help anchors, and focused automation tests are
  active. Broader retention-policy integration outside runtime artifacts/workspaces remains under
  the audit/event retention gaps.
- [x] Complete audit/event retention policy coverage beyond aggregate-scoped redacted readback.
  First audit-row retention command `audit-events.prune` and provider job log retention command
  `provider-job-logs.prune` are specified and implemented; `audit-events.export` now provides
  bounded aggregate-scoped redacted export. `deployments.logs.prune` now covers dry-run-first
  embedded deployment log entry pruning. Resource runtime log archival now has Appaloft-owned
  storage, CLI and HTTP/oRPC entrypoints, list/show readback, prune behavior, and delete-safety
  blockers for retained archive snapshots. Global audit export is now governed by ADR-056 and
  implemented as `audit-events.export-global` with bounded time-windowed redacted CLI and HTTP/oRPC
  readback. Legal hold is governed by ADR-057 and implemented through
  `audit-events.legal-holds.configure/list/show/release`; active holds block `audit-events.prune`
  from deleting matching rows and expose held counts. Immutable archive is governed by ADR-058 and
  implemented through `audit-events.archives.create/list/show/prune`, including retained redacted
  snapshots, digest metadata, archive pruning, and archive-aware source-row retention for
  `audit-events.prune`. Domain event stream retention is now governed by ADR-059 and
  `docs/specs/065-domain-event-stream-retention`; `domain-events.prune`,
  `domain_event_stream_records`, prune watermark state, retained `deployments.stream-events`
  replay/gap/follow behavior, CLI, HTTP/oRPC, operation catalog, docs registry, OpenAPI/SDK
  metadata, and focused tests are implemented. Organization retention defaults now have ADR-060,
  `docs/specs/066-organization-retention-defaults`, operation-map positioning, test matrix,
  application/persistence implementation, CLI, HTTP/oRPC, public docs/help, catalog, OpenAPI/SDK
  metadata, and focused tests. Scheduled history retention automation now has ADR-061,
  `docs/specs/067-scheduled-history-retention-automation`, operation-map positioning, a test
  matrix, application command-bus dispatch over existing prune commands, durable process attempt
  visibility, disabled-by-default shell runner wiring, and focused tests. ADR-054 defines durable
  process attempts as the current outbox/inbox-equivalent baseline, so accepted background-work
  retention is covered by `operator-work.prune`; a separate outbox/inbox retention command is not
  applicable unless a future ADR introduces a separate outbox/inbox store. Focused retention
  verification passes across audit, domain event stream, provider job log, deployment log, runtime
  log archive, retention default, scheduled history retention, and operator-work process-attempt
  retention tests.
- [x] Add terminal session list/show/attach/close/expire if terminal sessions remain public.
- [x] Ensure provider/plugin/system operations expose capability details and configuration
  diagnostics without leaking provider SDK types or secrets.
- [x] Verify CLI, HTTP/oRPC, Web, and generated MCP/tool contracts against `operation-catalog.ts`.
- [x] Add a published TypeScript SDK as a public operation client after the Phase 8 auth/org
  baseline: methods generated from the OpenAPI SDK contract plus Appaloft operation metadata,
  shared command/query input schemas, typed result and error handling, deploy-token/session header
  support, and no dependency on `core`, `application`, repository ports, handlers, use cases, or
  shell composition.
- [x] Keep SDK authentication, deploy-token, session, 401/403, and organization scope semantics
  planned rather than published until the TypeScript SDK and interface-parity slice is accepted.
- [x] Flatten CLI, HTTP/oRPC, Web, SDK, and generated MCP/tool parity around the operation catalog:
  each public operation has one canonical schema, one docs/help anchor decision, one error contract,
  and interface-specific adapters that dispatch through command/query boundaries instead of
  duplicating business behavior.
- [x] Let internal black-box and smoke tests use the published SDK against a running Appaloft
  server, while lower-level domain/application tests continue to use direct domain objects,
  handlers, use cases, buses, and testkit fixtures where that is the behavior under test.
- [x] Harden install/upgrade/release: migrations, backup/recovery, all-in-one packaging, binary
  release, static console asset serving, and smoke tests.
  Release-hardening source-of-truth now has `docs/testing/release-hardening-test-matrix.md`.
  Installer, deploy-action, static asset, binary bundle, Docker packaging, release-build workflow,
  SDK publish, manifest/checksum, release-note, final metadata, Homebrew, and smoke command
  contracts are covered by focused local tests. On 2026-05-12, the local release-hardening
  contract suite passed 66 tests, the bounded PGlite persistence release-readiness slice passed
  50 tests, and the PostgreSQL persistence integration slice passed against an isolated temporary
  PostgreSQL 14 cluster. The Docker-backed local smoke suite passed against Colima Docker for
  workspace commands, static, Dockerfile, prebuilt-image, and Compose methods; `bun run
  smoke:swarm` passed 11 tests including the opt-in real Swarm apply/cleanup path after temporary
  Swarm initialization; and `bun run smoke:install-auth` passed the opt-in self-hosted PGlite
  install/auth/deploy-token smoke after `bun.lock` was synced. Required SSH evidence is now exposed
  through GitHub Actions secret-gated/local explicit `bun run smoke:ssh`, its
  `smoke:ssh:remote-state` and `smoke:ssh:quick-deploy` parts, `bun run smoke:ssh:evidence` for
  redacted `dist/release/ssh-smoke-evidence.json` capture after both SSH suites pass, per-workflow
  redacted evidence capture for the reusable release/nightly workflows. Local release preparation
  can skip real SSH execution when no target server exists; the release workflow keeps manual
  `require_ssh_remote_state_e2e` and `require_ssh_quick_deploy_e2e` inputs so a
  release-readiness run that needs SSH confidence fails closed when target secrets are absent.

Exit criteria:
- [x] Operators can see and repair stuck work through Appaloft operations.
  Verified on 2026-05-12 by 53 focused operator-work tests across application, CLI, and HTTP/oRPC:
  list/show, durable-first merge, remote-state/source-link/route/job visibility,
  mark-recovered, dead-letter, cancel, retry, and prune all dispatch through command/query
  boundaries and mutate only the governed durable process-attempt ledger.
- [x] Historical attempts, logs, events, remote state backups, runtime artifacts, source
  workspaces, and build cache have documented retention/prune behavior.
  Verified on 2026-05-12 by the Phase 9 retention command/spec set. Historical process attempts
  are governed by `operator-work.prune`; embedded deployment logs by `deployments.logs.prune`;
  provider job logs by `provider-job-logs.prune`; retained audit rows, legal holds, immutable
  archives, and archive-aware audit prune by `audit-events.*`; retained deployment/domain events by
  `domain-events.prune` and `deployments.stream-events` retained replay/gap behavior; Appaloft-owned
  runtime log archive snapshots by `resources.runtime-logs.archive` and
  `resources.runtime-log-archives.*`; runtime artifacts, source workspaces, explicit Docker build
  cache, unused images, and old remote-state marker archives by `servers.capacity.prune` plus
  scheduled runtime prune policies; and
  scheduled history retention by retention defaults dispatching the existing manual prune commands.
  Live remote-state data, live locks, and state roots are explicitly excluded from runtime capacity
  prune and audit/log/event/process retention commands; current behavior is inspect, explicit old
  marker/archive prune, stale-lock recovery, migration backup/restore during state sync, and safe
  operator-work diagnostics, while standalone state-root prune or backup-delete remains a future
  governed extension rather than an unowned retention action.
- [x] TypeScript SDK, CLI, HTTP/oRPC, Web, and generated MCP/tool contracts are verified from the
  same operation catalog after auth/org rules are active, with no SDK-only business operations or
  transport-only business schemas.
  Verified on 2026-05-12 by 102 focused interface-parity tests covering operation catalog/docs
  coverage, OpenAPI `x-appaloft-*` metadata, generated TypeScript SDK facade, SDK import boundary,
  SDK auth/error/stream helpers, running-server SDK smoke, generated MCP descriptors, CLI/oRPC/Web
  docs-help links, and SDK release packaging.
- [x] Phase 9 release readiness passes the local, PGlite, PostgreSQL, Docker, and GitHub Actions
  secret-gated/local explicit SSH smoke gates required for a `0.11.0` minor release.
  Local, PGlite, PostgreSQL, Docker-backed local, Swarm, and install-auth evidence was recorded on
  2026-05-12. SSH smoke is wired through aggregate `smoke:ssh`,
  `smoke:ssh:remote-state`, `smoke:ssh:quick-deploy`, `smoke:ssh:evidence`, and per-workflow
  evidence scripts; Release publish runs can require the SSH reusable workflows when the manual
  `require_ssh_*` inputs are set, and those workflows upload redacted evidence artifacts after
  success. Missing SSH target secrets fail the required reusable workflows instead of converting the
  release-readiness path into a known-gap note.

## Phase 10: Runtime Usage Attribution And Monitoring

Target: `0.12.0`.

Release rule:
- [x] Select `0.12.0` only after Phase 9 has shipped or has been explicitly retargeted as
  complete, and only when the runtime usage attribution ADR/spec/test gates for the selected
  `0.12.0` slice are complete. On 2026-05-13, maintainers explicitly selected direct `0.12.0`
  release preparation after Phase 9 completion was already checked on `main`.
- [x] Do not use `0.12.0` to silently accept runtime sizing, quotas, or enforcement. CPU, memory,
  replicas, restart policy, rollout overlap/drain, quota, and destructive maintenance behavior
  still require their own accepted ADR/spec/test coverage before implementation.
- [x] Do not select `1.0.0-rc` directly while required `0.12.0` items remain unchecked, unless
  maintainers explicitly defer this track back to post-GA and record the deferral here.

Governing planning document:
- [Runtime Usage Attribution And Monitoring](./specs/068-runtime-usage-attribution-and-monitoring/spec.md)

Required:
- [x] Add ADR for runtime usage attribution operation/read-model boundaries.
- [x] Add runtime usage test matrix with `RT-USAGE-*` rows.
- [x] Implement read-only `runtime-usage.inspect` for server, project, environment, resource, and
  deployment scopes, using safe Appaloft ownership evidence and no mutation.
  - [x] Server scope returns live capacity-backed usage context.
  - [x] Project, environment, resource, and deployment scopes resolve current deployment/server
    context through read models and return partial attribution instead of guessed totals when
    ownership evidence is incomplete.
  - [x] Appaloft-managed Docker container labels provide current artifact, deployment/resource
    rollup, container writable byte, and runtime id attribution when the labels are present.
  - [x] Source workspace metadata and deployment read models provide deployment-id-based
    project/environment/resource rollups beyond current container labels.
  - [x] Retained runtime identity metadata from deployment read models enriches deployment-id-only
    artifacts when present.
- [x] Prove the `0.12.0` slice answers objective operator questions about current attribution,
  capacity pressure, disk ownership classes, current deployment/runtime context, and next
  diagnostic action without adding dashboard-only metrics.
- [x] Expose the accepted query through CLI and HTTP/oRPC shared schemas.
- [x] Add Web readback after query DTOs and i18n keys exist.
- [x] Preserve existing rejection for unsupported CPU/memory/replicas/runtime sizing config fields.

Pulled-forward runtime monitoring observation baseline:
- [x] Bounded runtime usage sample retention and rollup queries for charts.
- [x] Non-enforcing usage thresholds, warning/critical state, and operator visibility.
- [ ] Runtime sizing, quotas, or enforcement.

Post-`0.12.0` monitoring boundary:
- [x] Runtime Monitoring Observation has an accepted boundary ADR and feature artifact that defines
  bounded samples, rollups, charts, deployment markers, log/event/diagnostic linkage, and
  non-enforcing thresholds without turning Appaloft into Prometheus, APM, custom metric ingestion,
  dashboard building, alert routing, billing analytics, quota, cleanup, or runtime enforcement.
- [x] Bounded samples, rollups, charts, and threshold visibility are selected as an active
  pre-RC baseline rather than a post-GA placeholder. The
  [Runtime Monitoring Observation Boundary](./specs/069-runtime-monitoring-observation-boundary/spec.md)
  Spec/Test-First/Code/Docs rounds are implemented with CLI, HTTP/oRPC, Web, SDK metadata,
  generated MCP/tool descriptors, disabled-by-default collector wiring, and GitHub Actions/local
  explicit real-target smoke gates.

## Phase 11: 1.0.0 Release Candidate

Target: `1.0.0-rc`.

Release rule:
- [x] Select `1.0.0-rc` only after `0.12.0` is complete or explicitly deferred, no unchecked
  pre-rc release blocker
  remains, and the candidate is being used for GA hardening rather than new feature scope.
- [x] If release-candidate verification finds feature gaps, return the gap to the owning roadmap
  phase or release a `0.12.x` patch instead of expanding `1.0.0-rc` scope.

Required:
- [x] Re-run the full `1.0.0 Definition Of Done` against current implementation, specs, operation
  catalog, docs, migration gaps, and release artifacts.
- [x] Verify installer, upgrade, static console serving, docs packaging, CLI, HTTP/oRPC, Web,
  generated SDK, and generated MCP/tool contract surfaces use the same operation catalog semantics.
- [x] Verify all GA-blocking smoke suites pass or have accepted release notes and explicit
  migration gaps.
- [x] Freeze release-candidate scope to hardening, compatibility, packaging, documentation,
  migration, and support-readiness fixes only.

Exit criteria:
- [x] The release candidate can be promoted to `1.0.0` without adding new product behavior.
- [x] Remaining gaps are either closed or explicitly accepted as non-GA-blocking in the roadmap,
  specs, public docs, and release notes.

## Phase 12: 1.0.0 GA

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

## Future AI-Native Resource Template And MCP Tracks

Target: post-`1.0.0` planning by default.

The v1 Appaloft Agent Deploy Skill is not part of this post-`1.0.0` track set. It is a GA readiness
item above because it is a documentation/skill entry experience over existing CLI/API operations,
not a new MCP transport or template capability.

These tracks are recorded so future Spec Rounds do not model MCP servers, AI tool servers, or
template-backed software as a separate deployment engine. They are not current release blockers and
do not authorize runtime code before their own ADR/spec/test gates.

Governing planning document:
- [AI-Native Skill, Resource Template, And MCP Roadmap](./implementation/ai-native-resource-template-roadmap.md)

Roadmap principles:
- [ ] Preserve Appaloft's existing Resource, Workload, ResourceInstance, ResourceBinding,
  Deployment, RuntimePlan, EnvironmentSnapshot, Provider, Strategy, Integration, Plugin, command/
  query, and operation-catalog boundaries.
- [ ] Define a generic Resource Template / Workload Profile foundation before MCP-specific
  behavior. Templates describe deployable intent and must not be Docker Compose-only.
- [ ] Resolve template/profile deployment into existing application operations and deployment
  planning instead of bypassing the application layer.
- [ ] Add a template catalog/registry layer for local, repository, git, official, private, and
  licensed distribution modes without making curated catalogs a prerequisite for community use.
- [ ] Treat AI tool-server / MCP support as capability/profile metadata, generated outputs, docs,
  safe defaults, and gateway compatibility over the generic foundation.
- [ ] Plan Appaloft-as-MCP as a future interface over existing operations, using the same operation
  catalog, command/query schemas, neverthrow errors, operation ids, and correlation ids as CLI,
  HTTP/oRPC, and Web.
- [ ] Plan Appaloft-hosted MCP server templates as deployable Resources or dependency-backed
  workloads on user-owned infrastructure, not as a new MCP-specific deployment path.
- [ ] Defer MCP Gateway / Tool Gateway governance until template/tool-server foundations exist; the
  gateway is a policy, audit, identity, rate-limit, approval, redaction, and correlation layer above
  hosted tool servers.
- [ ] Keep AI-native observability, AgentOps, cost governance, eval hooks, model gateway, and agent
  runtime as long-term themes rather than initial template/MCP dependencies.

Candidate sequencing:
- [ ] Post-1.0 Track 1: Resource Template / Workload Profile Foundation. If maintainers deliberately
  pull this before GA, first update the version plan with an explicit pre-GA phase and explain which
  existing GA blocker is being replaced or deferred.
- [ ] Post-1.0 Track 2: Template Resolution And Deployment Planning. This depends on Track 1 being
  specified and must not reserve a `0.x` version while it remains post-`1.0.0` work.
- [ ] Post-1.0 Track 3: Template Catalog / Registry. This depends on resolution semantics and must
  not reserve a `0.x` version while it remains post-`1.0.0` work.
- [ ] Post-1.0 Track 4: AI Tool Server / MCP Capability. This is capability/profile metadata over
  the generic template layer and must not reserve a `0.x` version while it remains post-`1.0.0`
  work.
- [ ] Post-1.0 Track 5: Appaloft-as-MCP Interface Planning. This goes through the existing operation
  catalog and application buses and must not reserve a `0.x` version while it remains post-`1.0.0`
  work.
- [ ] Post-1.0 Track 6: Curated AI Tool Server Templates. This depends on edition, trust, secret,
  health, docs, and generated-client-config decisions and must not reserve a `0.x` version while it
  remains post-`1.0.0` work.
- [ ] Post-1.0 Track 7: MCP Gateway / Tool Gateway. This depends on gateway audit/redaction/
  identity/policy decisions and must not reserve a `0.x` version while it remains post-`1.0.0`
  work.

## Resource And Internal State Coverage Ledger

This ledger is the horizontal closure checklist. Each resource or internal state needs the unchecked
work below before GA.
- [x] Project: `projects.create`, `projects.list`.
- [x] Project: show, rename, archive safety, Web detail/settings closure, and
  resource/environment/deployment/access rollups.
- [x] Project post-Phase 4: description editing is active through `projects.set-description`,
  archived project restore is active through `projects.restore`, and archived project delete safety
  plus guarded tombstone delete are active through `projects.delete-check` and `projects.delete`,
  with application, CLI, HTTP-oRPC, Web, PGlite, catalog, docs-registry, OpenAPI, SDK, and public
  docs evidence recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md).
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
- [x] Source link: list/show/delete or archive, PostgreSQL/control-plane persistence before API/Web.
  Closed for the list/show/delete path by the application, CLI, HTTP-oRPC, catalog,
  docs-registry, OpenAPI, SDK, public docs, and AI-facing CLI-entrypoint evidence recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md). Source links remain mapping
  state rather than lifecycle aggregates, so no source-link archive operation is claimed.
- [x] Deployment attempt: create/list/show/logs.
- [x] Deployment attempt: stream events.
- [x] Deployment attempt: retry/redeploy, rollback candidate/readiness, archive/prune.
  Cancel is active through `deployments.cancel`, and terminal attempt archive plus dry-run-first
  guarded prune are active through `deployments.archive` and `deployments.prune`, with application,
  persistence, CLI, HTTP/oRPC, catalog, docs-registry, OpenAPI, SDK, public docs, and AI-facing
  CLI-entrypoint evidence recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md).
- [x] Runtime artifact/instance: internal snapshot and resource/deployment diagnostic context.
- [x] Runtime artifact/instance: capacity diagnostics, cleanup/prune, preview artifact cleanup, and
  rollback-candidate retention.
- [x] Runtime usage: read-only current attribution for server, project, environment, resource, and
  deployment scopes. Governed by
  [Runtime Usage Attribution And Monitoring](./specs/068-runtime-usage-attribution-and-monitoring/spec.md).
- [x] Runtime monitoring: bounded sample read/write storage, internal collector process
  visibility, disabled-by-default active-server/resource/deployment/project/environment collector
  runner, sample/rollup reads, deployment markers, log/event/diagnostic links, non-enforcing
  threshold readback, exact-scope CPU/memory/disk threshold configuration, server/resource Monitor sparklines,
  Project detail project/environment rollup-only readback, WebView Observe verification,
  sample-evidence-based threshold inheritance, and MCP/tool handler dispatch are implemented.
  Cross-window log/event filtering and richer observability navigation remain governed follow-up
  slices. Governed by
  [Runtime Monitoring Observation Boundary](./specs/069-runtime-monitoring-observation-boundary/spec.md).
- [x] Default access policy: static/shell configuration selects provider; generated routes are
  visible through `ResourceAccessSummary`.
- [x] Default access policy: configure, show, update/disable, preserve resource access projection.
- [x] Generated/server-applied route state: planned/latest generated routes, latest server-applied
  routes, latest durable routes, proxy status, and proxy preview are visible through read models.
- [x] Generated/server-applied route state: precedence hardening.
- [x] Generated/server-applied route state: route intent update/delete/reconcile where needed,
  provider-route projection/retention, and API/CLI/Web coverage.
  Closed by the domain-binding route, server-applied route, provider projection, access regression,
  and Web evidence recorded in [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md).
- [x] Domain binding: create, confirm ownership, list, ready routes projected into resource access
  summary.
- [x] Domain binding: show, update route behavior where allowed, retry verification, delete/archive.
  Closed by domain binding lifecycle and route/access evidence recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md).
- [x] Certificate: issue/renew, list.
- [x] Certificate: show, import, retry, revoke/delete, renewal attempt visibility.
  Closed by certificate lifecycle evidence recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md).
- [x] Resource health policy: configure, health query.
- [x] Resource health policy: reset/delete policy fields.
  Closed by `resources.reset-health` application, CLI, HTTP/oRPC, catalog, docs, and SDK evidence
  recorded in [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md).
- [x] Resource health policy: effective health observation history.
  Closed by `resources.health-history` application query, PG/PGlite
  `resource_health_observations` recorder/read-model, CLI, HTTP/oRPC, contracts, catalog, OpenAPI,
  SDK metadata, public docs/help, and executable `RES-HEALTH-HIST-*` evidence recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md).
- [x] Runtime logs: resource logs/stream and deployment logs.
- [x] Runtime logs: bounded logs, unavailable-state diagnostics, retention/prune.
  Resource runtime logs, deployment logs, provider job log retention prune, embedded deployment log
  prune, and Appaloft-owned resource runtime log archive/list/show/prune are covered with CLI and
  HTTP/oRPC entrypoints, persistence tests, and safe redaction/retention boundaries. Global
  retention defaults, domain event stream retention, outbox/inbox retention, and scheduled
  retention automation remain under the broader audit/event retention gaps.
- [x] Environment/resource secrets: environment set/unset variable baseline.
- [x] Environment/resource secrets: secret reference create/list/show/update/delete, masking,
  build/runtime scope. Closed by explicit Resource-owned secret reference lifecycle operations
  `resources.secrets.create`, `resources.secrets.rotate` (the value update operation),
  `resources.secrets.delete`, `resources.secrets.list`, and `resources.secrets.show` with
  application, CLI, HTTP/oRPC, operation catalog, public docs/help, OpenAPI, SDK metadata, and
  typecheck evidence recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md).
- [x] Storage volume: create/list/show/rename/delete, attach/detach, backup relationship metadata,
  deployment-driven runtime realization, and dry-run-first runtime cleanup.
- [x] Dependency resource instance: provision/import/list/show/rename/delete for Postgres and Redis.
- [x] Resource binding: bind/unbind/list/show/rotate, immutable deployment snapshot, and runtime
  injection materialization.
- [ ] Webhook/auto-deploy: create/list/show/update/delete, delivery attempts, replay, secret
  rotation.
- [x] Action PR preview: deploy/update from a user-authored GitHub Actions workflow with generated
  or user-owned wildcard preview access through the published `appaloft/deploy-action` wrapper,
  preview cleanup mapping, Marketplace examples, and public wrapper CI.
- [x] Self-hosted Action server API trigger: user-authored GitHub Actions workflow can call an
  existing self-hosted Appaloft server with trusted project/environment/resource/server ids to
  create a deployment without installing CLI, opening SSH, or mutating SSH-server PGlite state.
- [x] Self-hosted Action server config deploy: user-authored GitHub Actions workflow can hand a
  bounded source package reference and selected config path to the self-hosted server, which owns
  repository config bootstrap and ids-only deployment admission without runner-side CLI/SSH/PGlite
  mutation. Spec Round is
  [Action Server Config Deploy](./specs/050-action-server-config-deploy/spec.md), with workflow
  contract in [Action Server Config Deploy](./workflows/action-server-config-deploy.md).
- [x] Self-hosted Action API auth: action mutation endpoints require an Appaloft deploy token or
  future OIDC exchange, and rejected requests fail before source-link, resource, route, or
  deployment mutation.
- [x] Auth/org/team: self-hosted install can bootstrap a default admin, operators can invite or
  add team members into an organization, and project/resource access is scoped by membership before
  deployment APIs are considered production-secure.
- [x] TypeScript SDK and interface parity: publish `@appaloft/sdk` as an operation client over the
  authenticated HTTP/oRPC contract, keep CLI and HTTP as sibling adapters over the same
  command/query schemas, and allow internal black-box tests to use the SDK only where a running
  server boundary is the subject.
- [x] Product-grade preview deployment: create from PR event, list/show/update policy/delete on
  close, scoped env, GitHub App status/comments, and cleanup retries.
  Spec, operation catalog, CLI, HTTP/oRPC, Web, future MCP descriptors, public docs/help, safe
  GitHub pull-request ingestion, feedback, cleanup retry, and persistence coverage are implemented.
  A secret-gated live GitHub PR-comment feedback provider smoke gate is active. Full GitHub App
  installation-token onboarding, broader hosted provider smoke coverage, and managed-domain public
  enablement remain future hardening/public enablement work.
- [x] Scheduled task: create/list/show/update/delete, run now, run history/logs. Spec Round
  positioned by ADR-039 and `docs/specs/044-scheduled-task-resource-shape`.
  Operation catalog, CLI, HTTP/oRPC, Web controls, run history/logs, scheduled runner, runtime
  adapter, persistence, docs/help, and durable delivery handoff are implemented; the shell runner is
  opt-in by configuration.
- [x] Terminal session: open.
- [x] Terminal session: active list/show/attach/close/expire and redacted metadata.
  WebSocket attach, active lifecycle list/show/close/expire, CLI and HTTP/oRPC lifecycle surfaces,
  operation catalog entries, docs/help, and safe metadata redaction coverage are implemented.
- [x] Terminal session: interactive attach hardening.
  Web E2E coverage for resource/server attach, close-frame cleanup, resize-frame forwarding, and
  active-session lifecycle is implemented with mocked attach sockets. Durable open/close audit
  metadata is implemented through audit-event rows, without retaining terminal input/output.
  Deployment detail deep-links to the selected resource terminal deployment, and CLI
  server/resource `--attach` covers direct TTY bridging while preserving descriptor-only output as
  the default. Local true PTY resize and provider-native terminals remain governed runtime/provider
  follow-ups rather than Web affordance gaps.
- [x] Outbox/inbox/job/process state: list/show/retry/cancel/dead-letter/prune, attempt ownership.
  ADR-054 positions durable process delivery as the accepted baseline. Scheduled-task runs now have
  first worker execution, atomic claims, completion, and retry-generation handoff. Scheduled
  runtime prune now has accepted maintenance recording, atomic claim/completion handoff,
  command-bus dispatch, retry-scheduled failure visibility, and safe persisted operator details.
  Scheduled history retention now has command-bus dispatch through durable process attempts, and
  the current accepted long-running workflow set has operator-visible process-attempt projection
  plus `operator-work.*` list/show/retry/cancel/dead-letter/prune coverage. Remaining automatic
  provider/runtime retry workers require governed explicitly-enabled worker slices and are not a
  separate Phase 9 release blocker.
- [x] Remote SSH PGlite state: partial config workflow.
- [x] Remote SSH PGlite state: show locks/migrations/backups/recovery diagnostics.
  Operator-work aggregation and SSH diagnostics producer/read-model coverage expose safe lock,
  migration journal, backup, and recovery-marker rows without mutating remote state or leaking SSH
  identity paths.
- [ ] Remote SSH PGlite state: retry/repair/prune.
  Stale-lock recovery and explicit old marker/archive prune have executable evidence, but
  standalone migration execution, backup restore, state-root prune, and generic durable worker
  promotion remain future governed business operations unless maintainer-approved as non-GA-blocking
  for this pre-RC closure.
- [x] Audit/event history: event specs and partial runtime events.
- [x] Audit/event history: aggregate-scoped list/show/filter/export, retention prune, and redaction.
  `audit-events.list/show/export/prune` cover retained aggregate-scoped audit rows, bounded
  redacted export, dry-run-first retention prune, CLI and HTTP/oRPC dispatch, persistence, and
  public docs/help coverage.
- [x] Audit/event history: immutable archive snapshots and archive-aware retention.
  Global audit export is governed by ADR-056 and implemented through `audit-events.export-global`.
  Legal hold is governed by ADR-057 and implemented through
  `audit-events.legal-holds.configure/list/show/release` with hold-aware audit prune. Immutable
  archive is governed by ADR-058 and implemented through
  `audit-events.archives.create/list/show/prune` with retained redacted snapshots, digest metadata,
  archive pruning, and archive-aware audit prune source-row retention.
- [x] Audit/event history: organization defaults, scheduled retention automation, and current
  outbox/inbox-equivalent retention.
  Domain event stream retention has ADR-059, active `domain-events.prune`, feature artifacts,
  command spec, test matrix rows, `domain_event_stream_records` retained observation store,
  retained `deployments.stream-events` replay/gap/follow behavior, entrypoints, and focused
  verification. Organization retention defaults have ADR-060, feature artifacts, operation-map
  positioning, test matrix, application/persistence implementation, CLI, HTTP/oRPC, public
  docs/help, OpenAPI/SDK metadata, and focused tests. Scheduled history retention automation has
  ADR-061, feature artifacts, operation-map positioning, a test matrix, application service
  dispatch, durable process attempt visibility, disabled-by-default shell runner wiring, and
  focused tests. ADR-054 defines durable process attempts as the current outbox/inbox-equivalent
  baseline; `operator-work.prune` covers retention for that process state. A separate outbox/inbox
  retention command is not applicable unless a future ADR introduces a separate outbox/inbox store.
- [x] Providers/plugins/system: list providers/plugins, doctor, db status/migrate.
- [x] Providers/plugins/system: show capabilities/config diagnostics, safe enable/disable only when
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
- [x] Static/Node/Python/JVM fixture smoke: current supported JavaScript/TypeScript/Python/JVM
  catalog resource profiles produce Docker/OCI image artifact plans and headless execution evidence.
- [x] Static/Node/Python/JVM real fixture smoke: shared GitHub Actions/local explicit Docker and
  generic-SSH fixture slices build, run, verify internal HTTP, and record runtime metadata/logs from
  the same resource profile vocabulary when explicit external targets are configured.
- [x] Spring Boot real fixture smoke: generated Dockerfiles use Maven/Gradle build images and the
  Maven wrapper/no-wrapper plus Gradle Groovy/Kotlin DSL fixtures have GitHub Actions/local explicit
  Docker/generic-SSH smoke descriptors.
- [x] Generic Java deterministic jar real fixture smoke: `generic-java-jar` is a runnable jar fixture
  and owns the `ZSSH-CATALOG-012` local Docker/generic-SSH smoke descriptor.
- [x] Quarkus Maven JVM jar real fixture smoke: generated Dockerfiles use a Maven build image and
  start `target/quarkus-app/quarkus-run.jar` through the `ZSSH-CATALOG-017` local
  Docker/generic-SSH smoke descriptor.
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
- [x] Python: broaden real Docker/SSH smoke beyond the representative slice through the shared
  framework smoke descriptor set. Deeper Django collectstatic/static handling remains separate
  planner hardening.
- [x] Java/JVM: generic Maven/Gradle planner exists.
- [x] Java/JVM: add Spring Boot first.
- [x] Java/JVM: add Quarkus Maven JVM jar mode.
- [ ] Java/JVM: add Micronaut if demand justifies it.
- [x] Ruby: add Rails and generic Rack/Sinatra planners or explicit fallback errors.
- [x] PHP: add Composer app planner with PHP-FPM or app-server policy.
- [x] Go: add generic Go build plus common HTTP framework detection as metadata/defaults.
- [x] .NET: add ASP.NET Core planner with `dotnet publish` artifact rules.
- [x] Rust: add generic Cargo build plus common HTTP framework metadata/defaults.
- [x] Elixir: add Phoenix release planner with `mix` and runtime image policy.
- [ ] Buildpack-style auto-detection: add only after explicit planners remain deterministic; expose
  generated plan, builder policy, limitations, overrides/fix paths, and unsupported-field errors.
  The current Spec Round limits this to adapter-owned accelerator preview/contract guardrails and
  does not claim real `pack`/lifecycle execution.

2026-05-16 pre-RC framework closure evidence:

- Ruby, PHP, Go, .NET, Rust, and Elixir now have deterministic source-detection fixtures,
  workspace-command planner output, and headless Docker/OCI smoke coverage under
  `WF-PLAN-CAT-011`, `WF-PLAN-CAT-012`, `WF-PLAN-CAT-014`, `WF-PLAN-CAT-015`, and
  `WF-PLAN-SMOKE-003`. This closes the broad framework auto-detection blocker without claiming
  real `pack`/lifecycle buildpack execution.

## External Baseline Gap Checklist

External baseline research points to this practical minimum:
- [x] Docker substrate with Dockerfile, Compose, and prebuilt image paths.
- [ ] Buildpack/auto-detect option with explicit plan output. The contract now has a Phase 5
  feature artifact and stable matrix ids; Code Round still needs executable preview parity.
- [x] Static site packaging and first-class publish-directory semantics.
- [x] URL-first first-deploy entry experience: let CLI/Web/future tools lead with "source or local
  static output in, verified URL out" while still dispatching explicit Resource and Deployment
  operations. Governed by
  [URL-First Deployment Entry Experience](./specs/071-url-first-deployment-entry-experience/spec.md).
- [x] Upload-like local static output entry: accept an already-built local static output directory
  as deploy input for BYOS targets without introducing Appaloft-hosted artifact routing by default.
- [x] Generated domains and custom domains as separate concepts.
- [ ] Full HTTPS/ACME, force HTTPS, and redirect lifecycle closure.
- [ ] Environment variables, build-time arguments, build secrets, and secret masking.
- [x] Persistent storage and databases with service binding, backup/restore, and deletion behavior.
- [x] Git source binding, Action PR previews, and product-grade preview deployments.
- [ ] Webhook/auto-deploy delivery attempts, replay, secret rotation, and day-two management.
- [ ] Deployment history, standalone event stream, health checks, rollbacks, and resource limits.
- [x] Framework auto-detection broad enough for modern frontend frameworks and common backend
  frameworks.
- [x] AI-agent safe deployment protocol and outcome-first completion output generated from the same
  operation catalog and public docs, with future MCP/tool descriptors reusing the same semantics.
- [x] Pre-v1 Appaloft skill: publish a standard skill-manager install path so coding agents can run
  `npx skills add appaloft/appaloft` and use the complete operation catalog safely before the full
  MCP product surface exists. Deploy remains an internal subprotocol of the full Appaloft skill.
  Governed by
  [Appaloft Agent Deploy Skill](./specs/072-appaloft-agent-deploy-skill/spec.md).

## Immediate Spec-Round Todo

Recommended next Spec Rounds before broad Code Rounds:
- [x] URL-first deployment entry experience: categorize low-friction deployment lessons as
  user-layer Quick Deploy/first-deploy work, keep BYOS/runtime boundaries unchanged, and record
  follow-up tests/docs in
  [docs/specs/071-url-first-deployment-entry-experience](./specs/071-url-first-deployment-entry-experience/spec.md).
- [x] Appaloft agent deploy skill: position skill as the v1-priority AI-native affordance before
  MCP, define the safe deploy protocol and outcome packet, and keep it mapped to existing CLI/API
  operations in
  [docs/specs/072-appaloft-agent-deploy-skill](./specs/072-appaloft-agent-deploy-skill/spec.md).
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
  headless coverage for the current supported JavaScript/TypeScript/Python/JVM catalog.
- [x] Framework support tier matrix: add and run the first representative GitHub Actions/local
  explicit real local Docker fixture smoke slice for static/frontend, Node/server, and Python/server
  fixtures.
- [x] Framework support tier matrix: promote JavaScript/TypeScript catalog closure rows and
  `deployments.plan/v1` catalog preview contract rows for tested headless Docker/OCI readiness.
- [x] Framework support tier matrix: broaden fixture-by-fixture real Docker/SSH deployment smoke
  rows for the active JavaScript/TypeScript/Python/JVM catalog through shared GitHub Actions/local
  explicit smoke descriptors.
- [x] Deployment observation and recovery: harden `deployments.stream-events` reconnect/gap/CLI
  coverage, harden active retry/redeploy edge cases, rebuild public `deployments.cancel` with
  executable evidence, and harden rollback candidate/readiness coverage.
- [x] Access/domain/TLS closure: domain binding show/update/delete/retry and certificate
  import/revoke/retry.
  Closed by application, CLI, HTTP/oRPC, Web, provider-route, and docs/catalog evidence recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md).
- [x] Dependency resource lifecycle: Postgres/Redis provision/import, bind/unbind, secret rotation,
  backup/restore, delete, and opt-in scheduled backup policy configuration. Docker-backed
  Appaloft-managed Postgres/Redis for single-server targets is implemented in the shell provider and
  Web console; remaining work is backup prune/export and broader provider catalog coverage.
- [ ] Operator state closure: outbox/inbox/jobs, remote SSH state diagnostics, runtime target
  capacity diagnostics, audit/event retention, and prune/recovery commands.
  Active operator-work, runtime capacity, audit/event/log retention, scheduled retention, SSH
  diagnostics, and explicit old remote-state marker prune evidence is recorded in
  [Pre-RC Closure And Hardening](./specs/073-pre-rc-closure/tasks.md). Standalone remote SSH
  migration execution, backup restore, state-root prune, and generic durable worker promotion remain
  pending implementation or maintainer approval as non-GA-blocking.
