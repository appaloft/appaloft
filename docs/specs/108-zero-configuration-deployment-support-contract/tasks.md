# Tasks: Zero-Configuration Deployment Support Contract

## Source Of Truth

- [x] Locate zero-configuration behavior under workload detection/planning and Quick Deploy.
- [x] Record no-new-ADR rationale.
- [x] Audit current detector/planner implementation without changing TypeScript.
- [x] Audit active real Docker and generic-SSH smoke descriptor evidence.
- [x] Create spec, plan, tasks, and stable `ZERO-CONFIG-SUPPORT-*` ids.

## Documentation

- [x] Define Supported, Preview, and Unsupported from current evidence.
- [x] Document detection rules and required evidence/reason output.
- [x] Document override precedence and fail-closed troubleshooting.
- [x] Document local, remote Git, archive, and monorepo limitations without claiming incomplete
  support.
- [x] Synchronize the governing workflow and test matrix.
- [x] Update English and Chinese public source docs under a shared stable anchor.
- [x] Link first-deployment guidance to the support matrix.

## Implementation

- [x] Implement bounded workspace discovery and fail closed for zero/multiple candidate roots.
- [x] Apply explicit `source.baseDirectory` during both create and plan inspection.
- [x] Record automatic remote-Git framework detection as Unsupported after remote inspection was
  removed; retain Preview only for explicit container-native or command profiles.
- [x] Return stable `planVersion`/fingerprint and planner/profile command provenance.
- [x] Pass real Appaloft Docker smoke for Sinatra/Rack, Go Gin, ASP.NET Core, and Rust Axum.
- [x] No runtime support status is promoted without current real-smoke evidence.

## Verification

- [x] Run targeted public documentation contract/build verification.
- [x] Review the final diff and changed-file list.

Verification evidence:

- `bun run typecheck` in `apps/docs`: passed.
- `bun run build` in `apps/docs`: passed; 987 static pages generated.
- `bun test packages/docs-registry/test/help-topics.test.ts`: 22 passed, 0 failed.
- `bun test packages/docs-registry/test/operation-coverage.test.ts -t
  "ZSSH-RUNTIME-004|ZSSH-RUNTIME-005"`: 1 passed, 0 failed.
- Full docs-registry execution was restored by the owning Sandbox Agent artifact after this
  scoped verification recorded the concurrent catalog mismatch.
