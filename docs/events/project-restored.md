# project-restored Event Spec

## Normative Contract

`project-restored` means a `Project` aggregate transitioned from archived to active after durable
persistence.

It is a lifecycle fact. It does not mean child resources, environments, deployments, domains,
certificates, logs, or audit records were created, restored, retried, or otherwise mutated.
It does not mean a deployment was created, a historical deployment snapshot was edited, or runtime
state changed.

## Payload

```ts
type ProjectRestoredEventPayload = {
  projectId: string;
  projectSlug: string;
  restoredAt: string;
  previousArchivedAt?: string;
  previousArchiveReason?: string;
};
```

Payloads must not include secrets, deployment logs, credentials, raw environment values, provider
configuration, or private source metadata.

## Publisher

`projects.restore` publishes or records this event after the project is durably persisted.

## Consumers

Consumers may update project read models, navigation status, audit views, and future search
metadata. Duplicate consumers must not duplicate audit or projection rows.

## Current Implementation Notes And Migration Gaps

No child restore, retry, deploy, cleanup, or runtime process is started by this event. Future project
hard delete workflows must use their own accepted specs.

## Open Questions

- None.
