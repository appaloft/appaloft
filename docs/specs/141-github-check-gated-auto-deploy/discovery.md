# GitHub Check-Gated Auto Deploy — Grill / Discovery

## Status

- Round: Grill complete.
- Date: 2026-08-17.
- Owner decisions: recommended Q2-Q4 answers accepted on 2026-08-17.
- Code changes allowed: after Spec artifacts and `ready-for-agent` tickets exist.

## Actor And Observable Outcome

An operator can configure a GitHub-backed Resource so a matching verified push waits for named CI
checks on that exact revision. Appaloft creates the ordinary deployment exactly once only when every
required check reaches an accepted conclusion, and shows why a revision is waiting or blocked.
Policies without a check gate keep their current immediate-dispatch behavior.

## Evidence And Facts

- ADR-037 currently owns source-event auto-deploy as an application workflow over Resource policy
  and `deployments.create`; it deliberately excludes provider-native required status checks.
- `ResourceAutoDeployPolicy` has ref/event/path/dedupe fields but no required checks.
- A matching verified GitHub push is persisted and synchronously dispatched. Source-event status has
  no waiting-for-checks lifecycle.
- The existing GitHub webhook route verifies HMAC signatures and only normalizes push (plus a
  transport `ping` no-op) for this workflow.
- GitHub documents `check_run.completed` with the check name, head SHA and conclusion. A GitHub App
  needs only read-level Checks repository permission to subscribe to this event:
  <https://docs.github.com/en/webhooks/webhook-events-and-payloads#check_run>.
- GitHub treats `success`, `neutral` and `skipped` as successful required-check conclusions:
  <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging>.
- Mirroring branch-protection policy would add provider API reads, extra permission/availability
  failure modes and GitHub-specific policy ownership. Explicit Resource policy names remain
  deterministic and provider-neutral at the application boundary.
- There is no durable timer worker dedicated to source-event check deadlines. Adding clock-based
  timeout/retry in this slice would broaden the work into scheduled process delivery.

## Recommended Decisions

1. Add explicit `requiredChecks` names to `git-push` Resource auto-deploy policy. Do not mirror
   GitHub branch protection in the first slice.
2. Persist an exact-revision waiting state. Verified `check_run.completed` facts update safe check
   state; `success`, `neutral` and `skipped` satisfy a requirement. Failure-like conclusions block
   dispatch, but a later successful rerun for the same check and revision may unblock it. A newer
   matching push supersedes an older undispatched revision for the same Resource/ref. No
   clock-based timeout or automatic background retry is claimed in this slice.
3. Ship one closed public loop: domain/persistence, repository config, CLI, HTTP/oRPC, Web settings
   and source-event diagnostics, generated SDK metadata, docs/help and operation/test-matrix sync.

## Alternatives

- Mirror GitHub branch protection required checks dynamically. Rejected as the initial default
  because it transfers policy ownership to a provider API and needs additional permissions.
- Accept only `success`. Stricter but diverges from GitHub's documented required-check semantics.
- Treat the first terminal failure as permanently final. Simpler, but prevents normal GitHub rerun
  recovery for the same revision.
- Add a configurable timeout and scheduled retry worker now. Useful later, but not required for a
  correct event-driven gate and materially expands process topology.
- Add API-only configuration. Rejected as the recommended default because active entrypoints would
  expose different policy capabilities.

## Accepted Decisions

- Resource policy stores explicit required check names; branch-protection mirroring is out of scope.
- `success`, `neutral` and `skipped` satisfy a required check. Failure-like conclusions block but
  do not permanently close the exact revision; a later completed rerun may satisfy it.
- A newer matching push supersedes older undispatched work for the same Resource/ref.
- The first slice has no clock-based timeout or automatic background retry claim.
- Repository config, CLI, HTTP/oRPC, Web, SDK metadata, diagnostics and public docs ship together.
