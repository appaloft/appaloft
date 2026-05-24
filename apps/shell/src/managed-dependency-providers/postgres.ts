import {
  type DependencyResourceBackupProviderInput,
  type DependencyResourceRestoreProviderInput,
  type ExecutionContext,
  type ManagedPostgresDeleteInput,
  type ManagedPostgresDeleteResult,
  type ManagedPostgresProviderPort,
  type ManagedPostgresRealizationInput,
  type ManagedPostgresRealizationResult,
  type ServerRepository,
} from "@appaloft/application";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import {
  backupPath,
  commandFailure,
  containerName,
  dockerHandle,
  dockerManagedDependencyServices,
  dockerNetworkName,
  ensureNetworkCommand,
  managedLabel,
  parseDockerHandle,
  randomPassword,
  requireConnectionUrl,
  requireTargetFromHandle,
  runTargetCommand,
  shellQuote,
  shellQuotePath,
  volumeName,
} from "./docker-shared";

const postgresDefinition = dockerManagedDependencyServices.postgres;

export class DockerBackedManagedPostgresProvider implements ManagedPostgresProviderPort {
  constructor(private readonly serverRepository: ServerRepository) {}

  supports(providerKey: string): boolean {
    return providerKey === postgresDefinition.managedProviderKey;
  }

  async realize(
    context: ExecutionContext,
    input: ManagedPostgresRealizationInput,
  ): Promise<Result<ManagedPostgresRealizationResult, DomainError>> {
    if (!input.target) {
      return ok(fallbackPostgresRealization(input));
    }

    void context;
    const databaseName = postgresDatabaseName(input.slug);
    const user = "app";
    const password = randomPassword();
    const container = containerName(postgresDefinition, input.dependencyResourceId);
    const volume = volumeName(container);
    const connection = `postgres://${user}:${password}@${container}:5432/${databaseName}`;
    const command = [
      "set -eu",
      ensureNetworkCommand(),
      `docker volume create --label ${shellQuote(managedLabel)} --label ${shellQuote(
        `appaloft.dependency-resource-id=${input.dependencyResourceId}`,
      )} ${shellQuote(volume)} >/dev/null`,
      `docker rm -f ${shellQuote(container)} >/dev/null 2>&1 || true`,
      [
        "docker run -d",
        `--name ${shellQuote(container)}`,
        `--network ${shellQuote(dockerNetworkName)}`,
        "--restart unless-stopped",
        `--label ${shellQuote(managedLabel)}`,
        `--label ${shellQuote(`appaloft.dependency-resource-id=${input.dependencyResourceId}`)}`,
        `-e ${shellQuote(`POSTGRES_DB=${databaseName}`)}`,
        `-e ${shellQuote(`POSTGRES_USER=${user}`)}`,
        `-e ${shellQuote(`POSTGRES_PASSWORD=${password}`)}`,
        `-v ${shellQuote(`${volume}:/var/lib/postgresql/data`)}`,
        "postgres:16-alpine",
      ].join(" "),
      [
        "for attempt in $(seq 1 60); do",
        `  if PGPASSWORD=${shellQuote(password)} docker exec -e PGPASSWORD ${shellQuote(
          container,
        )} pg_isready -U ${shellQuote(user)} -d ${shellQuote(databaseName)} >/dev/null 2>&1; then`,
        "    exit 0",
        "  fi",
        "  sleep 1",
        "done",
        "exit 1",
      ].join("\n"),
    ].join("\n");

    const result = await runTargetCommand(input.target, command);
    if (result.exitCode !== 0) {
      return commandFailure({
        message: "Docker-backed managed Postgres realization failed",
        providerKey: input.providerKey,
        operation: "dependency-resources.provision",
        exitCode: result.exitCode,
      });
    }

    return ok({
      providerResourceHandle: dockerHandle({
        kind: postgresDefinition.kind,
        serverId: input.target.serverId,
        containerName: container,
      }),
      endpoint: {
        host: container,
        port: 5432,
        databaseName,
        maskedConnection: `postgres://${user}:********@${container}:5432/${databaseName}`,
      },
      connectionSecretValue: connection,
      realizedAt: input.requestedAt,
    });
  }

