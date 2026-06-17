import {
  ListConnectorCategoriesQuery,
  ListConnectorsQuery,
  type ListConnectorsQueryInput,
  PlanConnectorCapabilityQuery,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
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
const connectorOption = Options.text("connector");
const capabilityOption = Options.text("capability");
const parametersJsonOption = Options.text("parameters-json").pipe(Options.optional);

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

const planCommand = EffectCommand.make(
  "plan",
  {
    connector: connectorOption,
    capability: capabilityOption,
    parametersJson: parametersJsonOption,
  },
  ({ connector, capability, parametersJson }) =>
    runQuery(
      parseParametersJson(optionalValue(parametersJson)).andThen((parameters) =>
        PlanConnectorCapabilityQuery.create({
          connectorKey: connector,
          capabilityKey: capability,
          ...(parameters ? { parameters } : {}),
        }),
      ),
    ),
).pipe(EffectCommand.withDescription("Plan a connector capability without applying changes"));

export const connectorsCommand = EffectCommand.make("connectors").pipe(
  EffectCommand.withDescription("Connector catalog operations"),
  EffectCommand.withSubcommands([catalogCommand, listCommand, categoriesCommand, planCommand]),
);

function parseParametersJson(
  value: string | undefined,
): Result<Record<string, unknown> | undefined> {
  if (!value) {
    return ok(undefined);
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return err(domainError.validation("Connector parameters JSON must be an object"));
    }
    return ok(parsed as Record<string, unknown>);
  } catch {
    return err(domainError.validation("Connector parameters JSON is invalid"));
  }
}
