# CLI Entrypoints

This reference mirrors every Appaloft CLI transport in `packages/application/src/operation-catalog.ts`.
Use it to map AI intent to the same operations exposed through CLI, HTTP/API, Web, and MCP
surfaces. If a command is absent here, treat it as unsupported until the operation catalog adds it.

## Deploy Mode Notes

- `appaloft login` and `appaloft auth login` are local profile/context commands, not operation
  catalog entries. Without `--url`, they default to the public Appaloft Cloud control plane at
  `https://app.appaloft.com`, print the Cloud browser login URL and user code, wait for explicit
  Enter before opening the browser when enabled, then write a local `cloud` profile only after a
  trusted local credential verifies against the current organization context. This is a human
  interactive login path, not the default AI-agent auth handoff.
- `appaloft auth token login [--stdin | --token-file <path>] [--url <url>] [--profile <name>]`
  imports a scoped bearer token from CLI-approved input or `APPALOFT_TOKEN`, verifies the selected
  endpoint and current organization context, then writes a redacted local profile. Do not pass raw
  token material as an argv value.
- `appaloft auth status`, `appaloft context show`, `appaloft context list`,
  `appaloft context use <profile>`, and `appaloft logout` only manage local CLI profile/context
  state. They must not create projects, resources, deployments, source links, or domain bindings.
- `appaloft deploy` is the CLI entrypoint used by Pure SSH Action. SSH targets default to
  server-owned `ssh-pglite` state when no control plane is selected.
- Self-hosted Server Action does not call the CLI for deployment. It calls self-hosted Action API
  endpoints with `control-plane-url` and `appaloft-token`; server-config deploy then resolves
  source-link context and dispatches ids-only `deployments.create`.
- Product-grade preview operations are the `preview-policies.*` and `preview-environments.*`
  catalog entries. They are control-plane-owned and are not the same as Action-only PR preview
  workflow files.

## Catalog

