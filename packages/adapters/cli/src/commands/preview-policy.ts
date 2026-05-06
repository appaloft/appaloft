import { ConfigurePreviewPolicyCommand, ShowPreviewPolicyQuery } from "@appaloft/application";
import { Command as EffectCommand, Options } from "@effect/cli";

import { optionalNumber, optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const previewPolicyScopes = ["project", "resource"] as const;
const previewPolicyForkModes = ["disabled", "without-secrets", "with-secrets"] as const;
const previewPolicyBooleanValues = ["true", "false"] as const;

const scopeOption = Options.choice("scope", previewPolicyScopes).pipe(
  Options.withDefault("project"),
);
const projectOption = Options.text("project");
const resourceOption = Options.text("resource").pipe(Options.optional);
const sameRepositoryPreviewsOption = Options.choice(
  "same-repository-previews",
  previewPolicyBooleanValues,
).pipe(Options.withDefault("true"));
const forkPreviewsOption = Options.choice("fork-previews", previewPolicyForkModes).pipe(
  Options.withDefault("disabled"),
);
const secretBackedPreviewsOption = Options.choice(
  "secret-backed-previews",
  previewPolicyBooleanValues,
).pipe(Options.withDefault("true"));
const maxActivePreviewsOption = Options.text("max-active-previews").pipe(Options.optional);
const previewTtlHoursOption = Options.text("preview-ttl-hours").pipe(Options.optional);
const idempotencyKeyOption = Options.text("idempotency-key").pipe(Options.optional);

function booleanOptionValue(value: (typeof previewPolicyBooleanValues)[number]): boolean {
  return value === "true";
}

function previewPolicyScope(input: {
  scope: (typeof previewPolicyScopes)[number];
  project: string;
  resource?: string;
}) {
  return input.scope === "resource"
    ? {
        kind: "resource" as const,
        projectId: input.project,
        resourceId: input.resource ?? "",
      }
    : {
        kind: "project" as const,
        projectId: input.project,
      };
}

const configureCommand = EffectCommand.make(
  "configure",
  {
    scope: scopeOption,
    project: projectOption,
    resource: resourceOption,
    sameRepositoryPreviews: sameRepositoryPreviewsOption,
    forkPreviews: forkPreviewsOption,
    secretBackedPreviews: secretBackedPreviewsOption,
    maxActivePreviews: maxActivePreviewsOption,
    previewTtlHours: previewTtlHoursOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({
    forkPreviews,
    idempotencyKey,
    maxActivePreviews,
    previewTtlHours,
    project,
    resource,
    sameRepositoryPreviews,
    scope,
    secretBackedPreviews,
  }) => {
    const resourceId = optionalValue(resource);
    const maxActivePreviewsValue = optionalNumber(maxActivePreviews);
    const previewTtlHoursValue = optionalNumber(previewTtlHours);
    const idempotencyKeyValue = optionalValue(idempotencyKey);

    return runCommand(
      ConfigurePreviewPolicyCommand.create({
        scope: previewPolicyScope({
          scope,
          project,
          ...(resourceId ? { resource: resourceId } : {}),
        }),
        policy: {
          sameRepositoryPreviews: booleanOptionValue(sameRepositoryPreviews),
          forkPreviews,
          secretBackedPreviews: booleanOptionValue(secretBackedPreviews),
          ...(maxActivePreviewsValue !== undefined
            ? { maxActivePreviews: maxActivePreviewsValue }
            : {}),
          ...(previewTtlHoursValue !== undefined ? { previewTtlHours: previewTtlHoursValue } : {}),
        },
        ...(idempotencyKeyValue ? { idempotencyKey: idempotencyKeyValue } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.previewPolicyConfigure));

const showCommand = EffectCommand.make(
  "show",
  {
    scope: scopeOption,
    project: projectOption,
    resource: resourceOption,
  },
  ({ project, resource, scope }) => {
    const resourceId = optionalValue(resource);

    return runQuery(
      ShowPreviewPolicyQuery.create({
        scope: previewPolicyScope({
          scope,
          project,
          ...(resourceId ? { resource: resourceId } : {}),
        }),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.previewPolicyShow));

export const previewPolicyCommand = EffectCommand.make("policy").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.previewPolicy),
  EffectCommand.withSubcommands([configureCommand, showCommand]),
);
