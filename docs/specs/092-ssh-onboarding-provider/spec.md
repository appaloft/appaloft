# SSH Onboarding Provider Extension Point Spec

- Scope: provider-neutral public Appaloft extension point for creating or importing SSH deployment
  targets through external infrastructure providers.
- Status: Proposed spec-only slice.
- Governing docs: [Providers](../../PROVIDERS.md), [ADR-023](../../decisions/ADR-023-runtime-orchestration-target-boundary.md), [ADR-024](../../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md).

## Summary

Appaloft server registration must stay centered on a normal `generic-ssh` deployment target:
server name, host, SSH port, target kind, and SSH credential configuration. External providers
such as Hetzner, Vultr, DigitalOcean, or similar VPS services can reduce setup friction, but they
must not become server provider choices inside the deployment target form.

This spec defines a future `SSH onboarding provider` boundary. An onboarding provider may create
or discover infrastructure through a provider API, attach or reference SSH keys, run safe bootstrap
user data, wait for the server to become reachable, and return a provider-neutral SSH target
proposal. The proposal is then reviewed and saved through the existing `generic-ssh` server
registration flow.

This slice is documentation-only. It records the public boundary and safety rules for later
adapter work; it does not add a port, API route, UI entrypoint, provider SDK, or cloud-vendor
implementation.

## Ubiquitous Language

- **SSH deployment target**: a server Appaloft can reach over SSH for deployment and diagnostics.
- **Generic SSH server**: the persisted server record with `providerKey = "generic-ssh"`.
- **SSH onboarding provider**: an optional adapter that helps an operator create or connect an
  external server before it becomes a generic SSH server in Appaloft.
- **Target proposal**: provider-neutral, reviewable data returned by onboarding. It can prefill
  the generic SSH form but is not persisted as a server until the operator confirms it.
- **Provider connection**: a safe reference to an external provider account, token, installation,
  or consent record. It must not expose raw access tokens or provider secrets to public read models.
- **Bootstrap script**: provider user data or startup script used to prepare the server for SSH
  and container-based deployment. It must be rendered by an adapter and tracked as safe metadata,
  not stored as an operator-editable secret payload in the generic server record.

## Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| SSH-ONBOARD-001 | Server creation remains provider-neutral | An operator creates a server from the normal server form | The server is submitted | Appaloft persists `providerKey = "generic-ssh"` and does not ask the operator to choose Hetzner, Vultr, Alibaba, Tencent, ACME, or any other vendor as the server provider. |
| SSH-ONBOARD-002 | Onboarding returns a reviewable target proposal | An onboarding adapter creates or imports a VPS | The adapter completes discovery and readiness checks | It returns name, host, SSH port, optional username hint, credential reference hint, target kind, provider connection reference, and safe diagnostics for the generic SSH form. |
| SSH-ONBOARD-003 | Proposal confirmation uses existing server registration | A target proposal is visible to the operator | The operator confirms it | The application saves the target through the same generic SSH registration command path as manual entry. |
| SSH-ONBOARD-004 | Provider secrets never enter the generic server record | A provider token, OAuth token, API key, or account credential is needed for onboarding | The adapter calls the external provider | Secrets remain behind the provider connection boundary and are not copied into server state, target proposals, deployment snapshots, logs, diagnostics, URL parameters, or read models. |
| SSH-ONBOARD-005 | SSH private key ownership stays explicit | Onboarding needs SSH access | The adapter proposes credentials | It references an existing credential, creates a new credential through the credential boundary, or asks the operator to supply one; it does not embed private key material in the proposal. |
| SSH-ONBOARD-006 | Bootstrap output stays safe | A provider supports startup scripts, cloud-init, app images, or instance templates | The adapter provisions the server | The proposal may include script id, image id/name, bootstrap version, and readiness diagnostics, but not raw provider responses, access tokens, private keys, or unredacted command output. |
| SSH-ONBOARD-007 | Provider-specific lifecycle is separate from server lifecycle | A provider-created server is deleted, resized, reinstalled, billed, or suspended outside Appaloft | Appaloft reads the saved server | The saved server remains a generic SSH target; provider-native lifecycle status is observed through onboarding/provider diagnostics only when that adapter is explicitly configured. |
| SSH-ONBOARD-008 | Manual SSH remains the fallback | An onboarding adapter is unavailable, not configured, or fails | The operator still needs to deploy | The operator can continue with the normal generic SSH form without provider-specific fields blocking the workflow. |
| SSH-ONBOARD-009 | Public Appaloft ships no vendor placeholders | A vendor onboarding adapter is not implemented | Provider inventory and server forms are rendered | Public Appaloft does not show disabled vendor choices merely as planned capability. |
| SSH-ONBOARD-010 | Hosted/private distributions can inject adapters | A downstream distribution wants a Hetzner, Vultr, or partner setup flow | It composes Appaloft with an adapter | The adapter integrates through the onboarding boundary and returns generic SSH proposals without changing the core server target model. |