- `appaloft auth bootstrap-status` - `auth.bootstrap-status`
- `appaloft auth bootstrap-first-admin` - `auth.bootstrap-first-admin`
- `appaloft organization context` - `organizations.current-context`
- `appaloft organization switch <organizationId>` - `organizations.switch-current`
- `appaloft organization members list` - `organizations.list-members`
- `appaloft organization invitations list` - `organizations.list-invitations`
- `appaloft organization member invite` - `organizations.invite-member`
- `appaloft organization member role <memberId>` - `organizations.change-member-role`
- `appaloft organization member remove <memberId>` - `organizations.remove-member`
- `appaloft organization member restore <memberId>` - `organizations.reactivate-member`
- `appaloft organization owner transfer <fromMemberId> <toMemberId>` - `organizations.transfer-owner`
- `appaloft deploy-token create` - `deploy-tokens.create`
- `appaloft deploy-token list` - `deploy-tokens.list`
- `appaloft deploy-token show <tokenId>` - `deploy-tokens.show`
- `appaloft deploy-token rotate <tokenId> --confirm <tokenId>` - `deploy-tokens.rotate`
- `appaloft deploy-token revoke <tokenId> --confirm <tokenId>` - `deploy-tokens.revoke`
- `appaloft preview policy configure` - `preview-policies.configure`
- `appaloft preview policy show` - `preview-policies.show`
- `appaloft preview environment list` - `preview-environments.list`
- `appaloft preview environment show` - `preview-environments.show`
- `appaloft preview environment delete` - `preview-environments.delete`
- `appaloft blueprint list` - `blueprints.list`
- `appaloft blueprint show` - `blueprints.show`
- `appaloft blueprint plan-install` - `blueprints.plan-install`
- `appaloft blueprint install` - `blueprints.install`
- `appaloft blueprint installation show` - `blueprints.installation.show`
- `appaloft project create` - `projects.create`
- `appaloft project list` - `projects.list`
- `appaloft project count` - `projects.count`
- `appaloft project show <projectId>` - `projects.show`
- `appaloft project rename <projectId> --name <name>` - `projects.rename`
- `appaloft project reorder --project-ids <ids>` - `projects.reorder`
- `appaloft project set-description <projectId> --description <description>` - `projects.set-description`
- `appaloft project archive <projectId>` - `projects.archive`
- `appaloft project restore <projectId>` - `projects.restore`
- `appaloft project delete-check <projectId>` - `projects.delete-check`
- `appaloft project delete <projectId> --confirm <projectId>` - `projects.delete`
- `appaloft blueprint list` - `blueprints.list`
- `appaloft blueprint show` - `blueprints.show`
- `appaloft blueprint plan-install` - `blueprints.plan-install`
- `appaloft blueprint install` - `blueprints.install`
- `appaloft blueprint installation show` - `blueprints.installation.show`
- `appaloft server register` - `servers.register`
- `appaloft server credential <serverId>` - `servers.configure-credential`
- `appaloft server credential-create` - `credentials.create-ssh`
- `appaloft server credential-list` - `credentials.list-ssh`
- `appaloft server credential-show <credentialId>` - `credentials.show`
- `appaloft server credential-delete <credentialId> --confirm <credentialId>` - `credentials.delete-ssh`
- `appaloft server credential-rotate <credentialId> --private-key-file <path> --confirm <credentialId>` - `credentials.rotate-ssh`
- `appaloft server list` - `servers.list`
- `appaloft server count` - `servers.count`
- `appaloft server show <serverId>` - `servers.show`
- `appaloft server capacity inspect <serverId>` - `servers.capacity.inspect`
- `appaloft runtime-usage inspect <scope>` - `runtime-usage.inspect`
- `appaloft runtime-monitoring samples <scope> --from <iso> --to <iso>` - `runtime-monitoring.samples.list`
- `appaloft runtime-monitoring rollup <scope> --from <iso> --to <iso> --bucket <bucket>` - `runtime-monitoring.rollup`
- `appaloft runtime-monitoring thresholds configure <scope> --rule <json>` - `runtime-monitoring.thresholds.configure`
- `appaloft runtime-monitoring thresholds show <scope>` - `runtime-monitoring.thresholds.show`
- `appaloft server capacity prune <serverId> --before <iso> [--target <id-or-target>]` - `servers.capacity.prune`
- `appaloft server capacity policy configure --scope <scope> --retention-days <days>` - `scheduled-runtime-prune-policies.configure`
- `appaloft server capacity policy list` - `scheduled-runtime-prune-policies.list`
- `appaloft server capacity policy show <policyId>` - `scheduled-runtime-prune-policies.show`
- `appaloft server rename <serverId> --name <name>` - `servers.rename`
- `appaloft server reorder --server-ids <ids>` - `servers.reorder`
- `appaloft server proxy configure <serverId> --kind none|traefik|caddy` - `servers.configure-edge-proxy`
- `appaloft server deactivate <serverId>` - `servers.deactivate`
- `appaloft server delete-check <serverId>` - `servers.delete-check`
- `appaloft server delete <serverId> --confirm <serverId>` - `servers.delete`
- `appaloft server test <serverId>; appaloft server doctor <serverId>` - `servers.test-connectivity`
- `appaloft server proxy repair <serverId>` - `servers.bootstrap-proxy`
- `appaloft server runtime prepare <serverId>` - `servers.prepare-runtime`
- `appaloft resource list` - `resources.list`
- `appaloft resource count` - `resources.count`
- `appaloft resource show <resourceId>` - `resources.show`
- `appaloft resource create` - `resources.create`
- `appaloft resource archive <resourceId>` - `resources.archive`
- `appaloft resource restore <resourceId>` - `resources.restore`
- `appaloft resource delete-check <resourceId>` - `resources.delete-check`
- `appaloft resource delete <resourceId> --confirm-slug <slug>` - `resources.delete`
- `appaloft resource configure-health <resourceId>` - `resources.configure-health`
- `appaloft resource reset-health <resourceId>` - `resources.reset-health`
- `appaloft resource configure-source <resourceId>` - `resources.configure-source`
- `appaloft resource configure-runtime <resourceId>` - `resources.configure-runtime`
- `appaloft resource configure-network <resourceId>` - `resources.configure-network`
- `appaloft resource configure-access <resourceId>` - `resources.configure-access`
- `appaloft resource auto-deploy <resourceId>` - `resources.configure-auto-deploy`
- `appaloft resource storage attach <resourceId>` - `resources.attach-storage`
- `appaloft resource storage detach <resourceId> <attachmentId>` - `resources.detach-storage`
- `appaloft resource set-variable <resourceId> <key> <value>` - `resources.set-variable`
- `appaloft resource secrets create <resourceId> <key> <value>` - `resources.secrets.create`
- `appaloft resource secrets rotate <resourceId> <key> <value>` - `resources.secrets.rotate`
- `appaloft resource secrets delete <resourceId> <key>` - `resources.secrets.delete`
- `appaloft resource secrets list <resourceId>` - `resources.secrets.list`
- `appaloft resource secrets show <resourceId> <key>` - `resources.secrets.show`
- `appaloft resource import-variables <resourceId> --content <dotenv>` - `resources.import-variables`
- `appaloft resource unset-variable <resourceId> <key>` - `resources.unset-variable`
- `appaloft resource effective-config <resourceId>` - `resources.effective-config`
- `appaloft resource logs <resourceId>` - `resources.runtime-logs`
- `appaloft resource log-archives archive <resourceId>` - `resources.runtime-logs.archive`
- `appaloft resource log-archives list` - `resources.runtime-log-archives.list`
- `appaloft resource log-archives show <archiveId>` - `resources.runtime-log-archives.show`
- `appaloft resource log-archives prune --before <iso>` - `resources.runtime-log-archives.prune`
- `appaloft resource runtime-control-attempts prune --before <iso>` - `resources.runtime-control-attempts.prune`
- `appaloft server terminal <serverId>; appaloft resource terminal <resourceId>` - `terminal-sessions.open`
- `appaloft terminal-session list` - `terminal-sessions.list`
- `appaloft terminal-session show <sessionId>` - `terminal-sessions.show`
- `appaloft terminal-session close <sessionId>` - `terminal-sessions.close`
- `appaloft terminal-session expire` - `terminal-sessions.expire`
- `appaloft resource diagnose <resourceId>` - `resources.diagnostic-summary`
- `appaloft resource access-failure <requestId>` - `resources.access-failure-evidence.lookup`
- `appaloft resource health <resourceId>` - `resources.health`
- `appaloft resource health-history <resourceId> --from <iso> --to <iso>` - `resources.health-history`
- `appaloft resource proxy-config <resourceId>` - `resources.proxy-configuration.preview`
- `appaloft dependency provision --kind <kind>` - `dependency-resources.provision`
- `appaloft dependency import --kind <kind>` - `dependency-resources.import`
- `appaloft dependency plan --mode <create|reuse>` - `dependency-resources.provisioning.plan`
- `appaloft dependency accept <planId> --acknowledge-mutation` - `dependency-resources.provisioning.accept`
- `appaloft dependency status <planId>` - `dependency-resources.provisioning.status`
- `appaloft dependency list` - `dependency-resources.list`
- `appaloft dependency count` - `dependency-resources.count`
- `appaloft dependency show <dependencyResourceId>` - `dependency-resources.show`
- `appaloft dependency rename <dependencyResourceId>` - `dependency-resources.rename`
- `appaloft dependency delete <dependencyResourceId>` - `dependency-resources.delete`
- `appaloft dependency backup create <dependencyResourceId>` - `dependency-resources.create-backup`
- `appaloft dependency backup list <dependencyResourceId>` - `dependency-resources.list-backups`
- `appaloft dependency backup show <backupId>` - `dependency-resources.show-backup`
- `appaloft dependency backup restore <backupId>` - `dependency-resources.restore-backup`
- `appaloft dependency backup policy configure <dependencyResourceId>` - `dependency-resources.backup-policies.configure`
- `appaloft dependency backup policy list` - `dependency-resources.backup-policies.list`
- `appaloft dependency backup policy show <policyId>` - `dependency-resources.backup-policies.show`
- `appaloft resource dependency bind <resourceId>` - `resources.bind-dependency`
- `appaloft resource dependency unbind <resourceId> <bindingId>` - `resources.unbind-dependency`
- `appaloft resource dependency rotate-secret <resourceId> <bindingId>` - `resources.rotate-dependency-binding-secret`
- `appaloft resource dependency list <resourceId>` - `resources.list-dependency-bindings`
- `appaloft resource dependency show <resourceId> <bindingId>` - `resources.show-dependency-binding`
- `appaloft scheduled-task create <resourceId>` - `scheduled-tasks.create`
- `appaloft scheduled-task list` - `scheduled-tasks.list`
- `appaloft scheduled-task show <taskId>` - `scheduled-tasks.show`
- `appaloft scheduled-task configure <taskId>` - `scheduled-tasks.configure`
- `appaloft scheduled-task delete <taskId>` - `scheduled-tasks.delete`
- `appaloft scheduled-task run <taskId>` - `scheduled-tasks.run-now`
- `appaloft scheduled-task runs list` - `scheduled-task-runs.list`
- `appaloft scheduled-task runs show <runId>` - `scheduled-task-runs.show`
- `appaloft scheduled-task runs logs <runId>` - `scheduled-task-runs.logs`
- `appaloft storage volume create` - `storage-volumes.create`
- `appaloft storage volume list` - `storage-volumes.list`
- `appaloft storage volume show <storageVolumeId>` - `storage-volumes.show`
- `appaloft storage volume rename <storageVolumeId>` - `storage-volumes.rename`
- `appaloft storage volume delete <storageVolumeId>` - `storage-volumes.delete`
- `appaloft storage volume cleanup-runtime <storageVolumeId> --server <serverId> --before <iso> [--dry-run false]` - `storage-volumes.cleanup-runtime`
- `appaloft storage volume backup plan` - `storage-volumes.backup-plan`
- `appaloft storage volume backup create` - `storage-volumes.create-backup`
- `appaloft storage volume backup list --storage-volume <storageVolumeId>` - `storage-volumes.list-backups`
- `appaloft storage volume backup show <backupId>` - `storage-volumes.show-backup`
- `appaloft storage volume backup restore-plan <backupId>` - `storage-volumes.restore-plan`
- `appaloft storage volume backup restore <backupId>` - `storage-volumes.restore-backup`
- `appaloft storage volume backup prune <backupId>` - `storage-volumes.prune-backups`
- `appaloft env create` - `environments.create`
- `appaloft env list` - `environments.list`
- `appaloft env count` - `environments.count`
- `appaloft env show <environmentId>` - `environments.show`
- `appaloft env rename <environmentId> --name <name>` - `environments.rename`
- `appaloft env lock <environmentId>` - `environments.lock`
- `appaloft env unlock <environmentId>` - `environments.unlock`
- `appaloft env archive <environmentId>` - `environments.archive`
- `appaloft env clone <environmentId> --name <targetName>` - `environments.clone`
- `appaloft env duplicate apply <environmentId> --name <targetName>` - `environments.duplicate-profile`
- `appaloft env set <environmentId> <key> <value>` - `environments.set-variable`
- `appaloft env unset <environmentId> <key>` - `environments.unset-variable`
- `appaloft env effective-precedence <environmentId>` - `environments.effective-precedence`
- `appaloft env diff <environmentId> <otherEnvironmentId>` - `environments.diff`
- `appaloft env duplicate plan <environmentId> --name <targetName>` - `environments.plan-duplicate`
- `appaloft env diff-profile <environmentId> <targetEnvironmentId>` - `environments.diff-profile`
- `appaloft env sync-profile <environmentId> <targetEnvironmentId> --resource-ids <ids>` - `environments.sync-profile`
- `appaloft env promote <environmentId> <targetName>` - `environments.promote`
- `appaloft preview cleanup [path-or-source] --preview pull-request --preview-id pr-123` - `deployments.cleanup-preview`
- `appaloft deploy [path-or-source] [--config appaloft.yml] [--env KEY=VALUE] [--secret KEY=ci-env:NAME] [--preview pull-request]` - `deployments.create`
- `appaloft deployments retry <deploymentId>` - `deployments.retry`
- `appaloft deployments redeploy <resourceId>` - `deployments.redeploy`
- `appaloft deployments rollback <deploymentId> --candidate <rollbackCandidateDeploymentId>` - `deployments.rollback`
- `appaloft deployments cancel <deploymentId> --confirm <deploymentId>` - `deployments.cancel`
- `appaloft deployments archive <deploymentId> --confirm <deploymentId>` - `deployments.archive`
- `appaloft deployments prune --before <iso>` - `deployments.prune`
- `appaloft resource runtime stop <resourceId>` - `resources.runtime.stop`
- `appaloft resource runtime start <resourceId>` - `resources.runtime.start`
- `appaloft resource runtime restart <resourceId>` - `resources.runtime.restart`
- `appaloft deployments list` - `deployments.list`
- `appaloft deployments count` - `deployments.count`
- `appaloft deployments show <deploymentId>` - `deployments.show`
- `appaloft deployments plan --project <projectId> --environment <environmentId> --resource <resourceId> --server <serverId> [--destination <destinationId>]` - `deployments.plan`
- `appaloft deployments recovery-readiness <deploymentId>` - `deployments.recovery-readiness`
- `appaloft deployments timeline <deploymentId>` - `deployments.timeline`
- `appaloft deployments timeline <deploymentId> --follow --json` - `deployments.timeline.stream`
- `appaloft work list` - `operator-work.list`
- `appaloft work show <workId>` - `operator-work.show`
- `appaloft work events <workId> --follow --json` - `operator-work.stream-events`
- `appaloft work watch <workId> --json` - `operator-work.stream-events`
- `appaloft work mark-recovered <workId>` - `operator-work.mark-recovered`
- `appaloft work dead-letter <workId>` - `operator-work.dead-letter`
- `appaloft work cancel <workId>` - `operator-work.cancel`
- `appaloft work retry <workId>` - `operator-work.retry`
- `appaloft work prune --before <iso>` - `operator-work.prune`
- `appaloft source-links list` - `source-links.list`
- `appaloft source-links show <sourceFingerprint>` - `source-links.show`
- `appaloft source-links relink` - `source-links.relink`
- `appaloft source-links delete <sourceFingerprint>` - `source-links.delete`
- `appaloft static-artifacts publish <dist-directory>` - `static-artifacts.publish-payload`
- `appaloft static-artifacts publish <dist.zip>` - `static-artifacts.publish-archive`
- `appaloft audit-event list --aggregate <aggregateId>` - `audit-events.list`
- `appaloft audit-event show <auditEventId> --aggregate <aggregateId>` - `audit-events.show`
- `appaloft audit-event prune --before <iso>` - `audit-events.prune`
- `appaloft audit-event export --aggregate <aggregateId>` - `audit-events.export`
- `appaloft audit-event export-global --from <iso> --to <iso>` - `audit-events.export-global`
- `appaloft audit-event archive create` - `audit-events.archives.create`
- `appaloft audit-event archive list` - `audit-events.archives.list`
- `appaloft audit-event archive show <archiveId>` - `audit-events.archives.show`
- `appaloft audit-event archive prune --before <iso>` - `audit-events.archives.prune`
- `appaloft audit-event legal-hold configure` - `audit-events.legal-holds.configure`
- `appaloft audit-event legal-hold list` - `audit-events.legal-holds.list`
- `appaloft audit-event legal-hold show <holdId>` - `audit-events.legal-holds.show`
- `appaloft audit-event legal-hold release <holdId>` - `audit-events.legal-holds.release`
- `appaloft retention-default configure --category <category> --retention-days <days>` - `retention-defaults.configure`
- `appaloft retention-default list` - `retention-defaults.list`
- `appaloft retention-default show <category>` - `retention-defaults.show`
- `appaloft domain-event prune --before <iso>` - `domain-events.prune`
- `appaloft provider-job-log prune --before <iso>` - `provider-job-logs.prune`
- `appaloft source-event list --resource <resourceId> | --project <projectId>` - `source-events.list`
- `appaloft source-event show <sourceEventId> --resource <resourceId> | --project <projectId>` - `source-events.show`
- `appaloft source-event replay <sourceEventId> --resource <resourceId> | --project <projectId>` - `source-events.replay`
- `appaloft source-event prune --before <iso>` - `source-events.prune`
- `appaloft default-access configure` - `default-access-domain-policies.configure`
- `appaloft default-access list` - `default-access-domain-policies.list`
- `appaloft default-access show --scope system|deployment-target [--server <serverId>]` - `default-access-domain-policies.show`
- `appaloft domain-binding create` - `domain-bindings.create`
- `appaloft domain-binding confirm-ownership <domainBindingId> [--verification-mode dns|manual]` - `domain-bindings.confirm-ownership`
- `appaloft domain-binding list` - `domain-bindings.list`
- `appaloft domain-binding show <domainBindingId>` - `domain-bindings.show`
- `appaloft domain-binding dns-plan <domainBindingId> [--connector cloudflare-dns]` - `domain-bindings.dns-plan`
- `appaloft domain-binding configure-route <domainBindingId>` - `domain-bindings.configure-route`
- `appaloft domain-binding delete-check <domainBindingId>` - `domain-bindings.delete-check`
- `appaloft domain-binding delete <domainBindingId> --confirm <domainBindingId>` - `domain-bindings.delete`
- `appaloft domain-binding retry-verification <domainBindingId>` - `domain-bindings.retry-verification`
- `appaloft certificate import <domainBindingId>` - `certificates.import`
- `appaloft certificate issue-or-renew <domainBindingId>` - `certificates.issue-or-renew`
- `appaloft certificate list` - `certificates.list`
- `appaloft certificate show <certificateId>` - `certificates.show`
- `appaloft certificate retry <certificateId>` - `certificates.retry`
- `appaloft certificate revoke <certificateId>` - `certificates.revoke`
- `appaloft certificate delete <certificateId> --confirm <certificateId>` - `certificates.delete`
- `appaloft providers list` - `system.providers.list`
- `appaloft plugins list` - `system.plugins.list`
- `appaloft doctor` - `system.doctor`
- `appaloft upgrade check` - `system.instance-upgrade.check`
- `appaloft upgrade apply` - `system.instance-upgrade.apply`
- `appaloft db status` - `system.db-status`
- `appaloft db migrate` - `system.db-migrate`
- `appaloft connectors categories` - `connections.categories.list`
- `appaloft connectors catalog` - `connections.catalog.list`
- `appaloft connectors list` - `connections.list`
- `appaloft connectors show <connectionId>` - `connections.show`
- `appaloft connectors connect <connector>` - `connections.connect.start`
- `appaloft connectors callback <connectionId>` - `connections.connect.callback`
- `appaloft connectors revoke <connectionId>` - `connections.revoke`
- `appaloft connectors status <connectionId>` - `connections.status.show`
- `appaloft connectors plan --connector <connector> --capability <capability>` - `connections.capability.plan`
- `appaloft connectors accept --connector <connector> --capability <capability> --plan-id <planId>` - `connections.capability.accept`
- `appaloft connectors apply --connector <connector> --capability <capability>` - `connections.capability.apply`

## Blueprint Install Input Notes

`appaloft blueprint install <slug>` accepts repeated structured text flags:

- `--parameter KEY=value`
- `--secret KEY=value` or `--secret component:KEY=value`
- `--dependency-create requirementId[:kind]`

Accepted application-bundle installs must include all three acknowledgement values:

- `--acknowledgement accepts-blueprint-application-bundle`
- `--acknowledgement reviews-dependency-resource-bindings`
- `--acknowledgement preserves-user-owned-configuration`

After install returns, use `monitoring.workId` with `appaloft work watch <workId> --json` or
`appaloft work events <workId> --follow --json`. Use `monitoring.deploymentIds[]` with
`appaloft deployments timeline <deploymentId> --follow --json` and
`appaloft deployments show <deploymentId>`.
