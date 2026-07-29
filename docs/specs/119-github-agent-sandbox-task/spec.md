# GitHub-Driven Agent Sandbox Tasks

## Status

Accepted for Code Round. Public tracking #845 and implementation issues #846-#849 are complete,
actor-visible, and labelled `ready-for-agent`; hosted composition remains in Cloud #722-#727.

## Goal

Provide a provider-neutral GitHub trigger and feedback adapter that resolves an authorized
Repository Binding and Project Automation Rule into the existing Agent Task and Workspace
lifecycles, runs a pinned Agent Profile with native Agent authentication, publishes bounded
progress, delivers a pull request or review, supports steer/resume/stop, and proves Preview and
Sandbox cleanup.

## Requirements

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| GH-AUTO-WEBHOOK-001 | Safe event normalization | A signed GitHub App delivery is one of the supported event/action pairs | The webhook adapter verifies and parses it | A provider-neutral event containing numeric installation/repository/sender ids and bounded thread/head facts is produced; invalid signature, action, payload, or missing numeric identity fails before dispatch. |
| GH-AUTO-COMMAND-002 | Strict command grammar | An issue/PR top-level or inline comment is created | Command parsing runs | `fix`, `review`, `status`, `steer`, `stop`, `resume`, and `new --profile` parse exactly; code-block mentions, multiple commands, unknown flags, env, secret, or credential references fail closed. |
| GH-AUTO-BINDING-003 | Repository Binding | A provider installation exposes a repository | An administrator binds it to a Project | One active tenant-scoped binding maps numeric provider repository identity and source Connection to the Project; revoke blocks new execution without becoming a SourceLink. |
| GH-AUTO-RULE-004 | Automation Rule aggregate | A Project configures label, ready-for-review, or synchronize automation | A normalized event is matched | Repository scope, event/action, actor policy, Agent Profile, Workspace Profile/Template, Server pool, mode, runtime/retries, Preview, and PR policy are evaluated as one versioned rule. |
| GH-AUTO-PROFILE-005 | Agent Profile | A tenant configures Codex, OpenCode, or Pi execution | The Profile is validated and resolved | Exact installed Adapter/Profile references, capabilities, default model/agent-default, typed credential Connection, Workspace/Template, and bounded execution limits resolve without replacing existing definitions. |
| GH-AUTO-CREDENTIAL-006 | Typed Agent Connection | A Profile references an `agent` Connection | Admission resolves its auth mode and lifecycle | Owner/scope/status/expiry/revocation/allowed projects/profiles are enforced; plaintext and provider login protocol remain outside public state. |
| GH-AUTO-DELIVERY-007 | Delivery idempotency and audit | The same GitHub delivery is received concurrently or retried | The inbox claims it | One SourceEvent outcome exists, duplicate callers receive the original result, and no duplicate Workspace, Task, Preview, Check, Review, or PR is created. Rejections retain a safe actor/authorization snapshot. |
| GH-AUTO-AUTHZ-008 | Fail-closed authorization port | A normalized trigger needs actor, membership, repository, rule, profile, server, and credential decisions | Admission runs | The ordered resolution succeeds completely before compute or secret grants, or returns a typed actionable denial with zero compute and zero secret injection. |
| GH-AUTO-TASK-009 | Existing Task/Workspace composition | A valid trigger resolves a repository thread | It starts or resolves work | The current compatible Agent Task and Workspace are resumed, or one isolated Task/Workspace is created exactly once; no parallel domain model is introduced. |
| GH-AUTO-CONTROL-010 | Current task control | A thread has a current controllable Task | `steer`, `stop`, `resume`, or `new` is accepted | Steer and resume keep the same Workspace; stop is recoverable; new stops the old task and switches the pointer; terminal/cleaned tasks are not silently revived. |
| GH-AUTO-SESSION-011 | Truthful session recovery | An Adapter does or does not support native resume | A stopped/hibernated Task resumes | Native session is restored when supported; otherwise a new Run is created with the prior summary, diff, checks, and steer context and is explicitly reported as fallback. |
| GH-AUTO-LINEAGE-012 | Multi-Run Agent Task | A Task retries or resumes | A new Agent run starts | The first run id remains the stable Task id, `activeRunId` and bounded ordered lineage persist, and cumulative runtime/retry limits are enforced. |
| GH-AUTO-FEEDBACK-013 | Bounded feedback | A Task changes phase | GitHub and Console consume Task events | One reaction, one updatable status comment, one head-specific Check, and required delivery objects are upserted; raw output remains redacted and bounded in the common Task event stream. |
| GH-AUTO-FIX-014 | Write delivery | An authorized fix reaches accepted evidence | PR delivery policy permits write | An isolated branch is pushed and a Task-owned PR is created or updated with summary, checks, diff, and Preview; no merge/default-branch/force-push occurs. |
| GH-AUTO-REVIEW-015 | Read-only review | An authorized review is triggered | Findings are delivered | No code is pushed; actionable findings use Review/Check annotations where valid, content is deduped, and the same repo/PR/head/rule executes at most once. |
| GH-AUTO-HEAD-016 | Head SHA concurrency | PR head changes during work | Reconciliation runs | Stale review is superseded and does not annotate the new head; unsafe fix delivery enters `needs_reconciliation`; synchronize rules may create one review for the new head. |
| GH-AUTO-PREVIEW-017 | Safe private Preview | A permitted fix requests Preview | Preview is created from the Task evidence | The existing Preview lifecycle receives source SHA, private access policy, and TTL; Agent credentials never reach test/Preview processes. |
| GH-AUTO-CLEANUP-018 | Hibernate and exact cleanup | A Task stops/completes, TTL expires, or PR closes | Retention executes | Existing pause/terminate/Preview cleanup operations revoke processes, ports, routes, domains, networks, volumes, worktree, and session material according to policy and verify provider readback idempotently. |
| GH-AUTO-SURFACE-019 | Public surface parity | Bindings, rules, profiles, connections, and tasks are managed | API/SDK/CLI/Web clients operate | The operation catalog drives the neutral transport and UI surfaces, including events/output/checks/diff/preview/session/audit and stop/resume/cleanup controls. |
| GH-AUTO-CAPABILITY-020 | Adapter-neutral execution | Codex, OpenCode, and Pi installations declare different capabilities | A Task composes execution | Capability gates select native session or fallback behavior without vendor-specific Workspace/Task models or a universal model protocol. |

