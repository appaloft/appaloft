# Reusable SSH Credential Rotation

## Status

- Round: Spec Round
- Artifact state: implemented and verified in Code Round
- Behavior state: active
- Feature path: `docs/specs/001-reusable-ssh-credential-rotation/`

## Business Outcome

Operators can rotate one saved reusable SSH credential without changing the credential id that
deployment targets/servers already reference. Future connectivity tests and deployments use the
rotated credential material, while existing server references, deployment history, logs, and runtime
state remain intact.

The behavior completes the Phase 4 SSH credential lifecycle item without forcing users to create a new
credential and manually reattach every server before they can retire compromised or expired key
material.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Reusable SSH credential | A saved `ssh-private-key` credential record that may be referenced by deployment targets/servers. | Runtime topology / credential lifecycle | Saved credential, SSH credential |
| Rotate SSH credential | Replace the stored private-key material, and optional public-key/username metadata, for an existing reusable SSH credential while preserving its credential id. | Credential lifecycle command | Rotate saved credential |
| Affected server usage | The active and inactive visible deployment targets/servers that reference the reusable credential id at rotation admission time. | Credential usage read model | Usage, server references |
| Usage acknowledgement | Explicit operator confirmation that rotating an in-use credential affects future connectivity and deployment operations for the listed servers. | Rotation safety | In-use acknowledgement |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| SSH-CRED-ROTATE-001 | Rotate unused reusable credential | A stored reusable SSH private-key credential exists and no active/inactive visible server references it. | The operator submits `credentials.rotate-ssh` with a new private key and exact credential-id confirmation. | The credential id is preserved, key material is replaced, masked metadata is updated, and the command returns the credential id plus zero usage. |
| SSH-CRED-ROTATE-002 | Rotate credential used by visible servers | A stored credential is referenced by active or inactive visible servers. | The operator submits the command with exact credential-id confirmation and `acknowledgeServerUsage = true`. | The credential id is preserved, server references are unchanged, future credential reads show rotated metadata, and the command returns safe affected usage counts. |
| SSH-CRED-ROTATE-003 | In-use rotation without acknowledgement is rejected | A stored credential is referenced by at least one active or inactive visible server. | The operator omits `acknowledgeServerUsage` or sets it false. | The command returns `credential_rotation_requires_usage_acknowledgement` at phase `credential-safety-check` and key material is unchanged. |
| SSH-CRED-ROTATE-004 | Usage read unavailable is not treated as safe | The credential exists, but server usage cannot be safely derived. | The operator submits the rotation command. | The command returns `infra_error` at phase `credential-usage-read` and mutation is not attempted. |
| SSH-CRED-ROTATE-005 | Missing credential is rejected | The credential id does not exist or is not visible. | The operator submits the command. | The command returns `not_found` at phase `credential-read` and no secret material is stored. |
| SSH-CRED-ROTATE-006 | Secret material is never exposed | The credential has old or new private key material. | Rotation succeeds or fails through any expected branch. | Results and errors contain only safe ids, booleans, timestamps, and counts; they never include private key, public key body, paths, passphrases, command output, or provider credentials. |

## Domain Ownership

- Bounded context: Runtime Topology
- Aggregate/resource owner: reusable SSH credential lifecycle
- Upstream contexts: deployment target/server credential attachment, server connectivity testing
- Downstream contexts: future deployments, server connectivity/readiness observation, public docs/help

Rotation mutates only the credential library record. It does not mutate `DeploymentTarget`, server
credential attachment state, deployment attempts, resource profiles, proxy state, runtime state,
terminal sessions, logs, or repository config.

## Public Surfaces

- API: `POST /api/credentials/ssh/{credentialId}/rotate` using the command schema.
- CLI: `appaloft server credential-rotate <credentialId> --private-key-file <path> --confirm <credentialId>` with an explicit in-use acknowledgement flag when required.
- Web/UI: saved SSH credentials affordance reads usage first, requires exact credential-id confirmation, and requires in-use acknowledgement when usage is nonzero.
- Config: not applicable. Repository config must not select credential identity or raw credential material.
- Events: no credential rotation event is required in the first slice; future audit/event history must add an event spec before publishing credential mutation events.
- Public docs/help: existing topic `server.ssh-credential` and anchor `/docs/servers/credentials/ssh-keys/#server-ssh-credential-path` document rotation behavior and entrypoints.
- MCP/tools: generate from operation catalog metadata, using the same command schema and docs topic.

## Non-Goals

- Creating a new credential id.
- Detaching or rewriting server credential references.
- Testing live SSH connectivity during rotation.
- Scanning local SSH agents, local key files, shell history, Docker, terminal sessions, runtime logs, or provider state.
- Rotating direct private-key attachments or local SSH agent credentials.
- Adding audit/event history, tombstone visibility, or secret-store migration beyond the command's storage mutation.
- Exposing raw key material in command output, query output, Web state, CLI text, logs, diagnostics, or errors.

## Open Questions

- None blocking this behavior. Audit/event history can add a credential mutation event in a separate Spec Round.
