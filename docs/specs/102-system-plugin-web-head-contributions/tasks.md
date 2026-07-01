# Tasks: System Plugin Web Head Contributions

## Test-First

- [x] WEB-HEAD-CONTRIB-001: add SDK and host tests for compatible system-plugin head contributions.
- [x] WEB-HEAD-CONTRIB-002: add Elysia static Web HTML injection test.
- [x] WEB-HEAD-CONTRIB-003: add Elysia non-console/non-head response exclusion test.

## Source Of Truth

- [x] Add `docs/specs/102-system-plugin-web-head-contributions/spec.md`.
- [x] Add `docs/specs/102-system-plugin-web-head-contributions/plan.md`.
- [x] Update `docs/PLUGINS.md`.

## Implementation

- [x] Add `web-head` capability and `SystemPluginWebHeadContribution` contract to
  `@appaloft/plugin-sdk`.
- [x] Add compatible contribution listing to `@appaloft/plugin-host`.
- [x] Add Elysia Web Console HTML head response transformer.

## Entrypoints And Docs

- [x] Keep the extension point scoped to Web Console HTML responses.
- [x] Document that user-deployed apps, docs, API responses, and plugin routes are not targets.

## Verification

- [x] Run `bun test packages/plugins/sdk/test/manifest.test.ts`.
- [x] Run `bun test packages/plugins/host/test/registry.test.ts`.
- [x] Run `bun test packages/adapters/http-elysia/test/static-assets.test.ts`.
- [x] Run relevant package typechecks if touched types require it.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, public docs, tests, and implementation.