## Non-Goals

- No vendor-specific implementation in this slice.
- No Hetzner, Vultr, DigitalOcean, AWS, Alibaba, Tencent, or similar provider package.
- No provider selection field inside the server registration form.
- No provider billing, quota, invoice, marketplace, referral, entitlement, or support policy.
- No provider-native server lifecycle ownership in the generic server aggregate.
- No storage of raw provider API responses, provider access tokens, private keys, or unredacted
  bootstrap logs in public read models.
- No change to deployment execution; deployments continue to target generic SSH servers.

## Public Boundary

Future implementation should expose neutral public concepts such as:

- `SshOnboardingProvider`
- `SshOnboardingProviderRegistry`
- `SshOnboardingConnectionRef`
- `SshOnboardingRequest`
- `SshOnboardingTargetProposal`
- `SshOnboardingDiagnostic`
- `StartSshOnboardingCommand`
- `InspectSshOnboardingReadinessQuery`
- `ConfirmSshOnboardingTargetCommand`

These names are proposed vocabulary, not an implementation mandate for this documentation-only
slice. A later code round should create the smallest stable API that satisfies the acceptance
criteria and fits the existing command/query and provider registry patterns.

Provider-specific concepts stay behind adapters:

- provider token format and rotation model;
- region, image, plan, firewall, network, and SSH key identifiers;
- startup script, cloud-init, app image, or instance template APIs;
- provider-native server id and lifecycle status;
- partner/referral link handling;
- provider SDK request and response payloads.

## Flow

1. The operator starts from the generic SSH server area or a separate "create/import from provider"
   action.
2. The adapter collects only the provider-specific inputs it owns, such as region, plan, image, SSH
   key reference, or provider connection reference.
3. The adapter creates or discovers the external server, attaches SSH authorization, and optionally
   applies bootstrap user data.
4. The adapter polls readiness until the server has a public host and the configured SSH endpoint
   can be tested or safely reported as pending.
5. The adapter returns an `SshOnboardingTargetProposal`.
6. The operator reviews the proposal in the generic SSH registration surface.
7. Confirmation dispatches the normal generic SSH server registration path and, if needed, the
   credential configuration path.

## Adapter Examples

These examples describe possible adapter behavior without adding vendor commitments to public
core:

- A Hetzner adapter could use a provider connection to create a Cloud server with a selected
  location, server type, image, SSH key id, and cloud-init script, then return the new public IP as
  a generic SSH proposal.
- A Vultr adapter could create an instance with a plan, region, OS image, SSH key id, and startup
  script id, then return the assigned IPv4/IPv6 address as a generic SSH proposal.
- A manual import adapter could read an existing provider server id and return its public address
  and safe readiness diagnostics without creating infrastructure.

## Safety Rules

- Treat all provider responses as untrusted adapter input until translated into the target proposal.
- Redact provider tokens, SSH private keys, bootstrap secrets, and raw command output before logging.
- Prefer credential references over copied key material.
- Keep provider connection diagnostics safe for read models and support bundles.
- Require explicit operator confirmation before persisting a target proposal as a server.
- Keep onboarding failures recoverable by returning diagnostics and preserving the manual generic
  SSH path.

## Follow-Up Rounds

- Add a neutral application port and registry for SSH onboarding providers.
- Add a provider connection storage boundary with safe diagnostics and secret references.
- Add a generic SSH proposal review UI outside the manual server provider fields.
- Add one real adapter, preferably for a provider with stable API support for SSH keys and startup
  scripts.
- Add tests for proposal redaction, generic SSH confirmation, adapter failure recovery, and manual
  fallback.
