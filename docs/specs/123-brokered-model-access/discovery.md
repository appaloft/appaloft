# Discovery: Brokered Model Access

## Business outcome

A developer can open a Profile-pinned Agent Workspace and let Pi or OpenCode call a model provider
without placing the provider credential in the Workspace, Agent process, portable manifest, command
line, logs, snapshot, or public operation input.

## Existing evidence

- Agent Workspace Profiles already pin named `model-api` Credential Connection references.
- Pi and OpenCode harnesses already accept a short-lived model access descriptor issued by the
  hosting composition.
- The Runtime record already owns resolved credential bindings, but the public Harness execution
  port does not receive those bindings. A hosting composition therefore cannot issue model access
  for the exact Profile-pinned Connection without provider- or Agent-name branching.
- Public Sandbox process and destination grants already establish the capability pattern. Provider
  credential custody, tenant policy, audit and commercial rules do not belong in public core.

## Owner-confirmed decisions

| Topic | Decision |
| --- | --- |
| Public model | Extend the existing Workspace/Profile/Runtime path; do not create a model-provider aggregate or a second Workspace API. |
| Binding | One active Runtime resolves exactly one `model-api` binding for its Agent model access; missing or ambiguous binding fails before Agent launch. |
| Capability | The harness receives a short-lived, revocable gateway capability descriptor, never a provider secret. |
| Protocol metadata | Public contracts carry neutral protocol/model hints needed for compatibility, not hosted provider credentials or pricing. |
| Surfaces | Operation catalog, HTTP/oRPC, CLI, generated SDK, MCP and Console continue to share the same Profile and Workspace operations. |
| Agent behavior | Pi and OpenCode keep their native TUI/session behavior; Appaloft does not parse or replace their TUI. |
| Lifecycle | Rotation affects newly resolved capability use; revocation fences active access while preserving Workspace data. |
| Compatibility | Lower-level custom harnesses remain possible, but a Profile declaring `model-api` must use the brokered access port or fail closed. |

Owner confirmed these decisions on 2026-08-08 and authorized Spec, Ticket and Code.

## Rejected

- Injecting `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or equivalent raw values into the Agent process;
- putting a secret in Adapter/Profile manifests or Workspace operation input;
- branching on `pi` or `opencode` in application services;
- adding provider billing, tenant authorization or hosted encryption policy to public Appaloft;
- claiming a transparent protocol translation that the selected gateway does not implement.
