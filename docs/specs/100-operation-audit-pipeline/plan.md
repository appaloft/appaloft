# Operation Audit Pipeline Plan

## Implementation Plan

1. Add neutral public `OperationAuditSink` and operation audit envelope types.
2. Invoke the sink from `CommandBus` for selected lifecycle command domains.
3. Add a neutral lifecycle domain-event projector for deployment/resource/dependency/domain/server
   facts that happen outside the initial user command boundary.
4. Keep query operations non-audited by default.
5. Reuse the existing public audit read model instead of adding a downstream-private audit table.
6. Extend global audit export filters for organization, action, resource type, and actor.
7. Update the public Audit Log Console page to read the standard envelope.
8. Let downstream hosted distributions inject entitlement and retention visibility only at
   composition/admission time.

## Verification

- Application command-bus audit pipeline tests.
- Application lifecycle domain-event projection tests.
- PGlite audit read-model filter/redaction tests.
- Existing public audit export/list tests.
- Downstream hosted distribution plan/nav/API guard tests.
