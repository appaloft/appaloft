import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ExecutionContext,
  type EdgeProxyProviderRegistry,
  type ServerEdgeProxyBootstrapper,
  type ServerEdgeProxyBootstrapResult,
} from "@appaloft/application";
import { ok, type DeploymentTargetState, type Result } from "@appaloft/core";
import {
  createEdgeProxyEnsurePlanForSelection,
  proxyBootstrapOptionsFromEnv,
} from "./edge-proxy-plans";
import { classifyEdgeProxyStartFailure } from "./edge-proxy-failure-classification";

interface CommandResult {
  failed: boolean;
  output: string;
}

interface PreparedSshArgs {
  args: string[];
  cleanup(): void;
}

function trimOutput(stdout: string | Buffer | undefined, stderr: string | Buffer | undefined): string {
  const output = `${String(stdout ?? "")}\n${String(stderr ?? "")}`.trim();
  return output.length > 0 ? output.slice(0, 480) : "";
}

function runLocalCommand(command: string): CommandResult {
  const result = spawnSync(command, {
    encoding: "utf8",
    shell: true,
    timeout: 30_000,
    env: process.env,
  });

  return {
    failed: result.status !== 0,
    output: trimOutput(result.stdout, result.stderr),
  };
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
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
      "ConnectTimeout=10",
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

function runSshCommand(server: DeploymentTargetState, command: string): CommandResult {
  const prepared = prepareSshArgs(server, command);
  try {
    const result = spawnSync("ssh", prepared.args, {
      encoding: "utf8",
      timeout: 30_000,
    });

    return {
      failed: result.status !== 0,
      output: trimOutput(result.stdout, result.stderr),
    };
  } finally {
    prepared.cleanup();
  }
}

function failedResult(input: {
  server: DeploymentTargetState;
  kind: ServerEdgeProxyBootstrapResult["kind"];
  attemptedAt: string;
  message: string;
  errorCode: string;
  metadata?: Record<string, string>;
  output?: string;
}): ServerEdgeProxyBootstrapResult {
  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.output ? { output: input.output } : {}),
  };

  return {
    serverId: input.server.id.value,
    kind: input.kind,
    status: "failed",
    attemptedAt: input.attemptedAt,
    message: input.message,
    errorCode: input.errorCode,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

export class RuntimeServerEdgeProxyBootstrapper implements ServerEdgeProxyBootstrapper {
  constructor(private readonly edgeProxyProviderRegistry: EdgeProxyProviderRegistry) {}

  async bootstrap(
    context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
    },
  ): Promise<Result<ServerEdgeProxyBootstrapResult>> {
    const { server } = input;
    const attemptedAt = new Date().toISOString();
    const kind = server.edgeProxy?.kind.value;

    if (!kind || kind === "none" || (kind !== "traefik" && kind !== "caddy")) {
      return ok(
        failedResult({
          server,
          kind: kind ?? "none",
          attemptedAt,
          message: "No supported edge proxy kind is configured",
          errorCode: "edge_proxy_kind_unsupported",
        }),
      );
    }

    const planResult = await createEdgeProxyEnsurePlanForSelection({
      providerRegistry: this.edgeProxyProviderRegistry,
      context: {
        correlationId: context.requestId,
        server,
      },
      proxyKind: kind,
      options: proxyBootstrapOptionsFromEnv(process.env),
    });
    if (planResult.isErr() || !planResult.value) {
      const error = planResult.isErr() ? planResult.error : undefined;
      return ok(
        failedResult({
          server,
          kind,
          attemptedAt,
          message: error?.message ?? "Edge proxy provider could not render an ensure plan",
          errorCode: error?.code ?? "proxy_provider_unavailable",
        }),
      );
    }

    const plan = planResult.value;
    const runCommand =
      server.providerKey.value === "local-shell"
        ? runLocalCommand
        : server.providerKey.value === "generic-ssh"
          ? (command: string) => runSshCommand(server, command)
          : undefined;

    if (!runCommand) {
      return ok(
        failedResult({
          server,
          kind,
          attemptedAt,
          message: `No edge proxy bootstrapper is registered for ${server.providerKey.value}`,
          errorCode: "edge_proxy_provider_unsupported",
        }),
      );
    }

    const network = runCommand(plan.networkCommand);
    if (network.failed) {
      return ok(
        failedResult({
          server,
          kind,
          attemptedAt,
          message: `${plan.displayName} edge proxy network could not be prepared`,
          errorCode: "edge_proxy_network_failed",
          output: network.output,
        }),
      );
    }

    const proxy = runCommand(plan.containerCommand);
    if (proxy.failed) {
      const failure = classifyEdgeProxyStartFailure({
        containerName: plan.containerName,
        defaultErrorCode: "edge_proxy_start_failed",
        defaultMessage: `${plan.displayName} edge proxy failed to start`,
        networkName: plan.networkName,
        output: proxy.output,
        providerKey: plan.providerKey,
        proxyKind: plan.proxyKind,
      });

      return ok(
        failedResult({
          server,
          kind,
          attemptedAt,
          message: failure.message,
          errorCode: failure.errorCode,
          metadata: failure.metadata,
          output: proxy.output,
        }),
      );
    }

    return ok({
      serverId: server.id.value,
      kind,
      status: "ready",
      attemptedAt,
        message: `${plan.displayName} edge proxy is ready`,
        metadata: {
          containerName: plan.containerName,
          networkName: plan.networkName,
          providerKey: plan.providerKey,
        },
      });
  }
}
