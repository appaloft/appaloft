# project-renamed Event Spec

## Normative Contract

`project-renamed` means a `Project` aggregate's display name and derived slug changed after durable
persistence.

It is a fact event. It must not imply resources, environments, deployments, source links, or
external systems were mutated.

## Payload

```ts
type ProjectRenamedEventPayload = {
  projectId: string;
  previousName: string;
  nextName: string;
  previousSlug: string;
  nextSlug: string;
  renamedAt: string;
};
```

Payloads must not include secrets, provider credentials, deployment logs, or raw user comments.

## Publisher

`projects.rename` publishes or records this event after the project is durably persisted.

## Consumers

Consumers may update project read models, search metadata, audit views, and Web navigation labels.
Duplicate consumers must be idempotent by event id when available or by
`(projectId, nextSlug, "project-renamed")`.

## Current Implementation Notes And Migration Gaps

No async process is started by this event.

## Open Questions

- None.
