# Deploy Protocol

For deployment work, use this Appaloft deploy protocol:

1. Inspect safe project metadata only.
2. Select the deployment mode before asking for Appaloft ids.
3. Select or create project, server, environment, and resource context only through Appaloft
   operations or trusted bootstrap context.
4. Configure source, runtime, network, health, access, variables, dependencies, storage, and
   scheduled tasks on the Resource profile.
5. Run plan/preview when useful.
6. Create or clean up deployment through Appaloft.
7. Watch progress through the right stream, then observe detail, logs, resource health,
   diagnostics, recovery readiness, and `deployments.proof`.
8. Claim deployment success only when the proof verdict is `verified`. Treat
   `partially-verified`, `unverified`, `stale`, and `failed` as non-success outcomes and report the
   proof's evidence gaps, mismatches, and next safe actions.
9. Return URL/access state first, then proof verdict, ids, and next safe actions.

For Cloud deployments to a registered SSH server, read the server readiness summary and run
`appaloft server test <serverId>` before starting deployment. If the target is unavailable,
pending, or failed for Appaloft runtime work, run `appaloft server proxy repair <serverId>` and
re-check readiness before deploying. A failure that says `Executable not found in $PATH: "ssh"` is
a control-plane runtime packaging blocker; a failure that says `Docker is not available on the SSH
target` is a server initialization blocker. Report and stop rather than bypassing Appaloft with
direct SSH.

## GitHub Action Deployment Modes

When a user asks for a GitHub Action deploy, choose the mode from state ownership:

1. Pure SSH Action:
   - choose this for the fastest BYOS deploy to an SSH server;
   - default `control-plane-mode` is `none`;
   - the Action installs/runs the CLI and deploys through SSH;
   - SSH targets default to server-owned `ssh-pglite` state;
   - do not require an Appaloft console, `appaloft-token`, project id, resource id, or server id;
   - let source-link state bootstrap once and then automatically reuse context.
2. Self-hosted Server Action:
   - choose this when the user already has a self-hosted Appaloft console/API;
   - the deployment path must not SSH, invoke the CLI deploy executor, select `state-backend`, or
     mutate SSH-server PGlite;
   - require explicit `control-plane-url` to choose the Appaloft instance;
   - require `appaloft-token` or a future accepted deploy-token/OIDC credential for mutation
     endpoints;
   - prefer `server-config-deploy: true` so the server reads `appaloft.yml`, applies
     profile/env/domain changes, resolves source-link context, and dispatches ids-only
     `deployments.create`;
   - do not make project/environment/resource/server ids the default request. Use source-link state,
     repository binding, deploy-token scope, or a one-time trusted bootstrap/advanced override.
3. Product-grade Preview:
   - choose this when Appaloft Cloud or a self-hosted control plane should own preview policy,
     GitHub App webhook intake, comments/checks, cleanup retry, scheduler, audit, quota, and managed
     route/domain follow-up;
   - do not present it as the same thing as a user-maintained Action-only PR preview workflow.

Multiple Appaloft instances are not discovered by scanning target machines. The trusted
`control-plane-url` selects the self-hosted instance.

## Preview Deployments

Action-only PR preview is a repository-maintained workflow:

- the repository must define `pull_request` deploy and usually `pull_request.closed` cleanup
  workflows;
- same-repository PRs are the default safe example;
- fork PRs require an explicit reduced-credential policy before exposing SSH keys, deploy tokens, or
  production secrets;
- preview identity comes from trusted GitHub event facts such as PR number and source repository,
  not from committed config ids;
- use `appaloft.preview.yml` or trusted Action inputs when production `appaloft.yml` is not
  preview-safe;
- production `access.domains[]` must not be reinterpreted as PR hostnames.

Self-hosted server preview through the Action still uses the server API boundary:

- use `control-plane-mode: self-hosted`, `control-plane-url`, and `appaloft-token`;
- prefer `server-config-deploy: true` when the server should apply the selected config before
  deployment admission;
- preview `environment-variables`, `preview-domain-template`, and `preview-tls-mode` are transient
  trusted request values, not repository config identity;
- cleanup calls the self-hosted cleanup endpoint and resolves context from preview source-link
  state, not from project/resource/server ids.

Product-grade preview is control-plane-owned:

- preview policy decides same-repository/fork/secret eligibility, quotas, expiry, and route policy;
- GitHub App webhook verification and source-event ingestion are control-plane features;
- comments/checks/status feedback, cleanup retries, scheduler ownership, and audit are durable
  control-plane concerns;
