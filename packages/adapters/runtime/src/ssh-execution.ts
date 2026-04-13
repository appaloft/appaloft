import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  deploymentProgressSteps,
  type AppLogger,
  type DeploymentProgressReporter,
  type ExecutionBackend,
  type ExecutionContext,
  type IntegrationAuthPort,
  type ServerRepository,
  reportDeploymentProgress,
  toRepositoryContext,
} from "@yundu/application";
import {
  DeploymentLogEntry,
  DeploymentLogSourceValue,
  DeploymentPhaseValue,
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  ErrorCodeText,
  ExecutionResult,
  ExecutionStatusValue,
  ExitCode,
  FinishedAt,
  LogLevelValue,
  MessageText,
  OccurredAt,
  domainError,
  err,
  ok,
  type Deployment,
  type Result,
  type RollbackPlan,
} from "@yundu/core";
import {
  createProxyBootstrapPlan,
  dockerNetworkFlagForAccessRoutes,
} from "./proxy-bootstrap";
import { dockerLabelFlagsForAccessRoutes } from "./proxy-labels";

type LogPhase = "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
type LogLevel = "debug" | "info" | "warn" | "error";
type LogSource = "yundu" | "application";

function phaseLog(
  phase: LogPhase,
  message: string,
  level: LogLevel = "info",
  source: LogSource = "yundu",
): DeploymentLogEntry {
  return DeploymentLogEntry.rehydrate({
    timestamp: OccurredAt.rehydrate(new Date().toISOString()),
    source: DeploymentLogSourceValue.rehydrate(source),
    phase: DeploymentPhaseValue.rehydrate(phase),
    level: LogLevelValue.rehydrate(level),
    message: MessageText.rehydrate(message),
  });
}

function sanitizeName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function redactSecrets(input: string, secrets: readonly string[] = []): string {
  return secrets.reduce(
    (text, secret) => (secret.length > 0 ? text.replaceAll(secret, "[redacted]") : text),
    input,
  );
}

function normalizeWorkingDirectory(locator: string): string {
  const resolved = resolve(locator);
  if (existsSync(resolved)) {
    return resolved;
  }

  return dirname(resolved);
}

function normalizeDockerImage(locator: string): string {
  return locator.replace(/^docker:\/\//, "").replace(/^image:\/\//, "");
}

function isGitHubHttpsLocator(locator: string): boolean {
  try {
    const parsed = new URL(locator);
    return parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "github.com";
  } catch {
    return false;
  }
}

function withGitHubAccessToken(locator: string, accessToken: string): string {
  const parsed = new URL(locator);
  parsed.username = "x-access-token";
  parsed.password = accessToken;
  return parsed.toString();
}

function hostForHealthCheck(sshHost: string): string {
  return sshHost.includes("@") ? (sshHost.split("@").pop() ?? sshHost) : sshHost;
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

async function waitForHealth(url: string): Promise<{ ok: boolean; reason?: string }> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return { ok: true };
      }
    } catch (error) {
      if (attempt === 39) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message : "unknown fetch error",
        };
      }
    }

    await Bun.sleep(250);
  }

  return { ok: false, reason: "health check timed out" };
}

function runSyncProcess(input: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
}): {
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
  reason?: string;
} {
  const result = spawnSync(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    encoding: "utf8",
  });

  return {
    exitCode: result.status ?? 1,
    stdout: redactSecrets(result.stdout ?? "", input.redactions),
    stderr: redactSecrets(result.stderr ?? "", input.redactions),
    failed: result.status !== 0,
    ...(result.signal ? { reason: `terminated by signal ${result.signal}` } : {}),
    ...(result.error ? { reason: result.error.message } : {}),
  };
}

function runSyncShell(input: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
}): {
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
  reason?: string;
} {
  const result = spawnSync(input.command, {
    cwd: input.cwd,
    env: input.env,
    shell: true,
    encoding: "utf8",
  });

  return {
    exitCode: result.status ?? 1,
    stdout: redactSecrets(result.stdout ?? "", input.redactions),
    stderr: redactSecrets(result.stderr ?? "", input.redactions),
    failed: result.status !== 0,
    ...(result.signal ? { reason: `terminated by signal ${result.signal}` } : {}),
  };
}

