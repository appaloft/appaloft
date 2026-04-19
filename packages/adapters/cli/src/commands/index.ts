import { Command as EffectCommand } from "@effect/cli";

import { certificateCommand } from "./certificate.js";
import { dbCommand } from "./db.js";
import { deployCommand, deploymentsCommand, logsCommand } from "./deployment.js";
import { domainBindingCommand } from "./domain-binding.js";
import { envCommand } from "./environment.js";
import { pluginsCommand, providersCommand } from "./integrations.js";
import { doctorCommand, initCommand, serveCommand, versionCommand } from "./lifecycle.js";
import { projectCommand } from "./project.js";
import { resourceCommand } from "./resource.js";
import { serverCommand } from "./server.js";
import { sourceLinksCommand } from "./source-link.js";

export const mainCommand = EffectCommand.make("appaloft").pipe(
  EffectCommand.withDescription("AI Native local-to-cloud deployment platform"),
  EffectCommand.withSubcommands([
    versionCommand,
    serveCommand,
    initCommand,
    doctorCommand,
    dbCommand,
    projectCommand,
    resourceCommand,
    serverCommand,
    domainBindingCommand,
    certificateCommand,
    deploymentsCommand,
    deployCommand,
    logsCommand,
    envCommand,
    sourceLinksCommand,
    pluginsCommand,
    providersCommand,
  ]),
);
