# Discovery: Server Enrollment Task Flow

## Status

- Round: Grill / Discovery
- Owner decision: confirmed as part of the active `R1 Appaloft Workspace Alpha` objective
- Proposed scope: public CLI task flow over existing Server registration, credential, connectivity,
  runtime preparation and readback operations
- Code changes allowed: no, until this discovery and Spec are accepted and a Ticket exists

## Business Outcome

A developer can make the local Mac or one SSH VPS an Appaloft execution target with one memorable
command, receive the exact registered Server id immediately, and see whether runtime preparation
and final deployability readback actually succeeded. The task flow must remain resumable when a
later step fails and must not create a second Server lifecycle or expose SSH secret material.

## Existing Capabilities

- `RegisterServerCommand` owns DeploymentTarget identity and persisted endpoint metadata.
- `ConfigureServerCredentialCommand` owns the Server credential attachment.
- `TestServerConnectivityCommand` owns bounded connectivity and proxy diagnostics without lifecycle
  mutation.
- `PrepareServerRuntimeCommand` owns idempotent runtime/Docker/proxy preparation and returns exact
  phase evidence.
- `ShowServerQuery` owns final credential, edge-proxy and runtime-availability readback.
- `appaloft server register`, `credential`, `doctor`, `runtime prepare` and `show` remain the
  scriptable step-by-step equivalents.

## Confirmed Decisions

| Question | Decision | Rationale |
| --- | --- | --- |
| Product location | Public Appaloft CLI adapter | Server enrollment is neutral Community target activation, not hosted Cloud state. |
| Lifecycle ownership | Compose existing commands and query only | A task command must not add a Host/Machine aggregate, persistence, event or hidden mutation. |
| Entry | `appaloft server enroll --local` or `appaloft server enroll ssh://user@host[:port]` | Keeps local and registered-VPS activation explicit and memorable. |
| URI safety | SSH only; reject password, path, query and fragment | Secrets and unrelated URL state must not enter argv, logs or persisted endpoint metadata. |
| SSH credential | Existing stored credential id, private-key file read locally, or local SSH agent | Reuses current credential custody; key bytes never enter result/readback. |
| Sequence | register -> configure credential when required -> doctor -> runtime prepare -> show | Each step has an existing owner and observable result. |
| Failure | Fail non-zero at the exact failed step; do not delete the registered Server | Later steps can be retried safely, while automatic rollback could delete valid user intent. |
| Checkpoint | Print a safe registered checkpoint with Server id before later external effects | The user can recover without scraping errors or database state. |
| Readiness | Final success requires runtime preparation `ready` and authoritative `servers.show` readback | Connectivity success or a registered row alone is not deployability proof. |
| Local mode | Register `local-shell` at `localhost`; no SSH credential step | Local direct remains explicit without pretending to be SSH. |
| Headless parity | Keep every existing step command unchanged | Automation can continue using granular operations and machine output. |

## Candidate Journey

1. Parse and validate local mode or one secret-free SSH URI before mutation.
2. Register the exact target and print its safe Server id checkpoint.
3. Attach the selected SSH credential without echoing secret bytes.
4. Run the existing connectivity diagnostic.
5. Run idempotent runtime preparation and require its real `ready` result.
6. Query the Server detail and print one bounded completion result with credential/proxy/runtime
   readback and per-stage status.
7. On failure, use the printed Server id with existing granular commands to repair or retry.

## Rejected Alternatives

- A new `Host`, `Machine`, `Enrollment` or Cloud-only aggregate/API.
- Storing a private key, password or SSH URI in an enrollment record.
- Passing private-key bytes in argv or printing them in checkpoints/errors.
- Treating registration or connectivity alone as runtime readiness.
- Deleting the Server automatically after credential, connectivity or preparation failure.
- Hiding a second enrollment implementation inside the Workspace TUI.

## Public/Private Boundary

Public owns task parsing, safe sequencing, existing operation dispatch and bounded readback. Cloud
may inject its existing authz, tenancy, credential custody, audit and provider composition through
the same commands/query. Public imports no Cloud package and Cloud adds no enrollment lifecycle.

## Open Questions

No question remains that changes ownership or the first implementation slice. Interactive prompts,
outbound Worker enrollment and mTLS relay remain separate R2 behavior.
