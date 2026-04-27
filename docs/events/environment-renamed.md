# environment-renamed Event Spec

## Normative Contract

`environment-renamed` means an `Environment` aggregate's display name changed after durable
persistence.

It is a fact event. It must not imply resources, deployments, configuration variables, domains,
certificates, source links, runtime state, or external systems were mutated.

## Payload

```ts
type EnvironmentRenamedEventPayload = {
  environmentId: string;
  projectId: string;
  previousName: string;
  nextName: string;
  environmentKind: string;
  renamedAt: string;
};
```

Payloads must not include secret values, provider credentials, deployment logs, source credentials,
raw configuration values, or runtime output.

## Publication And Idempotency

The event is published or recorded only when an active environment changes name.

Repeated `environments.rename` calls with the current normalized name are idempotent command
successes and must not publish duplicate `environment-renamed` events.

Consumers must handle duplicate event delivery idempotently by environment id and next name.

## Consumers

Consumers may update environment read models, audit views, navigation status, and future search
metadata.

Consumers must not create deployments, mutate resources, copy variables, apply proxy routes, issue
certificates, stop runtime, or delete history.

## Current Implementation Notes And Migration Gaps

No async process is started by this event.

No migration gaps are recorded for this slice.

## Open Questions

- None.
