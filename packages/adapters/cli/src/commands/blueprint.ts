import {
  AcceptBlueprintInstallCommand,
  CreateBlueprintInstallPlanQuery,
  ListBlueprintsQuery,
  ShowBlueprintQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { type Option } from "effect";

import { optionalValue, runCommand, runQuery } from "../runtime.js";

const slugArg = Args.text({ name: "slug" });
const variantOption = Options.text("variant").pipe(Options.optional);
const profileOption = Options.text("profile").pipe(Options.optional);
const projectNameOption = Options.text("project-name").pipe(Options.optional);
const environmentNameOption = Options.text("environment-name").pipe(Options.optional);
const resourceSlugPrefixOption = Options.text("resource-slug-prefix").pipe(Options.optional);
const parameterOption = Options.text("parameter").pipe(Options.repeated);
const dependencyCreateOption = Options.text("dependency-create").pipe(Options.repeated);
const dependencyProviderOption = Options.text("dependency-provider").pipe(Options.optional);
const targetServerOption = Options.text("target-server").pipe(Options.optional);
const secretOption = Options.text("secret").pipe(Options.repeated);
const applicationIdOption = Options.text("application-id").pipe(Options.optional);
const acceptedByOption = Options.text("accepted-by").pipe(Options.optional);
const idempotencyKeyOption = Options.text("idempotency-key").pipe(Options.optional);
const acknowledgementOption = Options.text("acknowledgement").pipe(Options.repeated);

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

function dependencyProvisioningInput(input: {
  readonly dependencyCreate: readonly string[];
  readonly dependencyProvider?: string;
  readonly targetServer?: string;
}) {
  return input.dependencyCreate.flatMap((entry) => {
    const [requirementId, kind = requirementId] = entry.split(":").map((part) => part.trim());
    if (!requirementId) return [];
    return [
      {
        requirementId,
        kind,
        mode: "create" as const,
        ...(input.dependencyProvider ? { providerKey: input.dependencyProvider } : {}),
        ...(input.targetServer ? { target: { serverId: input.targetServer } } : {}),
      },
    ];
  });
}

function dependencyProvisioningOptions(input: {
  readonly dependencyCreate: readonly string[];
  readonly dependencyProvider: Option.Option<string>;
  readonly targetServer: Option.Option<string>;
}) {
  const dependencyProvider = nonEmptyOptional(input.dependencyProvider);
  const targetServer = nonEmptyOptional(input.targetServer);
  return dependencyProvisioningInput({
    dependencyCreate: input.dependencyCreate,
    ...(dependencyProvider ? { dependencyProvider } : {}),
    ...(targetServer ? { targetServer } : {}),
  });
}

export function installTargetInput(input: {
  readonly projectName?: string | undefined;
  readonly environmentName?: string | undefined;
  readonly resourceSlugPrefix?: string | undefined;
  readonly serverId?: string | undefined;
}) {
  return {
    ...(input.projectName ? { projectName: input.projectName } : {}),
    ...(input.environmentName ? { environmentName: input.environmentName } : {}),
    ...(input.resourceSlugPrefix ? { resourceSlugPrefix: input.resourceSlugPrefix } : {}),
    ...(input.serverId ? { serverId: input.serverId } : {}),
  };
}

export function secretValuesInput(values: readonly string[]) {
  return values.map((entry) => {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      throw new Error("Blueprint secret values must use KEY=value or component:KEY=value.");
    }
    const componentSeparator = entry.slice(0, separator).indexOf(":");
    const componentId =
      componentSeparator > 0 ? entry.slice(0, componentSeparator).trim() : undefined;
    const key =
      componentSeparator > 0
        ? entry.slice(componentSeparator + 1, separator).trim()
        : entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1);
    if (!key || value === "") {
      throw new Error("Blueprint secret values must include a secret key and non-empty value.");
    }
    return {
      ...(componentId ? { componentId } : {}),
      key,
      value,
    };
  });
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
    dependencyCreate: dependencyCreateOption,
    dependencyProvider: dependencyProviderOption,
    targetServer: targetServerOption,
  },
  ({
    dependencyCreate,
    dependencyProvider,
    environmentName,
    parameter,
    profile,
    projectName,
    resourceSlugPrefix,
    slug,
    targetServer,
    variant,
  }) =>
    runQuery(
      CreateBlueprintInstallPlanQuery.create({
        slug,
        variant: nonEmptyOptional(variant),
        profile: nonEmptyOptional(profile),
        parameters: parameterRecord(parameter),
        dependencyProvisioning: dependencyProvisioningOptions({
          dependencyCreate,
          dependencyProvider,
          targetServer,
        }),
        target: installTargetInput({
          projectName: nonEmptyOptional(projectName),
          environmentName: nonEmptyOptional(environmentName),
          resourceSlugPrefix: nonEmptyOptional(resourceSlugPrefix),
          serverId: nonEmptyOptional(targetServer),
        }),
      }),
    ),
).pipe(EffectCommand.withDescription("Create a dry-run Blueprint install plan"));

const installCommand = EffectCommand.make(
  "install",
  {
    slug: slugArg,
    variant: variantOption,
    profile: profileOption,
    projectName: projectNameOption,
    environmentName: environmentNameOption,
    resourceSlugPrefix: resourceSlugPrefixOption,
    parameter: parameterOption,
    dependencyCreate: dependencyCreateOption,
    dependencyProvider: dependencyProviderOption,
    targetServer: targetServerOption,
    secret: secretOption,
    applicationId: applicationIdOption,
    acceptedBy: acceptedByOption,
    idempotencyKey: idempotencyKeyOption,
    acknowledgement: acknowledgementOption,
  },
  ({
    acceptedBy,
    acknowledgement,
    applicationId,
    dependencyCreate,
    dependencyProvider,
    environmentName,
    idempotencyKey,
    parameter,
    profile,
    projectName,
    resourceSlugPrefix,
    secret,
    slug,
    targetServer,
    variant,
  }) =>
    runCommand(
      AcceptBlueprintInstallCommand.create({
        slug,
        variant: nonEmptyOptional(variant),
        profile: nonEmptyOptional(profile),
        parameters: parameterRecord(parameter),
        dependencyProvisioning: dependencyProvisioningOptions({
          dependencyCreate,
          dependencyProvider,
          targetServer,
        }),
        target: installTargetInput({
          projectName: nonEmptyOptional(projectName),
          environmentName: nonEmptyOptional(environmentName),
          resourceSlugPrefix: nonEmptyOptional(resourceSlugPrefix),
          serverId: nonEmptyOptional(targetServer),
        }),
        applicationId: nonEmptyOptional(applicationId),
        acceptedBy: nonEmptyOptional(acceptedBy),
        idempotencyKey: nonEmptyOptional(idempotencyKey),
        acknowledgements: acknowledgement,
        secretValues: secretValuesInput(secret),
      }),
    ),
).pipe(EffectCommand.withDescription("Accept and run a Blueprint install command"));

export const blueprintCommand = EffectCommand.make("blueprint").pipe(
  EffectCommand.withDescription("Blueprint catalog operations"),
  EffectCommand.withSubcommands([listCommand, showCommand, planInstallCommand, installCommand]),
);
