# deployments.stale-attempts Query

Returns a bounded list of non-terminal Deployment attempts whose durable activity is older than the
selected stale threshold. The query is read-only and never proves that an external process is dead.

Input: optional `projectId`, `resourceId`, `staleAfterSeconds` (default 900), and bounded `limit`.

Each item includes deployment/resource ids, status, latest activity time, stale duration,
threshold, and opaque `stateVersion`. Callers must pass that state version to
`deployments.reconcile-stale`.