- the final deployment still goes through ids-only `deployments.create` after the control plane
  selects preview context.

## Source-Link And Bootstrap Context

Agents should not ask ordinary users for `project-id`, `resource-id`, or `server-id` as the first
step of an Action deployment.

Use this context order:

1. Existing source-link or repository binding in the selected state owner.
2. Deploy-token scope, GitHub repository identity, config path, source base directory, and preview
   scope.
3. Interactive or trusted control-plane selection.
4. One-time trusted bootstrap context when no binding exists.
5. Advanced override/debug ids when an operator is intentionally repairing or retargeting context.

If binding is missing, prompt for one safe action:

- establish or relink source-link/repository binding in Appaloft; or
- run one trusted bootstrap deploy with complete project/environment/resource/server context.

Never put tokens, SSH keys, database URLs, provider account ids, organization ids, tenant ids, raw
secret values, credentials, host bind source paths, provider-native storage handles, task ids,
provider-native scheduler handles, backup policy ids, backup artifact handles, restore point ids,
source-event ids, webhook delivery ids, monitoring policy ids, runtime prune policy ids, metric
sample ids, log payloads, raw Docker/SSH cleanup commands, or webhook secret values into
`appaloft.yml`. Repository config may declare high-level application
`dependencies`, `dependencies.<key>.backup`, `storage`, `scheduledTasks`, `autoDeploy`,
`preview.pullRequest.policy`, `access.generated`, `monitoring.thresholds`,
`retention.runtimePrune`, `health`, `env`, supported `secrets` references, selected
`profiles.<key>` overlays, and selected `preview.pullRequest.profile` overlays, but deploy must
reconcile them through existing operations before ids-only deployment admission. Supported
`secrets` references are trusted runner `ci-env:<NAME>` values and same-key existing Resource
secret checks via `resource-secret:<KEY>`; external secret adapters are not repository config
resolvers yet. Resource health policy declarations use `resources.configure-health`; runtime prune
declarations configure only the trusted selected server's `deployment-snapshot` scheduled runtime
prune policy; preview policy declarations configure only the selected Resource policy during
ordinary trusted deploys and are skipped during PR preview deploy mutation; named config profiles
apply only after trusted CLI/Action `config-profile` selection, preview profile overlays apply only
after trusted PR preview context selects preview scope, and none may be added to
`deployments.create`.

## Entry Selection

Use this order:

1. Existing configured Resource in a selected remote control plane: use `appaloft deployments
   create --project <projectId> --environment <environmentId> --resource <resourceId> --server
   <serverId> [--destination <destinationId>]`; it is ids-only and does not replace source/profile
   configuration or proof verification.
2. Existing Appaloft config: `appaloft deploy <source>`; `source.type: image` in config is a
   Resource source/runtime profile declaration, not a deployment command field or registry secret
   surface.
3. Docker/OCI image: `appaloft deploy image://<image>:<tag> --method prebuilt-image`.
4. Compose source: `appaloft deploy <source> --method docker-compose`.
5. Dockerfile source: `appaloft deploy <source> --method dockerfile`.
6. Built static output: `appaloft deploy ./dist --as static-site`.
7. Static source: `appaloft deploy <source> --method static --publish-dir <dir>`.
8. Workspace commands: use explicit install, build, start, and port options.
9. Blueprint catalog: use `appaloft blueprint list/show/plan-install` for neutral catalog discovery
   and dry-run planning. For Web quick deploy, use
   `source=blueprint&sourceExtension=<catalog-extension-key>&blueprintSlug=<slug>` for official or
   extension-provided Blueprints such as PocketBase; do not invent a hidden CLI-only Blueprint
   deploy command. Submit the install command once with `--parameter KEY=value`,
   `--secret KEY=value` or `--secret component:KEY=value`, and the required acknowledgements
   `accepts-blueprint-application-bundle`, `reviews-dependency-resource-bindings`, and
   `preserves-user-owned-configuration`; then follow any returned parent work id through
   `appaloft work events <workId> --follow --json` or `appaloft work watch <workId> --json`; follow
   any returned deployment id through `appaloft deployments timeline <deploymentId> --follow --json`,
   deployment detail, and deployment logs.

## Progress Streams

Progress monitoring is part of deployment, not an optional afterthought.

- Use `appaloft deployments timeline <deploymentId> --follow --json` for a single deployment
  attempt. It is the user-level deployment event stream and remains paired with
  `appaloft deployments timeline <deploymentId>` for bounded deployment timeline/log review. For remote CLI profiles, the CLI should open
  the control-plane stream route when it is available; bounded JSON polling is only a compatibility
  fallback for older control planes that do not expose streaming.
