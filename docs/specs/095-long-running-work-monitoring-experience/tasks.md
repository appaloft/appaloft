# Long-Running Work Monitoring Experience Tasks

- [x] Document the three monitoring layers: deployment progress, task progress, and operator work.
- [x] Document that worker runtime topology is not live heartbeat evidence.
- [x] Add separate durable worker heartbeat storage and doctor/Instance readback for online/stale
  worker status.
- [x] Add acceptance ids for user-visible deployment progress and admin/operator work visibility.
- [x] Add Web Instance maintenance readback for durable worker runtime topology.
- [x] Correct generated CLI monitoring command strings to `appaloft work ...`.
- [x] Add tests covering Instance durable worker runtime copy/readback, heartbeat summary, and
  generated command names.
- [x] Add external worker-group observation for Web/API processes that do not execute durable work.
- [ ] Add dedicated Cloud/Enterprise worker process packaging follow-up.
