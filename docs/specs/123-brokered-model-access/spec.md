# Brokered Model Access

## Status

- Round: Spec
- Artifact state: owner-confirmed, ready for Ticket
- Compatibility: additive public execution-port input and capability semantics

## Business outcome

Profile-pinned Agent Workspaces can use a hosting-provided model gateway while the provider secret
remains outside the Sandbox and Agent process. The same neutral contract supports Pi, OpenCode and
future capability-compatible harnesses.

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| Model Connection binding | A resolved `model-api` Credential Connection reference pinned by the installed Workspace Profile. It contains no secret value. |
| Model access issuer | Hosting-provided port that exchanges the exact Runtime/Sandbox/run/binding scope for a short-lived gateway descriptor. |
| Model access descriptor | Provider-neutral gateway base URL, capability token, protocol and model identifier supplied to a harness. |
| Brokered access | Model traffic is authorized by a short-lived capability; the provider credential is resolved only by trusted hosting infrastructure. |

## Acceptance criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| MODEL-ACCESS-BIND-001 | Exact binding propagation | A Runtime was created from a compiled Profile with one `model-api` binding | Its harness starts or runs | The execution port and model access issuer receive that exact safe binding reference and Runtime/Sandbox/run scope. |
| MODEL-ACCESS-BIND-002 | Missing binding | A harness requires brokered model access but no active `model-api` binding exists | Agent launch is requested | Launch fails before the child process starts and returns actionable connection guidance without a secret. |
| MODEL-ACCESS-BIND-003 | Ambiguous binding | More than one `model-api` binding reaches one Runtime | Agent launch is requested | Launch fails closed before capability issuance or child process start. |
| MODEL-ACCESS-CAP-004 | Capability-only child | Exact binding resolution succeeds | Pi or OpenCode is launched | Its config contains only gateway URL, short-lived capability and safe protocol/model metadata; provider secret is absent from env, stdin, argv, filesystem snapshot, logs and result. A capability must remain valid through a bounded startup safety window, but is not required to cover the whole configured Run timeout before launch; gateway expiry still fails closed. |
| MODEL-ACCESS-REVOKE-005 | Revoked access | A hosting composition revokes the bound Connection or issued capability | The Agent makes another model request | Access is denied without deleting Workspace data; a later authorized issue may return a new descriptor. |
| MODEL-ACCESS-SURFACE-006 | Cross-surface parity | A Profile is configured and a Workspace is opened | CLI, SDK, HTTP/oRPC, MCP or Console initiates it | Every surface reaches the same public Profile/Workspace command and execution-port contract; no surface accepts a provider secret. |
| MODEL-ACCESS-COMPAT-007 | Capability-compatible harness | A future harness declares a `model-api` requirement | The Runtime launches it | The same binding and issuer contract is used without adding an Agent-specific operation family. |

## Domain ownership

- `AgentWorkspaceProfileInstallation` owns requirement-to-named-Connection references.
- `SandboxAgentRuntime` owns the immutable resolved binding snapshot and Runtime/Run scope.
- `SandboxAgentHarness` owns Agent-specific launch/config behavior but not credential custody.
- The model access issuer is a public neutral port implemented by a hosting composition.
- Provider credential storage, tenant authorization, audit, gateway routing, protocol endpoints,
  rotation policy and billing remain outside public core.

## Public surfaces

- Existing Profile configuration/compile and Workspace open/create operations remain canonical.
- The Harness execution input and model access issuer input gain the resolved safe credential
  bindings needed to select the exact `model-api` Connection.
- Pi/OpenCode reference harnesses consume one common model access contract.
- No public operation accepts or returns a provider secret.

## Non-goals

- Provider connection CRUD, encryption/KMS, hosted tenant authorization or audit implementation;
- protocol translation between Chat Completions, Responses and Anthropic Messages;
- model discovery, pricing, token billing or spending policy;
- MCP Provider, Marketplace or multi-language Trusted Code SDK;
- a universal Agent TUI or vendor session parser.

## Open questions

None that changes the public boundary or acceptance semantics.
