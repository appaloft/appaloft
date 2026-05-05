import { Command as EffectCommand } from "@effect/cli";

import { certificateCommand } from "./certificate.js";
import { dbCommand } from "./db.js";
import { defaultAccessCommand } from "./default-access.js";
import { dependencyCommand } from "./dependency.js";
import { deployCommand, deploymentsCommand, logsCommand, previewCommand } from "./deployment.js";
import { domainBindingCommand } from "./domain-binding.js";
import { envCommand } from "./environment.js";
import { pluginsCommand, providersCommand } from "./integrations.js";
import { doctorCommand, initCommand, serveCommand, versionCommand } from "./lifecycle.js";
import { operatorWorkCommand } from "./operator-work.js";
import { projectCommand } from "./project.js";
import { remoteStateCommand } from "./remote-state.js";
import { resourceCommand } from "./resource.js";
import { serverCommand } from "./server.js";
import { sourceEventCommand } from "./source-event.js";
import { sourceLinksCommand } from "./source-link.js";
import { storageCommand } from "./storage.js";

export const mainCommand = EffectCommand.make("appaloft").pipe(
  EffectCommand.withDescription("AI Native local-to-cloud deployment platform"),
  EffectCommand.withSubcommands([
    versionCommand,
    serveCommand,
    initCommand,
    doctorCommand,
    dbCommand,
    defaultAccessCommand,
    projectCommand,
    resourceCommand,
    dependencyCommand,
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
    remoteStateCommand,
    operatorWorkCommand,
    pluginsCommand,
    providersCommand,
  ]),
);
