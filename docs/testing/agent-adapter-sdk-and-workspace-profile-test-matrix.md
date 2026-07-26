# Agent Adapter SDK And Workspace Profiles Test Matrix

| ID | Layer | Scenario | Expected evidence |
| --- | --- | --- | --- |
| ADAPTER-MANIFEST-001 | Contract/unit | Valid canonical manifest | Normalized definition and stable digest; no execution. |
| ADAPTER-MANIFEST-002 | Contract/unit | Unknown schema major or incompatible API/runtime/template | Typed failure before registry/Sandbox effects. |
| ADAPTER-TRUST-003 | Contract/application | Remote manifest contains code entrypoint or unbounded command | Install rejects without module load or persistence. |
| ADAPTER-CAP-004 | Contract/client | Required or optional capability is unavailable | Required fails closed; optional action is absent. |
| ADAPTER-EVENT-005 | Harness/runtime | PTY, line, and structured modes emit output | Fidelity and redaction match declaration; no heuristic inference. |
| ADAPTER-CRED-006 | Contract/runtime | Named credential requirements are bound | Resolver returns one normalized reference per required requirement; unknown, duplicate, raw-value, missing-required and ambiguous stdin bindings fail closed before runtime effects. |
| ADAPTER-INSTALL-007 | Application/persistence | Two tenants install the same definition | Definition digest dedupes while application and PGlite repository tests prove tenant-isolated installation/readback. |
| ADAPTER-DISABLE-008 | Application/persistence | Active Workspace references installation | Aggregate, service, and PGlite reference-reader tests prove disable blocks new use while uninstall fails until references clear. |
| PROFILE-MANIFEST-009 | Contract/application | Valid Profile references exact Adapter/Template | Compiler emits bounded existing-operation inputs, not a new aggregate. |
| PROFILE-PIN-010 | Application/persistence | Definitions update after Workspace create | Resolved digest/Harness/capabilities remain stable for recovery. |
| ADAPTER-SURFACE-011 | Contract/transport | Lifecycle operations are exposed | Catalog, HTTP/oRPC, CLI mapping, generated SDK, MCP descriptor, and Web source tests prove the six lifecycle operations use the application schemas. |
| ADAPTER-CODEX-012 | Fixture/opt-in e2e | Fixture and real Codex use declarative Adapter | Own TUI/headless output, reconnect, lifecycle, and exact cleanup are truthful. |
