# project-archived Event Spec

## Normative Contract

`project-archived` means a `Project` aggregate transitioned from active to archived after durable
persistence.

It is a lifecycle fact. It does not mean child resources, environments, deployments, domains,
certificates, logs, or audit records were deleted or archived.
It does not mean a deployment was created, a historical deployment snapshot was edited, or runtime
state changed.

## Payload

```ts
type ProjectArchivedEventPayload = {
  projectId: string;
  projectSlug: string;
  archivedAt: string;
  reason?: string;
};
```

Payloads must not include secrets, deployment logs, credentials, raw environment values, provider
configuration, or private source metadata.

## Publisher

`projects.archive` publishes or records this event after the project is durably persisted.

## Consumers

Consumers may update project read models, navigation status, audit views, and future search
metadata. Duplicate consumers must not duplicate audit or projection rows.

## Current Implementation Notes And Migration Gaps

No cleanup process is started by this event. Future project delete or bulk child-archive workflows
must use their own accepted specs.

## Open Questions

- None.
