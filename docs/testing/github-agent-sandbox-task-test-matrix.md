# GitHub-Driven Agent Sandbox Task Test Matrix

| ID | Layer | Scenario | Expected evidence | Status |
| --- | --- | --- | --- | --- |
| GH-AUTO-WEBHOOK-001 | Integration/contract | Supported signed event/action and invalid signature/payload | All required events normalize with numeric ids; invalid input fails before dispatch. | public automated pass |
| GH-AUTO-COMMAND-002 | Unit/property | Valid commands, code blocks, multiple commands, env/secret/credential ids | Only the strict grammar parses; unsafe text is not persisted as a Task prompt. | public automated pass |
| GH-AUTO-BINDING-003 | Domain/persistence/application | Create, select, revoke, cross-tenant, and Workspace-open Repository Binding projection | Numeric repository identity is unique in tenant scope; an active GitHub binding resolves through the connector-neutral Workspace-open port; revoked/cross-tenant/conflicting binding cannot execute. | public automated pass |
| GH-AUTO-RULE-004 | Domain/application | Label, ready-for-review, synchronize, repository scope and full rule policy | Only exact active rules match and every execution field is resolved. | public automated pass |
| GH-AUTO-PROFILE-005 | Domain/application | Resolve Codex/OpenCode/Pi Profile and incompatible capabilities | Exact Adapter/Profile/Template pins resolve; missing capability fails before Sandbox. | public automated pass |
| GH-AUTO-CREDENTIAL-006 | Domain/runtime | Native account, native API key, isolated server config, disabled managed provider | Lifecycle/scope is enforced and public state never exposes plaintext. | public contract pass; hosted custody pending |
| GH-AUTO-DELIVERY-007 | Persistence/concurrency | Concurrent duplicate delivery and retry after outcome | One SourceEvent and zero duplicate compute/delivery effects. | public automated pass |
| GH-AUTO-AUTHZ-008 | Application/security | Unlinked actor, non-member, insufficient permission, collaborator, fork, missing credential | Typed denial and audit snapshot exist; compute/secret spies remain unused. | public policy pass; hosted identity resolution pending |
| GH-AUTO-TASK-009 | Application/integration | Existing active thread Task versus new Task | Same delivery/thread resolves exactly one existing or new Workspace/Task. | public automated pass |
| GH-AUTO-CONTROL-010 | Application | steer, stop, resume, new and terminal Task | Same Workspace is controlled; stop is recoverable; new switches pointer without ambiguity. | public automated pass |
| GH-AUTO-SESSION-011 | Runtime | Adapter with and without native resume | Native ref is restored, or a labelled fallback Run receives bounded prior context. | public automated pass |
| GH-AUTO-LINEAGE-012 | Persistence | Old one-Run state, retry, cumulative budget | Migration is lossless; ordered lineage and limits survive restart. | public automated pass |
| GH-AUTO-FEEDBACK-013 | Integration | Issue comment, Issue label, PR trigger, repeated phase events, checks, Diff, Preview, delivery, retention, sensitive URLs, and oversized/secret-like output | One reaction/comment/Check is upserted at the exact PR head or hydrated Issue source SHA; later updates reuse the same ids and the same bounded summary shows safe evidence while secret-like content and sensitive URLs are omitted. | public automated pass |
| GH-AUTO-FIX-014 | Git adapter | Fix success, repeated delivery, changed head, unauthorized write | One branch/PR is created or updated; no merge/default branch/force push. | public adapter pass; hosted acceptance pending |
| GH-AUTO-REVIEW-015 | Git adapter | Review findings and identical repo/PR/head/rule replay | No push; valid annotations and exactly-once review/content fingerprints. | public automated pass |
| GH-AUTO-HEAD-016 | Durable workflow | PR synchronize while review/fix runs | Stale review is superseded and unsafe fix enters reconciliation. | review guard pass; hosted fix reconciliation pending |
| GH-AUTO-PREVIEW-017 | Preview integration | Private Preview with TTL and credential traps | Existing Preview is source-bound; Agent secret never reaches test/Preview. | hosted composition pending |
| GH-AUTO-CLEANUP-018 | Runtime/provider | Stop, expiry, current or generated-related PR close, retry, provider readback | Current PR Tasks and Issue Tasks linked to generated PRs resolve the same cleanup operation without conflating ordinary PR current-Task control; exact process/port/domain/route/network/volume/worktree/session cleanup is confirmed. | public relation/process-store/orchestration pass; provider readback pending |
| GH-AUTO-SURFACE-019 | Contract/transport/Web | Manage and inspect all new objects and Task controls, including secret-bearing connection enrollment | Catalog, HTTP/oRPC, SDK, CLI, Web, and capability metadata use the same schemas; the neutral Console renderer validates bounded text/boolean/list fields, uses password semantics for transient secret input, clears password state after every attempt, and refetches successful actions. | public automated pass; secure Console form regression pass |
| GH-AUTO-CAPABILITY-020 | Adapter conformance | Codex/OpenCode/Pi capability differences | Native and fallback paths remain truthful without vendor-specific domain models. | fallback pass; real adapters pending |
| GH-AUTO-BOUNDARY-021 | Architecture/contract/composition | Public server and one hosted fixture compose automation, credential metadata, exact source resolution, repository materialization, feedback/finalization, and lifecycle cleanup | One public delivery/review/thread store is resolved; accepted hydrated trigger/intent/authz is immutable; Issue/PR source pins and PR fork identity resolve before authorization; checkout never falls back to ambient `HEAD`; task-scoped credentials and explicit owner/Agent-Profile/use/untrusted/server-pool admission scope, placement, expiry, and source materialization pass through the authoritative Workspace open workflow; native enrollment uses one public port; public graph has no private import; hosted fixture has no parallel lifecycle/idempotency table or contract. | public source-pin/credential-admission/Workspace-open/enrollment seams automated pass; hosted reuse pending |

## External Acceptance Boundary

Public CI uses deterministic adapters, repositories, GitHub ports, credential resolvers, and runtime
providers. A real GitHub App, model/account credential, registered Server, private Preview URL, and
provider cleanup readback are explicit opt-in hosted acceptance and cannot be inferred from this
matrix alone.

## Public Automated Evidence

- Focused suites cover the ids marked `public automated pass` or `public contract pass`, including
  `packages/application/test/github-repository-binding-workspace-projection.test.ts` for the
  GitHub-to-Workspace binding projection and conflict fail-closed behavior.
- `apps/web/src/lib/console/console-page-extension.test.ts` plus Svelte diagnostics cover the #892
  actionable form regression without adding any hosted or GitHub-specific contract to public Web.
- Public `lint`, `typecheck`, and `build` completed successfully on 2026-07-29.
- The repository-level test gate passed all feature suites, HTTP/WebSocket suites, SDK/CLI/Web
  suites, and WebView acceptance. One unrelated PGlite audit test exceeded its five-second
  concurrent timeout; its complete file then passed 10/10 in isolation. Hosted and real-provider
  statuses remain pending and are not inferred from this evidence.
