import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type DependencyResourceKind,
  type ExecutionContext,
  type ManagedDependencyResourceKind,
  type ManagedDependencySingleServerTarget,
  type ServerRepository,
  toRepositoryContext,
} from "@appaloft/application";
import { type AshScript, ash } from "@appaloft/ash";
import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";

const dockerSingleServerHandlePrefix = "docker-single-server:v1";
const dockerSingleServerBackupHandlePrefix = "docker-single-server-backup:v1";
const commandTimeoutMs = 120_000;

export const dockerNetworkName = "appaloft-edge";
export const managedLabel = "appaloft.managed=dependency-resource";
export const backupRoot = "$HOME/.appaloft/dependency-backups";

export interface DockerManagedDependencyServiceDefinition {
  kind: ManagedDependencyResourceKind;
  managedProviderKey: string;
  externalProviderKey: string;
  imageLabel: string;
  backupFileExtension: string;
}

export const dockerManagedDependencyServices = {
  postgres: {
    kind: "postgres",
    managedProviderKey: "appaloft-managed-postgres",
    externalProviderKey: "external-postgres",
    imageLabel: "postgres",
    backupFileExtension: "dump",
  },
  redis: {
    kind: "redis",
    managedProviderKey: "appaloft-managed-redis",
    externalProviderKey: "external-redis",
    imageLabel: "redis",
    backupFileExtension: "rdb",
  },
  mysql: {
    kind: "mysql",
    managedProviderKey: "appaloft-managed-mysql",
    externalProviderKey: "external-mysql",
    imageLabel: "mysql",
    backupFileExtension: "sql",
  },
  clickhouse: {
    kind: "clickhouse",
    managedProviderKey: "appaloft-managed-clickhouse",
    externalProviderKey: "external-clickhouse",
    imageLabel: "clickhouse",
    backupFileExtension: "tsv",
  },
  "object-storage": {
    kind: "object-storage",
    managedProviderKey: "appaloft-managed-object-storage",
    externalProviderKey: "external-object-storage",
    imageLabel: "minio",
    backupFileExtension: "tar",
  },
  opensearch: {
    kind: "opensearch",
    managedProviderKey: "appaloft-managed-opensearch",
    externalProviderKey: "external-opensearch",
    imageLabel: "opensearch",
    backupFileExtension: "snapshot",
  },
} satisfies Record<ManagedDependencyResourceKind, DockerManagedDependencyServiceDefinition>;

export interface ParsedDockerHandle {
  kind: ManagedDependencyResourceKind;
  serverId: string;
  containerName: string;
}

