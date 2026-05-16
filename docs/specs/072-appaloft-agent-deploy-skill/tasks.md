# Tasks: Appaloft Agent Deploy Skill

## Spec Round

- [x] Position agent deploy skill as a v1 entry-experience requirement.
- [x] Record that skill comes before MCP for v1 usability.
- [x] Define the safe deploy protocol and outcome packet.
- [x] Preserve operation catalog, BYOS, Resource profile, and ids-only deployment boundaries.

## Docs Round

- [x] Choose the canonical skill artifact path.
- [x] Write the public agent deploy skill content.
- [x] Add stable public docs anchors and traceability rows.
- [x] Link first-deployment, source, errors/statuses, logs/health, and recovery docs to the skill.
- [x] Keep translated anchor ids stable.

## Testing Round

- [x] Add docs registry coverage for the skill anchor.
- [x] Add text/contract checks that the skill contains no raw secret examples.
- [x] Add checks that the skill references existing operation keys or CLI/API entrypoints only.
- [x] Add installable package tests for `@appaloft/skills`.

## Code Round

- [x] Add CLI help pointer if the deploy help should reference the skill.
- [x] Add npm-installable skill packaging for `npx @appaloft/skills install deploy`.
- [x] Keep MCP integration optional and separate from the v1 skill path.

## Verification

- [x] Run focused public docs tests.
- [x] Run docs registry tests.
- [x] Run CLI help tests if CLI help changes.
- [x] Run generated package/installer tests.
