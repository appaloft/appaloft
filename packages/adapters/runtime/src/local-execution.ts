import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import type { AppLogger, ExecutionBackend, ExecutionContext } from "@yundu/application";
import {
  DeploymentLogEntry,
  DeploymentPhaseValue,
  domainError,
  ErrorCodeText,
  ExecutionResult,
  ExecutionStatusValue,
  ExitCode,
  FinishedAt,
  LogLevelValue,
  MessageText,
  OccurredAt,
  err,
  ok,
  type Deployment,
  type Result,
  type RollbackPlan,
} from "@yundu/core";

type LogPhase = "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
type LogLevel = "debug" | "info" | "warn" | "error";

function phaseLog(
  phase: LogPhase,
  message: string,
  level: LogLevel = "info",
): DeploymentLogEntry {
  return DeploymentLogEntry.rehydrate({
    timestamp: OccurredAt.rehydrate(new Date().toISOString()),
    phase: DeploymentPhaseValue.rehydrate(phase),
    level: LogLevelValue.rehydrate(level),
    message: MessageText.rehydrate(message),
  });
}

function toLogs(
  phase: LogPhase,
  output: string,
  level: LogLevel,
): DeploymentLogEntry[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 50)
    .map((line) => phaseLog(phase, line, level));
}

function normalizeWorkingDirectory(locator: string): string {
  const resolved = resolve(locator);
  if (existsSync(resolved)) {
    return resolved;
  }

  return dirname(resolved);
}

function deploymentEnv(
  deployment: Deployment,
  port?: number,
): NodeJS.ProcessEnv {
  const state = deployment.toState();
  const env = {
    ...process.env,
    YUNDU_DEPLOYMENT_ID: state.id.value,
    YUNDU_PROJECT_ID: state.projectId.value,
    YUNDU_ENVIRONMENT_ID: state.environmentId.value,
  } as NodeJS.ProcessEnv;

  for (const variable of state.environmentSnapshot.variables) {
    env[variable.key] = variable.value;
  }

  if (port) {
    env.PORT = String(port);
  }

  return env;
}

async function reservePort(preferred?: number): Promise<number> {
  if (preferred) {
    return preferred;
  }

  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to reserve local port"));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(port);
      });
    });
    server.on("error", reject);
  });
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

function sanitizeName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}

function runSyncCommand(input: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
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
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    failed: result.status !== 0,
    ...(result.signal ? { reason: `terminated by signal ${result.signal}` } : {}),
  };
}

function killProcess(pid: string | undefined): void {
  if (!pid) {
    return;
  }

  try {
    process.kill(-Number(pid), "SIGTERM");
  } catch {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      // process may already be gone
    }
  }
}

export class LocalExecutionBackend implements ExecutionBackend {
  constructor(
    private readonly runtimeRoot: string,
    private readonly logger: AppLogger,
  ) {}

