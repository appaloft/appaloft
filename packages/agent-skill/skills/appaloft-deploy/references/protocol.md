# Appaloft Deploy Protocol

## Entrypoint Selection

Use this order:

1. Built static output: `appaloft deploy ./dist --as static-site`.
2. Appaloft config present: `appaloft deploy <source>`.
3. Static source: `appaloft deploy <source> --method static --publish-dir <dir>`.
4. Compose source: `appaloft deploy <source> --method docker-compose`.
5. Dockerfile source: `appaloft deploy <source> --method dockerfile`.
6. Workspace commands: use explicit install, build, start, and port options.

## Safe Source Inspection

Read project metadata, build scripts, framework evidence, Docker/Compose files, static output
directories, and Appaloft config. Do not open `.env`, private keys, token files, cloud credentials,
or provider credential files.

## Operation Boundary

Quick Deploy is a workflow over existing Appaloft operations. Do not invent `quick-deploy.create`.
Do not add source/runtime/network fields to `deployments.create`; those fields belong to the
Resource profile and deployment snapshot.

## Outcome

Return:

- access URL, or why it is unavailable;
- deployment id and resource id;
- lifecycle status;
- `appaloft logs <deploymentId>`;
- `appaloft resource diagnose <resourceId>`;
- `appaloft deployments recovery-readiness <deploymentId>`.
