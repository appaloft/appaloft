# Long-Running Work Monitoring Experience Plan

1. Define the public three-layer monitoring model in neutral language.
2. Keep deployment events/logs as the primary user-facing deployment progress surface.
3. Keep `operator-work.*` as the admin/operator durable work ledger and repair surface.
4. Show durable worker runtime topology on Instance maintenance without claiming liveness from
   configuration alone.
5. Add a separate durable worker heartbeat read model for online/stale worker status.
5. Correct generated CLI follow-up command strings so they match the implemented `appaloft work`
   command group.
6. Leave product-specific parent workflow progress to Cloud/extension-owned specs that consume this
   public boundary.