  async delete(
    context: ExecutionContext,
    input: ManagedPostgresDeleteInput,
  ): Promise<Result<ManagedPostgresDeleteResult, DomainError>> {
    const targetResult = input.target
      ? ok({
          handle: parseDockerHandle(input.providerResourceHandle),
          target: input.target,
        })
      : await requireTargetFromHandle({
          context,
          serverRepository: this.serverRepository,
          providerResourceHandle: input.providerResourceHandle,
          operation: "dependency-resources.delete",
        });
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }
    const parsed = targetResult.value.handle;
    if (!parsed || parsed.kind !== postgresDefinition.kind) {
      return err(
        domainError.providerCapabilityUnsupported("Provider resource handle is not Postgres", {
          phase: "managed-dependency-docker-delete",
          providerKey: input.providerKey,
        }),
      );
    }
    const result = await runTargetCommand(
      targetResult.value.target,
      [
        "set -eu",
        `docker rm -f ${shellQuote(parsed.containerName)} >/dev/null 2>&1 || true`,
        `docker volume rm ${shellQuote(volumeName(parsed.containerName))} >/dev/null 2>&1 || true`,
      ].join("\n"),
    );
    if (result.exitCode !== 0) {
      return commandFailure({
        message: "Docker-backed managed Postgres deletion failed",
        providerKey: input.providerKey,
        operation: "dependency-resources.delete",
        exitCode: result.exitCode,
      });
    }
    return ok({ deletedAt: input.requestedAt });
  }
}

export const postgresDockerBackupCapability = {
  definition: postgresDefinition,
  createCommand(
    input: DependencyResourceBackupProviderInput & { container: string; path: string },
  ) {
    return postgresBackupCommand(input);
  },
  restoreCommand(
    input: DependencyResourceRestoreProviderInput & { container: string; path: string },
  ) {
    return postgresRestoreCommand(input);
  },
  pathForBackup(input: Parameters<typeof backupPath>[1]) {
    return backupPath(postgresDefinition, input);
  },
};

function fallbackPostgresRealization(
  input: ManagedPostgresRealizationInput,
): ManagedPostgresRealizationResult {
  const databaseName = input.slug.replaceAll("-", "_");
  return {
    providerResourceHandle: `pg/${input.dependencyResourceId}`,
    endpoint: {
      host: `${input.slug}.postgres.internal`,
      port: 5432,
      databaseName,
      maskedConnection: `postgres://app:********@${input.slug}.postgres.internal:5432/${databaseName}`,
    },
    secretRef: `secret://dependency/postgres/${input.dependencyResourceId}`,
    realizedAt: input.requestedAt,
  };
}

function postgresDatabaseName(slug: string): string {
  const normalized = slug
    .toLowerCase()
    .replaceAll(/[^a-z0-9_]/g, "_")
    .replaceAll(/^_+|_+$/g, "");
  return normalized || "app";
}

function postgresBackupCommand(input: {
  container: string;
  path: string;
  connectionSecretValue?: string;
}): Result<string, DomainError> {
  const connection = requireConnectionUrl({
    connectionSecretValue: input.connectionSecretValue,
    dependencyKind: postgresDefinition.kind,
  });
  if (connection.isErr()) {
    return err(connection.error);
  }
  const username = decodeURIComponent(connection.value.username || "app");
  const password = decodeURIComponent(connection.value.password);
  const databaseName = connection.value.pathname.replace(/^\//, "") || "app";
  return ok(
    [
      "set -eu",
      `mkdir -p ${shellQuotePath(input.path.replace(/\/[^/]+$/, ""))}`,
      `PGPASSWORD=${shellQuote(password)} docker exec -e PGPASSWORD ${shellQuote(
        input.container,
      )} pg_dump -U ${shellQuote(username)} -d ${shellQuote(databaseName)} -Fc > ${shellQuotePath(
        input.path,
      )}`,
    ].join("\n"),
  );
}

function postgresRestoreCommand(input: {
  container: string;
  path: string;
  connectionSecretValue?: string;
}): Result<string, DomainError> {
  const connection = requireConnectionUrl({
    connectionSecretValue: input.connectionSecretValue,
    dependencyKind: postgresDefinition.kind,
  });
  if (connection.isErr()) {
    return err(connection.error);
  }
  const username = decodeURIComponent(connection.value.username || "app");
  const password = decodeURIComponent(connection.value.password);
  const databaseName = connection.value.pathname.replace(/^\//, "") || "app";
  return ok(
    [
      "set -eu",
      `test -f ${shellQuotePath(input.path)}`,
      `cat ${shellQuotePath(input.path)} | PGPASSWORD=${shellQuote(password)} docker exec -i -e PGPASSWORD ${shellQuote(
        input.container,
      )} pg_restore -U ${shellQuote(username)} -d ${shellQuote(databaseName)} --clean --if-exists`,
    ].join("\n"),
  );
}
