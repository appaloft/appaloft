import {
  type DependencyResourceBackupProviderInput,
  type DependencyResourceRestoreProviderInput,
} from "@appaloft/application";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import {
  backupPath,
  dockerManagedDependencyServices,
  requireConnectionUrl,
  shellQuote,
  shellQuotePath,
} from "./docker-shared";

const postgresDefinition = dockerManagedDependencyServices.postgres;
const redisDefinition = dockerManagedDependencyServices.redis;

export const dockerBackupCapabilities = [
  {
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
  },
  {
    definition: redisDefinition,
    createCommand(
      input: DependencyResourceBackupProviderInput & { container: string; path: string },
    ) {
      return redisBackupCommand(input);
    },
    restoreCommand(
      input: DependencyResourceRestoreProviderInput & { container: string; path: string },
    ) {
      void input.connectionSecretValue;
      return ok(redisRestoreCommand(input));
    },
    pathForBackup(input: Parameters<typeof backupPath>[1]) {
      return backupPath(redisDefinition, input);
    },
  },
];

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

function redisBackupCommand(input: {
  container: string;
  path: string;
  connectionSecretValue?: string;
}): Result<string, DomainError> {
  const connection = requireConnectionUrl({
    connectionSecretValue: input.connectionSecretValue,
    dependencyKind: redisDefinition.kind,
  });
  if (connection.isErr()) {
    return err(connection.error);
  }
  const password = decodeURIComponent(connection.value.password);
  return ok(
    [
      "set -eu",
      `mkdir -p ${shellQuotePath(input.path.replace(/\/[^/]+$/, ""))}`,
      `docker exec ${shellQuote(input.container)} redis-cli -a ${shellQuote(
        password,
      )} --no-auth-warning SAVE >/dev/null`,
      `docker cp ${shellQuote(`${input.container}:/data/dump.rdb`)} ${shellQuotePath(input.path)}`,
    ].join("\n"),
  );
}

function redisRestoreCommand(input: { container: string; path: string }): string {
  return [
    "set -eu",
    `test -f ${shellQuotePath(input.path)}`,
    `docker stop ${shellQuote(input.container)} >/dev/null`,
    `docker cp ${shellQuotePath(input.path)} ${shellQuote(`${input.container}:/data/dump.rdb`)}`,
    `docker start ${shellQuote(input.container)} >/dev/null`,
  ].join("\n");
}
