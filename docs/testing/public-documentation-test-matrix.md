# Public Documentation Test Matrix

> GOVERNING DOCUMENT
>
> This matrix defines expected coverage for public documentation, help anchors, localization,
> search, agent-readable documentation, and release packaging.

## Normative Contract

Public documentation coverage is part of user-visible behavior closure.

When a behavior changes user-controlled input, output, status, recovery, workflow sequencing, or
entrypoint affordances, the relevant test rows in this matrix must be updated or explicitly marked
not applicable in the governing spec change.

Automated checks may be added over multiple implementation slices. Until a row is automated, specs
and final round summaries must identify the row as a documented manual or deferred coverage gap.

## Coverage Rows

| ID | Scenario | Preferred automation | Required assertion |
| --- | --- | --- | --- |
| PUB-DOCS-001 | Public docs IA includes required nested grouped sections. | contract | The docs app navigation or source metadata contains Start Here, Deploy, Projects And Resources, Servers And Credentials, Environments And Configuration, Access, Domains And TLS, Observe And Troubleshoot, Integrations, Reference, and Self-Hosting And Operations, and user-input groups expose nested task/concept/troubleshooting/reference pages instead of only a group overview. |
| PUB-DOCS-002 | User-visible operation has public docs coverage. | contract | Every user-facing operation catalog entry that changes or exposes behavior maps to a public docs page, anchor, not-applicable decision, or explicit migration gap. |
| PUB-DOCS-003 | Product help anchors are stable and explicit. | contract | Web `?`, CLI docs/help, API descriptions, and future MCP/tool help targets use explicit stable anchors, not generated translated heading ids. |
| PUB-DOCS-004 | Public docs links resolve. | integration | Internal links, public docs links, and anchor links resolve in the built docs output. |
| PUB-DOCS-005 | Help registry entries resolve to built docs. | integration | Each registered topic id resolves to exactly one built page and anchor for each required locale or declared locale gap. |
| PUB-DOCS-006 | Docs search indexes task and troubleshooting pages. | integration | Built search data includes required task, concept, reference, and troubleshooting pages with configured keywords or aliases. |
| PUB-DOCS-007 | Locale coverage is explicit. | contract | Each public docs page declares locale state for `zh-CN` and `en-US`; required help anchors are stable across locales. |
| PUB-DOCS-008 | Agent-readable docs index is valid. | integration | `/llms.txt` or the selected generated equivalent contains curated links to the main public docs sections and does not include internal-only migration notes. |
| PUB-DOCS-009 | Per-page Markdown or copyable Markdown exists where required. | integration | User task and reference pages can be consumed as Markdown or copied as Markdown without losing required headings, examples, or warnings. |
| PUB-DOCS-010 | Web console help affordances link to public docs. | e2e-preferred | A representative Web form help affordance opens the expected `/docs/*#anchor` target without leaving the local self-hosted product context when docs are served locally. |
| PUB-DOCS-011 | CLI help can surface docs links. | e2e-preferred | A representative CLI command or interactive prompt prints or opens the expected docs topic link for a user-controlled input. |
| PUB-DOCS-012 | HTTP/API descriptions point at public docs. | contract | A representative HTTP/oRPC/OpenAPI description references the expected public docs topic without redefining separate transport-only semantics. |
| PUB-DOCS-013 | Binary bundle embeds docs separately from Web console assets. | e2e-preferred | A binary bundle serves Web console assets and docs assets independently, with docs available under `/docs/*`. |
| PUB-DOCS-014 | Docs static directory override works. | e2e-preferred | Setting the docs static override environment variable serves replacement docs assets without overriding Web console assets. |
| PUB-DOCS-015 | Secret and diagnostic guidance is safe. | contract | Troubleshooting and diagnostic docs explain masked secrets and safe support payload sharing without instructing users to expose secret values. |
| PUB-DOCS-016 | Public docs topics are traceable to specs and product surfaces. | contract | Topics that explain governed behavior record the public page/anchor, internal spec references, and the Web/CLI/API surface that links users to the topic. |
| PUB-DOCS-017 | Public error guides are human- and agent-readable. | contract | Registered public error guides resolve to a human docs anchor and an agent-readable JSON guide with safe details, responsibility, actionability, remedies, and governing specs. |

