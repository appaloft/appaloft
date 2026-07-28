# Profile-Aware Workspace Open And Attach Test Matrix

| ID | Layer | Scenario | Expected evidence | Status |
| --- | --- | --- | --- | --- |
| WS-OPEN-GIT-001 | CLI/unit | Git root/remote/branch/HEAD resolution | Safe local context only; no file upload or remote mutation. | planned |
| WS-OPEN-GIT-002 | core/CLI | SSH/HTTPS normalization | Equivalent locators map to one case-preserving Repository Identity; unsafe credentials/query/fragment fail. | planned |
| WS-OPEN-GIT-003 | CLI/unit | Dirty staged/unstaged/untracked checkout | Fails before control-plane request with HEAD SHA and bounded clean/commit guidance. | planned |
| WS-OPEN-GIT-004 | CLI/integration | Detached, missing upstream, unpushed, remote-ahead, remote-behind, ref mismatch | Read-only upstream tip must exactly match HEAD before business dispatch. | planned |
| WS-OPEN-BIND-005 | core/application/PGlite/HTTP | Repository Binding lookup | Exact tenant Repository maps to Project; missing/cross-tenant/ambiguous state fails with safe setup entrypoint. | planned |
| WS-OPEN-PROFILE-006 | application/CLI | Profile name/id/default resolution | Exact enabled installation resolves; disabled/stale/missing/ambiguous/unauthorized fails before effects. | planned |
| WS-OPEN-CRED-007 | application/Cloud | Named Credential Connection preflight | Required mappings resolve exactly once; missing/stale/unauthorized returns Connect Credential entrypoint without secret material. | planned |
| WS-OPEN-ADMIT-008 | application/Cloud | Admission and placement reservation | Reservation is obtained and consumed before Sandbox create; no capacity creates no Sandbox/Runtime. | planned |
| WS-CREATE-PROFILE-009 | application/CLI/SDK | Profile-aware explicit create | Immutable ref, compiled Sandbox plan, initialization, ports, Runtime pin, and credential grants are used. | planned |
| WS-OPEN-CREATE-010 | application/e2e | First local-context open | Exactly one Sandbox and Runtime; Workspace id equals Sandbox id. | planned |
| WS-OPEN-RESUME-011 | application/PGlite/e2e | Repeat open | Same preferred Workspace/Runtime/session is resumed; no duplicate Sandbox. | planned |
| WS-OPEN-NEW-012 | application/e2e | `--new` | New Sandbox becomes preferred; prior Workspace remains unchanged. | planned |
| WS-OPEN-SHA-013 | application/CLI | Preferred source differs from local HEAD | Fails with `--new` guidance and performs no implicit source mutation. | planned |
| WS-ATTACH-MANAGED-014 | application/CLI/terminal | Managed TUI auto attach and reconnect | Exact grant, one active Terminal Session, immediate bridge, bounded replay, replacement only after terminal expiry. | planned |
| WS-ATTACH-NATIVE-015 | application/CLI/gateway | Native attach handoff | Short-lived revocable access; direct argv only with `local-client-exec`, otherwise validated display. | planned |
| WS-ATTACH-UNSUPPORTED-016 | application/CLI | No supported attach | Capability-driven error and no fake/raw access. | planned |
| WS-OPEN-PARTIAL-017 | application/provider | Failure after Sandbox identity | Exact phase/id/retry/recovery/terminate evidence; repeated open coordinates same partial Workspace. | planned |
| WS-OPEN-REMOTE-018 | CLI/HTTP | Remote control-plane dispatch | Local Git preflight remains local; catalog operations and Terminal gateway dispatch remotely without local backend bootstrap. | planned |
| WS-OPEN-SURFACE-019 | contract/SDK/CLI/Web | Cross-surface parity | Same workflow schemas and descriptor semantics; no duplicated Profile compilation. | planned |
| WS-OPEN-CLEANUP-020 | application/PGlite/Cloud/e2e | Terminate exact cleanup | Runtime, grants, attach access, reservation, Sandbox and preference clean exactly; bindings/defaults/other Workspaces remain. | planned |

Real Pi/OpenCode smoke is explicit opt-in. Evidence must name target, Profile pins, credential
boundary, attach mode, reconnect behavior, exact created ids, cleanup operations, and provider
orphan readback.
