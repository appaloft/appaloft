import { Command as EffectCommand } from "@effect/cli";

import { dbCommand } from "./db.js";
import {
  cancelCommand,
  deployCommand,
  deploymentsCommand,
  healthCommand,
  logsCommand,
  reattachCommand,
  redeployCommand,
  rollbackCommand,
} from "./deployment.js";
import { domainBindingCommand } from "./domain-binding.js";
import { envCommand } from "./environment.js";
import { pluginsCommand, providersCommand } from "./integrations.js";
import { doctorCommand, initCommand, serveCommand, versionCommand } from "./lifecycle.js";
import { projectCommand } from "./project.js";
import { resourceCommand } from "./resource.js";
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
    resourceCommand,
    serverCommand,
    domainBindingCommand,
    deploymentsCommand,
    deployCommand,
    redeployCommand,
    cancelCommand,
    reattachCommand,
    healthCommand,
    logsCommand,
    rollbackCommand,
    envCommand,
    pluginsCommand,
    providersCommand,
  ]),
);
