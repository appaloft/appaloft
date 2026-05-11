import {
  CreateDeployTokenCommand,
  ListDeployTokensQuery,
  RevokeDeployTokenCommand,
  RotateDeployTokenCommand,
  ShowDeployTokenQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalNumber, optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const workflowCommands = ["source-link-deploy", "server-config-deploy", "preview-cleanup"] as const;

const tokenIdArg = Args.text({ name: "tokenId" });
const organizationIdOption = Options.text("organization-id");
const displayNameOption = Options.text("display-name");
const workflowCommandsOption = Options.text("workflow-commands");
const deploymentTargetIdsOption = Options.text("deployment-target-ids").pipe(Options.optional);
const environmentIdsOption = Options.text("environment-ids").pipe(Options.optional);
const projectIdsOption = Options.text("project-ids").pipe(Options.optional);
const repositoryFullNamesOption = Options.text("repositories").pipe(Options.optional);
const resourceIdsOption = Options.text("resource-ids").pipe(Options.optional);
const expiresAtOption = Options.text("expires-at").pipe(Options.optional);
const idempotencyKeyOption = Options.text("idempotency-key").pipe(Options.optional);
const statusOption = Options.choice("status", ["active", "revoked"] as const).pipe(
  Options.optional,
);
const resourceIdOption = Options.text("resource-id").pipe(Options.optional);
const repositoryFullNameOption = Options.text("repository").pipe(Options.optional);
const limitOption = Options.text("limit").pipe(Options.optional);
const confirmOption = Options.text("confirm");
const reasonOption = Options.text("reason").pipe(Options.optional);

function splitCsv(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length ? values : undefined;
}

function splitWorkflowCommands(value: string): (typeof workflowCommands)[number][] {
  return (splitCsv(value) ?? []) as (typeof workflowCommands)[number][];
}

const createCommand = EffectCommand.make(
  "create",
  {
    organizationId: organizationIdOption,
    displayName: displayNameOption,
    workflowCommands: workflowCommandsOption,
    deploymentTargetIds: deploymentTargetIdsOption,
    environmentIds: environmentIdsOption,
    projectIds: projectIdsOption,
    repositoryFullNames: repositoryFullNamesOption,
    resourceIds: resourceIdsOption,
    expiresAt: expiresAtOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({
    deploymentTargetIds,
    displayName,
    environmentIds,
    expiresAt,
    idempotencyKey,
    organizationId,
    projectIds,
    repositoryFullNames,
    resourceIds,
    workflowCommands: requestedWorkflowCommands,
  }) =>
    runCommand(
      CreateDeployTokenCommand.create({
        organizationId,
        displayName,
        scope: {
          workflowCommands: splitWorkflowCommands(requestedWorkflowCommands),
          deploymentTargetIds: splitCsv(optionalValue(deploymentTargetIds)),
          environmentIds: splitCsv(optionalValue(environmentIds)),
          projectIds: splitCsv(optionalValue(projectIds)),
          repositoryFullNames: splitCsv(optionalValue(repositoryFullNames)),
          resourceIds: splitCsv(optionalValue(resourceIds)),
        },
        expiresAt: optionalValue(expiresAt),
        idempotencyKey: optionalValue(idempotencyKey),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deployTokenCreate));

const listCommand = EffectCommand.make(
  "list",
  {
    organizationId: organizationIdOption,
    status: statusOption,
    resourceId: resourceIdOption,
    repositoryFullName: repositoryFullNameOption,
    limit: limitOption,
  },
  ({ limit, organizationId, repositoryFullName, resourceId, status }) =>
    runQuery(
      ListDeployTokensQuery.create({
        organizationId,
        status: optionalValue(status),
        resourceId: optionalValue(resourceId),
        repositoryFullName: optionalValue(repositoryFullName),
        limit: optionalNumber(limit),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deployTokenList));

const showCommand = EffectCommand.make(
  "show",
  {
    tokenId: tokenIdArg,
    organizationId: organizationIdOption,
  },
  ({ organizationId, tokenId }) =>
    runQuery(
      ShowDeployTokenQuery.create({
        organizationId,
        tokenId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deployTokenShow));

const rotateCommand = EffectCommand.make(
  "rotate",
  {
    tokenId: tokenIdArg,
    organizationId: organizationIdOption,
    confirm: confirmOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({ confirm, idempotencyKey, organizationId, tokenId }) =>
    runCommand(
      RotateDeployTokenCommand.create({
        tokenId,
        organizationId,
        confirmation: { tokenId: confirm },
        idempotencyKey: optionalValue(idempotencyKey),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deployTokenRotate));

const revokeCommand = EffectCommand.make(
  "revoke",
  {
    tokenId: tokenIdArg,
    organizationId: organizationIdOption,
    confirm: confirmOption,
    reason: reasonOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({ confirm, idempotencyKey, organizationId, reason, tokenId }) =>
    runCommand(
      RevokeDeployTokenCommand.create({
        tokenId,
        organizationId,
        confirmation: { tokenId: confirm },
        reason: optionalValue(reason),
        idempotencyKey: optionalValue(idempotencyKey),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.deployTokenRevoke));

export const deployTokenCommand = EffectCommand.make("deploy-token").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.deployToken),
  EffectCommand.withSubcommands([
    createCommand,
    listCommand,
    showCommand,
    rotateCommand,
    revokeCommand,
  ]),
);