export interface ParsedDockerBackupHandle extends ParsedDockerHandle {
  backupId: string;
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export function serviceForKind(
  kind: DependencyResourceKind,
): DockerManagedDependencyServiceDefinition | undefined {
  if (!isManagedDependencyKind(kind)) {
    return undefined;
  }
  return dockerManagedDependencyServices[kind];
}

export function serviceForProvider(
  providerKey: string,
  kind: DependencyResourceKind,
): DockerManagedDependencyServiceDefinition | undefined {
  const definition = serviceForKind(kind);
  if (!definition) {
    return undefined;
  }
  if (
    definition.managedProviderKey === providerKey ||
    definition.externalProviderKey === providerKey
  ) {
    return definition;
  }
  return undefined;
}

export function safeDockerToken(input: string): string {
  const normalized = input
    .toLowerCase()
    .replaceAll(/[^a-z0-9_.-]/g, "-")
    .replaceAll(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  return normalized || "resource";
}

function shortDockerToken(input: string, maxLength: number): string {
  const token = safeDockerToken(input);
  return token.length <= maxLength ? token : token.slice(0, maxLength).replaceAll(/[-_.]+$/g, "");
}

export function containerName(
  definition: DockerManagedDependencyServiceDefinition,
  dependencyResourceId: string,
): string {
  return shortDockerToken(`appaloft-${definition.imageLabel}-${dependencyResourceId}`, 58);
}

export function volumeName(container: string): string {
  return shortDockerToken(`${container}-data`, 63);
}

export function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function dockerHandle(input: ParsedDockerHandle): string {
  return [dockerSingleServerHandlePrefix, input.kind, input.serverId, input.containerName].join(
    ":",
  );
}

export function parseDockerHandle(handle: string): ParsedDockerHandle | undefined {
  const [prefix, version, kind, serverId, container] = handle.split(":");
  if (
    `${prefix}:${version}` !== dockerSingleServerHandlePrefix ||
    !isManagedDependencyKind(kind) ||
    !serverId ||
    !container
  ) {
    return undefined;
  }
  return { kind, serverId, containerName: container };
}

export function backupHandle(input: ParsedDockerBackupHandle): string {
  return [
    dockerSingleServerBackupHandlePrefix,
    input.kind,
    input.serverId,
    input.containerName,
    input.backupId,
  ].join(":");
}

export function parseDockerBackupHandle(handle: string): ParsedDockerBackupHandle | undefined {
  const [prefix, version, kind, serverId, container, backupId] = handle.split(":");
  if (
    `${prefix}:${version}` !== dockerSingleServerBackupHandlePrefix ||
    !isManagedDependencyKind(kind) ||
    !serverId ||
    !container ||
    !backupId
  ) {
    return undefined;
  }
  return { kind, serverId, containerName: container, backupId };
}

export function backupPath(
  definition: DockerManagedDependencyServiceDefinition,
  input: ParsedDockerBackupHandle,
): string {
  return `${backupRoot}/${safeDockerToken(definition.kind)}/${safeDockerToken(input.containerName)}/${safeDockerToken(
    input.backupId,
  )}.${definition.backupFileExtension}`;
}

export function ensureNetworkCommand(): AshScript {
  return ash`
    docker network inspect ${ash.arg(dockerNetworkName)} >/dev/null 2>&1 || docker network create ${ash.arg(dockerNetworkName)}
  `;
}

export function commandFailure(input: {
  message: string;
  providerKey: string;
  operation: string;
  exitCode: number | null;
}): Result<never, DomainError> {
  return err(
    domainError.provider(input.message, {
      phase: "managed-dependency-docker-execution",
      providerKey: input.providerKey,
      operation: input.operation,
      exitCode: input.exitCode ?? -1,
    }),
  );
}

export async function runTargetCommand(
  target: ManagedDependencySingleServerTarget,
  command: AshScript,
  options: { stdin?: Uint8Array } = {},
): Promise<CommandResult> {
  const renderedCommand = ash.render(command);
  if (target.providerKey === "local-shell") {
    return spawnCommand(["sh", "-lc", renderedCommand], options);
  }

  const identity = target.privateKey ? writeSshIdentityFile(target.privateKey) : undefined;
  try {
    return await spawnCommand(
      [
        "ssh",
        ...sshArgs({
          target,
          remoteCommand: renderedCommand,
          ...(identity ? { identityFile: identity.identityFile } : {}),
        }),
      ],
      options,
    );
  } finally {
    identity?.cleanup();
  }
}

export async function requireTargetFromHandle(input: {
  context: ExecutionContext;
  serverRepository: ServerRepository;
  providerResourceHandle: string;
  operation: string;
}): Promise<Result<{ handle: ParsedDockerHandle; target: ManagedDependencySingleServerTarget }>> {
  const handle = parseDockerHandle(input.providerResourceHandle);
  if (!handle) {
    return err(
      domainError.providerCapabilityUnsupported("Provider resource handle is not Docker-backed", {
        phase: "managed-dependency-target-resolution",
        operation: input.operation,
      }),
    );
  }
  const target = await resolveSingleServerTarget({
    context: input.context,
    serverRepository: input.serverRepository,
    serverId: handle.serverId,
    operation: input.operation,
  });
  if (target.isErr()) {
    return err(target.error);
  }
  return ok({ handle, target: target.value });
}

export async function resolveSingleServerTarget(input: {
  context: ExecutionContext;
  serverRepository: ServerRepository;
  serverId: string;
  operation: string;
}): Promise<Result<ManagedDependencySingleServerTarget>> {
  const serverId = DeploymentTargetId.rehydrate(input.serverId);
  const server = await input.serverRepository.findOne(
    toRepositoryContext(input.context),
    DeploymentTargetByIdSpec.create(serverId),
  );
  if (!server) {
    return err(domainError.notFound("server", input.serverId));
  }
  const lifecycleGuard = server.ensureCanAcceptNewWork(input.operation);
  if (lifecycleGuard.isErr()) {
    return err(lifecycleGuard.error);
  }
  const state = server.toState();
  const providerKey = state.providerKey.value;
  if (state.targetKind.value !== "single-server") {
    return err(
      domainError.providerCapabilityUnsupported("Managed dependency target must be single-server", {
        phase: "managed-dependency-target-resolution",
        serverId: input.serverId,
        targetKind: state.targetKind.value,
        operation: input.operation,
      }),
    );
  }
  if (providerKey !== "local-shell" && providerKey !== "generic-ssh") {
    return err(
      domainError.providerCapabilityUnsupported(
        "Managed dependency target must use local-shell or generic-ssh",
        {
          phase: "managed-dependency-target-resolution",
          serverId: input.serverId,
          providerKey,
          operation: input.operation,
        },
      ),
    );
  }
  return ok({
    serverId: state.id.value,
    providerKey,
    targetKind: "single-server",
    host: state.host.value,
    port: state.port.value,
    ...(state.credential?.username ? { username: state.credential.username.value } : {}),
    ...(state.credential?.privateKey ? { privateKey: state.credential.privateKey.value } : {}),
  });
}

function isManagedDependencyKind(
  input: string | undefined,
): input is ManagedDependencyResourceKind {
  return (
    input === "postgres" ||
    input === "redis" ||
    input === "mysql" ||
    input === "clickhouse" ||
    input === "object-storage" ||
    input === "opensearch"
  );
}

async function spawnCommand(
  args: string[],
  options: { stdin?: Uint8Array } = {},
): Promise<CommandResult> {
  const child = Bun.spawn(args, {
    env: process.env,
    ...(options.stdin ? { stdin: options.stdin } : {}),
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeout = setTimeout(() => child.kill(), commandTimeoutMs);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  } finally {
    clearTimeout(timeout);
  }
}

function writeSshIdentityFile(privateKey: string): {
  identityFile: string;
  cleanup(): void;
} {
  const sshDir = mkdtempSync(join(tmpdir(), "appaloft-managed-dependency-ssh-"));
  const identityFile = join(sshDir, "id_managed_dependency");
  writeFileSync(identityFile, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, {
    mode: 0o600,
  });
  chmodSync(identityFile, 0o600);
  return {
    identityFile,
    cleanup: () => rmSync(sshDir, { recursive: true, force: true }),
  };
}

function sshArgs(input: {
  target: ManagedDependencySingleServerTarget;
  remoteCommand: string;
  identityFile?: string;
}): string[] {
  return [
    "-p",
    String(input.target.port),
    ...(input.identityFile ? ["-i", input.identityFile, "-o", "IdentitiesOnly=yes"] : []),
    "-o",
    "BatchMode=yes",
    "-o",
    "PreferredAuthentications=publickey",
    "-o",
    "PasswordAuthentication=no",
    "-o",
    "KbdInteractiveAuthentication=no",
    "-o",
    "NumberOfPasswordPrompts=0",
    "-o",
    "StrictHostKeyChecking=accept-new",
    hostWithUsername(input.target.host, input.target.username),
    input.remoteCommand,
  ];
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}
