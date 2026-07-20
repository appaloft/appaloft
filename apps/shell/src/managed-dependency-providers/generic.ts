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
import { type AshScript, ash } from "@appaloft/ash";
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
  volumeName,
} from "./docker-shared";

interface DockerRealizationSpec {
  command: AshScript;
  stdin: Uint8Array;
  endpoint: ManagedDependencyRealizationResult["endpoint"];
  connectionSecretValue: string;
}

export class DockerBackedManagedDependencyProvider implements ManagedDependencyProviderPort {
  constructor(private readonly serverRepository: ServerRepository) {}

  supports(
    providerKey: string,
    kind: ManagedDependencyResourceKind,
    capabilities?: ManagedDependencyRealizationInput["capabilities"],
  ): boolean {
    if (capabilities?.some((capability) => capability.required)) {
      return false;
    }
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
    const result = await runTargetCommand(input.target, spec.command, { stdin: spec.stdin });
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
      ash`
        set -eu
        docker rm -f ${ash.arg(parsed.containerName)} >/dev/null 2>&1 || true
        docker volume rm ${ash.arg(volumeName(parsed.containerName))} >/dev/null 2>&1 || true
        rm -f "$HOME/.appaloft/dependency-secrets"/${ash.arg(`${parsed.containerName}.redis.conf`)}
      `,
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
    stdin: sensitiveInput(password),
    command: ash`
      set -eu
      IFS= read -r APPALOFT_MANAGED_DEPENDENCY_PASSWORD
      ${transientEnvFileSetupScript(container)}
      printf 'POSTGRES_PASSWORD=%s\n' "$APPALOFT_MANAGED_DEPENDENCY_PASSWORD" > "$APPALOFT_DEPENDENCY_ENV_FILE"
      ${provisionSetupScript(volume, input.dependencyResourceId, container)}
      docker run -d ${ash.list([
        ...commonDockerRunArgs(input.dependencyResourceId, container),
        "-e",
        `POSTGRES_DB=${databaseName}`,
        "-e",
        `POSTGRES_USER=${user}`,
        "-v",
        `${volume}:/var/lib/postgresql/data`,
      ])} --env-file "$APPALOFT_DEPENDENCY_ENV_FILE" postgres:16-alpine
      for attempt in $(seq 1 60); do
        if docker exec ${ash.arg(container)} pg_isready -U ${ash.arg(user)} -d ${ash.arg(
          databaseName,
        )} >/dev/null 2>&1; then
          exit 0
        fi
        sleep 1
      done
      exit 1
    `,
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
    stdin: sensitiveInput(password),
    command: ash`
      set -eu
      IFS= read -r APPALOFT_MANAGED_DEPENDENCY_PASSWORD
      umask 077
      APPALOFT_DEPENDENCY_SECRET_DIR="$HOME/.appaloft/dependency-secrets"
      APPALOFT_DEPENDENCY_REDIS_CONFIG="$APPALOFT_DEPENDENCY_SECRET_DIR"/${ash.arg(
        `${container}.redis.conf`,
      )}
      mkdir -p "$APPALOFT_DEPENDENCY_SECRET_DIR"
      printf 'requirepass %s\nappendonly yes\n' "$APPALOFT_MANAGED_DEPENDENCY_PASSWORD" > "$APPALOFT_DEPENDENCY_REDIS_CONFIG"
      ${provisionSetupScript(volume, input.dependencyResourceId, container)}
      docker run -d ${ash.list([
        ...commonDockerRunArgs(input.dependencyResourceId, container),
        "-v",
        `${volume}:/data`,
      ])} -v "$APPALOFT_DEPENDENCY_REDIS_CONFIG:/usr/local/etc/redis/appaloft.conf:ro" redis:7-alpine redis-server /usr/local/etc/redis/appaloft.conf
      for attempt in $(seq 1 60); do
        if docker exec ${ash.arg(container)} sh -lc ${ash.arg(
          ash.render(
            ash`password="$(awk '$1 == "requirepass" { print $2; exit }' /usr/local/etc/redis/appaloft.conf)"; REDISCLI_AUTH="$password" redis-cli PING`,
          ),
        )} >/dev/null 2>&1; then
          exit 0
        fi
        sleep 1
      done
      exit 1
    `,
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
    stdin: sensitiveInput(password, rootPassword),
    command: ash`
      set -eu
      IFS= read -r APPALOFT_MANAGED_DEPENDENCY_PASSWORD
      IFS= read -r APPALOFT_MANAGED_DEPENDENCY_ROOT_PASSWORD
      ${transientEnvFileSetupScript(container)}
      printf 'MYSQL_PASSWORD=%s\nMYSQL_ROOT_PASSWORD=%s\n' "$APPALOFT_MANAGED_DEPENDENCY_PASSWORD" "$APPALOFT_MANAGED_DEPENDENCY_ROOT_PASSWORD" > "$APPALOFT_DEPENDENCY_ENV_FILE"
      ${provisionSetupScript(volume, input.dependencyResourceId, container)}
      docker run -d ${ash.list([
        ...commonDockerRunArgs(input.dependencyResourceId, container),
        "-e",
        `MYSQL_DATABASE=${databaseName}`,
        "-e",
        `MYSQL_USER=${user}`,
        "-v",
        `${volume}:/var/lib/mysql`,
      ])} --env-file "$APPALOFT_DEPENDENCY_ENV_FILE" mysql:8.4
      for attempt in $(seq 1 90); do
        if docker exec ${ash.arg(container)} sh -lc ${ash.arg(
          ash.render(
            ash`MYSQL_PWD="$MYSQL_PASSWORD" mysqladmin ping -h 127.0.0.1 -u "$MYSQL_USER" --silent`,
          ),
        )} >/dev/null 2>&1; then
          exit 0
        fi
        sleep 1
      done
      exit 1
    `,
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
    stdin: sensitiveInput(password),
    command: ash`
      set -eu
      IFS= read -r APPALOFT_MANAGED_DEPENDENCY_PASSWORD
      ${transientEnvFileSetupScript(container)}
      printf 'CLICKHOUSE_PASSWORD=%s\n' "$APPALOFT_MANAGED_DEPENDENCY_PASSWORD" > "$APPALOFT_DEPENDENCY_ENV_FILE"
      ${provisionSetupScript(volume, input.dependencyResourceId, container)}
      docker run -d ${ash.list([
        ...commonDockerRunArgs(input.dependencyResourceId, container),
        "-e",
        `CLICKHOUSE_DB=${databaseName}`,
        "-e",
        `CLICKHOUSE_USER=${user}`,
        "-v",
        `${volume}:/var/lib/clickhouse`,
      ])} --env-file "$APPALOFT_DEPENDENCY_ENV_FILE" clickhouse/clickhouse-server:24.8
      for attempt in $(seq 1 90); do
        if docker exec ${ash.arg(container)} sh -lc ${ash.arg(
          ash.render(ash`
            umask 077
            client_config=/tmp/appaloft-clickhouse-client.xml
            trap 'rm -f "$client_config"' EXIT
            printf '<config><user>%s</user><password>%s</password></config>\n' "$CLICKHOUSE_USER" "$CLICKHOUSE_PASSWORD" > "$client_config"
            clickhouse-client --config-file "$client_config" --query 'SELECT 1'
          `),
        )} >/dev/null 2>&1; then
          exit 0
        fi
        sleep 1
      done
      exit 1
    `,
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
    stdin: sensitiveInput(secretKey),
    command: ash`
      set -eu
      IFS= read -r APPALOFT_MANAGED_DEPENDENCY_PASSWORD
      ${transientEnvFileSetupScript(container)}
      ${ash.env("APPALOFT_MINIO_ACCESS_KEY", accessKey)}
      ${ash.env("APPALOFT_MINIO_CONTAINER", container)}
      printf 'MINIO_ROOT_PASSWORD=%s\n' "$APPALOFT_MANAGED_DEPENDENCY_PASSWORD" > "$APPALOFT_DEPENDENCY_ENV_FILE"
      ${provisionSetupScript(volume, input.dependencyResourceId, container)}
      docker run -d ${ash.list([
        ...commonDockerRunArgs(input.dependencyResourceId, container),
        "-e",
        `MINIO_ROOT_USER=${accessKey}`,
        "-v",
        `${volume}:/data`,
      ])} --env-file "$APPALOFT_DEPENDENCY_ENV_FILE" minio/minio:latest server /data --console-address :9001
      for attempt in $(seq 1 90); do
        if docker exec ${ash.arg(container)} sh -c ${ash.arg(
          "wget -q -O - http://127.0.0.1:9000/minio/health/ready >/dev/null 2>&1 || curl -fsS http://127.0.0.1:9000/minio/health/ready >/dev/null 2>&1",
        )}; then
          break
        fi
        sleep 1
      done
      MC_HOST_local="http://$APPALOFT_MINIO_ACCESS_KEY:$APPALOFT_MANAGED_DEPENDENCY_PASSWORD@$APPALOFT_MINIO_CONTAINER:9000"
      export MC_HOST_local
      docker run --rm ${ash.list([
        "--network",
        dockerNetworkName,
        "-e",
        "MC_HOST_local",
        "minio/mc:latest",
        "mb",
        "--ignore-existing",
        `local/${bucketName}`,
      ])} >/dev/null
    `,
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
    stdin: sensitiveInput(password),
    command: ash`
      set -eu
      IFS= read -r APPALOFT_MANAGED_DEPENDENCY_PASSWORD
      ${transientEnvFileSetupScript(container)}
      printf 'OPENSEARCH_INITIAL_ADMIN_PASSWORD=%s\n' "$APPALOFT_MANAGED_DEPENDENCY_PASSWORD" > "$APPALOFT_DEPENDENCY_ENV_FILE"
      ${provisionSetupScript(volume, input.dependencyResourceId, container)}
      docker run -d ${ash.list([
        ...commonDockerRunArgs(input.dependencyResourceId, container),
        "-e",
        "discovery.type=single-node",
        "-e",
        "plugins.security.disabled=true",
        "-v",
        `${volume}:/usr/share/opensearch/data`,
      ])} --env-file "$APPALOFT_DEPENDENCY_ENV_FILE" opensearchproject/opensearch:2
      for attempt in $(seq 1 120); do
        if docker exec ${ash.arg(container)} sh -c ${ash.arg(
          "curl -fsS http://127.0.0.1:9200/_cluster/health >/dev/null 2>&1",
        )}; then
          exit 0
        fi
        sleep 1
      done
      exit 1
    `,
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

function provisionSetupScript(
  volume: string,
  dependencyResourceId: string,
  container: string,
): AshScript {
  return ash`
    ${ensureNetworkCommand()}
    docker volume create ${ash.list([
      "--label",
      managedLabel,
      "--label",
      `appaloft.dependency-resource-id=${dependencyResourceId}`,
      volume,
    ])} >/dev/null
    docker rm -f ${ash.arg(container)} >/dev/null 2>&1 || true
  `;
}

function commonDockerRunArgs(dependencyResourceId: string, container: string): readonly string[] {
  return [
    "--name",
    container,
    "--network",
    dockerNetworkName,
    "--restart",
    "unless-stopped",
    "--label",
    managedLabel,
    "--label",
    `appaloft.dependency-resource-id=${dependencyResourceId}`,
  ];
}

function transientEnvFileSetupScript(container: string): AshScript {
  return ash`
    umask 077
    APPALOFT_DEPENDENCY_SECRET_DIR="$HOME/.appaloft/dependency-secrets"
    APPALOFT_DEPENDENCY_ENV_FILE="$APPALOFT_DEPENDENCY_SECRET_DIR"/${ash.arg(`${container}.env`)}
    mkdir -p "$APPALOFT_DEPENDENCY_SECRET_DIR"
    trap 'rm -f "$APPALOFT_DEPENDENCY_ENV_FILE"' EXIT
  `;
}

function sensitiveInput(...values: readonly string[]): Uint8Array {
  return new TextEncoder().encode(`${values.join("\n")}\n`);
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
