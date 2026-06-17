import {
  ListConnectorCategoriesQuery,
  ListConnectorsQuery,
  type ListConnectorsQueryInput,
} from "@appaloft/application";
import { Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runQuery } from "../runtime.js";

const categoryOption = Options.choice("category", [
  "source",
  "dns",
  "infrastructure",
  "notification",
  "billing",
  "identity",
  "observability",
  "storage",
]).pipe(Options.optional);
const includeUnavailableOption = Options.boolean("include-unavailable").pipe(
  Options.withDefault(false),
);

const catalogCommand = EffectCommand.make(
  "catalog",
  {
    category: categoryOption,
    includeUnavailable: includeUnavailableOption,
  },
  ({ category, includeUnavailable }) =>
    runQuery(
      ListConnectorsQuery.create({
        category: optionalValue(category) as ListConnectorsQueryInput["category"],
        includeUnavailable,
      }),
    ),
).pipe(EffectCommand.withDescription("List connector catalog entries"));

const listCommand = EffectCommand.make(
  "list",
  {
    category: categoryOption,
  },
  ({ category }) =>
    runQuery(
      ListConnectorsQuery.create({
        category: optionalValue(category) as ListConnectorsQueryInput["category"],
        includeUnavailable: false,
      }),
    ),
).pipe(EffectCommand.withDescription("List visible connectors"));

const categoriesCommand = EffectCommand.make("categories", {}, () =>
  runQuery(ListConnectorCategoriesQuery.create()),
).pipe(EffectCommand.withDescription("List connector categories"));

export const connectorsCommand = EffectCommand.make("connectors").pipe(
  EffectCommand.withDescription("Connector catalog operations"),
  EffectCommand.withSubcommands([catalogCommand, listCommand, categoriesCommand]),
);
