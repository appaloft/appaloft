import { Command as EffectCommand } from "@effect/cli";

import { auditEventCommand } from "./audit-event.js";
import { authCommand } from "./auth.js";
import { certificateCommand } from "./certificate.js";
import { dbCommand } from "./db.js";
import { defaultAccessCommand } from "./default-access.js";
import { dependencyCommand } from "./dependency.js";
import { deployTokenCommand } from "./deploy-token.js";
import { deployCommand, deploymentsCommand, logsCommand, previewCommand } from "./deployment.js";
import { domainBindingCommand } from "./domain-binding.js";
import { domainEventCommand } from "./domain-event.js";
import { envCommand } from "./environment.js";
import { pluginsCommand, providersCommand } from "./integrations.js";
import { doctorCommand, initCommand, serveCommand, versionCommand } from "./lifecycle.js";
import { operatorWorkCommand } from "./operator-work.js";
import { organizationCommand } from "./organization.js";
import { projectCommand } from "./project.js";
import { providerJobLogCommand } from "./provider-job-log.js";
import { remoteStateCommand } from "./remote-state.js";
import { resourceCommand } from "./resource.js";
import { retentionDefaultCommand } from "./retention-default.js";
import { runtimeMonitoringCommand } from "./runtime-monitoring.js";
import { runtimeUsageCommand } from "./runtime-usage.js";
import { scheduledTaskCommand } from "./scheduled-task.js";
import { serverCommand } from "./server.js";
import { sourceEventCommand } from "./source-event.js";
import { sourceLinksCommand } from "./source-link.js";
import { storageCommand } from "./storage.js";
import { terminalSessionCommand } from "./terminal-session.js";
import { upgradeCommand } from "./upgrade.js";

export const mainCommand = EffectCommand.make("appaloft").pipe(
  EffectCommand.withDescription("AI Native local-to-cloud deployment platform"),
  EffectCommand.withSubcommands([
    versionCommand,
    serveCommand,
    initCommand,
    doctorCommand,
    dbCommand,
    authCommand,
    defaultAccessCommand,
    projectCommand,
    resourceCommand,
    dependencyCommand,
    deployTokenCommand,
    organizationCommand,
    scheduledTaskCommand,
    storageCommand,
    serverCommand,
    domainBindingCommand,
    certificateCommand,
    deploymentsCommand,
    previewCommand,
    deployCommand,
    logsCommand,
    envCommand,
    sourceEventCommand,
    sourceLinksCommand,
    auditEventCommand,
    domainEventCommand,
    providerJobLogCommand,
    retentionDefaultCommand,
    runtimeUsageCommand,
    runtimeMonitoringCommand,
    remoteStateCommand,
    operatorWorkCommand,
    terminalSessionCommand,
    upgradeCommand,
    pluginsCommand,
    providersCommand,
  ]),
);
