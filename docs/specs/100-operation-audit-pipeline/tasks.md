# Operation Audit Pipeline Tasks

- [x] Define neutral `OperationAuditSink` contract and envelope.
- [x] Wire `CommandBus` to record lifecycle command results through the sink.
- [x] Wire selected lifecycle domain events through a neutral audit projector.
- [x] Remove project lifecycle direct audit writes from use cases.
- [x] Normalize retained payload fields for actor, action, organization, result, resource, and related targets.
- [x] Extend global audit export filters.
- [x] Keep query operations non-audited by default.
- [x] Add application and persistence tests.
- [ ] Add broader end-to-end smoke coverage for deployment/resource/domain flows.