## Current Implementation Notes And Migration Gaps

`apps/docs` now provides a Fumadocs/Next static docs app.

Current status:

- `PUB-DOCS-001` is covered by the IA v2 Fumadocs sidebar groups and nested page set. Deploy,
  resources, servers, environments, access, observe, integrations, reference, and self-hosting each
  expose concrete child pages below the group overview.
- `PUB-DOCS-002` is covered by `@appaloft/docs-registry` operation coverage tests. Every current
  `packages/application/src/operation-catalog.ts` key must have exactly one public docs decision:
  documented topic, not-applicable reason, or explicit migration gap. The current operation catalog
  maps to documented public topics, including Phase 7 storage, dependency resource,
  dependency-binding, backup/restore, retry, redeploy, rollback, and source auto-deploy
  operations.
- `PUB-DOCS-003` is covered for registered help topics by `@appaloft/docs-registry`; full
  enforcement for every Web/CLI/API/MCP help target is still incomplete. Source auto-deploy now has
  registered stub anchors for setup, signatures, dedupe, ignored events, and recovery before Code
  Round activation. Resource runtime controls now have registered stub anchors for runtime
  controls, restart versus redeploy, and blocked start before Code Round activation. Docker Swarm
  runtime targets now have a registered server docs anchor for default-active Swarm execution.
  Action-only pull request previews and control-plane product-grade previews now have registered
  `deploy/previews` anchors that distinguish workflow-file previews from control-plane previews.
  Dependency runtime injection now has a registered dependency docs anchor for plan/show blocked
  readiness and safe bind-to-deploy behavior.
  Self-hosted Docker install docs now describe the PostgreSQL default, `install.sh --database
  pglite` escape hatch, direct `3721` access, and `--domain` Appaloft instance console route under
  the stable `self-hosting/install#self-hosting-install-docker` anchor.
  Self-hosted Action deploy-token docs now describe installer bootstrap output, GitHub Secret
  wiring through `appaloft-token`, 401/403 recovery, scope meaning including id-free target
  resolution, CLI lifecycle commands, and admin-protected HTTP/API lifecycle endpoints under
  `self-hosting/action-deploy-token-auth#self-hosting-action-deploy-token-auth`.
  Self-hosted first-admin docs now describe installer-driven local admin bootstrap, generated
  one-time passwords, login URL expectations, public bootstrap status/setup endpoints, OAuth
  optionality, console sign-out, required OAuth provider settings, callback URL expectations,
  trusted origin configuration, and product auth 401/403 recovery under
  `self-hosting/first-admin-bootstrap#self-hosting-first-admin-bootstrap`.
  Self-hosted organization/team docs now describe current context, current organization switching,
  member and invitation lists, member invitation, role updates, removal, CLI session handoff, safe
  outputs, and product auth 401/403 recovery under
  `self-hosting/organization-team-management#self-hosting-organization-team-management`.
  Repository config docs now describe `controlPlane.mode`, safe `controlPlane.url` usage, and the
  narrow advanced-bootstrap role of `controlPlane.deploymentContext` under
  `environments/reference/config-file#environment-config-file-control-plane`.
  Repository config docs now also describe source/runtime fields, including Dockerfile path,
  Docker Compose file path, Docker build target, and static publish directory, under
  `environments/reference/config-file#environment-config-file-runtime`.
  CLI remote control-plane client docs now describe login/profile/context storage, local fallback,
  remote typed SDK dispatch, explicit unsupported-operation behavior, and the no-adoption/no-secret
  boundary under `reference/cli#cli-remote-control-plane-login` and
  `reference/cli#cli-remote-control-plane-dispatch`.
