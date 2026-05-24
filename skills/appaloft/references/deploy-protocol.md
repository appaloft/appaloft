# Deploy Protocol

For deployment work, use this Appaloft deploy protocol:

1. Inspect safe project metadata only.
2. Select the deployment mode before asking for Appaloft ids.
3. Select or create project, server, environment, and resource context only through Appaloft
   operations or trusted bootstrap context.
4. Configure source, runtime, network, health, access, variables, dependencies, and storage on the
   Resource profile.
5. Run plan/preview when useful.
6. Create or clean up deployment through Appaloft.
7. Observe deployment detail, logs, resource health, diagnostics, and recovery readiness.
8. Return URL/access state first, then ids and next safe actions.

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
secret values, credentials, host bind source paths, or provider-native storage handles into
`appaloft.yml`. Repository config may declare high-level application `dependencies` and `storage`,
but deploy must reconcile them through existing operations before ids-only deployment admission.

## Entry Selection

Use this order:

1. Existing Appaloft config: `appaloft deploy <source>`.
2. Docker/OCI image: `appaloft deploy image://<image>:<tag> --method prebuilt-image`.
3. Compose source: `appaloft deploy <source> --method docker-compose`.
4. Dockerfile source: `appaloft deploy <source> --method dockerfile`.
5. Built static output: `appaloft deploy ./dist --as static-site`.
6. Static source: `appaloft deploy <source> --method static --publish-dir <dir>`.
7. Workspace commands: use explicit install, build, start, and port options.

## Follow-Up Commands

- `appaloft deployments show <deploymentId>`
- `appaloft logs <deploymentId>`
- `appaloft deployments events <deploymentId>`
- `appaloft resource health <resourceId>`
- `appaloft resource diagnose <resourceId>`
- `appaloft deployments recovery-readiness <deploymentId>`
- `appaloft deployments retry <deploymentId>`
- `appaloft deployments redeploy <resourceId>`
- `appaloft deployments rollback <deploymentId> --candidate <rollbackCandidateDeploymentId>`
