import {
  ConfigureRetentionDefaultsCommand,
  ListRetentionDefaultsQuery,
  retentionDefaultCategorySchema,
  retentionDefaultScopeSchema,
  ShowRetentionDefaultQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const retentionDefaultScopes = retentionDefaultScopeSchema.options;
const retentionDefaultCategories = retentionDefaultCategorySchema.options;

const policyIdOption = Options.text("policy-id").pipe(Options.optional);
const scopeOption = Options.choice("scope", retentionDefaultScopes).pipe(
  Options.withDefault("system"),
);
const optionalScopeOption = Options.choice("scope", retentionDefaultScopes).pipe(Options.optional);
const organizationIdOption = Options.text("organization-id").pipe(Options.optional);
const categoryOption = Options.choice("category", retentionDefaultCategories);
const categoryArg = Args.text({ name: "category" });
const optionalCategoryOption = Options.choice("category", retentionDefaultCategories).pipe(
  Options.optional,
);
const retentionDaysOption = Options.text("retention-days");
const disableDryRunSchedulingOption = Options.boolean("disable-dry-run-scheduling").pipe(
  Options.withDefault(false),
);
const destructiveSchedulingEnabledOption = Options.boolean("destructive-scheduling-enabled").pipe(
  Options.withDefault(false),
);
const disabledOption = Options.boolean("disabled").pipe(Options.withDefault(false));
const enabledOnlyOption = Options.boolean("enabled-only").pipe(Options.withDefault(false));

const configureCommand = EffectCommand.make(
  "configure",
  {
    policyId: policyIdOption,
    scope: scopeOption,
    organizationId: organizationIdOption,
    category: categoryOption,
    retentionDays: retentionDaysOption,
    disableDryRunScheduling: disableDryRunSchedulingOption,
    destructiveSchedulingEnabled: destructiveSchedulingEnabledOption,
    disabled: disabledOption,
  },
  ({
    category,
    destructiveSchedulingEnabled,
    disableDryRunScheduling,
    disabled,
    organizationId,
    policyId,
    retentionDays,
    scope,
  }) =>
    runCommand(
      ConfigureRetentionDefaultsCommand.create({
        ...(optionalValue(policyId) ? { policyId: optionalValue(policyId) } : {}),
        scope,
        ...(optionalValue(organizationId) ? { organizationId: optionalValue(organizationId) } : {}),
        category,
        retentionDays: Number(retentionDays),
        dryRunSchedulingEnabled: !disableDryRunScheduling,
        destructiveSchedulingEnabled,
        enabled: !disabled,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.retentionDefaultConfigure));

const listCommand = EffectCommand.make(
  "list",
  {
    scope: optionalScopeOption,
    organizationId: organizationIdOption,
    category: optionalCategoryOption,
    enabledOnly: enabledOnlyOption,
  },
  ({ category, enabledOnly, organizationId, scope }) =>
    runQuery(
      ListRetentionDefaultsQuery.create({
        ...(optionalValue(scope) ? { scope: optionalValue(scope) } : {}),
        ...(optionalValue(organizationId) ? { organizationId: optionalValue(organizationId) } : {}),
        ...(optionalValue(category) ? { category: optionalValue(category) } : {}),
        enabledOnly,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.retentionDefaultList));

const showCommand = EffectCommand.make(
  "show",
  {
    category: categoryArg,
    scope: scopeOption,
    organizationId: organizationIdOption,
  },
  ({ category, organizationId, scope }) =>
    runQuery(
      ShowRetentionDefaultQuery.create({
        scope,
        ...(optionalValue(organizationId) ? { organizationId: optionalValue(organizationId) } : {}),
        category: category as (typeof retentionDefaultCategories)[number],
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.retentionDefaultShow));

export const retentionDefaultCommand = EffectCommand.make("retention-default").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.retentionDefault),
  EffectCommand.withSubcommands([configureCommand, listCommand, showCommand]),
);
