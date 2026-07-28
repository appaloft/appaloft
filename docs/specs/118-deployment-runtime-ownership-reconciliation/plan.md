# Deployment Runtime Ownership Reconciliation Plan

## Spec Round

1. Record desired-state, rollback, shared-asset, and product-boundary decisions.
2. Add a stable deployment runtime reconciliation test matrix.
3. Split the existing-spec retry lineage bug from the new reconciliation behavior.

## Code Round

1. Select the runtime-owning deployment during retry admission.
2. Make provider inventory parseable and prove missing Resources are not active protection.
3. Add exact cleanup readback and bounded retry around replacement and failed compensation.
4. Add desired-versus-actual orphan reconciliation using ownership labels and current route/runtime
   protection.
5. Reuse the operation from Preview and Dev Seed cleanup.

## Verification Round

1. Run targeted application, runtime adapter, Preview, and Cloud Dev Seed tests.
2. Run public lint, typecheck, test, and build.
3. Run Cloud integration checks for authorization, audit, and registered Server composition.
4. Validate a real registered Server with product operations and read-only provider readback.

## Delivery Round

1. Merge the neutral public PR.
2. Pin the merged public commit in Cloud.
3. Merge the Cloud workflow/composition PR after public main and both CI gates pass.
