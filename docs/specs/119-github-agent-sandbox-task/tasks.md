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
- [x] Create and link public repository materialization regression issue #925 after real hosted
  acceptance proved the GitHub adapter still required an empty Workspace root despite #908/#909.
- [x] Create and link public askpass permission regression issue #927 after real hosted acceptance
  proved the task-scoped shell helper was not executable in a registered Linux Sandbox.
- [x] Create and link public bounded Agent Run failure diagnostic issue #932 after real hosted
  acceptance proved the terminal Run state discarded the actionable harness failure.
- [x] Create and link public durable credential restart issue #934 after external run `30597332756`
  proved the worker lost organization scope and process-local credential admission across restart.
- [x] Create and link public feedback-continuity issue #936 after external run `30604398408` proved
  that `stop` created a second Task status comment instead of reusing the current thread Task's
  existing bounded feedback ids.
- [x] Create and link public workspace-scoped process-home issue #941 after external run
  `30690194327` proved a resumed OpenCode Run attempted to open
  `/root/.local/share/opencode/log/opencode.log` inside a read-only-root Sandbox.
- [x] Create and link public pause-safe activity persistence issue #951 after external run
  `30699497767` proved a late ready-state activity save replaced the paused recovery handle.
- [x] Create and link public fallback-resume objective issue #982 after composed external run
  `30791490605` proved an immediate stop/resume could start a fallback Run without the original
  Task objective and leave delivery retrying a branch with no commit.

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
- [x] GH-AUTO-BOUNDARY-021: make the GitHub repository materializer reuse the populated-root
  `git init`/exact-fetch behavior required by #908/#909 and reject clone-to-dot regressions.
- [x] GH-AUTO-BOUNDARY-021: keep the installation token at mode `0600` while making the
  task-scoped askpass helper owner-executable at mode `0700`.
- [x] Run the dedicated read-only Public/Private Boundary Review Round before hosted Code resumes;
  final public #954 pin reviews report no P0/P1 boundary finding and no parallel hosted lifecycle
  contract.

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
- [x] Prove missing/revoked/expired/cross-scope and existing-server-config failures precede compute;
  public contracts and downstream composition regressions fail closed before secret/runtime effects.
- [x] Prove Agent credentials never enter argv, Git evidence, tests, Preview, events, or snapshots
  through public redaction/credential-boundary tests and downstream exact-process composition tests.

## Task And Session Slice

