# Portable Workspace Recovery And Placement Reconciliation Plan

## Sync And Spec Round

1. Accept ADR-098 and define stable recovery, compatibility, relocation and cleanup requirements.
2. Keep recovery subordinate to Sandbox and keep placement topology outside public state.
3. Add stable test matrix rows before implementation.

## Code Round

1. Add the optional provider relocation observation and maintenance result.
2. Implement shared-filesystem Docker recovery with validated opaque handles and digests.
3. Prove cross-provider-family resume and retry-safe failure in application tests.
4. Prove that hosted composition can reconcile an inactive placement without widening public state.

## Verification Round

1. Run targeted core, application and runtime adapter tests.
2. Run public lint, typecheck, test and build.
3. Run a real local two-provider Docker recovery smoke with exact cleanup.
4. Leave provider-specific multi-placement acceptance to the consuming composition.

## Delivery Round

1. Merge the neutral public PR.
2. Let consuming compositions pin the merged public commit and verify their own placement policy.
