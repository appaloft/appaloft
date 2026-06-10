# project-reordered Event Spec

## Metadata

- Event type: `project-reordered`
- Owning aggregate: Project
- Producer: `projects.reorder`
- Source classification: normative contract

## Contract

`project-reordered` records that a project's display position in project lists changed.

Payload:

```ts
type ProjectReorderedPayload = {
  projectId: string;
  projectSlug: string;
  previousDisplayOrder: number;
  nextDisplayOrder: number;
  reorderedAt: string;
};
```

The event must not include secrets, resource configuration, environment variables, deployment
snapshots, runtime state, or child resource state.

## Consumers

Read models, navigation labels, audit views, and future automation/tooling may consume this event to
explain why project list order changed.