- [x] Add stable Task id, active Run, bounded Run lineage, and old-state migration tests.
- [x] Add current thread Task pointer and historical read model.
- [x] Implement recoverable stop, steer, resume, and explicit native-session fallback.
- [x] GH-AUTO-SESSION-011: persist the bounded redacted original Task objective and make an
  unproven native-session fallback start a fresh child Run with objective, diff/check, steer, and
  current-instruction context (#982).
- [x] Compose existing Workspace create/recover, Agent Task, durable work, checks, Diff, and Preview.
- [x] Enforce cumulative runtime, automatic retry classes, and Task control permission.
- [x] GH-AUTO-DURABLE-CREDENTIAL-023: persist optional organization id in Sandbox Agent durable-work
  safe input and reconstruct the exact tenant context in the worker.
- [x] GH-AUTO-DURABLE-CREDENTIAL-023: replay the existing process-credential admission port from
  persisted Runtime Profile pin/bindings before a restarted worker launches the Agent process.
- [x] GH-AUTO-DURABLE-CREDENTIAL-023: prove restarted process-local admission recovery and denied
  admission fail-closed behavior through the public Runtime service without a parallel admission
  table.
- [x] GH-AUTO-CONTROL-010/GH-AUTO-LINEAGE-012: key durable Agent Task reconciliation by stable
  Task plus active Run generation and make same-generation enqueue idempotent in application and
  PostgreSQL persistence regressions (#938).
- [x] GH-AUTO-CONTROL-010/GH-AUTO-LINEAGE-012: fence an in-flight stale reconciliation so steer,
  stop, or resume cannot be overwritten by the superseded Run's terminal status (#945).
- [x] GH-AUTO-DURABLE-CREDENTIAL-023: compose downstream hosted revoked/cross-scope restart coverage
  with zero secret resolution, process launch, or Sandbox effects after the public change is merged
  and pinned.
- [x] SBX-RUNTIME-005/GH-AUTO-RUNTIME-HOME-024: make Docker exec/terminal and OpenCode native
  process launches share one writable Workspace-scoped HOME/XDG contract; prove the exact
  read-only-root regression and compute-released resume path.
- [x] GH-AUTO-LIFECYCLE-025: block an admitted runtime operation, pause the Sandbox, then finish the
  old operation and prove its activity bookkeeping cannot overwrite paused state or recovery handle.
- [ ] GH-AUTO-NATIVE-STATE-027: emit only the singular snapshot policy accepted by exact pinned
  OpenCode 1.18.4, validate the generated native config before background startup, revoke scoped
  model access on validation failure, and preserve native sessions plus independent headless Runs
  (#980). Focused regression, runtime package tests/typecheck, `check:ash`, public lint, 61-package
  typecheck, repository test, and build pass; registered-server acceptance after run `30784070803`
  remains the unchecked exit gate.

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
- [x] Persist one bounded, redacted failure diagnostic on the existing Sandbox Agent Run and
  project it through the existing Agent Task failure field (#932).
- [x] Preserve the current thread Task's status comment and Check ids across distinct
  `status`/`steer`/`stop`/`resume` deliveries and process restart; prove control acknowledgements
  remain per delivery while Task feedback is updated in place (#936).
- [x] Update an existing head-bound Check from a control delivery without requiring a newly
  hydrated source SHA; retain exact-SHA admission for Check creation (#953).

## Retention And Cleanup Slice

- [x] Implement idle hibernation, stopped recovery window, Preview TTL, and PR-close cleanup through
  the existing public Workspace, Sandbox, Preview, and Task operations.
- [x] Prove the public exact process/port/domain/route/network/volume/worktree/session cleanup
  contract; real-provider readback remains a downstream opt-in acceptance requirement.
- [x] Persist cleanup failure/retry state and require provider readback before success.

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
- [x] Docs outcome for #925: not user-facing. The fix restores the already documented repository
  materialization workflow and changes no command, API, status, error code, or recovery guidance.
- [x] Docs outcome for #953: not user-facing. The adapter correction restores the existing
  `agents/github-agent-tasks#github-agent-tasks` contract that one current Task comment and Check
  converge without adding or changing a user command, field, page, or help anchor.
- [x] Docs outcome for #927: not user-facing. The fix restores the already documented
  installation-authenticated materialization behavior and changes no public command or contract.
- [x] Reopen #927 after registered-server smoke proved Docker's Workspace tmpfs is `noexec`;
  remove the executable askpass/token-file path and reuse the existing neutral Workspace source
  Git credential-cache command plan with credential input only on Sandbox stdin.
- [x] Prove GitHub checkout clears ambient credential helpers, disables interactive/askpass
  fallback, exits the task-scoped credential cache, removes its socket directory, and fails closed
  when credential cleanup cannot be confirmed.
- [x] Prove failed Agent Runs redact and bound harness errors, survive Postgres round-trip, keep
  legacy rows readable, and expose the diagnostic through Agent Task feedback (#932).
- [x] Docs outcome for #934: not user-facing. The fix restores the already specified
  restart-safe credential-bound Agent Task execution and changes no command, API, status, error
  vocabulary, or recovery guidance.
- [x] Docs outcome for #945: not user-facing. The fix enforces the existing active-Run generation
  contract and changes no command, API schema, status vocabulary, or recovery guidance.
- [x] Public #947 fixes the bounded background Agent exit-status observation exposed by external
  run `30694283308`; the existing Task/Workspace/Sandbox and process operations remain unchanged.
- [x] Docs outcome for #947: not user-facing. The fix restores the existing Agent Run completion
  contract and changes no command, API schema, status vocabulary, Console affordance, or recovery
  guidance.
- [x] Docs outcome for #951: not user-facing. The fix narrows activity persistence so it cannot
  overwrite the already documented Sandbox pause/resume/cleanup lifecycle; no command, API schema,
  status vocabulary, Console affordance, or recovery guidance changes.
- [x] Prove #951 with deterministic detached-aggregate concurrency and PostgreSQL conditional-update
  regressions; run public lint, 61-package typecheck, 5-task build, and the canonical 35-task test
  gate. The first two full-test attempts exposed unrelated existing timing/environment flakes; the
  exact tests passed in isolation and the final canonical run passed 35/35 tasks.
- [x] Pass the independent read-only public/private pre-delivery boundary review with P0 0, P1 0,
  and no new P2 finding; the narrow activity operation belongs to the public Sandbox repository and
  Cloud adds no lifecycle state or workaround.
- [x] Synchronize Domain Model, Business Operation Map, operation catalog, SDK/CLI/Web docs, and
  Test Matrix evidence.
- [x] Commit and push public implementation changes with neutral messages.
- [x] Merge the final public correction through #953 / PR #954 and record final public `main` SHA
  `7cdd99ca83554bf76184d209199f60a75b3a4679`.
- [x] Keep downstream real GitHub/registered-Server/native-provider/Preview/provider-cleanup smoke
  outside the public CI claim; its result must remain explicit in the hosted delivery report.
