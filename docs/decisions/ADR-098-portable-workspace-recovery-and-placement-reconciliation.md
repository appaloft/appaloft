# ADR-098: Portable Workspace Recovery And Placement Reconciliation

- Status: Accepted
- Date: 2026-07-26

## Context

ADR-097 introduced truthful compute-released hibernation and a portability gate. Its first Docker
implementation retains a one-shot recovery image on the original provider. That releases active
compute but cannot recover a Workspace after its current placement is deactivated or unavailable.

Cross-placement recovery needs two independent facts:

- durable recovery bytes must live outside the source compute allocation;
- maintenance must know when the current placement no longer accepts work without learning private
  provider topology.

A hosted composition may decide that a placement is draining and may select its replacement, but
the recovery format, same-Sandbox identity, retry safety and provider reconciliation hook are
neutral Execution Sandbox behavior.

## Decision

### Portable recovery is subordinate, immutable and integrity checked

A compute-released provider may persist its one-shot recovery package in a shared recovery store.
The persisted Sandbox handle identifies the package without exposing an absolute host path,
credential or signed URL. The package includes the durable `/workspace` filesystem and the base
image identity needed to recreate the runtime.

The provider verifies the package digest and Sandbox ownership before restoration. A corrupt,
missing or mismatched package fails closed before a replacement runtime becomes ready.

The recovery package remains subordinate to the original Sandbox. It is not listed as a reusable
`SandboxSnapshot`, cannot create multiple Sandboxes and is deleted only after successful cutover or
explicit termination.

### Recovery families describe actual store compatibility

Providers backed by the same recovery format and shared store identity advertise
`provider-family` portability with the same opaque recovery family. A matching format without a
shared store is not compatible.

The first portable Docker adapter uses a shared-filesystem store. Every participating worker must
mount the same durable root and configure the same explicit store id. The recovery handle contains
only a version, Sandbox id, collision-resistant package id and digest; the configured root never
enters public state. The advertised recovery family uses a bounded digest of the store id rather
than publishing the operator's raw identifier.

Object-storage, volume-snapshot and vendor stores may implement later recovery families without
changing Sandbox lifecycle operations.

### Placement reconciliation is provider-neutral maintenance

`SandboxProvider` may implement a read-only `requiresRelocation` observation for one owned runtime.
It returns only whether the current placement should move; it does not expose a host, region,
capacity or credential.

Maintenance may relocate a ready Sandbox only when:

- the provider requests relocation;
- pause mode is `compute-released`;
- recovery portability is `provider-family` or `portable`.

Relocation uses the existing `sandboxes.pause` then `sandboxes.resume` lifecycle. The provider or
injected placement policy selects the compatible destination. No `migrate` aggregate or parallel
hosted-only operation family is introduced.

### Cutover is retry-safe

Source recovery remains authoritative until the target runtime is ready and durable Sandbox
placement has been saved. A failed target restore leaves the Sandbox paused with the same recovery
handle so maintenance or an operator can retry.

Old terminal, native attach and port capabilities remain invalid after relocation. Callers obtain
new capabilities from the existing operation families.

Terminate removes the exact owned recovery package. Cleanup must never scan or delete a shared
recovery root by prefix alone.

## Consequences

- Two compatible Docker providers can recover the same Sandbox identity through a shared durable
  filesystem even when the source provider no longer accepts new work.
- Hosted placement drain can be implemented as composition policy over the public relocation
  observation and pause/resume lifecycle.
- A shared mount outage pauses migration without destroying the source package.
- Arbitrary PTY memory and unpersisted Agent output remain outside the recovery promise.

## Rejected Alternatives

### Copy the Docker image through the control-plane process

Rejected because large recovery packages would be buffered through the API process, increasing
memory, timeout and credential exposure risk.

### Treat every matching Docker provider as compatible

Rejected because two providers may use the same tar format while pointing at different stores.
Compatibility requires an explicit shared store identity.

### Add `workspaces.migrate` only in hosted composition

Rejected because it would duplicate public Sandbox lifecycle and hide retry and identity semantics
behind a hosted-only command.