- `PUB-DOCS-004` is partially covered by successful static build and explicit anchor smoke checks;
  a dedicated automated link checker does not exist yet.
- `PUB-DOCS-005` is covered for registered help topics by tests that resolve each locale page and
  explicit anchor in docs source.
- `PUB-DOCS-006` is covered at build level by Fumadocs static Orama search index generation.
- `PUB-DOCS-007` is covered at content-schema level by required `localeState` frontmatter for each
  docs page.
- `PUB-DOCS-008` is covered by the curated `apps/docs/public/llms.txt` file.
- `PUB-DOCS-010` has expanded Web coverage for quick deploy, resource-create, project
  detail/settings lifecycle, domain binding, resource detail, deployment target, server
  default-access, connectivity, runtime logs, diagnostics, and terminal surfaces. Covered help
  topics include source, server target, SSH credentials, connectivity testing, environment
  selection, variable precedence, project lifecycle, project setting side effects, resource
  identity, runtime, health, network profile, custom domain, generated access route, TLS
  certificate readiness, proxy readiness, safe diagnostic payloads, runtime logs, terminal
  sessions, and resource detail/profile editing closure for source/runtime/network/access/health/
  configuration sections. Server registration provider help now points at the Docker Swarm runtime
  target anchor for cluster-target readiness and unsupported-field recovery.
  Self-hosted Action deploy-token auth is covered as an installer, GitHub Action, CLI lifecycle,
  HTTP/API error, admin-protected lifecycle API, and future MCP/tool help topic; Web lifecycle
  management surfaces remain later Phase 8 work.
  Self-hosted first-admin bootstrap is covered as an installer, Web onboarding/login, public
  bootstrap HTTP/API, product auth error recovery, and future member/token management help topic.
  Organization/team operation contracts are now covered by the stable
  `self-hosting.organization-team-management` help topic for HTTP/API routes, CLI commands, session
  input, safe outputs, owner-retention recovery, current organization switching, and apps/web
  `/organization` member/deploy-token management.
  Repository config docs now cover user-facing application graphs for `dependencies`,
  `dependencies.<key>.backup`, `storage`, `scheduledTasks`, `autoDeploy`, `access.generated`,
  `monitoring.thresholds`, `preview.pullRequest.policy`, `profiles.<key>`,
  `preview.pullRequest.profile`, plus Resource health policy through
  `health`, including ids-only deployment admission, preview provenance cleanup
  where applicable, dependency backup policy reconciliation, Resource auto-deploy policy
  reconciliation, Resource generated access profile reconciliation, exact Resource-scope
  non-enforcing monitoring threshold reconciliation, Resource preview policy reconciliation,
  selected named profile overlay application,
  selected PR preview overlay application, Resource health policy reconciliation, and the
  no-secret/no-provider-handle boundary
  under
  `environments/reference/config-file#environment-config-file-dependencies`,
  `#environment-config-file-storage`, `#environment-config-file-generated-access`,
  `#environment-config-file-monitoring-thresholds`, `#environment-config-file-named-profiles`,
  `#environment-config-file-preview-profile`, `#environment-config-file-preview-policy`,
  `#environment-config-file-health`,
  `#environment-config-file-scheduled-tasks`, and `#environment-config-file-auto-deploy`.
- `PUB-DOCS-011` has expanded CLI coverage for high-confusion operations including deployment
  source, preview cleanup, source relink, SSH credentials, server connectivity, terminal sessions,
  project lifecycle, resource profiles, environment variables, domains, certificates, logs, health,
  diagnostics, and deployment plan preview blocked/fix/override guidance.
- `PUB-DOCS-011` now also covers Docker Swarm target registration guidance through CLI
  `server register` help.
- `PUB-DOCS-011` now also covers scheduled task lifecycle, run-now, run history, and run-log
  guidance through CLI `scheduled-task` help.
- `PUB-DOCS-011` now also covers dependency resource and resource dependency binding guidance
  through CLI dependency help. Dependency runtime injection has a registered CLI help target for
  plan/show blocked readiness.
