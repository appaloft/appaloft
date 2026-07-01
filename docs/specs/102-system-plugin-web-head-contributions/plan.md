# Plan: System Plugin Web Head Contributions

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: `docs/ARCHITECTURE.md`, `docs/PLUGINS.md`
- Local specs: `docs/specs/102-system-plugin-web-head-contributions/spec.md`
- Test matrix: stable ids in this spec and `tasks.md`

## Architecture Approach

- Domain/application placement: no aggregate or command/query behavior; keep the contract in
  `@appaloft/plugin-sdk`.
- Repository/specification/visitor impact: none.
- Event/CQRS/read-model impact: none.
- Entrypoint impact: `@appaloft/plugin-host` exposes compatible system-plugin head contributions;
  `@appaloft/adapter-http-elysia` inserts them into Web Console HTML responses.
- Persistence/migration impact: none.

## Roadmap And Compatibility

- Roadmap target: neutral extensibility hardening.
- Version target: public Appaloft pre-release line.
- Compatibility impact: minor-compatible additive plugin contract.

## Testing Strategy

- Matrix ids: `WEB-HEAD-CONTRIB-001`, `WEB-HEAD-CONTRIB-002`,
  `WEB-HEAD-CONTRIB-003`.
- Test-first rows:
  - `packages/plugins/sdk/test/manifest.test.ts`
  - `packages/plugins/host/test/registry.test.ts`
  - `packages/adapters/http-elysia/test/static-assets.test.ts`
- Acceptance/e2e: HTTP adapter static asset test proves insertion through Elysia request handling.
- Contract/integration/unit: SDK schema and host registry tests prove contract compatibility.

## Risks And Migration Gaps

- Remote/untrusted plugin isolation is future work; this slice is for trusted system plugins.
- CSP nonce negotiation is not part of this slice.
