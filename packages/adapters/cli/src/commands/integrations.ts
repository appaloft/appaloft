import {
  GitHubAppConnectionQuery,
  ListGitHubRepositoriesQuery,
  ListPluginsQuery,
  ListProvidersQuery,
} from "@appaloft/application";
import { Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const githubRepositorySearchOption = Options.text("search").pipe(Options.optional);

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

const githubStatusCommand = EffectCommand.make("status", {}, () =>
  runQuery(GitHubAppConnectionQuery.create()),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.githubStatus));

const githubRepositoriesCommand = EffectCommand.make(
  "repositories",
  { search: githubRepositorySearchOption },
  ({ search }) => runQuery(ListGitHubRepositoriesQuery.create({ search: optionalValue(search) })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.githubRepositories));

export const githubCommand = EffectCommand.make("github").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.github),
  EffectCommand.withSubcommands([githubStatusCommand, githubRepositoriesCommand]),
);