function deploymentEnv(deployment: Deployment, port?: number): NodeJS.ProcessEnv {
  const state = deployment.toState();
  const env = {
    ...process.env,
    YUNDU_DEPLOYMENT_ID: state.id.value,
    YUNDU_PROJECT_ID: state.projectId.value,
    YUNDU_ENVIRONMENT_ID: state.environmentId.value,
    YUNDU_RESOURCE_ID: state.resourceId.value,
    YUNDU_DESTINATION_ID: state.destinationId.value,
  } as NodeJS.ProcessEnv;

  for (const variable of state.environmentSnapshot.variables) {
    env[variable.key] = variable.value;
  }

  if (port) {
    env.PORT = String(port);
  }

  return env;
}

interface SshTarget {
  host: string;
  port: string;
  identityFile?: string;
}

interface PreparedSshSource {
  kind: "workspace" | "image";
  metadata: Record<string, string>;
  remoteWorkdir?: string;
  image?: string;
}

export class SshExecutionBackend implements ExecutionBackend {
  constructor(
    private readonly runtimeRoot: string,
    private readonly logger: AppLogger,
    private readonly progressReporter: DeploymentProgressReporter,
    private readonly integrationAuthPort?: IntegrationAuthPort,
    private readonly serverRepository?: ServerRepository,
  ) {}

  private report(
    context: ExecutionContext,
    input: {
      deploymentId: string;
      phase: LogPhase;
      message: string;
      level?: LogLevel;
      source?: LogSource;
      status?: "running" | "succeeded" | "failed";
      stream?: "stdout" | "stderr";
    },
  ): void {
    reportDeploymentProgress(this.progressReporter, context, {
      deploymentId: input.deploymentId,
      phase: input.phase,
      message: input.message,
      ...(input.level ? { level: input.level } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.stream ? { stream: input.stream } : {}),
      step: deploymentProgressSteps[input.phase],
    });
  }

  private runtimeDirectory(deploymentId: string): string {
    return resolve(this.runtimeRoot, "ssh-deployments", deploymentId);
  }

