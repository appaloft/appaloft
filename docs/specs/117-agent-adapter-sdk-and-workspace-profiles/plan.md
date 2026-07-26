# Plan: Agent Adapter SDK And Workspace Profiles

## Governing Sources

- `docs/DOMAIN_MODEL.md`
- `docs/BUSINESS_OPERATION_MAP.md`
- ADR-091, ADR-094, ADR-095, ADR-096, ADR-100
- `docs/testing/agent-adapter-sdk-and-workspace-profile-test-matrix.md`

## Architecture

- Add portable manifest schemas and deterministic canonical digest helpers in a public package.
- Keep Adapter distribution records outside Sandbox/Harness aggregates.
- Add tenant-scoped definition/installation application ports and in-memory/Postgres/PGlite
  adapters.
- Add validate/install/list/show/disable/uninstall command/query contracts through the operation
  catalog.
- Compile an Agent Workspace Profile into existing Workspace create composition and persist only
  the resolved Adapter/Profile snapshot needed for recovery.
- Implement Declarative Harness execution through existing Sandbox process/terminal boundaries.
- Keep Trusted Code Adapter registration at composition time.
- Add CLI local file/package loading; the server receives canonical content and never fetches an
  arbitrary URL.

## Testing

- Start with schema/digest/conformance unit and contract tests.
- Add application lifecycle, tenant isolation, reference fencing, operation catalog, HTTP/oRPC,
  CLI, SDK, MCP descriptor, and persistence tests.
- Add deterministic fixture Agent integration without model credentials.
- Keep real Codex/Docker/SSH smoke explicit opt-in.

## Risks

- Manifest argv/path/healthcheck inputs require strict bounds and normalization.
- Definition and installation identity must not leak tenant ownership into portable manifests.
- Profile resolution must be atomic enough to prevent digest/version drift during Workspace create.
- Existing Harness catalog and Runtime persistence must remain backward compatible.
