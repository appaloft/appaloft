# Deploy Protocol

For deployment work, use this Appaloft deploy protocol:

1. Inspect safe project metadata only.
2. Select or create project, server, environment, and resource context.
3. Configure source, runtime, network, health, access, variables, dependencies, and storage on the
   Resource profile.
4. Run plan/preview when useful.
5. Create or clean up deployment through Appaloft.
6. Observe deployment detail, logs, resource health, diagnostics, and recovery readiness.
7. Return URL/access state first, then ids and next safe actions.

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
