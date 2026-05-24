import {
  type ExecutionContext,
  type ManagedDependencyDeleteInput,
  type ManagedDependencyDeleteResult,
  type ManagedDependencyProviderPort,
  type ManagedDependencyRealizationInput,
  type ManagedDependencyRealizationResult,
  type ManagedDependencyResourceKind,
  type ServerRepository,
} from "@appaloft/application";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import {
  commandFailure,
  containerName,
  type DockerManagedDependencyServiceDefinition,
  dockerHandle,
  dockerNetworkName,
  ensureNetworkCommand,
  managedLabel,
  randomPassword,
  requireTargetFromHandle,
  runTargetCommand,
  serviceForKind,
  shellQuote,
  volumeName,
} from "./docker-shared";

interface DockerRealizationSpec {
  command: string;
  endpoint: ManagedDependencyRealizationResult["endpoint"];
  connectionSecretValue: string;
}

export class DockerBackedManagedDependencyProvider implements ManagedDependencyProviderPort {
  constructor(private readonly serverRepository: ServerRepository) {}

  supports(providerKey: string, kind: ManagedDependencyResourceKind): boolean {
    return serviceForKind(kind)?.managedProviderKey === providerKey;
  }

  async realize(
    _context: ExecutionContext,
    input: ManagedDependencyRealizationInput,
  ): Promise<Result<ManagedDependencyRealizationResult, DomainError>> {
    const definition = serviceForKind(input.kind);
    if (!definition || definition.managedProviderKey !== input.providerKey) {
      return err(unsupported(input.providerKey, input.kind, "dependency-resources.provision"));
    }
    if (!input.target) {
      return ok(fallbackDependencyRealization(input, definition));
    }

    const container = containerName(definition, input.dependencyResourceId);
    const volume = volumeName(container);
    const spec = dockerRealizationSpec(input, definition, container, volume);
    const result = await runTargetCommand(input.target, spec.command);
    if (result.exitCode !== 0) {
      return commandFailure({
        message: `Docker-backed managed ${input.kind} realization failed`,
        providerKey: input.providerKey,
        operation: "dependency-resources.provision",
        exitCode: result.exitCode,
      });
    }

    return ok({
      providerResourceHandle: dockerHandle({
        kind: definition.kind,
        serverId: input.target.serverId,
        containerName: container,
      }),
      endpoint: spec.endpoint,
      connectionSecretValue: spec.connectionSecretValue,
      realizedAt: input.requestedAt,
    });
  }

