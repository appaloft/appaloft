import { existsSync } from "node:fs";
import { chmod, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import {
  type CommandBus,
  CreateDeployTokenCommand,
  type ExecutionContextFactory,
  ListDeployTokensQuery,
  type QueryBus,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";
import { type DomainError, err, ok, type Result } from "@appaloft/core";

const bootstrapOrganizationId = "org_self_hosted";
const bootstrapDisplayName = "GitHub Action deploy token";
const bootstrapWorkflowCommands = [
  "source-link-deploy",
  "server-config-deploy",
  "preview-cleanup",
] as const;

export interface DeployTokenBootstrapOutput {
  schemaVersion: "deploy-token.bootstrap/v1";
  created: boolean;
  organizationId: string;
  actionSecretName: "APPALOFT_TOKEN";
  tokenId?: string;
  displayName?: string;
  secretSuffix?: string;
  token?: string;
}

export interface BootstrapDeployTokenOutputInput {
  config: AppConfig;
  commandBus: CommandBus;
  queryBus: QueryBus;
  executionContextFactory: ExecutionContextFactory;
}

function bootstrapError(message: string, details: Record<string, unknown> = {}): DomainError {
  return {
    code: "deploy_token_bootstrap_failed",
    category: "infra",
    message,
    retryable: false,
    details: {
      phase: "deploy-token-bootstrap",
      ...Object.fromEntries(
        Object.entries(details).filter(
          (entry): entry is [string, string | number | boolean | null | readonly string[]] =>
            typeof entry[1] === "string" ||
            typeof entry[1] === "number" ||
            typeof entry[1] === "boolean" ||
            entry[1] === null ||
            (Array.isArray(entry[1]) && entry[1].every((value) => typeof value === "string")),
        ),
      ),
    },
  };
}

function outputWithoutRawToken(input: {
  organizationId: string;
  tokenId?: string;
  displayName?: string;
  secretSuffix?: string;
}): DeployTokenBootstrapOutput {
  return {
    schemaVersion: "deploy-token.bootstrap/v1",
    created: false,
    organizationId: input.organizationId,
    actionSecretName: "APPALOFT_TOKEN",
    ...(input.tokenId ? { tokenId: input.tokenId } : {}),
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.secretSuffix ? { secretSuffix: input.secretSuffix } : {}),
  };
}

async function writeOutputFile(
  outputFile: string,
  output: DeployTokenBootstrapOutput,
): Promise<Result<DeployTokenBootstrapOutput>> {
  try {
    await mkdir(dirname(outputFile), { recursive: true, mode: 0o700 });
    const tempFile = `${outputFile}.tmp`;
    await Bun.write(tempFile, `${JSON.stringify(output, null, 2)}\n`);
    await chmod(tempFile, 0o600);
    await rename(tempFile, outputFile);
    await chmod(outputFile, 0o600);
    return ok(output);
  } catch (error) {
    return err(
      bootstrapError("Installer deploy token bootstrap output could not be written", {
        outputFile,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

export async function writeBootstrapDeployTokenOutput(
  input: BootstrapDeployTokenOutputInput,
): Promise<Result<DeployTokenBootstrapOutput | null>> {
  const outputFile = input.config.bootstrapDeployTokenOutputFile?.trim();
  if (!outputFile) {
    return ok(null);
  }

  if (existsSync(outputFile)) {
    return ok(null);
  }

  const context = input.executionContextFactory.create({
    entrypoint: "system",
    actor: {
      kind: "system",
      id: "installer",
      label: "appaloft-installer",
    },
  });
  const listQuery = ListDeployTokensQuery.create({
    organizationId: bootstrapOrganizationId,
    status: "active",
    limit: 1,
  });
  if (listQuery.isErr()) {
    return err(listQuery.error);
  }

  const existing = await input.queryBus.execute(context, listQuery.value);
  if (existing.isErr()) {
    return err(existing.error);
  }

  const existingToken = existing.value.items[0];
  if (existingToken) {
    return writeOutputFile(
      outputFile,
      outputWithoutRawToken({
        organizationId: bootstrapOrganizationId,
        tokenId: existingToken.tokenId,
        displayName: existingToken.displayName,
        secretSuffix: existingToken.secretSuffix,
      }),
    );
  }

  const createCommand = CreateDeployTokenCommand.create({
    organizationId: bootstrapOrganizationId,
    displayName: bootstrapDisplayName,
    scope: {
      workflowCommands: [...bootstrapWorkflowCommands],
    },
    idempotencyKey: "installer-bootstrap-deploy-token",
  });
  if (createCommand.isErr()) {
    return err(createCommand.error);
  }

  const created = await input.commandBus.execute(context, createCommand.value);
  if (created.isErr()) {
    return err(created.error);
  }

  return writeOutputFile(outputFile, {
    schemaVersion: "deploy-token.bootstrap/v1",
    created: true,
    organizationId: created.value.organizationId,
    actionSecretName: "APPALOFT_TOKEN",
    tokenId: created.value.tokenId,
    displayName: created.value.displayName,
    secretSuffix: created.value.secretSuffix,
    token: created.value.token,
  });
}
