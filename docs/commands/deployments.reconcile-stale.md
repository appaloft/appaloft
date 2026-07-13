# deployments.reconcile-stale Command

Safely terminates one still-stale non-terminal Deployment as `interrupted`.

Input requires `deploymentId`, exact `confirm`, observed `stateVersion`, optional `resourceId`, and
the same bounded `staleAfterSeconds` used for observation. Admission re-reads durable state inside
the `resource-runtime` coordination scope. Changed/recent/terminal attempts are rejected. Running
runtime ownership is canceled before the interrupted transition is persisted.