  async delete(
    context: ExecutionContext,
    input: ManagedDependencyDeleteInput,
  ): Promise<Result<ManagedDependencyDeleteResult, DomainError>> {
    const definition = serviceForKind(input.kind);
    if (!definition || definition.managedProviderKey !== input.providerKey) {
      return err(unsupported(input.providerKey, input.kind, "dependency-resources.delete"));
    }
    const targetResult = input.target
      ? ok({
          handle: undefined,
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
    const parsed =
      targetResult.value.handle ??
      requireDockerHandleKind(input.providerResourceHandle, definition.kind);
    if (!parsed || parsed.kind !== definition.kind) {
      return err(
        domainError.providerCapabilityUnsupported(
          "Provider resource handle does not match dependency resource kind",
          {
            phase: "managed-dependency-docker-delete",
            providerKey: input.providerKey,
            dependencyKind: input.kind,
          },
        ),
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
        message: `Docker-backed managed ${input.kind} deletion failed`,
        providerKey: input.providerKey,
        operation: "dependency-resources.delete",
        exitCode: result.exitCode,
      });
    }
    return ok({ deletedAt: input.requestedAt });
  }
}

function dockerRealizationSpec(
  input: ManagedDependencyRealizationInput,
  definition: DockerManagedDependencyServiceDefinition,
  container: string,
  volume: string,
): DockerRealizationSpec {
  switch (input.kind) {
    case "postgres":
      return postgresSpec(input, definition, container, volume);
    case "redis":
      return redisSpec(input, definition, container, volume);
    case "mysql":
      return mysqlSpec(input, definition, container, volume);
    case "clickhouse":
      return clickHouseSpec(input, definition, container, volume);
    case "object-storage":
      return objectStorageSpec(input, definition, container, volume);
    case "opensearch":
      return openSearchSpec(input, definition, container, volume);
    default:
      throw new Error(`Unsupported dependency kind ${input.kind}`);
  }
}

function postgresSpec(
  input: ManagedDependencyRealizationInput,
  _definition: DockerManagedDependencyServiceDefinition,
  container: string,
  volume: string,
): DockerRealizationSpec {
  const databaseName = databaseNameFor(input.slug);
  const user = "app";
  const password = randomPassword();
  const connection = `postgres://${user}:${password}@${container}:5432/${databaseName}`;
  return {
    endpoint: {
      host: container,
      port: 5432,
      databaseName,
      maskedConnection: `postgres://${user}:********@${container}:5432/${databaseName}`,
    },
    connectionSecretValue: connection,
    command: [
      "set -eu",
      ensureNetworkCommand(),
      volumeCreateCommand(volume, input.dependencyResourceId),
      removeContainerCommand(container),
      [
        "docker run -d",
        `--name ${shellQuote(container)}`,
        `--network ${shellQuote(dockerNetworkName)}`,
        "--restart unless-stopped",
        labels(input.dependencyResourceId),
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
    ].join("\n"),
  };
}

function redisSpec(
  input: ManagedDependencyRealizationInput,
  _definition: DockerManagedDependencyServiceDefinition,
  container: string,
  volume: string,
): DockerRealizationSpec {
  const password = randomPassword();
  const connection = `redis://:${password}@${container}:6379/0`;
  return {
    endpoint: {
      host: container,
      port: 6379,
      maskedConnection: `redis://:********@${container}:6379/0`,
    },
    connectionSecretValue: connection,
    command: [
      "set -eu",
      ensureNetworkCommand(),
      volumeCreateCommand(volume, input.dependencyResourceId),
      removeContainerCommand(container),
      [
        "docker run -d",
        `--name ${shellQuote(container)}`,
        `--network ${shellQuote(dockerNetworkName)}`,
        "--restart unless-stopped",
        labels(input.dependencyResourceId),
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
    ].join("\n"),
  };
}

function mysqlSpec(
  input: ManagedDependencyRealizationInput,
  _definition: DockerManagedDependencyServiceDefinition,
  container: string,
  volume: string,
): DockerRealizationSpec {
  const databaseName = databaseNameFor(input.slug);
  const user = "app";
  const password = randomPassword();
  const rootPassword = randomPassword();
  const connection = `mysql://${user}:${password}@${container}:3306/${databaseName}`;
  return {
    endpoint: {
      host: container,
      port: 3306,
      databaseName,
      maskedConnection: `mysql://${user}:********@${container}:3306/${databaseName}`,
    },
    connectionSecretValue: connection,
    command: [
      "set -eu",
      ensureNetworkCommand(),
      volumeCreateCommand(volume, input.dependencyResourceId),
      removeContainerCommand(container),
      [
        "docker run -d",
        `--name ${shellQuote(container)}`,
        `--network ${shellQuote(dockerNetworkName)}`,
        "--restart unless-stopped",
        labels(input.dependencyResourceId),
        `-e ${shellQuote(`MYSQL_DATABASE=${databaseName}`)}`,
        `-e ${shellQuote(`MYSQL_USER=${user}`)}`,
        `-e ${shellQuote(`MYSQL_PASSWORD=${password}`)}`,
        `-e ${shellQuote(`MYSQL_ROOT_PASSWORD=${rootPassword}`)}`,
        `-v ${shellQuote(`${volume}:/var/lib/mysql`)}`,
        "mysql:8.4",
      ].join(" "),
      [
        "for attempt in $(seq 1 90); do",
        `  if docker exec -e MYSQL_PWD=${shellQuote(password)} ${shellQuote(
          container,
        )} mysqladmin ping -h 127.0.0.1 -u ${shellQuote(user)} --silent >/dev/null 2>&1; then`,
        "    exit 0",
        "  fi",
        "  sleep 1",
        "done",
        "exit 1",
      ].join("\n"),
    ].join("\n"),
  };
}

function clickHouseSpec(
  input: ManagedDependencyRealizationInput,
  definition: DockerManagedDependencyServiceDefinition,
  container: string,
  volume: string,
): DockerRealizationSpec {
  void definition;
  const databaseName = databaseNameFor(input.slug);
  const user = "app";
  const password = randomPassword();
  const connection = `clickhouse://${user}:${password}@${container}:9000/${databaseName}`;
  return {
    endpoint: {
      host: container,
      port: 9000,
      databaseName,
      maskedConnection: `clickhouse://${user}:********@${container}:9000/${databaseName}`,
    },
    connectionSecretValue: connection,
    command: [
      "set -eu",
      ensureNetworkCommand(),
      volumeCreateCommand(volume, input.dependencyResourceId),
      removeContainerCommand(container),
      [
        "docker run -d",
        `--name ${shellQuote(container)}`,
        `--network ${shellQuote(dockerNetworkName)}`,
        "--restart unless-stopped",
        labels(input.dependencyResourceId),
        `-e ${shellQuote(`CLICKHOUSE_DB=${databaseName}`)}`,
        `-e ${shellQuote(`CLICKHOUSE_USER=${user}`)}`,
        `-e ${shellQuote(`CLICKHOUSE_PASSWORD=${password}`)}`,
        `-v ${shellQuote(`${volume}:/var/lib/clickhouse`)}`,
        "clickhouse/clickhouse-server:24.8",
      ].join(" "),
      [
        "for attempt in $(seq 1 90); do",
        `  if docker exec ${shellQuote(container)} clickhouse-client --user ${shellQuote(
          user,
        )} --password ${shellQuote(password)} --query ${shellQuote("SELECT 1")} >/dev/null 2>&1; then`,
        "    exit 0",
        "  fi",
        "  sleep 1",
        "done",
        "exit 1",
      ].join("\n"),
    ].join("\n"),
  };
}

function objectStorageSpec(
  input: ManagedDependencyRealizationInput,
  definition: DockerManagedDependencyServiceDefinition,
  container: string,
  volume: string,
): DockerRealizationSpec {
  void definition;
  const bucketName = bucketNameFor(input.slug);
  const accessKey = `app${input.dependencyResourceId.replaceAll(/[^a-zA-Z0-9]/g, "")}`.slice(0, 20);
  const secretKey = randomPassword();
  const connection = `s3://${accessKey}:${secretKey}@${container}:9000/${bucketName}?forcePathStyle=true`;
  return {
    endpoint: {
      host: container,
      port: 9000,
      databaseName: bucketName,
      maskedConnection: `s3://${accessKey}:********@${container}:9000/${bucketName}?forcePathStyle=true`,
    },
    connectionSecretValue: connection,
    command: [
      "set -eu",
      ensureNetworkCommand(),
      volumeCreateCommand(volume, input.dependencyResourceId),
      removeContainerCommand(container),
      [
        "docker run -d",
        `--name ${shellQuote(container)}`,
        `--network ${shellQuote(dockerNetworkName)}`,
        "--restart unless-stopped",
        labels(input.dependencyResourceId),
        `-e ${shellQuote(`MINIO_ROOT_USER=${accessKey}`)}`,
        `-e ${shellQuote(`MINIO_ROOT_PASSWORD=${secretKey}`)}`,
        `-v ${shellQuote(`${volume}:/data`)}`,
        "minio/minio:latest",
        "server /data --console-address :9001",
      ].join(" "),
      [
        "for attempt in $(seq 1 90); do",
        `  if docker exec ${shellQuote(container)} sh -c ${shellQuote(
          "wget -q -O - http://127.0.0.1:9000/minio/health/ready >/dev/null 2>&1 || curl -fsS http://127.0.0.1:9000/minio/health/ready >/dev/null 2>&1",
        )}; then`,
        "    break",
        "  fi",
        "  sleep 1",
        "done",
        [
          "docker run --rm",
          `--network ${shellQuote(dockerNetworkName)}`,
          "minio/mc:latest",
          "alias set local",
          `${shellQuote(`http://${container}:9000`)}`,
          shellQuote(accessKey),
          shellQuote(secretKey),
          ">/dev/null",
        ].join(" "),
        [
          "docker run --rm",
          `--network ${shellQuote(dockerNetworkName)}`,
          "minio/mc:latest",
          "mb --ignore-existing",
          shellQuote(`local/${bucketName}`),
          ">/dev/null",
        ].join(" "),
      ].join("\n"),
    ].join("\n"),
  };
}

function openSearchSpec(
  input: ManagedDependencyRealizationInput,
  definition: DockerManagedDependencyServiceDefinition,
  container: string,
  volume: string,
): DockerRealizationSpec {
  void definition;
  const password = `${randomPassword()}A1!`;
  const connection = `http://admin:${password}@${container}:9200`;
  return {
    endpoint: {
      host: container,
      port: 9200,
      maskedConnection: `http://admin:********@${container}:9200`,
    },
    connectionSecretValue: connection,
    command: [
      "set -eu",
      ensureNetworkCommand(),
      volumeCreateCommand(volume, input.dependencyResourceId),
      removeContainerCommand(container),
      [
        "docker run -d",
        `--name ${shellQuote(container)}`,
        `--network ${shellQuote(dockerNetworkName)}`,
        "--restart unless-stopped",
        labels(input.dependencyResourceId),
        `-e ${shellQuote("discovery.type=single-node")}`,
        `-e ${shellQuote("plugins.security.disabled=true")}`,
        `-e ${shellQuote(`OPENSEARCH_INITIAL_ADMIN_PASSWORD=${password}`)}`,
        `-v ${shellQuote(`${volume}:/usr/share/opensearch/data`)}`,
        "opensearchproject/opensearch:2",
      ].join(" "),
      [
        "for attempt in $(seq 1 120); do",
        `  if docker exec ${shellQuote(container)} sh -c ${shellQuote(
          "curl -fsS http://127.0.0.1:9200/_cluster/health >/dev/null 2>&1",
        )}; then`,
        "    exit 0",
        "  fi",
        "  sleep 1",
        "done",
        "exit 1",
      ].join("\n"),
    ].join("\n"),
  };
}

function fallbackDependencyRealization(
  input: ManagedDependencyRealizationInput,
  definition: DockerManagedDependencyServiceDefinition,
): ManagedDependencyRealizationResult {
  const port = fallbackPort(input.kind);
  const databaseName =
    input.kind === "object-storage" ? bucketNameFor(input.slug) : databaseNameFor(input.slug);
  return {
    providerResourceHandle: `${definition.imageLabel}/${input.dependencyResourceId}`,
    endpoint: {
      host: `${input.slug}.${definition.imageLabel}.internal`,
      port,
      ...(databaseName ? { databaseName } : {}),
      maskedConnection: `${fallbackScheme(input.kind)}://app:********@${input.slug}.${definition.imageLabel}.internal:${port}/${databaseName}`,
    },
    secretRef: `secret://dependency/${input.kind}/${input.dependencyResourceId}`,
    realizedAt: input.requestedAt,
  };
}

function fallbackPort(kind: ManagedDependencyResourceKind): number {
  switch (kind) {
    case "mysql":
      return 3306;
    case "clickhouse":
      return 9000;
    case "object-storage":
      return 9000;
    case "opensearch":
      return 9200;
    case "postgres":
      return 5432;
    case "redis":
      return 6379;
  }
}

function fallbackScheme(kind: ManagedDependencyResourceKind): string {
  switch (kind) {
    case "object-storage":
      return "s3";
    case "opensearch":
      return "http";
    default:
      return kind;
  }
}

function databaseNameFor(slug: string): string {
  const normalized = slug
    .toLowerCase()
    .replaceAll(/[^a-z0-9_]/g, "_")
    .replaceAll(/^_+|_+$/g, "");
  return normalized || "app";
}

function bucketNameFor(slug: string): string {
  const normalized = slug
    .toLowerCase()
    .replaceAll(/[^a-z0-9.-]/g, "-")
    .replaceAll(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  const withLength = normalized.length >= 3 ? normalized : `${normalized || "app"}-bucket`;
  return withLength.slice(0, 63).replaceAll(/[-.]+$/g, "") || "app-bucket";
}

function volumeCreateCommand(volume: string, dependencyResourceId: string): string {
  return `docker volume create --label ${shellQuote(managedLabel)} --label ${shellQuote(
    `appaloft.dependency-resource-id=${dependencyResourceId}`,
  )} ${shellQuote(volume)} >/dev/null`;
}

function removeContainerCommand(container: string): string {
  return `docker rm -f ${shellQuote(container)} >/dev/null 2>&1 || true`;
}

function labels(dependencyResourceId: string): string {
  return [
    `--label ${shellQuote(managedLabel)}`,
    `--label ${shellQuote(`appaloft.dependency-resource-id=${dependencyResourceId}`)}`,
  ].join(" ");
}

function requireDockerHandleKind(
  providerResourceHandle: string,
  kind: ManagedDependencyResourceKind,
): { kind: ManagedDependencyResourceKind; serverId: string; containerName: string } | undefined {
  const [prefix, version, parsedKind, serverId, container] = providerResourceHandle.split(":");
  if (
    `${prefix}:${version}` !== "docker-single-server:v1" ||
    parsedKind !== kind ||
    !serverId ||
    !container
  ) {
    return undefined;
  }
  return { kind, serverId, containerName: container };
}

function unsupported(
  providerKey: string,
  dependencyKind: ManagedDependencyResourceKind,
  operation: string,
): DomainError {
  return domainError.providerCapabilityUnsupported(
    "Provider does not support managed dependency realization",
    {
      phase: "dependency-resource-realization-admission",
      providerKey,
      dependencyKind,
      operation,
    },
  );
}
