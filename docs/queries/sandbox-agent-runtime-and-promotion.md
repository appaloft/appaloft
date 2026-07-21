# Sandbox Agent Runtime And Promotion Queries

| Operation | Read model | Default bound |
| --- | --- | --- |
| `sandboxes.agents.runtimes.list` | Runtime summaries for one Sandbox. | bounded by tenant scope |
| `sandboxes.agents.runtimes.show` | One Runtime, template/harness identity, active Run and lifecycle. | one |
| `sandboxes.agents.runs.list` | Runs for one Runtime with lineage/status/usage summary. | bounded by runtime scope |
| `sandboxes.agents.runs.show` | One Run lifecycle, parent, approval wait and safe outcome summary. | one |
| `sandboxes.agents.runs.events` | Cursor replay of bounded redacted Run events. | 500 events |
| `sandboxes.agents.approvals.list` | Pending/resolved approval descriptors for a Run. | bounded by Run scope |
| `sandboxes.agents.approvals.show` | One exact-request approval descriptor. | one |
| `sandboxes.source-artifacts.list` | Artifact summaries scoped to Sandbox. | bounded by Sandbox scope |
| `sandboxes.source-artifacts.show` | Digest, manifest/provenance summary, refs and retention. | one |
| `sandboxes.candidate-previews.show` | Artifact digest, expiry, verification and controlled access descriptor. | one |
| `sandboxes.promotions.list` | Promotion summaries scoped to Sandbox/artifact/target. | bounded by Sandbox scope |
| `sandboxes.promotions.show` | Plan/accept/work stages, Resource/Deployment/proof and next actions. | one |

Queries are tenant-scoped and mutation-free. Run events omit hidden reasoning, raw secret/tool
payloads, full file contents and unbounded stdout/stderr. Promotion readback references authoritative
Resource, Deployment and proof identities instead of copying their complete state.
