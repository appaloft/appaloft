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
   diagnostics, and recovery readiness.
8. Return URL/access state first, then ids and next safe actions.

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

1. Existing Appaloft config: `appaloft deploy <source>`; `source.type: image` in config is a
   Resource source/runtime profile declaration, not a deployment command field or registry secret
   surface.
2. Docker/OCI image: `appaloft deploy image://<image>:<tag> --method prebuilt-image`.
3. Compose source: `appaloft deploy <source> --method docker-compose`.
4. Dockerfile source: `appaloft deploy <source> --method dockerfile`.
5. Built static output: `appaloft deploy ./dist --as static-site`.
6. Static source: `appaloft deploy <source> --method static --publish-dir <dir>`.
7. Workspace commands: use explicit install, build, start, and port options.
8. Blueprint catalog: use `appaloft blueprint list/show/plan-install` for neutral catalog discovery
   and dry-run planning. For Web quick deploy, use
   `source=blueprint&sourceExtension=<catalog-extension-key>&blueprintSlug=<slug>` for official or
   extension-provided Blueprints such as PocketBase; do not invent a hidden CLI-only Blueprint
   deploy command. Submit the install command once with `--parameter KEY=value`,
   `--secret KEY=value` or `--secret component:KEY=value`, and the required acknowledgements
   `accepts-blueprint-application-bundle`, `reviews-dependency-resource-bindings`, and
   `preserves-user-owned-configuration`; then follow any returned parent work id through
   `appaloft work events <workId> --follow --json` or `appaloft work watch <workId> --json`; follow
   any returned deployment id through `appaloft deployments events <deploymentId> --follow --json`,
   deployment detail, and deployment logs.

## Progress Streams

Progress monitoring is part of deployment, not an optional afterthought.

- Use `appaloft deployments events <deploymentId> --follow --json` for a single deployment
  attempt. It is the user-level deployment event stream and remains paired with
  `appaloft logs <deploymentId>` for deployment logs. For remote CLI profiles, the CLI may satisfy
  this by polling the bounded JSON event route until a terminal envelope when direct SSE streaming
  is not available.
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

## Follow-Up Commands

- `appaloft deployments show <deploymentId>`
- `appaloft logs <deploymentId>`
- `appaloft deployments events <deploymentId> --follow --json`
- `appaloft work events <workId> --follow --json`
- `appaloft work watch <workId> --json`
- `appaloft work show <workId>`
- `appaloft resource health <resourceId>`
- `appaloft resource diagnose <resourceId>`
- `appaloft deployments recovery-readiness <deploymentId>`
- `appaloft deployments retry <deploymentId>`
- `appaloft deployments redeploy <resourceId>`
- `appaloft deployments rollback <deploymentId> --candidate <rollbackCandidateDeploymentId>`