- `PUB-DOCS-011` now also covers CLI remote control-plane login/context help through the stable
  `cli.remote-control-plane-login` topic.
- `PUB-DOCS-012` has expanded HTTP/API route-description coverage for high-confusion operations
  including deployment source, SSH credentials, server connectivity, resource profiles, environment
  variables, project lifecycle, domains, certificates, logs, health, diagnostics, and terminal
  sessions. The HTTP API reference page also names the runtime OpenAPI document path
  `/api/openapi.json`, Scalar reference path `/api/reference`, and docs-generated OpenAPI
  reference path `/docs/reference/openapi/`.
- `PUB-DOCS-012` now also covers Docker Swarm target registration guidance through the HTTP
  `POST /servers` route description.
- `PUB-DOCS-012` now also covers scheduled task lifecycle, run-now, run history, and run-log
  guidance through the scheduled-task HTTP route descriptions.
- `PUB-DOCS-012` now also covers dependency resource and resource dependency binding route
  descriptions through the dependency resource lifecycle anchor. Dependency runtime injection has a
  registered HTTP/API help target for plan/show blocked readiness.
- `PUB-DOCS-013` is covered by HTTP adapter tests for embedded docs routing and binary bundle smoke
  verification that `/docs/*` is served separately from Web console assets.
- `PUB-DOCS-014` is covered by HTTP adapter tests for `docsStaticDir` override behavior and binary
  bundle documentation of `APPALOFT_DOCS_STATIC_DIR`.
- `PUB-DOCS-016` is covered for initial high-confusion access and resource profile topics by
  `@appaloft/docs-registry` topic metadata and
  `docs/documentation/public-docs-traceability.md`. Source auto-deploy traceability is recorded as
  future Web/CLI/API surface coverage until those operations are active. Phase 7 storage,
  dependency resource, backup/restore, recovery-command, and resource runtime control traceability
  is recorded for active CLI/HTTP/API/Web operations. Future MCP runtime-control descriptors remain
  deferred until the tool surface exists. Docker Swarm runtime target traceability is recorded as a
  target-help anchor with deferred execution UI. Scheduled task
  traceability is recorded for active CLI/HTTP/API/Web/future MCP help links. Preview deployment
  traceability is recorded for Action-only CLI/repository-config guidance and future
  Cloud/self-hosted product-grade preview surfaces. Self-hosted Action deploy-token auth
  traceability is recorded for installer bootstrap output, GitHub Action secret wiring, and
  HTTP/API 401/403 recovery. Organization/team management traceability is recorded for HTTP/API
  routes, CLI commands, apps/web `/organization`, and product session 401/403 recovery. Dependency
  runtime injection traceability is recorded for safe bind-to-deploy behavior and plan/show blocked
  readiness. CLI remote control-plane client traceability is recorded for local profile/context
  commands, remote generated SDK operation dispatch, explicit local fallback, and unsupported
  remote-operation recovery.
- `PUB-DOCS-017` is covered for registered public error guides by
  `packages/docs-registry/test/help-topics.test.ts`.

There is still no dedicated automated public documentation checker for every product help
affordance, complete link resolution in built output, search alias freshness, or future MCP/tool
descriptions.

Deployment plan preview public docs now describe blocked preview phase/reason/evidence/fix/override
fields under the stable `deploy/lifecycle#deployment-plan-preview` anchor. Dedicated automated docs
link coverage for the new blocked/fix/override copy remains part of the broader public docs checker
gap above.

The next help integration Code Rounds should expand `PUB-DOCS-003` and `PUB-DOCS-010` from the
current high-confusion Web coverage to full owner-scoped form-field coverage, then close remaining
CLI/API command and route gaps. Future operation catalog additions may use explicit `PUB-DOCS-002`
migration gaps temporarily, but a behavior should not be considered complete until its gap is
converted into a documented public anchor or a not-applicable decision.
