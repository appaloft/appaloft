# Reusable Workspace Snapshot Policy Test Matrix

| ID | Layer | Scenario | Expected evidence |
| --- | --- | --- | --- |
| SNAP-POL-001 | Application | Static or injected policy resolves | Only bounded neutral policy fields cross the port. |
| SNAP-POL-002 | Application/server | Ready unprotected Sandbox is due | One scheduled Snapshot is ready and maintenance reports its id. |
| SNAP-POL-003 | Application/server | Active capture or Terminal Session exists | Scheduled capture is skipped without provider mutation. |
| SNAP-POL-004 | Application/provider | TTL/count retention is exceeded | Exact oldest eligible handles are deleted; unrelated handles remain. |
| SNAP-POL-005 | Application | Required pre-termination capture succeeds/fails | Success precedes terminate; failure preserves ready runtime. |
| SNAP-POL-006 | Application | Termination retry sees fresh Snapshot | Existing Snapshot is reused without duplicate provider capture. |
| SNAP-POL-007 | Application | Best-effort capture fails | Failed Snapshot is visible and termination/expiry completes. |
| SNAP-POL-008 | Application | Required capture starts from paused compute-released state | Resume precedes capture and failure retains recoverable state. |
| SNAP-PORT-001 | Runtime adapter | Shared-store Snapshot capture | Digest-addressed package exists and local transient image is removed. |
| SNAP-PORT-002 | Application/runtime | Two providers restore one retained Snapshot repeatedly | Workspace bytes survive in every new Sandbox and package remains. |
| SNAP-PORT-003 | Application | Target recovery family differs | Typed compatibility failure precedes target effects. |
| SNAP-PORT-004 | Runtime adapter | Digest or ownership is invalid | Restore fails closed and package remains. |
| SNAP-PORT-005 | Runtime adapter | Portable Snapshot delete | Exact package/cache is removed; unrelated data remains. |
| SNAP-CLOUD-001 | Hosted composition | Snapshot policy environment is complete/incomplete | Complete policy registers; partial or invalid policy fails closed. |
| SNAP-CLOUD-002 | Hosted registered Server | Portable Snapshot source Server drains | Provision selects an active compatible Server without requiring source compute. |
