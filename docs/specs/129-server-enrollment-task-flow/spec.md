# Server Enrollment Task Flow

## Status

- Round: Spec
- Artifact state: proposed for public review
- Code changes allowed: no, until this Spec and ADR-108 are accepted and an actor-visible Ticket is
  marked `ready-for-agent`
- Compatibility: additive CLI task presentation over existing public operations
- Governing decision: proposed ADR-108

## Business Outcome

An authenticated developer enrolls the local machine or one SSH VPS as an Appaloft Server through
one recoverable CLI journey, then selects that authoritative Server from Workspace/Profile flows
without inferring readiness from registration alone.

## Requirements And Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| SERVER-ENROLL-001 | Explicit target form | no mutation has run | `--local` or one `ssh://user@host[:port]` target is parsed | exactly one mode is accepted; SSH password/path/query/fragment and non-SSH schemes fail before dispatch. |
| SERVER-ENROLL-002 | Register checkpoint | valid target metadata exists | enrollment starts | one `RegisterServerCommand` runs and a safe checkpoint containing its Server id is printed before credential or runtime effects. |
| SERVER-ENROLL-003 | Credential attachment | an SSH Server is registered | a stored credential id, private-key file or local agent mode is selected | one `ConfigureServerCredentialCommand` runs; private-key bytes never appear in argv, output, error evidence or readback. |
| SERVER-ENROLL-004 | Local direct mode | `--local` is selected | enrollment runs | `local-shell` at `localhost` is registered without an SSH credential command and follows the same diagnostic/preparation/readback contract. |
| SERVER-ENROLL-005 | Connectivity diagnostic | registration and required credential attachment succeeded | enrollment continues | one `TestServerConnectivityCommand` supplies bounded real diagnostics before runtime preparation. |
| SERVER-ENROLL-006 | Runtime readiness | connectivity succeeded | enrollment continues | one `PrepareServerRuntimeCommand` runs in the selected mode; any result other than `ready` fails closed rather than claiming completion. |
| SERVER-ENROLL-007 | Authoritative readback | runtime preparation is ready | completion is rendered | `ShowServerQuery` supplies exact Server, credential, proxy and `runtimeAvailability` truth plus completed stage names. |
| SERVER-ENROLL-008 | Recoverable partial failure | registration succeeded and any later step fails | CLI exits non-zero | the registered Server is not deleted; its already printed id and stable underlying error allow granular repair/retry. |
| SERVER-ENROLL-009 | No new operation truth | the task flow is invoked locally or against a remote control plane | each stage executes | only existing catalog messages dispatch; no adapter repository access, hidden API, new event or persistence is added. |
| SERVER-ENROLL-010 | Granular parity | scripts use existing Server commands | enrollment is added | `register`, `credential`, `doctor`, `runtime prepare` and `show` inputs/output remain compatible. |
| SERVER-ENROLL-011 | Discoverability | a user reads CLI help or Server docs | enrollment is resolved | both locales explain local/SSH syntax, secret-safe credential choices, readiness meaning and recovery commands. |

## Input Contract

- Exactly one of `--local` or positional `ssh://user@host[:port]` is required.
- `--name` is optional; defaults to `Local machine` for local mode and the SSH hostname otherwise.
- `--workload-role` remains repeatable and uses the existing canonical Server roles.
- SSH accepts exactly one credential source:
  - `--credential-id <id>` for a stored SSH private-key credential;
  - `--private-key-file <path>` read locally by the CLI; or
  - neither, meaning `local-ssh-agent`.
- SSH username comes from the URI user-info. Percent-decoding must be bounded and a password is
  rejected. Local mode rejects SSH credential options.
- `--runtime-mode` uses the existing `prepare | repair | upgrade` values and defaults to `prepare`.
- SSH host normalization and validation ultimately remain owned by `RegisterServerCommand`.

## Result And Failure Contract

- After registration, print a safe `server-enrollment-checkpoint/v1` value with `serverId`, target
  kind and `registered` status. It contains no credential metadata beyond the non-secret source
  kind.
- On success, print `server-enrollment/v1` with the same Server id, ordered completed stages,
  runtime preparation status/steps, and the bounded `servers.show/v1` readback.
- A later operation failure remains the original stable `DomainError`; the adapter must not replace
  its code, category, phase or retryability with a generic enrollment error.
- A `PrepareServerRuntimeCommand` result with `status = failed` is converted to a stable non-zero CLI
  failure because task completion means deployable readback, not merely command transport success.
- No automatic deletion, credential deletion, proxy mutation outside runtime preparation, or
  Workspace creation occurs.

## Public Surfaces

- Additive `appaloft server enroll` CLI task command and localized help/docs.
- Existing commands/query only; no operation catalog, HTTP/oRPC, SDK, MCP, aggregate, event,
  persistence or read-model additions.
- Workspace TUI/Profile target selection continues to consume `servers.show/list` truth rather
  than an enrollment-owned record.

## Non-Goals

- Interactive wizard or Server management pane inside the Workspace TUI.
- Outbound Worker, relay, mTLS enrollment, port forwarding or personal-Mac inbound access.
- Credential broker/device authorization for native Agent providers.
- Automatic Workspace creation, Profile mutation, deployment, DNS or public exposure.
- Reusing an already registered Server by endpoint; duplicate registration keeps the existing
  command's stable conflict behavior.

## Compatibility And Migration

- Entirely additive. Existing granular CLI, API, SDK and MCP operations remain canonical.
- The task flow may run through the local or generated remote command/query buses, so Cloud needs
  no wrapper and only adopts the merged public SHA.
- Future interactive presentation may call the same task coordinator or dispatch the same existing
  operations, but cannot introduce another lifecycle.
