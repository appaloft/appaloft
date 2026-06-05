import {
  CreateBlueprintInstallPlanQuery,
  ListBlueprintsQuery,
  ShowBlueprintQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { type Option } from "effect";

import { optionalValue, runQuery } from "../runtime.js";

const slugArg = Args.text({ name: "slug" });
const variantOption = Options.text("variant").pipe(Options.optional);
const profileOption = Options.text("profile").pipe(Options.optional);
const projectNameOption = Options.text("project-name").pipe(Options.optional);
const environmentNameOption = Options.text("environment-name").pipe(Options.optional);
const resourceSlugPrefixOption = Options.text("resource-slug-prefix").pipe(Options.optional);
const parameterOption = Options.text("parameter").pipe(Options.repeated);

function nonEmptyOptional(value: Option.Option<string>): string | undefined {
  const raw = optionalValue(value)?.trim();
  return raw ? raw : undefined;
}

function primitiveValue(value: string): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  const numeric = Number(value);
  return value.trim() !== "" && Number.isFinite(numeric) ? numeric : value;
}

function parameterRecord(values: readonly string[]): Record<string, string | number | boolean> {
  return Object.fromEntries(
    values.flatMap((entry) => {
      const separator = entry.indexOf("=");
      if (separator <= 0) return [];
      const key = entry.slice(0, separator).trim();
      const value = entry.slice(separator + 1);
      return key ? [[key, primitiveValue(value)] as const] : [];
    }),
  );
}

const listCommand = EffectCommand.make("list", {}, () =>
  runQuery(ListBlueprintsQuery.create()),
).pipe(EffectCommand.withDescription("List Blueprint catalog entries"));

const showCommand = EffectCommand.make("show", { slug: slugArg }, ({ slug }) =>
  runQuery(ShowBlueprintQuery.create({ slug })),
).pipe(EffectCommand.withDescription("Show a Blueprint manifest"));

const planInstallCommand = EffectCommand.make(
  "plan-install",
  {
    slug: slugArg,
    variant: variantOption,
    profile: profileOption,
    projectName: projectNameOption,
    environmentName: environmentNameOption,
    resourceSlugPrefix: resourceSlugPrefixOption,
    parameter: parameterOption,
  },
  ({ environmentName, parameter, profile, projectName, resourceSlugPrefix, slug, variant }) =>
    runQuery(
      CreateBlueprintInstallPlanQuery.create({
        slug,
        variant: nonEmptyOptional(variant),
        profile: nonEmptyOptional(profile),
        parameters: parameterRecord(parameter),
        target: {
          projectName: nonEmptyOptional(projectName),
          environmentName: nonEmptyOptional(environmentName),
          resourceSlugPrefix: nonEmptyOptional(resourceSlugPrefix),
        },
      }),
    ),
).pipe(EffectCommand.withDescription("Create a dry-run Blueprint install plan"));

export const blueprintCommand = EffectCommand.make("blueprint").pipe(
  EffectCommand.withDescription("Blueprint catalog operations"),
  EffectCommand.withSubcommands([listCommand, showCommand, planInstallCommand]),
);
