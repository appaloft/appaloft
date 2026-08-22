# Appaloft Up Entrypoint

## Status

Spec confirmed from the owner product-direction decision on 2026-08-22.

## Governing Sources

- [Discovery](./discovery.md)
- [Spec 142: Railway-Like Folder Onboarding](../142-railway-like-folder-onboarding/spec.md)
- [Spec 143: First Deploy Login Fold And Agent-Env Guard](../143-first-deploy-login-and-agent-env-guard/spec.md)
- [Deployment Create Test Matrix](../../testing/deployments.create-test-matrix.md)
- [Test Matrix](../../testing/appaloft-up-entrypoint-test-matrix.md)

No new ADR is required: this slice adds a CLI presentation alias to an existing
workflow and does not change ownership, lifecycle, persistence, security policy,
or a public business operation.

## Actor And Outcome

An operator can run `appaloft up [path]` as the canonical folder-to-deployment
entrypoint. The command behaves exactly like the existing deploy workflow and
does not require separate project setup, login, or result inspection steps.

## Policy

1. `appaloft up [path]` is the canonical top-level deployment happy path.
2. `up` and `deploy` invoke one shared deploy workflow. Neither command shells
   out to the other, and no option or lifecycle branch is maintained twice.
3. `appaloft deploy [path]` remains a supported 1.x compatibility alias. Given
   identical arguments and starting state, `up` and `deploy` produce the same
   mutations, output payload, error, and exit status.
4. Path defaulting, explicit `--project`, repository identity, and durable
   folder-project link behavior remain governed by Spec 142.
5. An unauthenticated human Cloud invocation uses the folded login from Spec
   143 and continues through the same invocation after successful login.
6. Coding-agent, CI, and non-TTY invocations without `--yes` print the existing
   deployment plan and perform no login write, project creation, deployment, or
   skill write. `up --yes` follows the same guarded mutation path as
   `deploy --yes`.
7. `up --json` uses the same input parsing and machine-readable result schema as
   `deploy --json`. Human status text must not corrupt JSON stdout.
8. A successful command waits for the existing deployment workflow's terminal
   success proof before exiting zero. Acceptance alone is not success. A failed
   terminal deployment exits non-zero with the same diagnostic evidence as
   `deploy`, and an access URL is printed only when the succeeded deployment has
   a real route.
9. Authentication, onboarding, admission, packaging, deployment, verification,
   and error semantics remain owned by their existing workflow and operations.
   `up` adds no business operation, command/query message, or persistence.
10. Root help and `appaloft up --help` present `up` as the primary deployment
    entrypoint. Help identifies `deploy` as the supported 1.x compatibility
    spelling and describes the inherited safety and completion contract.

## Acceptance Criteria

| ID | Scenario | Expected result |
| --- | --- | --- |
| `UP-ENTRY-001` | Operator runs `appaloft up` or `appaloft up <path>` | CLI invokes the existing deploy workflow with cwd/path semantics and no new business operation. |
| `UP-ENTRY-002` | Existing automation runs `appaloft deploy` | The compatibility spelling remains accepted in 1.x and is behaviorally equivalent to `up` for the same arguments and state. |
| `UP-ENTRY-003` | Unlinked or unauthenticated human folder | `up` inherits folder onboarding and folded login, then continues the same invocation. |
| `UP-ENTRY-004` | Coding-agent, CI, or non-TTY invocation without `--yes` | Prints the existing plan and performs no mutation; `--yes` enables the same guarded path as `deploy --yes`. |
| `UP-ENTRY-005` | Caller uses `up --json` | Output schema, stdout/stderr separation, and exit status match `deploy --json`; stdout remains parseable JSON. |
| `UP-ENTRY-006` | Deployment is accepted and later succeeds or fails | Command waits for terminal status; only verified success exits zero and may print a real URL; terminal failure exits non-zero with diagnostics. |
| `UP-ENTRY-007` | Operator requests CLI help | Root help leads with `up`; `up --help` states login/onboarding, `--yes`, JSON, and terminal-proof behavior and identifies `deploy` as the 1.x compatibility spelling. |

## Public Surfaces

- Canonical: `appaloft up [path] [--yes] [--project <id>] [--json]`
- 1.x compatibility: `appaloft deploy [path] [--yes] [--project <id>] [--json]`
- Public docs: first-deployment task page and stable CLI help anchor.
- AI-facing Appaloft skill: deployment entrypoint guidance leads with `up` and
  records `deploy` compatibility without describing a second workflow.

## Compatibility And Migration

- This is additive in 1.x. Existing `appaloft deploy` scripts continue to work.
- Public examples and generated guidance migrate to `appaloft up`; they do not
  require users to rewrite working 1.x automation immediately.
- A future removal or semantic change to `deploy` requires a major-version
  decision and is outside this Spec.
- The business operation map and operation catalog continue to describe the
  existing deployment operation. `up` is an entrypoint alias, not a new row.

## Non-Goals

- A new deployment command/query or operation-catalog entry
- Changes to deployment admission, runtime execution, route verification, or
  rollback semantics
- A new configuration file or folder-link store
- Removing `appaloft deploy` in 1.x
- Adding Railway-specific project, service, environment, or provider semantics

## Implementation And Verification Notes

- `up` and `deploy` are registered over one option schema and one in-process
  deployment workflow. JSON output is emitted once from the terminal result,
  while legacy human output remains compatible.
- The source CLI help, non-interactive guard, alias parity, onboarding,
  terminal completion, and docs registry contracts have automated coverage.
- An authorized Hostinger workspace smoke confirmed repository/project reuse
  and no leaked resources. It also exposed an independent hosted integration
  defect before Workspace persistence; that repair is outside this public
  repository and does not alter this entrypoint contract.

## Docs Round Outcome

- Reuse `deployment.source` at
  `/docs/deliver/sources/#deployment-source` as the command-help topic, with
  `appaloft up`, `railway up`, and `appaloft deploy` search aliases.
- First-deployment task guidance owns
  `/docs/start/first-deployment/#cli-up-first-deployment`; exact syntax and
  compatibility wording also appear at
  `/docs/reference/cli/#cli-up-deployment-entrypoint`.
- `zh-CN` and `en-US` are both complete. AI-facing Skill and deploy-protocol
  guidance use `up` as canonical while retaining `deploy` as a 1.x compatibility
  spelling.