## Supported GitHub Inputs

- `issue_comment.created`, including Issue and pull-request top-level comments;
- `pull_request_review_comment.created`;
- `issues.labeled`;
- `pull_request.labeled`, `pull_request.ready_for_review`,
  `pull_request.synchronize`, and `pull_request.closed`.

Supported commands are `@appaloft fix`, `review`, `status`, `steer <instruction>`, `stop`,
`resume`, and `new --profile <allowed-profile>`.

## Default Policy

- Manual status/review requires linked numeric identity, active organization membership, and at
  least GitHub pull permission. Write/control commands require push permission and Task control
  permission.
- Label actors require triage permission; automation executes as the configured automation identity.
- Forks, external collaborators, missing identity, stale/revoked/expired credentials, missing
  capability, and untrusted server configuration fail before compute.
- Completed workspaces hibernate after 15 minutes idle. Stopped/failed workspaces hibernate
  immediately and remain recoverable for seven days.
- Private Preview defaults to 24 hours and cannot exceed 72 hours.
- Pull-request close performs destructive cleanup and removes recoverability for that thread.

## Compatibility

Existing `AgentTaskRunService` callers retain their first-run `taskRunId`, existing one-run
descriptors remain readable, and existing Workspace, Sandbox, Preview, SourceEvent, Connection,
Adapter, Profile, and Git delivery operations remain authoritative. New fields and operations are
additive or versioned with deterministic migration.

## Non-goals

- Slack, Telegram, Zapier, or a generic workflow builder;
- automatic merge or production deployment;
- an Appaloft Agent TUI;
- a mandatory managed model gateway;
- arbitrary fork execution;
- secrets, environment variables, or credential identifiers in GitHub comments;
- vendor-specific Workspace, Task, Preview, or Deployment aggregates.
