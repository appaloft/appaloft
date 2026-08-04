# Agent Workspace Setup Experience

## Status

Implementation complete; ready for Sync Round.

## Goal

Make Organization settings task-oriented for ordinary Agent Workspace setup while preserving the
full declarative Adapter/Profile lifecycle for advanced integration authors.

## Requirements

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| AGENT-SETUP-UX-001 | Task-oriented setup | Organization settings loads | User reviews Agent workspace setup | OpenCode/Pi, Model connections, and Workspace Profiles are distinct concepts in the primary surface. |
| AGENT-SETUP-UX-002 | Advanced custom manifests | User is not authoring an integration | Primary setup surface renders | Raw Adapter/Profile JSON is absent until the user chooses Advanced / Custom integrations. |
| AGENT-SETUP-UX-003 | Neutral hosted capability | A system plugin contributes a model-connection settings route | Setup renders | A task CTA links to the contributed route; Community without it remains usable and never imports private code. |
| AGENT-SETUP-UX-004 | Responsive acceptance | Setup renders at desktop or 390px mobile | Content is inspected | Status, actions and lists remain readable with no horizontal overflow. |

## Ownership

- Bounded context：Agent Adapter/Profile distribution plus neutral Web entrypoint composition.
- Resource owner：existing tenant-scoped Adapter/Profile installations.
- No new aggregate, command, query, event or persistence shape.

## Compatibility

All existing Agent Adapter and Agent Workspace Profile operations, dialogs and URLs remain available.
The change is additive IA/copy; automation and API clients are unaffected.

## Documentation impact

- Existing public topic: `agent.adapter-installations`.
- Stable localized anchors: `/docs/agents/adapters/#agent-adapter-installations` and
  `/docs/en/agents/adapters/#agent-adapter-installations`.
- The registry and maintainer traceability row include this Spec and the task-oriented setup surface.

## Non-goals

- installing uploaded code;
- model provider SDKs or credential custody in public Appaloft;
- replacing the Agent's native TUI;
- changing Workspace, Runtime or Profile lifecycle;
- claiming an Agent is ready without an installed compatible definition.
