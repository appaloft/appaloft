# Discovery: GitHub-Driven Agent Sandbox Tasks

## Business Outcome

A repository member can use a GitHub comment, label, or pull-request lifecycle event to start or
control an Appaloft Agent Task. Appaloft resolves the tenant, repository, project, policy, profile,
credential, and registered Server before it creates compute. The task then uses the existing
Workspace, Sandbox, Preview, and Agent Task lifecycles to run an interchangeable Agent Adapter,
publish bounded progress, deliver a pull request or review, and hibernate or clean up exactly.

GitHub is a trigger and feedback adapter. Agent Task is the business execution object. Workspace
and Sandbox remain the isolated execution environment. Codex, OpenCode, and Pi remain replaceable
Agent Adapters.

## Existing Evidence

- `AgentTaskRunService` already composes Sandbox Agent runs, checks, bounded Git evidence, Preview,
  approval, Git push, pull-request delivery, cancellation, and cleanup.
- Agent Workspace, Collaboration, hibernation, portable recovery, reusable Snapshot, Adapter
  definition/installation, Workspace Profile definition/installation, and process-scoped
  credential grants already exist.
- `SourceEvent` already verifies provider events, records delivery ids, owns a unique dedupe key,
  and persists dispatch outcomes.
- `Connection` already owns tenant-safe owner scope, status, expiry, revocation, and redacted secret
  references.
- GitHub integration adapters already verify source webhooks and write bounded comments/checks for
  existing Preview workflows.
- No existing model binds a GitHub installation repository to an Appaloft Project, expresses
  project Agent automation rules, resolves a GitHub numeric actor id, or links a GitHub thread to
  one controllable Agent Task.

## Owner-Confirmed Decisions

| Topic | Decision |
| --- | --- |
| Agent Profile | A tenant-scoped configuration/policy object references an installed Agent Adapter, installed Agent Workspace Profile, typed Agent Credential Connection, default model, capabilities, and execution limits. It does not replace Workspace Profile or Sandbox Template. |
| Credential Connection | Reuse the public `Connection` aggregate with an `agent` category and typed safe metadata. Cloud or another composition owns secret custody and login coordination. |
| Automation Rule | A public `ProjectAutomationRule` aggregate owns repository scope, event/action, actor policy, profile, Workspace/Server selection, mode, runtime/retries, Preview, and PR delivery policy. |
| Repository Binding | A public `RepositoryBinding` aggregate maps provider repository numeric id and source installation Connection to an Appaloft Project. It is not `SourceLink`. |
| Actor policy | Manual commands require numeric identity linkage, organization membership, repository permission, no external collaborator, and no fork. Automated rules use an explicit automation identity. Admin does not bypass tenant, fork, or credential checks. |
| Task evolution | Evolve the existing Agent Task process manager to ordered multi-Run lineage. Keep the first Run id as the compatibility Task id and add `activeRunId`, bounded lineage, recoverable stop, resume, and steer. |
| Delivery inbox | Reuse `SourceEvent` as the verified GitHub delivery inbox. Persist authorization and actor snapshots. Use an additional review execution key for repo/PR/head/rule uniqueness. |
| Thread routing | One Repository Binding + Issue/PR thread has one current controllable Task pointer and retained history. `new --profile` stops the current task recoverably before switching the pointer. |
| PR authorization | An authorized fix command or rule can carry bounded branch push and PR create/update preauthorization. It never permits default-branch writes or merge. |
| Retention | Completed workspaces hibernate after 15 idle minutes; stopped/failed workspaces hibernate immediately and retain a seven-day recovery window; private Preview defaults to 24 hours and caps at 72 hours; PR close performs exact destructive cleanup. |
| Existing server config | Disabled for unattended automation by default. Opt-in requires owner/project/profile/server scope and a verified isolated Unix/container identity and HOME. |
| Automation identity | Public rules keep an opaque reference. Hosted composition owns a non-human, organization-owned, revocable Project Automation Identity. It is not a user or Deploy Token. |
| Native account login | Run the installed Agent CLI's official browser/device login in an owner-isolated enrollment Sandbox. Treat the resulting native bundle as opaque encrypted material. Do not implement provider login protocols. |
| Feedback | One reaction, one updatable status comment, one head-specific Check Run, and the required PR or Review. Raw Agent output remains in the Task event stream. |
| Command grammar | Parse one line-leading command outside code blocks. Only `new --profile <allowed-profile>` accepts a flag. Reject env, secret, credential-id, or unsafe instructions before Task prompt persistence. |
| UI boundary | Public owns neutral operations/SDK/CLI/Web surfaces. Hosted composition injects tenancy, identity, credential custody, automation identity, entitlement, audit, and hosted authz. |
| Head concurrency | Pin base/head SHA. Supersede stale review work, never force-push or silently rebase changed user work, and dedupe reviews by head/rule/content fingerprint. |
| Retry budget | Runtime is cumulative Agent execution time. Automatic retries cover transient infrastructure/provider failures only and add a Run to the same Task lineage. |
| Preview safety | Agent credentials never enter tests or Preview. Preview is private, TTL-bound, source-SHA-bound, separately configured, and exactly revoked. |
| External acceptance | Use a dedicated private `appaloft/agent-sandbox-smoke` repository and the owner-authorized Hostinger smoke Server. Missing real credentials remain an explicit deferred gap. |
| Identity linking | Public exposes a numeric GitHub actor identity resolver port. Hosted composition stores verified numeric provider-user linkage; username and avatar are display snapshots only. |

## Rejected Alternatives

- A second GitHub Task, Workspace, Preview, or Deployment aggregate.
- Username or email matching for webhook authorization.
- Passing credential ids, environment variables, or raw secrets through comments.
- Using the project creator as the identity for unattended automation.
- Sharing root/global Agent configuration between users or organizations.
- Reimplementing an Agent TUI, native login protocol, or universal model gateway.
- Running arbitrary fork pull requests, force-pushing, auto-merging, or production deploying.
- Treating a database cleanup status as proof without provider readback.

## Shared Understanding

The owner confirmed the decision log one item at a time and confirmed the complete shared
understanding on 2026-07-28. Spec and Ticket rounds are authorized. Code remains gated on complete
artifacts and ready tickets.
