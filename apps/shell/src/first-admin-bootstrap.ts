import { existsSync } from "node:fs";
import { chmod, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import {
  BootstrapFirstAdminCommand,
  type CommandBus,
  type ExecutionContextFactory,
  GetAuthBootstrapStatusQuery,
  type ProductLoginMethodStatus,
  type QueryBus,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";
import { type DomainError, err, ok, type Result } from "@appaloft/core";

export interface FirstAdminBootstrapOutput {
  schemaVersion: "first-admin.bootstrap/v1";
  bootstrapRequired: boolean;
  created: boolean;
  email?: string;
  generatedPassword?: string;
  loginMethods: ProductLoginMethodStatus[];
  loginUrl?: string;
  organizationId?: string;
  organizationSlug?: string;
}

export interface BootstrapFirstAdminOutputInput {
  commandBus: CommandBus;
  config: AppConfig;
  executionContextFactory: ExecutionContextFactory;
  queryBus: QueryBus;
}

function bootstrapError(message: string, details: Record<string, unknown> = {}): DomainError {
  return {
    code: "first_admin_bootstrap_failed",
    category: "infra",
    message,
    retryable: false,
    details: {
      phase: "first-admin-bootstrap",
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

async function writeOutputFile(
  outputFile: string,
  output: FirstAdminBootstrapOutput,
): Promise<Result<FirstAdminBootstrapOutput>> {
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
      bootstrapError("Installer first-admin bootstrap output could not be written", {
        outputFile,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

export async function writeBootstrapFirstAdminOutput(
  input: BootstrapFirstAdminOutputInput,
): Promise<Result<FirstAdminBootstrapOutput | null>> {
  const outputFile = input.config.bootstrapFirstAdminOutputFile?.trim();
  const outputFileAlreadyExists = outputFile ? existsSync(outputFile) : false;
  const firstAdminEmail = input.config.firstAdminEmail?.trim();
  const firstAdminPassword = input.config.firstAdminPassword?.trim();
  const startupBootstrapConfigured = Boolean(firstAdminEmail && firstAdminPassword);

  if (!startupBootstrapConfigured && !outputFile) {
    return ok(null);
  }

  if (!startupBootstrapConfigured && outputFileAlreadyExists) {
    return ok(null);
  }

  const writeOutputIfNeeded = (output: FirstAdminBootstrapOutput) => {
    if (!outputFile || outputFileAlreadyExists) {
      return ok(output);
    }

    return writeOutputFile(outputFile, output);
  };

  const context = input.executionContextFactory.create({
    entrypoint: "system",
    actor: {
      kind: "system",
      id: "installer",
      label: "appaloft-installer",
    },
  });
  const statusQuery = GetAuthBootstrapStatusQuery.create({});
  if (statusQuery.isErr()) {
    return err(statusQuery.error);
  }

  const status = await input.queryBus.execute(context, statusQuery.value);
  if (status.isErr()) {
    return err(status.error);
  }

  if (!status.value.bootstrapRequired) {
    return writeOutputIfNeeded({
      schemaVersion: "first-admin.bootstrap/v1",
      bootstrapRequired: false,
      created: false,
      loginMethods: status.value.loginMethods,
      ...(status.value.firstAdminEmail ? { email: status.value.firstAdminEmail } : {}),
      ...(status.value.loginUrl ? { loginUrl: status.value.loginUrl } : {}),
      ...(status.value.organizationId ? { organizationId: status.value.organizationId } : {}),
      ...(status.value.organizationSlug ? { organizationSlug: status.value.organizationSlug } : {}),
    });
  }

  if (!firstAdminEmail) {
    return writeOutputIfNeeded({
      schemaVersion: "first-admin.bootstrap/v1",
      bootstrapRequired: true,
      created: false,
      loginMethods: status.value.loginMethods,
      ...(status.value.loginUrl ? { loginUrl: status.value.loginUrl } : {}),
    });
  }

  const command = BootstrapFirstAdminCommand.create({
    email: firstAdminEmail,
    displayName: input.config.firstAdminDisplayName?.trim() || "Appaloft Admin",
    ...(firstAdminPassword ? { password: firstAdminPassword } : {}),
    organizationName: input.config.firstAdminOrganizationName?.trim() || "Self-hosted Appaloft",
    organizationSlug: input.config.firstAdminOrganizationSlug?.trim() || "self-hosted-appaloft",
    idempotencyKey: "installer-bootstrap-first-admin",
  });
  if (command.isErr()) {
    return err(command.error);
  }

  const created = await input.commandBus.execute(context, command.value);
  if (created.isErr()) {
    return err(created.error);
  }

  return writeOutputIfNeeded({
    schemaVersion: "first-admin.bootstrap/v1",
    bootstrapRequired: false,
    created: true,
    email: created.value.email,
    loginMethods: created.value.loginMethods,
    organizationId: created.value.organizationId,
    organizationSlug: created.value.organizationSlug,
    ...(created.value.generatedPassword
      ? { generatedPassword: created.value.generatedPassword }
      : {}),
    ...(created.value.loginUrl ? { loginUrl: created.value.loginUrl } : {}),
  });
}
