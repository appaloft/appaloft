# Workspace Control Delivery Actions

## Status

- Round: Code / Sync
- Artifact state: accepted by public PR #1033
- Code changes: tracked by public issue #1034
- Compatibility: additive presentation over existing public operations
- Governing decision: accepted ADR-107 presentation boundary; no new ADR is required

## Business Outcome

An authenticated developer completes the Preview and delivery portion of the R1 Workspace journey
inside `appaloft workspace` without losing the Agent session or learning internal ids, while every
mutation and proof remains owned by the same public operation used by headless callers.

## Requirements And Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| WS-TUI-DELIVERY-001 | Bounded delivery palette | a Workspace detail is selected | the user presses `d` | actions are derived only from exact Preview, Task and Promotion descriptors and public statuses; ids are bounded and no mutation occurs. |
| WS-TUI-DELIVERY-002 | Private TTL Preview | the Workspace is non-terminal | the user enters a valid port, explicitly selects visibility/TTL and confirms | one `ExposeSandboxPortCommand` executes with default `private` visibility and bounded expiry, followed by detail readback. |
| WS-TUI-DELIVERY-003 | Confirmed Preview revoke | an exposure belongs to the selected Workspace | revoke is selected | no `RevokeSandboxPortCommand` runs before confirmation; success removes only the exact exposure and refreshes detail. |
| WS-TUI-DELIVERY-004 | Agent Task approval | an exact selected Task is `awaiting-approval` | approval is confirmed | one `ApproveAgentTaskRunCommand` executes and the existing Task read model supplies the next status. |
| WS-TUI-DELIVERY-005 | Git/PR delivery | an exact selected Task is `approved` or `delivering` | bounded branch/commit/remote and optional GitHub PR fields are reviewed and confirmed | one `DeliverAgentTaskRunCommand` executes; no credential value enters the event, renderer or output. |
| WS-TUI-DELIVERY-006 | Promotion accept/retry | an exact Promotion is `planned`, `failed` or `needs-attention` | the valid action is confirmed | accept uses the descriptor's exact artifact digest; accept/retry uses a new parent-owned idempotency key and dispatches the existing Promotion command once. |
| WS-TUI-DELIVERY-007 | Authoritative Deployment Proof | a Promotion supplies deployment and resource ids | detail loads or refreshes | `DeploymentProofQuery` supplies the verdict and bounded mismatch/unavailable counts; status alone never invents proof. |
| WS-TUI-DELIVERY-008 | Busy/readback discipline | a delivery mutation is in flight or succeeds | input or refresh occurs | duplicate submit is blocked, Agent terminal identity remains unchanged, and existing bounded queries supply Preview/Task/Promotion/proof truth after success. |
| WS-TUI-DELIVERY-009 | Structured failure | validation, authz, Git, provider, mutation or proof readback fails | the failure is presented | stable code/phase/retryability survive without secret, provider body, query-bearing URL or Agent output leakage; the form remains recoverable. |
| WS-TUI-DELIVERY-010 | Headless parity | TTY is absent, structured output is requested or a subcommand is used | delivery runs | existing Preview, Task, Promotion and Deployment Proof commands remain unchanged and renderer assets are not required. |
| WS-TUI-DELIVERY-011 | Discoverability | a user reads Workspace help/docs | delivery controls are resolved | both locales explain `d`, private-by-default Preview, external-write confirmation, proof readback and headless equivalents. |

## Delivery Availability

| Existing descriptor state | TUI action |
| --- | --- |
| non-terminal Workspace | create Preview |
| any listed Sandbox Port exposure | revoke exact Preview |
| Agent Task `awaiting-approval` | approve exact Task |
| Agent Task `approved` or `delivering` | deliver exact Task |
| Promotion `planned` | accept exact Promotion |
| Promotion `failed` or `needs-attention` | retry exact Promotion |
| Promotion with `deploymentId` and `resourceId` | read Deployment Proof on detail refresh |

The application layer remains authoritative and may reject stale status. Renderer availability is
guidance, not mutation admission.

## Form And Protocol Contract

- The Rust sidecar owns only bounded editing, focus, palette, confirmation and rendering.
- Every event carries the currently selected `workspaceId` plus an exact exposure, task or
  promotion id when applicable. The Bun parent rejects a target absent from the latest selected
  detail.
- Preview input is a validated integer port, explicit visibility and a fixed bounded TTL preset.
  The Bun parent converts the TTL to an ISO timestamp using its injected clock.
- Task delivery fields are length-bounded and reject NUL/newline where the existing operation does
  not accept them. Empty optional PR fields remain absent rather than guessed.
- The renderer never accepts credential, token, password, private-key or provider-secret input.
- External-write confirmation shows only safe target ids and user-entered non-secret metadata.
- Mutation success clears the form and refreshes existing detail. Failure keeps recoverable input
  and presents only the stable structured error envelope.

## Public Surfaces

- TUI renderer message/event protocol for delivery palette, forms, confirmation, busy state and
  proof summaries.
- Existing public commands and queries only; no operation-catalog, API/oRPC, SDK, MCP,
  persistence, event or aggregate additions.
- Existing headless commands remain canonical machine-readable equivalents.

## Domain Ownership

- Sandbox owns Workspace lifecycle and port exposure.
- Agent Task owns checks, approval, Git/PR delivery and delivery result.
- Sandbox Promotion owns the reviewed artifact-to-application transition.
- Deployment Proof query service owns planned-versus-observed verification.
- Terminal Session/Agent adapters keep native Agent process and interaction ownership.
- The CLI adapter owns only bounded presentation and existing operation dispatch.

## Non-Goals

- Creating a new Agent Task or Promotion plan from the first delivery palette.
- Editing source artifacts, Project/Environment/Resource topology or deployment configuration.
- Merging a GitHub pull request or auto-approving application Promotion.
- New Git hosting providers or Cloud-only delivery paths.
- A TUI-owned delivery queue, optimistic proof or credential store.
- Server enrollment; it remains the next separately governed R1 slice.

## Compatibility And Migration

- Additive interactive behavior; existing command parsing and machine output remain unchanged.
- Renderer protocol changes are bundled with the matching CLI artifact and are not a public remote
  API.
- Existing Preview/Task/Promotion/proof descriptors remain backward compatible; presentation maps
  only bounded optional fields.