- Use `appaloft work events <workId> --follow --json` or
  `appaloft work watch <workId> --json` for a parent durable work item that coordinates multiple
  resources, child deployments, retries, or long-running platform work such as Blueprint install.
  Report stable parent states such as accepted, running, progress, retry-scheduled, succeeded,
  failed, canceled, dead-lettered, closed, gap, or error; include worker id/group only when the
  operation result explicitly returns safe observed fields. If an older CLI/control plane returns
  `control_plane_unsupported` for remote watch, fall back to explicit `work show`/`work list`
  polling and report that the watch surface is unavailable.
- Use `appaloft work show <workId>` only for a snapshot/detail read. Do not use repeated `work show`
  polling as the live progress mechanism when the event stream is available.

## Real Smoke Cleanup

Treat cleanup as part of a real deployment smoke when the test created project, resource, storage,
deployment, or runtime state:

1. Identify the exact ids and slugs from the run output, manifest, or Appaloft list/show commands.
   Do not use broad filters, direct SQL, direct Docker deletion, or provider APIs to decide what to
   remove.
2. Stop running workload through `appaloft resource runtime stop <resourceId>` when the resource is
   still active.
3. Archive and delete seed-owned resources through
   `appaloft resource archive <resourceId>` and
   `appaloft resource delete-check <resourceId>` before
   `appaloft resource delete <resourceId> --confirm-slug <slug>`.
4. Archive visible seed-owned deployments through
   `appaloft deployments archive <deploymentId> --confirm <deploymentId>` when they are not removed
   by resource/project cleanup.
5. If project deletion is still blocked by `deployment-history`, prune only the exact seed-owned
   scope. Run dry-runs first, then prune retained records and archived deployments:
   `appaloft deployments logs prune --resource <resourceId> --before <iso> --dry-run`,
   `appaloft resource runtime-control-attempts prune --resource <resourceId> --before <iso> --dry-run`,
   `appaloft provider-job-log prune --resource <resourceId> --before <iso> --dry-run`,
   `appaloft resource log-archives prune --resource <resourceId> --before <iso> --dry-run`, and
   `appaloft deployments prune --resource <resourceId> --before <iso> --dry-run`. Execute the same
   commands without `--dry-run` only after the matched ids belong to the smoke. Do not delete rows
   directly from the database to bypass retained references.
6. Run `appaloft project delete-check <projectId>` before deleting a seed-owned project. If blockers
   remain, clear them through Appaloft lifecycle commands, then archive and delete the project with
   exact confirmation.
7. Keep shared or environment-injected SSH server records for reuse unless the user explicitly asks
   to delete the server. If deleting a seed-owned server record, deactivate it, run delete-check, and
   delete by exact id.
8. For Appaloft-managed storage, detach resource attachments first, run
   `appaloft storage volume cleanup-runtime <storageVolumeId> --server <serverId> --before <iso>`
   for runtime realizations, and delete the storage volume only when it is seed-owned.
9. After Appaloft cleanup completes, use `appaloft server test <serverId>` and
   `appaloft server capacity inspect <serverId>` as the first read-only orphan check when the server
   credential is managed by Appaloft. When a specific stopped container or runtime artifact is
   suspected, run `appaloft server capacity prune <serverId> --before <iso> --target <id-or-target> --dry-run true`
   before executing the same command with `--dry-run false`. Direct read-only
   SSH/Docker inspection is acceptable only for verification, not mutation, and only when the needed
   credential is available. If orphan containers, networks, or volumes with the test
   resource/deployment identifiers remain, fix or add an Appaloft cleanup operation and rerun it; do
   not manually remove the remote artifacts as the primary cleanup path.

## Follow-Up Commands

- `appaloft deployments show <deploymentId>`
- `appaloft deployments proof <deploymentId>`
- `appaloft deployments timeline <deploymentId>`
- `appaloft deployments timeline <deploymentId> --follow --json`
- `appaloft work events <workId> --follow --json`
- `appaloft work watch <workId> --json`
- `appaloft work show <workId>`
- `appaloft resource health <resourceId>`
- `appaloft resource diagnose <resourceId>`
- `appaloft deployments recovery-readiness <deploymentId>`
- `appaloft deployments retry <deploymentId>`
- `appaloft deployments redeploy <resourceId>`
- `appaloft deployments rollback <deploymentId> --candidate <rollbackCandidateDeploymentId>`
