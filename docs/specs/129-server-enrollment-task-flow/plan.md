# Plan: Server Enrollment Task Flow

## Delivery Sequence

1. Accept Discovery, ADR-108, Spec, Tasks and Test Matrix before Ticket or Code.
2. Create one actor-visible public Ticket linked to every `SERVER-ENROLL-*` id.
3. Add RED CLI tests for target parsing, ordered dispatch, safe checkpoint/readback and partial
   failure recovery.
4. Implement a CLI-adapter task coordinator over existing command/query messages.
5. Preserve granular command behavior and both local/remote bus execution.
6. Update localized docs/help and governing workflow/operation-map references.
7. Run focused CLI tests, lint, typecheck, full tests and build.

## Public/Private Boundary Verification

- New source remains in the public CLI adapter.
- Only existing `@appaloft/application` messages dispatch.
- No public import references Cloud and no private type/table/service is required.
- Cloud adoption is a gitlink-only update after public merge and independent boundary review.

## Rollback

Reverting the additive task command removes `server enroll`; every granular Server command and all
persisted Server state remain valid.
