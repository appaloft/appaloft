# Plan: Appaloft Agent Deploy Skill

## Source-Of-Truth Alignment

- ADR-010 governs Quick Deploy as an entry workflow over explicit operations.
- ADR-014 keeps `deployments.create` ids-only and Resource-profile driven.
- ADR-017 keeps access/domain/TLS out of deployment input.
- ADR-021 and ADR-023 keep Docker/OCI runtime execution behind runtime target adapters.
- ADR-033 governs error knowledge links for human and agent-readable recovery.
- The skill does not need a new ADR unless it creates a new operation, hosted artifact boundary,
  MCP-only behavior, or persistent agent workflow state.

## Relationship To MCP

The v1 ordering is skill first, MCP later:

1. Appaloft Skill: complete AI-facing entrypoint over existing CLI/API/Web behavior and all CLI
   operation catalog entries.
2. Agent Deploy Skill: deploy subprotocol inside the full skill for first-deploy and URL-first
   outcomes.
3. Generated MCP/tool descriptors: formal transport metadata from the operation catalog.
4. Appaloft-as-MCP server: future packaged server and handler coverage.
5. AI tool server templates/gateway: later AI-native product tracks.

The skill may mention future MCP tools, but it must not depend on them for v1.

## Documentation Impact

- Add or update public docs with a stable anchor for the skill.
- Link the skill from first deployment, deployment sources, errors/statuses, and recovery docs.
- Keep public docs task-oriented; internal DDD/CQRS terms stay out of the user-facing skill.
- Keep translated anchor ids stable.

## Repository Artifact Options

The Code/Docs Round has chosen the v1 distribution location:

- `docs/agent/appaloft-skill.md` is the canonical governing source for the full AI-facing entrypoint;
- `docs/agent/appaloft-deploy-skill.md` is the canonical governing source for the deploy
  subprotocol;
- `packages/skills/skills/appaloft` is the installable full skill folder;
- `packages/skills/skills/appaloft-deploy` is the installable deploy subprotocol folder;
- `@appaloft/skills` exposes `npx @appaloft/skills add appaloft` and the narrower
  `npx @appaloft/skills install deploy`;
- `.well-known` or public docs page export for copyable agent instructions;
- generated `llms.txt` or equivalent summary derived from the same source.

Other generated exports remain optional follow-ups derived from the canonical source.

## Operation And Entrypoint Impact

- No new operation catalog entry.
- CLI remains the preferred v1 automation path for local coding agents.
- HTTP/API remains the preferred integration path for agents running beside a control plane.
- Web remains human-facing but should point users to the skill when they ask an agent to deploy.
- MCP remains optional and generated from existing operation catalog entries.

## Test Strategy

- Add documentation/registry tests for the public skill anchor once docs are written.
- Add text/contract tests that the skill does not contain raw secret examples or agent-only
  operation names.
- Add CLI help snapshot coverage only if CLI help links to the skill.
- Add generated `llms.txt` or skill package tests only when generation exists.

## Implementation Order

1. Public docs page or repository skill artifact with the deploy protocol.
2. Docs registry/topic link and public docs traceability row.
3. CLI help pointer to the skill docs if appropriate.
4. npm-installable skill packaging.
5. Optional MCP/tool descriptor cross-links after the MCP surface is productized.

## Open Questions

- Whether v1 should publish an `llms.txt` summary for Appaloft deploy agents.
