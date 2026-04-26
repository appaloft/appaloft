# environment-archived Event Spec

## Normative Contract

`environment-archived` means an `Environment` aggregate transitioned from active or locked to
archived after durable persistence.

It is a lifecycle fact. It does not mean resources, deployments, domains, certificates, logs, source
links, runtime state, or audit records were deleted, stopped, or archived.

## Payload

```ts
type EnvironmentArchivedEventPayload = {
  environmentId: string;
  projectId: string;
  environmentName: string;
  environmentKind: string;
  archivedAt: string;
  reason?: string;
};
```

Payloads must not include secret values, provider credentials, deployment logs, source credentials,
or runtime output.

`reason`, when present, is the normalized safe `ArchiveReason` accepted by
`environments.archive`.

## Publication And Idempotency

The event is published or recorded only when an environment transitions from active or locked to
archived.

Repeated `environments.archive` calls against an already archived environment are idempotent command
successes and must not publish duplicate `environment-archived` events.

Consumers must handle duplicate event delivery idempotently by environment id and archived lifecycle
state.

## Consumers

Consumers may update environment read models, audit views, navigation status, and future search
metadata.

Consumers must not stop runtime, delete resources, cancel deployments, remove proxy routes, revoke
certificates, delete source links, or delete deployment history.

## Current Implementation Notes And Migration Gaps

No cleanup process is started by this event. Future environment delete/restore or bulk child
lifecycle workflows must use their own accepted specs.

No migration gaps are recorded for this slice.

## Open Questions

- None.
