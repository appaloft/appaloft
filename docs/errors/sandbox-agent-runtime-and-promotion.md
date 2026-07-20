# Sandbox Agent Runtime And Promotion Errors

| Code | Category | Meaning / recovery |
| --- | --- | --- |
| `sandbox_agent_runtime_not_found` | not-found | Runtime is absent or not visible in tenant scope. |
| `sandbox_agent_runtime_unavailable` | conflict | Parent Sandbox is not ready/resumable; inspect Sandbox state. |
| `sandbox_agent_runtime_busy` | conflict | One Run is active; response includes safe active Run id. |
| `sandbox_agent_harness_unsupported` | validation | Template/harness/model capability is unavailable. |
| `sandbox_agent_run_parent_invalid` | validation | Continue parent is wrong Runtime, active or missing. |
| `sandbox_agent_approval_required` | conflict | Run waits for external approval; inspect approval query. |
| `sandbox_agent_approval_expired` | conflict | Approval request expired; retry tool action to create a new request. |
| `sandbox_agent_approval_forbidden` | forbidden | Runtime/harness identity or actor scope cannot resolve approval. |
| `sandbox_agent_credential_broker_unavailable` | infrastructure | Required external broker is unavailable; no env fallback is allowed. |
| `source_artifact_capture_unsafe` | validation | Unsafe path/link/entry/secret was detected; fix source root. |
| `source_artifact_changed_during_capture` | conflict | Workspace changed; wait for quiescence and capture again. |
| `source_artifact_referenced` | conflict | Accepted Resource/deployment history protects the artifact. |
| `promotion_candidate_unverified` | conflict | Candidate failed exact-digest materialization/verification. |
| `sandbox_promotion_plan_expired` | conflict | Create a new plan/candidate. |
| `sandbox_promotion_plan_superseded` | conflict | Workspace/target changed; review a new plan. |
| `sandbox_promotion_artifact_mismatch` | conflict | Expected digest does not equal planned digest. |
| `sandbox_promotion_accept_forbidden` | forbidden | Sandbox/runtime identity or actor lacks publish authority. |
| `sandbox_promotion_target_conflict` | conflict | Target precondition no longer permits new Resource creation. |
| `sandbox_promotion_needs_attention` | conflict | Delivery evidence is incomplete; follow returned proof gaps/next action. |

Adapters translate stable categories to HTTP/CLI errors. Provider/Pi-specific errors are mapped at
their anticorruption boundaries and never become public codes.