  private applyFailure(
    deployment: Deployment,
    input: {
      logs: DeploymentLogEntry[];
      errorCode: string;
      retryable?: boolean;
      metadata?: Record<string, string>;
    },
  ): { deployment: Deployment } {
    deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(1),
      status: ExecutionStatusValue.rehydrate("failed"),
      logs: input.logs,
      retryable: input.retryable ?? false,
      errorCode: ErrorCodeText.rehydrate(input.errorCode),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }));

    return { deployment };
  }

  private runtimeDirectory(deploymentId: string): string {
    return resolve(this.runtimeRoot, "local-deployments", deploymentId);
  }

  private async executeHostProcess(
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();
    const workdir =
      state.runtimePlan.execution.workingDirectory ?? normalizeWorkingDirectory(state.runtimePlan.source.locator);
    const runtimeDir = this.runtimeDirectory(state.id.value);
    const logPath = resolve(runtimeDir, "app.log");
    mkdirSync(runtimeDir, { recursive: true });

    const port = await reservePort(state.runtimePlan.execution.port);
    const env = deploymentEnv(deployment, port);
    const logs: DeploymentLogEntry[] = [
      phaseLog("plan", `Using local host-process execution in ${workdir}`),
    ];

    const maybeRun = (
      phase: LogPhase,
      command: string | undefined,
      label: string,
    ): boolean => {
      if (!command) {
        return true;
      }

      logs.push(phaseLog(phase, `${label}: ${command}`));
      const result = runSyncCommand({
        command,
        cwd: workdir,
        env,
      });
      logs.push(...toLogs(phase, result.stdout, "info"));
      logs.push(...toLogs(phase, result.stderr, "warn"));

      if (!result.failed) {
        return true;
      }

      logs.push(
        phaseLog(
          phase,
          result.reason
            ? `${label} failed: ${result.reason}`
            : `${label} failed with exit code ${result.exitCode}`,
          "error",
        ),
      );
      return false;
    };

    if (!maybeRun("package", state.runtimePlan.execution.installCommand, "Install command")) {
      return ok({
        deployment: this.applyFailure(deployment, {
          logs,
          errorCode: "local_install_failed",
          metadata: {
            workdir,
          },
        }).deployment,
      });
    }

    if (!maybeRun("package", state.runtimePlan.execution.buildCommand, "Build command")) {
      return ok({
        deployment: this.applyFailure(deployment, {
          logs,
          errorCode: "local_build_failed",
          metadata: {
            workdir,
          },
        }).deployment,
      });
    }

    const startCommand = state.runtimePlan.execution.startCommand;
    if (!startCommand) {
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog("deploy", "Start command is required for host-process execution", "error"),
          ],
          errorCode: "missing_start_command",
          metadata: {
            workdir,
          },
        }).deployment,
      });
    }

    logs.push(phaseLog("deploy", `Start command: ${startCommand}`));
    const stdoutFd = openSync(logPath, "a");
    const stderrFd = openSync(logPath, "a");
    const child = spawn(startCommand, {
      cwd: workdir,
      env,
      shell: true,
      detached: true,
      stdio: ["ignore", stdoutFd, stderrFd],
    });
    closeSync(stdoutFd);
    closeSync(stderrFd);
    child.unref();

    const healthPath = state.runtimePlan.execution.healthCheckPath ?? "/";
    const url = `http://127.0.0.1:${port}${healthPath}`;
    const health = await waitForHealth(url);

    if (!health.ok) {
      killProcess(String(child.pid));
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog(
              "verify",
              `Health check failed for ${url}${health.reason ? `: ${health.reason}` : ""}`,
              "error",
            ),
          ],
          errorCode: "local_health_check_failed",
          retryable: true,
          metadata: {
            workdir,
            logPath,
            pid: String(child.pid),
            port: String(port),
            url,
          },
        }).deployment,
      });
    }

    logs.push(phaseLog("verify", `Application is reachable at ${url}`));
    deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(0),
      status: ExecutionStatusValue.rehydrate("succeeded"),
      retryable: false,
      logs,
      metadata: {
        workdir,
        logPath,
        pid: String(child.pid),
        port: String(port),
        url,
      },
    }));
    return ok({ deployment });
  }

  private async executeDockerContainer(
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();
    const workdir =
      state.runtimePlan.execution.workingDirectory ?? normalizeWorkingDirectory(state.runtimePlan.source.locator);
    const port = await reservePort(state.runtimePlan.execution.port);
    const env = deploymentEnv(deployment, port);
    const logs: DeploymentLogEntry[] = [
      phaseLog("plan", `Using local docker-container execution in ${workdir}`),
    ];

    const dockerVersion = runSyncCommand({
      command: "docker version --format '{{.Server.Version}}'",
      cwd: workdir,
      env,
    });

    if (dockerVersion.failed) {
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog("deploy", "Docker is not available on the local machine", "error"),
          ],
          errorCode: "docker_unavailable",
          retryable: false,
        }).deployment,
      });
    }

    let image = state.runtimePlan.execution.image;
    const containerName = sanitizeName(`yundu-${state.id}`);

    if (state.runtimePlan.buildStrategy === "dockerfile") {
      image = sanitizeName(`yundu-image-${state.id}`);
      const dockerfilePath = state.runtimePlan.execution.dockerfilePath ?? "Dockerfile";
      logs.push(phaseLog("package", `docker build -t ${image} -f ${dockerfilePath} ${workdir}`));
      const build = runSyncCommand({
        command: `docker build -t ${image} -f ${dockerfilePath} ${workdir}`,
        cwd: workdir,
        env,
      });
      logs.push(...toLogs("package", build.stdout, "info"));
      logs.push(...toLogs("package", build.stderr, "warn"));

      if (build.failed || !image) {
        return ok({
          deployment: this.applyFailure(deployment, {
            logs: [
              ...logs,
              phaseLog("package", "Docker image build failed", "error"),
            ],
            errorCode: "docker_build_failed",
            retryable: true,
          }).deployment,
        });
      }
    }

    if (!image) {
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog("package", "Docker image is required for docker execution", "error"),
          ],
          errorCode: "missing_docker_image",
        }).deployment,
      });
    }

    runSyncCommand({
      command: `docker rm -f ${containerName}`,
      cwd: workdir,
      env,
    });

    const envFlags = Object.entries(env)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .filter(([key]) =>
        key === "PORT" || key.startsWith("YUNDU_") || state.environmentSnapshot.variables.some((variable) => variable.key === key),
      )
      .map(([key, value]) => `-e ${key}=${JSON.stringify(value)}`)
      .join(" ");
    const runCommand = `docker run -d --rm --name ${containerName} -p ${port}:${port} ${envFlags} ${image}`;
    logs.push(phaseLog("deploy", runCommand));
    const run = runSyncCommand({
      command: runCommand,
      cwd: workdir,
      env,
    });
    logs.push(...toLogs("deploy", run.stdout, "info"));
    logs.push(...toLogs("deploy", run.stderr, "warn"));

    if (run.failed) {
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog("deploy", "Docker container failed to start", "error"),
          ],
          errorCode: "docker_run_failed",
          retryable: true,
          metadata: {
            image,
            containerName,
            port: String(port),
          },
        }).deployment,
      });
    }

    const healthPath = state.runtimePlan.execution.healthCheckPath ?? "/";
    const url = `http://127.0.0.1:${port}${healthPath}`;
    const health = await waitForHealth(url);

    if (!health.ok) {
      runSyncCommand({
        command: `docker rm -f ${containerName}`,
        cwd: workdir,
        env,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog(
              "verify",
              `Container health check failed for ${url}${health.reason ? `: ${health.reason}` : ""}`,
              "error",
            ),
          ],
          errorCode: "docker_health_check_failed",
          retryable: true,
          metadata: {
            image,
            containerName,
            port: String(port),
            url,
          },
        }).deployment,
      });
    }

    logs.push(phaseLog("verify", `Container is reachable at ${url}`));
    deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(0),
      status: ExecutionStatusValue.rehydrate("succeeded"),
      retryable: false,
      logs,
      metadata: {
        image,
        containerName,
        port: String(port),
        url,
      },
    }));
    return ok({ deployment });
  }

  private async executeDockerCompose(
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();
    const workdir =
      state.runtimePlan.execution.workingDirectory ?? normalizeWorkingDirectory(state.runtimePlan.source.locator);
    const composeFile = state.runtimePlan.execution.composeFile ?? state.runtimePlan.source.locator;
    const env = deploymentEnv(deployment, state.runtimePlan.execution.port);
    const logs: DeploymentLogEntry[] = [
      phaseLog("plan", `Using local docker-compose-stack execution in ${workdir}`),
      phaseLog("deploy", `docker compose -f ${composeFile} up -d --build`),
    ];

    const up = runSyncCommand({
      command: `docker compose -f ${composeFile} up -d --build`,
      cwd: workdir,
      env,
    });
    logs.push(...toLogs("deploy", up.stdout, "info"));
    logs.push(...toLogs("deploy", up.stderr, "warn"));

    if (up.failed) {
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog("deploy", "Docker compose deployment failed", "error"),
          ],
          errorCode: "docker_compose_failed",
          retryable: true,
          metadata: {
            composeFile,
            workdir,
          },
        }).deployment,
      });
    }

    logs.push(phaseLog("verify", "Compose stack started successfully"));
    deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(0),
      status: ExecutionStatusValue.rehydrate("succeeded"),
      retryable: false,
      logs,
      metadata: {
        composeFile,
        workdir,
      },
    }));
    return ok({ deployment });
  }

  async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    void context;
    const state = deployment.toState();
    try {
      switch (state.runtimePlan.execution.kind) {
        case "host-process":
          return await this.executeHostProcess(deployment);
        case "docker-container":
          return await this.executeDockerContainer(deployment);
        case "docker-compose-stack":
          return await this.executeDockerCompose(deployment);
        default:
          return err(
            domainError.validation(
              `Unsupported local execution kind: ${state.runtimePlan.execution.kind}`,
            ),
          );
      }
    } catch (error) {
      this.logger.error("local_execution_backend.execute_failed", {
        deploymentId: state.id.value,
        message: error instanceof Error ? error.message : String(error),
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            phaseLog(
              "deploy",
              error instanceof Error ? error.message : "Unknown local execution error",
              "error",
            ),
          ],
          errorCode: "local_execution_failed",
          retryable: true,
        }).deployment,
      });
    }
  }

  async rollback(
    context: ExecutionContext,
    deployment: Deployment,
    plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    void context;
    void plan;
    const state = deployment.toState();
    const metadata = state.runtimePlan.execution.metadata ?? {};
    const env = deploymentEnv(deployment);
    const workdir =
      state.runtimePlan.execution.workingDirectory ?? normalizeWorkingDirectory(state.runtimePlan.source.locator);
    const logs: DeploymentLogEntry[] = [];

    try {
      switch (state.runtimePlan.execution.kind) {
        case "host-process":
          killProcess(metadata.pid);
          logs.push(phaseLog("rollback", metadata.pid ? `Stopped process ${metadata.pid}` : "No process id recorded"));
          break;
        case "docker-container":
          if (metadata.containerName) {
            runSyncCommand({
              command: `docker rm -f ${metadata.containerName}`,
              cwd: workdir,
              env,
            });
          }
          logs.push(
            phaseLog(
              "rollback",
              metadata.containerName
                ? `Removed container ${metadata.containerName}`
                : "No container metadata recorded",
            ),
          );
          break;
        case "docker-compose-stack":
          if (metadata.composeFile) {
            runSyncCommand({
              command: `docker compose -f ${metadata.composeFile} down`,
              cwd: workdir,
              env,
            });
          }
          logs.push(
            phaseLog(
              "rollback",
              metadata.composeFile
                ? `Stopped compose stack ${metadata.composeFile}`
                : "No compose metadata recorded",
            ),
          );
          break;
      }

      deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(0),
        status: ExecutionStatusValue.rehydrate("rolled-back"),
        retryable: false,
        logs,
      }));

      return ok({ deployment });
    } catch (error) {
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            phaseLog(
              "rollback",
              error instanceof Error ? error.message : "Unknown rollback error",
              "error",
            ),
          ],
          errorCode: "local_rollback_failed",
          retryable: true,
        }).deployment,
      });
    }
  }
}
