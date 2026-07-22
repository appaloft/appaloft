# `deployments.proof` Error Contract

| Code/category | Meaning | Recovery |
| --- | --- | --- |
| existing deployment not-found | No scoped Deployment is visible. | Check id and authorized project/tenant context. |
| `deployment_resource_context_mismatch` / conflict | Optional Resource context does not own the Deployment. | Use the owning Resource path. |
| existing forbidden/unauthorized | Product-session/tenant policy denies the query. | Authenticate with the required membership/scope. |
| `deployment_proof_evidence_unavailable` / infrastructure | The query could not assemble enough bounded read-model evidence to return a safe proof. | Retry the query or inspect diagnostics. |

Target-specific inability to inspect artifact/workload/configuration is normally represented inside a
successful proof response as `unavailableEvidence`, not as a transport error. The query must not turn
missing evidence into `verified`.

Managed access failures remain inside proof as stable mismatches. Redirect-specific failures use
`access_redirect_status_mismatch` or `access_redirect_destination_mismatch`; expected and observed
values are safe route evidence and never include credentials or response bodies.
