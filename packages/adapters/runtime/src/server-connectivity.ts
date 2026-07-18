import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type EdgeProxyProviderRegistry,
  type ExecutionContext,
  type ServerConnectivityCheck,
  type ServerConnectivityChecker,
  type ServerConnectivityResult,
} from "@appaloft/application";
import { ok, type DeploymentTargetState, type Result } from "@appaloft/core";
import {
  createEdgeProxyDiagnosticsPlanForSelection,
  proxyBootstrapOptionsFromEnv,
} from "./edge-proxy-plans";
import { runBufferedProcess, shellCommand } from "./buffered-process";

interface CommandRunnerResult {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}

type CommandRunner = (
  command: string,
  args: string[],
  timeoutMs: number,
) => Promise<CommandRunnerResult>;

interface ProcessCheckInput {
  name: string;
  command: string;
  args: string[];
  timeoutMs: number;
  successMessage: string;
  failureMessage: string;
  metadata?: Record<string, string>;
  runner: CommandRunner;
}

interface PreparedSshArgs {
  args: string[];
  cleanup(): void;
}

function hostForTcp(host: string): string {
  return host.includes("@") ? (host.split("@").pop() ?? host) : host;
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

function trimOutput(stdout: string | undefined, stderr: string | undefined): string {
  const output = `${String(stdout ?? "")}\n${String(stderr ?? "")}`.trim();
  return output.length > 0 ? output.slice(0, 240) : "";
}

function classifySshFailure(output: string): string {
  if (/network is unreachable|no route to host/i.test(output)) return "network-unreachable";
  if (/could not resolve hostname|name or service not known|nodename nor servname/i.test(output)) {
    return "host-resolution-failed";
  }
  if (/connection timed out|connection refused|operation timed out/i.test(output)) {
    return "host-unreachable";
  }
  if (/permission denied/i.test(output)) return "authentication-failed";
  if (/host key verification failed|remote host identification has changed/i.test(output)) {
    return "host-key-verification-failed";
  }
  return "ssh-failed";
}

async function processCheck(input: ProcessCheckInput): Promise<ServerConnectivityCheck> {
  const startedAt = Date.now();
  const result = await input.runner(input.command, input.args, input.timeoutMs);
  const durationMs = Date.now() - startedAt;
  const details = trimOutput(result.stdout, result.stderr);

  if (result.status === 0) {
    return {
      name: input.name,
      status: "passed",
      message: details ? `${input.successMessage}: ${details}` : input.successMessage,
      durationMs,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
  }

  return {
    name: input.name,
    status: "failed",
    message:
      result.error instanceof Error
        ? `${input.failureMessage}: ${result.error.message}`
        : details || input.failureMessage,
    durationMs,
    ...(input.metadata || input.command === "ssh"
      ? {
          metadata: {
            ...input.metadata,
            ...(input.command === "ssh"
              ? { failureKind: classifySshFailure(`${details}\n${result.error?.message ?? ""}`) }
              : {}),
          },
        }
      : {}),
  };
}

async function tcpCheck(input: {
  host: string;
  port: number;
  timeoutMs: number;
}): Promise<ServerConnectivityCheck> {
  const startedAt = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const socket = await Promise.race([
      Bun.connect({
        hostname: input.host,
        port: input.port,
        socket: {},
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("TCP connection timed out")), input.timeoutMs);
      }),
    ]);
    if (timeout) {
      clearTimeout(timeout);
    }
    socket.end();
    return {
      name: "tcp",
      status: "passed",
      message: `TCP connection to ${input.host}:${input.port} succeeded`,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (timeout) {
      clearTimeout(timeout);
    }
    return {
      name: "tcp",
      status: "failed",
      message:
        error instanceof Error
          ? `TCP connection to ${input.host}:${input.port} failed: ${error.message}`
          : `TCP connection to ${input.host}:${input.port} failed`,
      durationMs: Date.now() - startedAt,
    };
  }
}

function resolveOverallStatus(
  checks: readonly ServerConnectivityCheck[],
): ServerConnectivityResult["status"] {
  const activeChecks = checks.filter((check) => check.status !== "skipped");

  if (activeChecks.every((check) => check.status === "passed")) {
    return "healthy";
  }

  if (activeChecks.some((check) => check.name === "ssh" && check.status === "passed")) {
    return "degraded";
  }

  if (activeChecks.some((check) => check.name === "local-shell" && check.status === "passed")) {
    return "degraded";
  }

  return "unreachable";
}

