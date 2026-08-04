# Agent Adapter SDK And Workspace Profiles Test Matrix

| ID | Layer | Scenario | Expected evidence |
| --- | --- | --- | --- |
| ADAPTER-MANIFEST-001 | Contract/unit | Valid canonical manifest | Normalized definition and stable digest; no execution. |
| ADAPTER-MANIFEST-002 | Contract/unit | Unknown schema major or incompatible API/runtime/template | Typed failure before registry/Sandbox effects. |
| ADAPTER-TRUST-003 | Contract/application | Remote manifest contains code entrypoint or unbounded command | Install rejects without module load or persistence. |
| ADAPTER-CAP-004 | Contract/client | Required or optional capability is unavailable | Required fails closed; optional action is absent. |
| ADAPTER-EVENT-005 | Harness/runtime | PTY, line, and structured modes emit output | Fidelity and redaction match declaration; no heuristic inference. |
| ADAPTER-CRED-006 | Contract/runtime | Named credential requirements are bound and consumed by one child | Resolver returns one normalized reference per required requirement; unknown, duplicate, raw-value, missing-required, ambiguous stdin, cross-tenant, stale-pin and replayed bindings fail closed before child effects. TUI/headless launch records only scope/grant ids, and completion, cancellation, Runtime termination, and Sandbox cleanup revoke the exact scope. |
| ADAPTER-INSTALL-007 | Application/persistence | Two tenants install the same definition | Definition digest dedupes while application and PGlite repository tests prove tenant-isolated installation/readback. |
| ADAPTER-DISABLE-008 | Application/persistence | Active Workspace references installation | Aggregate, service, and PGlite reference-reader tests prove disable blocks new use while uninstall fails until references clear. |
| PROFILE-MANIFEST-009 | Contract/application | Valid Profile references exact Adapter/Template | Compiler emits bounded existing-operation inputs, not a new aggregate. |
| PROFILE-PIN-010 | Application/persistence | Definitions update after Workspace create | Resolved digest/Harness/capabilities remain stable for recovery. |
| ADAPTER-SURFACE-011 | Contract/transport | Lifecycle operations are exposed | Catalog, HTTP/oRPC, CLI mapping, generated SDK, MCP descriptor, and Web source tests prove the six lifecycle operations use the application schemas. |
| ADAPTER-CODEX-012 | Fixture/opt-in e2e | Fixture and real Codex use declarative Adapter | Own TUI/headless output, reconnect, lifecycle, and exact cleanup are truthful. |
| AGENT-SETUP-UX-001 | Web/source + WebView | Organization setup distinguishes Agents, Model connections and Workspace Profiles | Source contract and desktop WebView prove task-oriented setup with OpenCode/Pi. |
| AGENT-SETUP-UX-002 | Web/source | Raw Adapter/Profile manifests are advanced actions | Primary display surface contains no form/textarea; custom actions open the existing dialogs. |
| AGENT-SETUP-UX-003 | Web/source | Optional hosted model connection capability is contributed | Neutral extension metadata resolves the CTA without a private import; absence remains safe. |
| AGENT-SETUP-UX-004 | WebView | Desktop and 390px mobile setup | Both viewports have no horizontal overflow and preserve readable actions/status. |

## Current Evidence

- `PROFILE-MANIFEST-009` is covered by SDK schema/compiler tests, application lifecycle tests,
  PGlite registry tests, HTTP/oRPC tests, CLI mapping tests, and Web source tests.
- `PROFILE-PIN-010` is covered by compiler output assertions, Sandbox Runtime creation/recovery
  assertions, SDK Workspace creation, and PGlite persistence of the immutable resolved pin and
  active installation references.
- `ADAPTER-CAP-004` is enforced by required capability compilation and capability-gated Web
  mutations; unavailable required capabilities fail before Sandbox creation.
- `ADAPTER-CRED-006` is covered by operation/schema and SDK credential-reference parity,
  Profile compilation, immutable Runtime/PGlite binding persistence, declarative Harness launch,
  echo-disabled managed PTY bootstrap, one-time neutral child-port admission, and
  completion/cancellation/Runtime/Workspace revocation tests from public #834. Those tests prove
  secret values stay absent from argv, descriptors, events, logs, snapshots, audit metadata, and
  serialized Runtime state.
- `ADAPTER-SURFACE-011` covers both the Adapter and Profile operation families across the catalog,
  HTTP/oRPC, CLI, generated SDK metadata, and Web Console source.
- `ADAPTER-CODEX-012` remains an explicit opt-in acceptance gate. Its local Docker and real-provider
  evidence is deferred and is not part of the OpenCode/Pi V1 setup surface. A later Codex slice must
  include target, credential boundary, reconnect behavior, exact cleanup, and any truthful
  capability limitation.
- `AGENT-SETUP-UX-001..003` are covered by the Organization page source contract and localized
  labels. `AGENT-SETUP-UX-004` is covered by desktop and 390px WebView acceptance with overflow
  assertions.
