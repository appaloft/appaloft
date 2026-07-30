# Tasks: GitHub-Driven Agent Sandbox Tasks

## Workflow

- [x] Complete owner Grill and shared-understanding confirmation.
- [x] Complete Discovery, ADR-102, Spec 119, Plan, Tasks, and public Test Matrix.
- [x] Create and link public tracking #845 and actor-visible vertical slices #846-#849.
- [x] Mark implementation issues `ready-for-agent` after ticket review.
- [x] Record the 2026-07-29 boundary audit and owner-confirmed correction in Discovery/ADR/Spec.
- [x] Create and link public boundary-composition issue #876 under #845.
- [x] Create and link public Workspace/enrollment boundary correction issue #888.
- [x] Create and link public Repository Binding / Workspace-open convergence issue #890.
- [x] Create and link public secure neutral Console form issue #892 after composed hosted
  acceptance exposed the missing actionable input surface.
- [x] Create and link public post-acknowledgement Task failure feedback issue #916 after real
  webhook acceptance exposed an unrecorded delivery outcome.
- [x] Create and link public tenant-context resolution issue #921 after composed hosted
  acceptance exposed different Profile visibility between authenticated and system entrypoints.

## Public Composition Boundary Slice

- [x] GH-AUTO-BOUNDARY-021: register `GitHubAgentAutomationStore` in public server composition.
- [x] GH-AUTO-BOUNDARY-021: expose one public GitHub signature verification seam.
- [x] GH-AUTO-BOUNDARY-021: return normalized intent and the complete immutable allowed execution
  plus hydrated trigger/source snapshot in accepted automation outcomes.
- [x] GH-AUTO-BOUNDARY-021: expose neutral repository materialization, Workspace Profile preview
  plan, and bounded Task/Review/PR projection seams.
- [x] GH-AUTO-BOUNDARY-021: model lifecycle cleanup authorization without fake Agent
  Profile/credential references and make Task controls reference-based.
- [x] GH-AUTO-BOUNDARY-021: add public composition and downstream-boundary contract tests.
- [x] GH-AUTO-BOUNDARY-021: make task-scoped credential references, requested placement, expiry,
  and source materialization inputs of the authoritative `AgentWorkspaceOpenService` workflow.
- [x] GH-AUTO-BOUNDARY-021: pass explicit owner/Agent-Profile/use/untrusted/server-pool scope through public
  credential admission so hosted custody can fail closed before placement or Sandbox effects.
- [x] GH-AUTO-BOUNDARY-021: accept one immutable public-compiled Profile plan, validate its
  installation pin, and keep admission plus all Workspace runtime effects in public open.
- [x] GH-AUTO-BOUNDARY-021: keep one public `AgentCredentialEnrollmentPort` for native enrollment
  begin/refresh/revoke composition; downstream runtimes must not define a parallel enrollment port.
- [x] GH-AUTO-BOUNDARY-021: resolve exact Issue/PR source pins and PR fork identity through the
  public GitHub adapter before authorization; checkout must not fall back to ambient `HEAD`.
- [x] GH-AUTO-BINDING-003/WS-OPEN-BIND-005: project an active GitHub App Repository Binding
  through the connector-neutral Workspace-open binding port, preserve an explicit unbind, and fail
  closed on conflicting Project ownership.
- [ ] Run the dedicated read-only Public/Private Boundary Review Round and require `PASS` before
  hosted Code resumes.

## Event And Policy Slice

- [x] Add supported GitHub webhook signature/action/payload normalization tests.
- [x] Add strict command parser and sensitive-input rejection tests.
- [x] Implement Repository Binding and Project Automation Rule aggregates and persistence.
- [x] Extend SourceEvent kinds and atomic delivery idempotency.
- [x] Add review execution-key uniqueness and stale-head behavior.
- [x] Add operation catalog, transport, SDK, CLI, and Web management surfaces.
- [x] Extend the neutral Console extension page with bounded text, password, boolean, and
  string-list fields; validate bound fields, clear password state after every submission attempt,
  and refetch the document after successful non-redirect actions.

## Profile And Credential Slice

- [x] Add Agent Profile aggregate and exact Adapter/Workspace Profile resolution.
- [x] Extend Connection with `agent` category and typed auth-mode metadata.
- [x] Add native account enrollment and credential resolver ports without provider login protocol.
- [ ] Prove missing/revoked/expired/cross-scope and existing-server-config failures precede compute.
- [ ] Prove Agent credentials never enter argv, Git evidence, tests, Preview, events, or snapshots.

## Task And Session Slice

- [x] Add stable Task id, active Run, bounded Run lineage, and old-state migration tests.
- [x] Add current thread Task pointer and historical read model.
- [x] Implement recoverable stop, steer, resume, and explicit native-session fallback.
- [ ] Compose existing Workspace create/recover, Agent Task, durable work, checks, Diff, and Preview.
- [ ] Enforce cumulative runtime, automatic retry classes, and Task control permission.

## GitHub Feedback And Delivery Slice

- [x] Persist and upsert acknowledgement reaction, status comment, Check, Review, and PR ids.
- [x] Implement bounded/redacted Task event summaries and Check annotations.
- [x] Publish Issue comment/label Task Checks against the hydrated exact source SHA; omit the Check
  only when no exact source SHA is available (#895).
- [x] Render checks, bounded Diff, Preview, delivery, failure, and retention in the same GitHub
  comment and Check without exposing secret-like content or sensitive URLs.
- [x] Implement write branch/PR delivery with head reconciliation and no force-push/merge.
- [x] Implement read-only Review delivery and finding/head/content dedupe.
- [x] Implement label, ready-for-review, synchronize, and PR-close dispatch.
- [x] Link an Issue Task's generated PR through the existing public process store so PR close
  resolves exact cleanup without making the related write Task current for normal PR commands
  (#898).
- [x] Preserve bounded, secret-safe Issue/PR request context for label and automatic PR-review
  rules so automated Tasks receive the actor-visible request instead of a generic action (#902).
- [x] Reuse the acknowledgement feedback state to publish one bounded failure comment and record
  the delivery outcome when Task start/replace fails, so replay cannot create compute or feedback
  again (#916).

## Retention And Cleanup Slice

- [ ] Implement idle hibernation, stopped recovery window, Preview TTL, and PR-close cleanup.
- [ ] Prove exact process/port/domain/route/network/volume/worktree/session cleanup.
- [ ] Persist cleanup failure/retry state and require provider readback before success.

## Verification And Sync

- [x] Run focused tests for every implemented public Test Matrix id.
- [x] Run public `lint`, `typecheck`, and `build`; run the full test gate and document the isolated
  pass for its unrelated concurrent PGlite timeout.
- [x] Run focused Console renderer tests and Svelte diagnostics for #892.
- [x] Docs outcome for #895: existing complete zh-CN/en-US
  `agents/github-agent-tasks#github-agent-tasks` already defines bounded status comment and Check
  Run updates; no registry or new-page change is required.
- [x] Docs outcome for #898: existing complete zh-CN/en-US
  `agents/github-agent-tasks#github-agent-tasks` already defines PR-close cleanup; no registry or
  new-page change is required.
- [x] Docs outcome for #902: the complete zh-CN/en-US
  `agents/github-agent-tasks#github-agent-tasks` pages now explain bounded automation request
  context and pre-Workspace fail-closed behavior.
- [x] Synchronize Domain Model, Business Operation Map, operation catalog, SDK/CLI/Web docs, and
  Test Matrix evidence.
- [ ] Commit and push public changes with a neutral message.
- [ ] Open the public PR with a neutral title, pass checks, merge, and record final public main SHA.
