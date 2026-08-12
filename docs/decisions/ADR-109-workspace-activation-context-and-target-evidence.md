# ADR-109: Workspace Activation Context And Target Evidence

Status: Accepted

Date: 2026-08-12

## Context

`workspaces.open` currently requires a Repository Binding and Project default or explicit Profile,
and placement returns only an opaque reservation. Hosted, self-hosted and local compositions need a
neutral way to initialize missing public context and explain the chosen execution class without
exposing host or provider credentials. Cloud entitlement and fleet topology are not public domain.

## Decision

1. Workspace activation remains the public `workspaces.open` application workflow; no new Workspace
   aggregate, identity, lifecycle or command family is introduced.
2. An optional `WorkspaceActivationContextInitializerPort` may idempotently ensure missing public
   Project, Repository Binding and default Profile state after source validation. The default port
   preserves current fail-closed behavior. Canonical repositories are re-read after initialization.
3. Placement returns validated `WorkspaceTargetSelectionEvidence`: target class `managed`,
   `registered-server` or `local`; source `platform-default`, `saved-policy` or `explicit`; and a
   stable reason code. Evidence contains no host, Server id, provider handle or credential.
4. The existing Workspace open-entry coordination record persists the evidence. Create and resume
   return the same evidence; resume never silently relocates or reevaluates placement.
5. Implementations own target policy, eligibility and inventory behind the ports. Ordinary public
   command input cannot submit a Server id or forge selection evidence.
6. Existing entries without evidence read as `legacy-unclassified`; no ownership is guessed.

## Consequences

- Community, hosted and Enterprise compositions share one activation/readback language.
- The public result change is additive and expected to require a minor release.
- Public persistence gains coordination evidence, not infrastructure topology or lifecycle truth.
- Hosted entitlement, managed pools, billing, tenancy and credentials remain downstream concerns.

## Rejected alternatives

- Infer ownership from provider keys, names or Server roles.
- Add a hosted-only Workspace open workflow.
- Let callers provide raw target/server identity.
- Re-run placement during resume.