  private pushCommandOutput(
    logs: DeploymentLogEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      phase: LogPhase;
      output: string;
      level: LogLevel;
      stream: "stdout" | "stderr";
      redactions?: readonly string[];
    },
  ): void {
    for (const line of redactSecrets(input.output, input.redactions)
      .split(/\r?\n/)
      .map((outputLine) => outputLine.trim())
      .filter((outputLine) => outputLine.length > 0)
      .slice(0, 50)) {
      this.report(input.context, {
        deploymentId: input.deploymentId,
        phase: input.phase,
        source: "application",
        level: input.level,
        message: line,
        stream: input.stream,
      });
      logs.push(phaseLog(input.phase, line, input.level, "application"));
    }
  }

  private applyFailure(
    deployment: Deployment,
    input: {
      logs: DeploymentLogEntry[];
      errorCode: string;
      retryable?: boolean;
      metadata?: Record<string, string>;
    },
  ): Deployment {
    deployment.applyExecutionResult(
      FinishedAt.rehydrate(new Date().toISOString()),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(1),
        status: ExecutionStatusValue.rehydrate("failed"),
        logs: input.logs,
        retryable: input.retryable ?? false,
        errorCode: ErrorCodeText.rehydrate(input.errorCode),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }),
    );
    return deployment;
  }

  private writePrivateKey(runtimeDir: string, privateKey: string): string {
    const sshDir = resolve(runtimeDir, "ssh");
    const identityFile = resolve(sshDir, "id_deployment_target");
    mkdirSync(sshDir, { recursive: true });
    writeFileSync(identityFile, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, {
      mode: 0o600,
    });
    chmodSync(identityFile, 0o600);
    return identityFile;
  }

  private cleanupPrivateKey(target: SshTarget): void {
    if (target.identityFile) {
      rmSync(dirname(target.identityFile), { recursive: true, force: true });
    }
  }

  private async targetFor(
    context: ExecutionContext,
    deployment: Deployment,
    runtimeDir: string,
  ): Promise<Result<SshTarget>> {
    const state = deployment.toState();
    const planTarget = state.runtimePlan.target;
    const metadata = planTarget.metadata ?? {};
    let host = metadata.serverHost;
    let port = metadata.serverPort ?? "22";
    let username: string | undefined;
    let identityFile: string | undefined;

    const serverId = planTarget.serverIds[0];
    if (this.serverRepository && serverId) {
      const server = await this.serverRepository.findOne(
        toRepositoryContext(context),
        DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate(serverId)),
      );
      const serverState = server?.toState();

      if (serverState) {
        host = serverState.host.value;
        port = String(serverState.port.value);
        username = serverState.credential?.username?.value;
        if (
          serverState.credential?.kind.value === "ssh-private-key" &&
          serverState.credential.privateKey
        ) {
          identityFile = this.writePrivateKey(runtimeDir, serverState.credential.privateKey.value);
        }
      }
    }

    if (!host) {
      return err(domainError.validation("SSH deployment target is missing server host metadata"));
    }

    return ok({
      host: hostWithUsername(host, username),
      port,
      ...(identityFile ? { identityFile } : {}),
    });
  }

  private sshArgs(target: SshTarget): string[] {
    return [
      "-p",
      target.port,
      ...(target.identityFile
        ? ["-i", target.identityFile, "-o", "IdentitiesOnly=yes"]
        : []),
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      target.host,
    ];
  }

  private runRemoteCommand(input: {
    target: SshTarget;
    command: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
  }) {
    return runSyncProcess({
      command: "ssh",
      args: [...this.sshArgs(input.target), input.command],
      cwd: input.cwd,
      env: input.env,
    });
  }

  private async prepareSshSource(
    context: ExecutionContext,
    deployment: Deployment,
    logs: DeploymentLogEntry[],
    input: {
      runtimeDir: string;
      remoteRoot: string;
      target: SshTarget;
      env: NodeJS.ProcessEnv;
    },
  ): Promise<
    | { prepared: true; source: PreparedSshSource }
    | { prepared: false; deployment: Deployment }
  > {
    const state = deployment.toState();
    const source = state.runtimePlan.source;

    if (state.runtimePlan.buildStrategy === "prebuilt-image" || source.kind === "docker-image") {
      return {
        prepared: true,
        source: {
          kind: "image",
          image: state.runtimePlan.execution.image ?? normalizeDockerImage(source.locator),
          metadata: {
            sourceStrategy: "prebuilt-image",
          },
        },
      };
    }

    let localWorkdir =
      state.runtimePlan.execution.workingDirectory ?? normalizeWorkingDirectory(source.locator);
    const remoteWorkdir = `${input.remoteRoot}/source`;

    if (source.kind === "remote-git") {
      const sourceDir = resolve(input.runtimeDir, "source");
      mkdirSync(input.runtimeDir, { recursive: true });
      rmSync(sourceDir, { recursive: true, force: true });

      const accessToken = isGitHubHttpsLocator(source.locator)
        ? await this.integrationAuthPort?.getProviderAccessToken(context, "github")
        : null;
      const cloneLocator = accessToken
        ? withGitHubAccessToken(source.locator, accessToken)
        : source.locator;
      logs.push(phaseLog("package", `Clone remote git source into ${sourceDir}`));
      this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "running",
        message: `Clone remote git source ${source.displayName}`,
      });
      const clone = runSyncProcess({
        command: "git",
        args: ["clone", "--depth", "1", cloneLocator, sourceDir],
        cwd: input.runtimeDir,
        env: input.env,
        redactions: accessToken ? [accessToken, cloneLocator] : [cloneLocator],
      });
      this.pushCommandOutput(logs, {
        context,
        deploymentId: state.id.value,
        phase: "package",
        output: clone.stderr,
        level: "warn",
        stream: "stderr",
        redactions: accessToken ? [accessToken, cloneLocator] : [cloneLocator],
      });

      if (clone.failed) {
        const message = clone.reason
          ? `Remote git clone failed: ${clone.reason}`
          : `Remote git clone failed with exit code ${clone.exitCode}`;
        logs.push(phaseLog("package", message, "error"));
        return {
          prepared: false,
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "remote_git_clone_failed",
            retryable: true,
            metadata: {
              source: source.locator,
              sourceDir,
            },
          }),
        };
      }

      localWorkdir = sourceDir;
    }

    if (!existsSync(localWorkdir)) {
      const message = `Source working directory does not exist: ${localWorkdir}`;
      logs.push(phaseLog("package", message, "error"));
      return {
        prepared: false,
        deployment: this.applyFailure(deployment, {
          logs,
          errorCode: "source_workdir_missing",
          retryable: false,
          metadata: {
            localWorkdir,
          },
        }),
      };
    }

    logs.push(phaseLog("package", `Upload source workspace to ${input.target.host}:${remoteWorkdir}`));
    this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "running",
      message: "Upload source workspace over SSH",
    });
    const remotePrepareCommand = `rm -rf ${shellQuote(remoteWorkdir)} && mkdir -p ${shellQuote(remoteWorkdir)} && tar -xzf - -C ${shellQuote(remoteWorkdir)}`;
    const uploadCommand = [
      "tar",
      "-czf",
      "-",
      "-C",
      shellQuote(localWorkdir),
      ".",
      "|",
      "ssh",
      ...this.sshArgs(input.target).map((arg) => shellQuote(arg)),
      shellQuote(remotePrepareCommand),
    ].join(" ");
    const upload = runSyncShell({
      command: uploadCommand,
      cwd: input.runtimeDir,
      env: input.env,
    });
    this.pushCommandOutput(logs, {
      context,
      deploymentId: state.id.value,
      phase: "package",
      output: upload.stderr,
      level: "warn",
      stream: "stderr",
    });

    if (upload.failed) {
      const message = upload.reason
        ? `Source upload failed: ${upload.reason}`
        : `Source upload failed with exit code ${upload.exitCode}`;
      logs.push(phaseLog("package", message, "error"));
      return {
        prepared: false,
        deployment: this.applyFailure(deployment, {
          logs,
          errorCode: "ssh_source_upload_failed",
          retryable: true,
          metadata: {
            localWorkdir,
            remoteWorkdir,
          },
        }),
      };
    }

    this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "succeeded",
      message: "Remote source workspace is ready",
    });

    return {
      prepared: true,
      source: {
        kind: "workspace",
        remoteWorkdir,
        metadata: {
          sourceStrategy: source.kind === "remote-git" ? "remote-git" : "local-workspace",
          remoteWorkdir,
        },
      },
    };
  }

  async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();

    if (state.runtimePlan.execution.kind !== "docker-container") {
      return err(
        domainError.validation(
          `SSH execution currently supports docker-container plans only, got ${state.runtimePlan.execution.kind}`,
        ),
      );
    }

    const runtimeDir = this.runtimeDirectory(state.id.value);
    mkdirSync(runtimeDir, { recursive: true });

    const targetResult = await this.targetFor(context, deployment, runtimeDir);
    if (targetResult.isErr()) {
      return targetResult.map(() => ({ deployment }));
    }
    const target = targetResult._unsafeUnwrap();
    const remoteRoot = `/tmp/yundu-deployments/${sanitizeName(state.id.value)}`;

    const port = state.runtimePlan.execution.port ?? 3000;
    const env = deploymentEnv(deployment, port);
    const logs: DeploymentLogEntry[] = [
      phaseLog("plan", `Using SSH docker-container execution on ${target.host}:${target.port}`),
    ];

    try {
      const prepared = await this.prepareSshSource(context, deployment, logs, {
        runtimeDir,
        remoteRoot,
        target,
        env,
      });

      if (!prepared.prepared) {
        return ok({ deployment: prepared.deployment });
      }

      const dockerVersion = this.runRemoteCommand({
        target,
        command: "docker version --format '{{.Server.Version}}'",
        cwd: runtimeDir,
        env,
      });

      if (dockerVersion.failed) {
        const message = "Docker is not available on the SSH target";
        logs.push(phaseLog("package", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "ssh_docker_unavailable",
            retryable: false,
            metadata: {
              host: target.host,
            },
          }),
        });
      }

      let image = prepared.source.image ?? state.runtimePlan.execution.image;
      const containerName = sanitizeName(`yundu-${state.id.value}`);

      if (state.runtimePlan.buildStrategy === "dockerfile") {
        image = sanitizeName(`yundu-image-${state.id.value}`);
        const dockerfilePath = state.runtimePlan.execution.dockerfilePath ?? "Dockerfile";
        const remoteWorkdir = prepared.source.remoteWorkdir;
        if (!remoteWorkdir) {
          return err(domainError.validation("Dockerfile SSH deployment requires a remote workdir"));
        }

        const buildCommand = `cd ${shellQuote(remoteWorkdir)} && docker build -t ${shellQuote(image)} -f ${shellQuote(dockerfilePath)} .`;
        logs.push(phaseLog("package", `Build Docker image ${image} on SSH target`));
        this.report(context, {
          deploymentId: state.id.value,
          phase: "package",
          status: "running",
          message: `Build image ${image}`,
        });
        const build = this.runRemoteCommand({
          target,
          command: buildCommand,
          cwd: runtimeDir,
          env,
        });
        this.pushCommandOutput(logs, {
          context,
          deploymentId: state.id.value,
          phase: "package",
          output: build.stdout,
          level: "info",
          stream: "stdout",
        });
        this.pushCommandOutput(logs, {
          context,
          deploymentId: state.id.value,
          phase: "package",
          output: build.stderr,
          level: "warn",
          stream: "stderr",
        });

        if (build.failed) {
          const message = "SSH Docker image build failed";
          logs.push(phaseLog("package", message, "error"));
          return ok({
            deployment: this.applyFailure(deployment, {
              logs,
              errorCode: "ssh_docker_build_failed",
              retryable: true,
              metadata: {
                host: target.host,
                remoteWorkdir,
              },
            }),
          });
        }
      }

      if (!image) {
        return err(domainError.validation("Docker image is required for SSH docker execution"));
      }

      const accessRoutes = state.runtimePlan.execution.accessRoutes ?? [];
      const proxyBootstrap = createProxyBootstrapPlan(accessRoutes);
      if (proxyBootstrap) {
        const proxyMessage = `Ensure ${proxyBootstrap.displayName} edge proxy on Docker network ${proxyBootstrap.networkName}`;
        logs.push(phaseLog("deploy", proxyMessage));
        this.report(context, {
          deploymentId: state.id.value,
          phase: "deploy",
          status: "running",
          message: proxyMessage,
        });

        const network = this.runRemoteCommand({
          target,
          command: proxyBootstrap.networkCommand,
          cwd: runtimeDir,
          env,
        });
        this.pushCommandOutput(logs, {
          context,
          deploymentId: state.id.value,
          phase: "deploy",
          output: network.stdout,
          level: "info",
          stream: "stdout",
        });
        this.pushCommandOutput(logs, {
          context,
          deploymentId: state.id.value,
          phase: "deploy",
          output: network.stderr,
          level: "warn",
          stream: "stderr",
        });

        const proxy = this.runRemoteCommand({
          target,
          command: proxyBootstrap.containerCommand,
          cwd: runtimeDir,
          env,
        });
        this.pushCommandOutput(logs, {
          context,
          deploymentId: state.id.value,
          phase: "deploy",
          output: proxy.stdout,
          level: "info",
          stream: "stdout",
        });
        this.pushCommandOutput(logs, {
          context,
          deploymentId: state.id.value,
          phase: "deploy",
          output: proxy.stderr,
          level: "warn",
          stream: "stderr",
        });

        if (network.failed || proxy.failed) {
          const message = `${proxyBootstrap.displayName} edge proxy failed to start`;
          logs.push(phaseLog("deploy", message, "error"));
          return ok({
            deployment: this.applyFailure(deployment, {
              logs,
              errorCode: "ssh_edge_proxy_start_failed",
              retryable: true,
              metadata: {
                host: target.host,
                proxyKind: proxyBootstrap.kind,
                containerName: proxyBootstrap.containerName,
                networkName: proxyBootstrap.networkName,
              },
            }),
          });
        }

        this.report(context, {
          deploymentId: state.id.value,
          phase: "deploy",
          status: "succeeded",
          message: `${proxyBootstrap.displayName} edge proxy is ready`,
        });
      }

      const envFlags = Object.entries(env)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .filter(
          ([key]) =>
            key === "PORT" ||
            key.startsWith("YUNDU_") ||
            state.environmentSnapshot.variables.some((variable) => variable.key === key),
        )
        .map(([key, value]) => `-e ${shellQuote(`${key}=${value}`)}`)
        .join(" ");
      const labelFlags = dockerLabelFlagsForAccessRoutes({
        deploymentId: state.id.value,
        port,
        accessRoutes,
        quote: shellQuote,
      });
      const networkFlag = dockerNetworkFlagForAccessRoutes(accessRoutes);
      const runCommand = [
        `docker rm -f ${shellQuote(containerName)} >/dev/null 2>&1 || true`,
        [
          `docker run -d --rm --name ${shellQuote(containerName)}`,
          networkFlag,
          `-p ${port}:${port}`,
          envFlags,
          labelFlags,
          shellQuote(image),
        ]
          .filter(Boolean)
          .join(" "),
      ].join(" && ");
      logs.push(phaseLog("deploy", `Start SSH container ${containerName}`));
      const run = this.runRemoteCommand({
        target,
        command: runCommand,
        cwd: runtimeDir,
        env,
      });
      this.pushCommandOutput(logs, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        output: run.stdout,
        level: "info",
        stream: "stdout",
      });
      this.pushCommandOutput(logs, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        output: run.stderr,
        level: "warn",
        stream: "stderr",
      });

      if (run.failed) {
        const message = "SSH Docker container failed to start";
        logs.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "ssh_docker_run_failed",
            retryable: true,
            metadata: {
              host: target.host,
              image,
              containerName,
            },
          }),
        });
      }

      const healthPath = state.runtimePlan.execution.healthCheckPath ?? "/";
      const url = `http://${hostForHealthCheck(target.host)}:${port}${healthPath}`;
      this.report(context, {
        deploymentId: state.id.value,
        phase: "verify",
        status: "running",
        message: `Checking ${url}`,
      });
      const health = await waitForHealth(url);

      if (!health.ok) {
        this.runRemoteCommand({
          target,
          command: `docker rm -f ${shellQuote(containerName)}`,
          cwd: runtimeDir,
          env,
        });
        const message = `SSH container health check failed for ${url}${health.reason ? `: ${health.reason}` : ""}`;
        logs.push(phaseLog("verify", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "ssh_docker_health_check_failed",
            retryable: true,
            metadata: {
              host: target.host,
              image,
              containerName,
              port: String(port),
              url,
              ...prepared.source.metadata,
            },
          }),
        });
      }

      const message = `SSH container is reachable at ${url}`;
      logs.push(phaseLog("verify", message));
      deployment.applyExecutionResult(
        FinishedAt.rehydrate(new Date().toISOString()),
        ExecutionResult.rehydrate({
          exitCode: ExitCode.rehydrate(0),
          status: ExecutionStatusValue.rehydrate("succeeded"),
          retryable: false,
          logs,
          metadata: {
            host: target.host,
            image,
            containerName,
            port: String(port),
            url,
            ...prepared.source.metadata,
          },
        }),
      );

      return ok({ deployment });
    } catch (error) {
      if (context.entrypoint !== "cli") {
        this.logger.error("ssh_execution_backend.execute_failed", {
          deploymentId: state.id.value,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            phaseLog(
              "deploy",
              error instanceof Error ? error.message : "Unknown SSH execution error",
              "error",
            ),
          ],
          errorCode: "ssh_execution_failed",
          retryable: true,
        }),
      });
    } finally {
      this.cleanupPrivateKey(target);
    }
  }

  async rollback(
    context: ExecutionContext,
    deployment: Deployment,
    plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    void plan;
    const state = deployment.toState();
    const metadata = state.runtimePlan.execution.metadata ?? {};
    const runtimeDir = this.runtimeDirectory(state.id.value);
    mkdirSync(runtimeDir, { recursive: true });

    const targetResult = await this.targetFor(context, deployment, runtimeDir);
    if (targetResult.isErr()) {
      return targetResult.map(() => ({ deployment }));
    }

    const target = targetResult._unsafeUnwrap();
    const logs: DeploymentLogEntry[] = [];
    const env = deploymentEnv(deployment);

    try {
      if (metadata.containerName) {
        this.runRemoteCommand({
          target,
          command: `docker rm -f ${shellQuote(metadata.containerName)}`,
          cwd: runtimeDir,
          env,
        });
      }
    } finally {
      this.cleanupPrivateKey(target);
    }

    logs.push(
      phaseLog(
        "rollback",
        metadata.containerName
          ? `Removed SSH container ${metadata.containerName}`
          : "No SSH container metadata recorded",
      ),
    );
    deployment.applyExecutionResult(
      FinishedAt.rehydrate(new Date().toISOString()),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(0),
        status: ExecutionStatusValue.rehydrate("rolled-back"),
        retryable: false,
        logs,
      }),
    );
    this.report(context, {
      deploymentId: state.id.value,
      phase: "rollback",
      status: "succeeded",
      message: "SSH rollback completed",
    });

    return ok({ deployment });
  }
}
