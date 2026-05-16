# project-deleted Event Spec

## Normative Contract

`project-deleted` means a `Project` aggregate transitioned from archived to deleted after durable
persistence.

It is a tombstone lifecycle fact. It does not mean child resources, environments, deployments,
domains, certificates, logs, source events, audit rows, or runtime state were deleted.

## Payload

```ts
type ProjectDeletedEventPayload = {
  projectId: string;
  projectSlug: string;
  deletedAt: string;
  archivedAt?: string;
  archiveReason?: string;
};
```

Payloads must not include secrets, deployment logs, credentials, raw environment values, provider
configuration, or private source metadata.

## Publisher

`projects.delete` publishes or records this event after the project tombstone is durably persisted.

## Consumers

Consumers may update read models, navigation state, audit views, and future search metadata. They
must not cascade cleanup or erase retained child history.
