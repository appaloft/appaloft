# ADR-105: Brokered Model Access Capability

Status: Accepted

Date: 2026-08-08

## Context

Workspace Profiles already pin named Credential Connection references and Agent Runtime records
already retain their safe resolved bindings. Pi and OpenCode also accept hosting-issued gateway
access. The missing link is a neutral execution-port contract that carries the exact binding to the
issuer. Injecting a provider key into a Sandbox would violate the established credential
requirement/reference/grant boundary and make rotation, revocation and tenant policy unreliable.

## Decision

1. Brokered model access extends the existing Profile, Runtime and Harness path; it does not create
   a model-provider aggregate or Agent-specific operation family.
2. A Runtime that needs model access resolves exactly one active `model-api` binding. Missing or
   ambiguous state fails before Agent launch.
3. The Harness execution port receives safe resolved credential bindings. It never receives a
   provider secret.
4. Pi, OpenCode and future compatible harnesses exchange the exact Runtime/Sandbox/run/binding scope
   through one provider-neutral issuer port for a short-lived, revocable model access descriptor.
5. The descriptor may contain gateway URL, capability token, protocol and model identifier. It may
   not contain the upstream provider key.
6. Provider custody, encryption, tenant authorization, audit, gateway routing, rotation policy and
   billing are hosting composition concerns.
7. Existing Profile/Workspace commands remain the only public mutation path. CLI, SDK, HTTP/oRPC,
   MCP and Console do not gain a secret-bearing shortcut.

## Consequences

- Hosting products can rotate or revoke upstream credentials without rebuilding Workspace data.
- Reference harnesses no longer need static provider keys and remain vendor-TUI native.
- Generic declarative adapters must explicitly support the model access capability; otherwise a
  `model-api` requirement fails closed.
- No new public persistence or event family is required.

## Verification

Governed by
[Brokered Model Access Test Matrix](../testing/brokered-model-access-test-matrix.md).
