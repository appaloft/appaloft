import { Command as EffectCommand } from "@effect/cli";
import { ListPluginsQuery, ListProvidersQuery } from "@yundu/application";

import { runQuery } from "../runtime.js";

const listPluginsCommand = EffectCommand.make("list", {}, () =>
  runQuery(ListPluginsQuery.create()),
).pipe(EffectCommand.withDescription("List plugins"));

const listProvidersCommand = EffectCommand.make("list", {}, () =>
  runQuery(ListProvidersQuery.create()),
).pipe(EffectCommand.withDescription("List providers"));

export const pluginsCommand = EffectCommand.make("plugins").pipe(
  EffectCommand.withDescription("Plugin operations"),
  EffectCommand.withSubcommands([listPluginsCommand]),
);

export const providersCommand = EffectCommand.make("providers").pipe(
  EffectCommand.withDescription("Provider operations"),
  EffectCommand.withSubcommands([listProvidersCommand]),
);
