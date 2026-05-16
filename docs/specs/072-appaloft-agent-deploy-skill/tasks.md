# Tasks: Appaloft Agent Deploy Skill

## Spec Round

- [x] Position agent deploy skill as a v1 entry-experience requirement.
- [x] Record that skill comes before MCP for v1 usability.
- [x] Position the full Appaloft skill as the AI-facing entrypoint over the operation catalog.
- [x] Define the safe deploy protocol and outcome packet.
- [x] Preserve operation catalog, BYOS, Resource profile, and ids-only deployment boundaries.

## Docs Round

- [x] Choose the canonical skill artifact path.
- [x] Write the public full Appaloft skill content.
- [x] Write the public agent deploy skill content.
- [x] Add stable public docs anchors and traceability rows.
- [x] Link first-deployment, source, errors/statuses, logs/health, and recovery docs to the skill.
- [x] Keep translated anchor ids stable.

## Testing Round

- [x] Add docs registry coverage for the skill anchor.
- [x] Add text/contract checks that the skill contains no raw secret examples.
- [x] Add checks that the full skill includes every CLI transport entrypoint from the operation
  catalog.
- [x] Add checks that the skill references existing operation keys or CLI/API entrypoints only.
- [x] Add skill source validation through docs registry and operation coverage tests.

## Code Round

- [x] Add CLI help pointer if the deploy help should reference the skill.
- [x] Document standard full skill install with `npx skills add appaloft/appaloft`.
- [x] Remove npm skill installer fallback and keep deploy as an internal full-skill subprotocol.
- [x] Keep MCP integration optional and separate from the v1 skill path.

## Verification

- [x] Run focused public docs tests.
- [x] Run docs registry tests.
- [x] Run CLI help tests if CLI help changes.
- [x] Run generated package/installer tests.
