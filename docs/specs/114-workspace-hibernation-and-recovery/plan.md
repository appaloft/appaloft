# Workspace Hibernation And Recovery Plan

## Sync Round

1. Align ADR-091, the Execution Sandbox workflow and domain model with graded pause semantics.
2. Record that current Docker `pause` freezes rather than releases compute and that Docker Snapshot
   images are provider-local.
3. Keep `SandboxSnapshot` independent from same-identity hibernation recovery.

## Spec And Test Round

1. Add stable requirements and matrix rows for hibernation, activity, auto-suspend, quota,
   placement and portability rejection.
2. Add failing core/application/provider tests before implementation.
3. Keep operation names and public Workspace identity unchanged.

## Code Round

1. Extend Sandbox state with activity and observed suspension metadata.
2. Grade provider pause and recovery portability capabilities.
3. Add quota and placement policy ports.
4. Implement compute-released Docker pause/resume with exact cleanup.
5. Extend maintenance with explicit idle auto-suspend.
6. Propagate safe descriptor fields through generated transports and clients.

## Verification Round

1. Run targeted core, application, runtime-provider and transport tests.
2. Run public lint, typecheck, test and build.
3. Run Docker real-provider hibernate/restore smoke.
4. Run Cloud composed integration tests and Registered Server acceptance where configured.

## Delivery Round

1. Merge the public PR.
2. Pin the merged public main SHA in Cloud.
3. Keep Cloud placement/quota/idle adapters and production acceptance evidence in the private PR.

