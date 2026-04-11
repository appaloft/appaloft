import { Command as EffectCommand } from "@effect/cli";

import { dbCommand } from "./db.js";
import { deployCommand, deploymentsCommand, logsCommand, rollbackCommand } from "./deployment.js";
import { envCommand } from "./environment.js";
import { pluginsCommand, providersCommand } from "./integrations.js";
import { doctorCommand, initCommand, serveCommand, versionCommand } from "./lifecycle.js";
import { projectCommand } from "./project.js";
import { serverCommand } from "./server.js";

export const mainCommand = EffectCommand.make("yundu").pipe(
  EffectCommand.withDescription("AI Native local-to-cloud deployment platform"),
  EffectCommand.withSubcommands([
    versionCommand,
    serveCommand,
    initCommand,
    doctorCommand,
    dbCommand,
    projectCommand,
    serverCommand,
    deploymentsCommand,
    deployCommand,
    logsCommand,
    rollbackCommand,
    envCommand,
    pluginsCommand,
    providersCommand,
  ]),
);
