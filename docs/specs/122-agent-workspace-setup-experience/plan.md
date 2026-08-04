# Plan: Agent Workspace Setup Experience

## Governing sources

- ADR-094, ADR-100 and ADR-103
- Spec 111, Spec 117 and Spec 120
- `docs/testing/agent-adapter-sdk-and-workspace-profile-test-matrix.md`

## Architecture

- Recompose the existing Organization page without adding business logic to Svelte components.
- Continue using existing oRPC list/show/mutation contracts and capability checks.
- Read a neutral Web extension metadata marker to discover an optional hosted Model connections route.
- Keep manifest dialogs and lifecycle operations unchanged, but expose creation actions only from an
  Advanced / Custom integrations section.
- Use existing Appaloft UI primitives and localized copy.

## Testing

- Bind `AGENT-SETUP-UX-001..003` to the Organization page source contract.
- Bind `AGENT-SETUP-UX-001/004` to desktop and mobile WebView acceptance.
- Keep existing `ADAPTER-SURFACE-011` lifecycle tests passing.

## Version and docs

- Backward-compatible minor UI capability.
- Update the Agent Adapters reference with the normal setup path and advanced manifest boundary.