function prepareSshArgs(server: DeploymentTargetState, remoteCommand: string): PreparedSshArgs {
  const credential = server.credential;
  let tempDir: string | undefined;
  let identityArgs: string[] = [];

  if (credential?.kind.value === "ssh-private-key" && credential.privateKey) {
    tempDir = mkdtempSync(join(tmpdir(), "appaloft-ssh-"));
    const identityFile = join(tempDir, "id_deployment_target");
    writeFileSync(
      identityFile,
      credential.privateKey.value.endsWith("\n")
        ? credential.privateKey.value
        : `${credential.privateKey.value}\n`,
      { mode: 0o600 },
    );
    chmodSync(identityFile, 0o600);
    identityArgs = ["-i", identityFile, "-o", "IdentitiesOnly=yes"];
  }

  return {
    args: [
      "-p",
      String(server.port.value),
      ...identityArgs,
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=5",
      "-o",
      "StrictHostKeyChecking=accept-new",
      hostWithUsername(server.host.value, credential?.username?.value),
      remoteCommand,
    ],
    cleanup(): void {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  };
}

async function sshProcessCheck(
  server: DeploymentTargetState,
  remoteCommand: string,
  input: Omit<ProcessCheckInput, "command" | "args">,
): Promise<ServerConnectivityCheck> {
  const prepared = prepareSshArgs(server, remoteCommand);
  try {
    return await processCheck({
      ...input,
      command: "ssh",
      args: prepared.args,
    });
  } finally {
    prepared.cleanup();
  }
}

async function shellProcessCheck(
  command: string,
  input: Omit<ProcessCheckInput, "command" | "args">,
): Promise<ServerConnectivityCheck> {
  return await processCheck({
    ...input,
    command: "sh",
    args: ["-lc", command],
  });
}

async function defaultCommandRunner(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<CommandRunnerResult> {
  const result = await runBufferedProcess({
    command: command === "sh" && args[0] === "-lc" && args[1] ? shellCommand(args[1]) : [command, ...args],
    timeoutMs,
  });
  return {
    status: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(result.error ? { error: result.error } : {}),
  };
}

function withProxyRepairMetadata(
  server: DeploymentTargetState,
  check: ServerConnectivityCheck,
): ServerConnectivityCheck {
  if (check.status !== "failed") {
    return check;
  }

  return {
    ...check,
    metadata: {
      ...check.metadata,
      repairCommand: `appaloft server proxy repair ${server.id.value}`,
    },
  };
}

export class RuntimeServerConnectivityChecker implements ServerConnectivityChecker {
  constructor(
    private readonly edgeProxyProviderRegistry?: EdgeProxyProviderRegistry,
    private readonly commandRunner: CommandRunner = defaultCommandRunner,
  ) {}

  private async edgeProxyChecks(
    context: ExecutionContext,
    server: DeploymentTargetState,
  ): Promise<ServerConnectivityCheck[]> {
    const proxyKind = server.edgeProxy?.kind.value;

    if (!proxyKind || proxyKind === "none") {
      return [
        {
          name: "edge-proxy",
          status: "skipped",
          message: "Edge proxy is disabled for this server",
          durationMs: 0,
        },
      ];
    }

    if (!this.edgeProxyProviderRegistry) {
      return [
        {
          name: "edge-proxy-provider",
          status: "skipped",
          message: "No edge proxy provider registry is available for diagnostics",
          durationMs: 0,
          metadata: {
            proxyKind,
          },
        },
      ];
    }

    const planResult = await createEdgeProxyDiagnosticsPlanForSelection({
      providerRegistry: this.edgeProxyProviderRegistry,
      context: {
        correlationId: context.requestId,
        server,
      },
      proxyKind,
      options: proxyBootstrapOptionsFromEnv(process.env),
    });

    if (planResult.isErr()) {
      return [
        {
          name: "edge-proxy-provider",
          status: "failed",
          message: planResult.error.message,
          durationMs: 0,
          metadata: {
            errorCode: planResult.error.code,
            proxyKind,
          },
        },
      ];
    }

    const plan = planResult.value;
    if (!plan) {
      return [
        {
          name: "edge-proxy-provider",
          status: "skipped",
          message: `No edge proxy diagnostics are required for ${proxyKind}`,
          durationMs: 0,
          metadata: {
            proxyKind,
          },
        },
      ];
    }

    if (server.providerKey.value !== "local-shell" && server.providerKey.value !== "generic-ssh") {
      return [
        {
          name: "edge-proxy-provider",
          status: "skipped",
          message: `No edge proxy diagnostic executor is registered for ${server.providerKey.value}`,
          durationMs: 0,
          metadata: {
            providerKey: plan.providerKey,
            proxyKind,
          },
        },
      ];
    }

    return await Promise.all(
      plan.checks.map(async (check) => {
        const input = {
          name: check.name,
          timeoutMs: check.timeoutMs,
          successMessage: check.successMessage,
          failureMessage: check.failureMessage,
          metadata: {
            providerKey: plan.providerKey,
            proxyKind,
            ...check.metadata,
          },
          runner: this.commandRunner,
        };

        const result =
          server.providerKey.value === "generic-ssh"
            ? await sshProcessCheck(server, check.command, input)
            : await shellProcessCheck(check.command, input);

        return withProxyRepairMetadata(server, result);
      }),
    );
  }

  private async dockerSwarmManagerChecks(
    server: DeploymentTargetState,
  ): Promise<ServerConnectivityCheck[]> {
    const metadata = {
      host: server.host.value,
      port: String(server.port.value),
      providerKey: server.providerKey.value,
      targetKind: server.targetKind.value,
    };
    const checks: ServerConnectivityCheck[] = [];

    checks.push(
      await sshProcessCheck(server, "printf appaloft-swarm-connectivity", {
        name: "ssh",
        timeoutMs: 8000,
        successMessage: "SSH connection to the Swarm manager succeeded",
        failureMessage: "SSH connection to the Swarm manager failed",
        metadata,
        runner: this.commandRunner,
      }),
    );
    checks.push(
      await sshProcessCheck(server, "docker version --format '{{.Server.Version}}'", {
        name: "docker",
        timeoutMs: 8000,
        successMessage: "Swarm manager Docker daemon is available",
        failureMessage: "Swarm manager Docker daemon is not available",
        metadata,
        runner: this.commandRunner,
      }),
    );
    checks.push(
      await sshProcessCheck(
        server,
        "state=$(docker info --format '{{.Swarm.LocalNodeState}} {{.Swarm.ControlAvailable}}'); test \"$state\" = 'active true' && printf '%s' \"$state\"",
        {
          name: "swarm-manager",
          timeoutMs: 8000,
          successMessage: "Docker Swarm manager control plane is active",
          failureMessage: "Docker Swarm manager control plane is not active",
          metadata,
          runner: this.commandRunner,
        },
      ),
    );
    checks.push(
      await sshProcessCheck(
        server,
        "docker info --format '{{range .Plugins.Network}}{{println .}}{{end}}' | grep -Fx overlay",
        {
          name: "swarm-overlay-network",
          timeoutMs: 8000,
          successMessage: "Docker overlay network driver is available",
          failureMessage: "Docker overlay network driver is not available",
          metadata,
          runner: this.commandRunner,
        },
      ),
    );

    const proxyKind = server.edgeProxy?.kind.value;
    checks.push(
      proxyKind && proxyKind !== "none"
        ? {
            name: "swarm-edge-proxy",
            status: "failed",
            message: `No Docker Swarm edge proxy readiness executor is registered for ${proxyKind}`,
            durationMs: 0,
            metadata: {
              providerKey: server.providerKey.value,
              proxyKind,
              targetKind: server.targetKind.value,
            },
          }
        : {
            name: "swarm-edge-proxy",
            status: "skipped",
            message: "Edge proxy is disabled for this Swarm target",
            durationMs: 0,
            metadata: {
              providerKey: server.providerKey.value,
              targetKind: server.targetKind.value,
            },
          },
    );

    return checks;
  }

  async test(
    context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
    },
  ): Promise<Result<ServerConnectivityResult>> {
    const { server } = input;
    const checks: ServerConnectivityCheck[] = [];

    if (server.providerKey.value === "local-shell") {
      checks.push({
        name: "local-shell",
        status: "passed",
        message: "Local command runner is available",
        durationMs: 0,
      });
      checks.push(
        await processCheck({
          name: "docker",
          command: "docker",
          args: ["version", "--format", "{{.Server.Version}}"],
          timeoutMs: 8000,
          successMessage: "Docker daemon is available",
          failureMessage: "Docker daemon is not available",
          runner: this.commandRunner,
        }),
      );
    } else if (server.providerKey.value === "generic-ssh") {
      checks.push(
        await sshProcessCheck(server, "printf appaloft-connectivity", {
          name: "ssh",
          timeoutMs: 8000,
          successMessage: "SSH connection succeeded",
          failureMessage: "SSH connection failed",
          metadata: {
            host: server.host.value,
            port: String(server.port.value),
          },
          runner: this.commandRunner,
        }),
      );
      checks.push(
        await sshProcessCheck(server, "docker version --format '{{.Server.Version}}'", {
          name: "docker",
          timeoutMs: 8000,
          successMessage: "Remote Docker daemon is available",
          failureMessage: "Remote Docker daemon is not available",
          metadata: {
            host: server.host.value,
            port: String(server.port.value),
          },
          runner: this.commandRunner,
        }),
      );
    } else if (server.providerKey.value === "docker-swarm") {
      checks.push(...(await this.dockerSwarmManagerChecks(server)));
    } else {
      checks.push(
        await tcpCheck({
          host: hostForTcp(server.host.value),
          port: server.port.value,
          timeoutMs: 5000,
        }),
      );
      checks.push({
        name: "provider-capability",
        status: "skipped",
        message: `No provider-specific connectivity probe is registered for ${server.providerKey.value}`,
        durationMs: 0,
      });
    }

    if (server.providerKey.value !== "docker-swarm") {
      checks.push(...(await this.edgeProxyChecks(context, server)));
    }

    return ok({
      serverId: server.id.value,
      name: server.name.value,
      host: server.host.value,
      port: server.port.value,
      providerKey: server.providerKey.value,
      checkedAt: new Date().toISOString(),
      status: resolveOverallStatus(checks),
      checks,
    });
  }
}
