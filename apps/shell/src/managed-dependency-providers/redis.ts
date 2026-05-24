import {
  type DependencyResourceBackupProviderInput,
  type DependencyResourceRestoreProviderInput,
  type ExecutionContext,
  type ManagedRedisDeleteInput,
  type ManagedRedisDeleteResult,
  type ManagedRedisProviderPort,
  type ManagedRedisRealizationInput,
  type ManagedRedisRealizationResult,
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

const redisDefinition = dockerManagedDependencyServices.redis;

export class DockerBackedManagedRedisProvider implements ManagedRedisProviderPort {
  constructor(private readonly serverRepository: ServerRepository) {}

  supports(providerKey: string): boolean {
    return providerKey === redisDefinition.managedProviderKey;
  }

  async realize(
    context: ExecutionContext,
    input: ManagedRedisRealizationInput,
  ): Promise<Result<ManagedRedisRealizationResult, DomainError>> {
    if (!input.target) {
      return ok(fallbackRedisRealization(input));
    }

    void context;
    const password = randomPassword();
    const container = containerName(redisDefinition, input.dependencyResourceId);
    const volume = volumeName(container);
    const connection = `redis://:${password}@${container}:6379/0`;
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
        `-v ${shellQuote(`${volume}:/data`)}`,
        "redis:7-alpine",
        "redis-server",
        "--appendonly yes",
        `--requirepass ${shellQuote(password)}`,
      ].join(" "),
      [
        "for attempt in $(seq 1 60); do",
        `  if docker exec ${shellQuote(container)} redis-cli -a ${shellQuote(
          password,
        )} --no-auth-warning PING >/dev/null 2>&1; then`,
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
        message: "Docker-backed managed Redis realization failed",
        providerKey: input.providerKey,
        operation: "dependency-resources.provision",
        exitCode: result.exitCode,
      });
    }

    return ok({
      providerResourceHandle: dockerHandle({
        kind: redisDefinition.kind,
        serverId: input.target.serverId,
        containerName: container,
      }),
      endpoint: {
        host: container,
        port: 6379,
        maskedConnection: `redis://:********@${container}:6379/0`,
      },
      connectionSecretValue: connection,
      realizedAt: input.requestedAt,
    });
  }

  async delete(
    context: ExecutionContext,
    input: ManagedRedisDeleteInput,
  ): Promise<Result<ManagedRedisDeleteResult, DomainError>> {
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
    if (!parsed || parsed.kind !== redisDefinition.kind) {
      return err(
        domainError.providerCapabilityUnsupported("Provider resource handle is not Redis", {
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
        message: "Docker-backed managed Redis deletion failed",
        providerKey: input.providerKey,
        operation: "dependency-resources.delete",
        exitCode: result.exitCode,
      });
    }
    return ok({ deletedAt: input.requestedAt });
  }
}

export const redisDockerBackupCapability = {
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
};

function fallbackRedisRealization(
  input: ManagedRedisRealizationInput,
): ManagedRedisRealizationResult {
  return {
    providerResourceHandle: `redis/${input.dependencyResourceId}`,
    endpoint: {
      host: `${input.slug}.redis.internal`,
      port: 6379,
      maskedConnection: `redis://:********@${input.slug}.redis.internal:6379/0`,
    },
    secretRef: `secret://dependency/redis/${input.dependencyResourceId}`,
    realizedAt: input.requestedAt,
  };
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
