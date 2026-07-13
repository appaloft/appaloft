# deployment.interrupted

Published after a confirmed stale deployment reconciliation persists the Deployment as terminal
`interrupted`. The event identifies the deployment and recovery lineage without exposing logs,
environment values, runtime credentials, or provider internals. Existing `deployment.finished`
follows with `status = interrupted`.
