import { createPrivateKey } from "node:crypto";

import { ash } from "@appaloft/ash";
import { type DeploymentTargetState, type DomainError, domainError, err, ok, type Result } from "@appaloft/core";

import {
  type CertificateRouteRuntime,
  type CertificateRouteRuntimeActivationInput,
  type CertificateRouteRuntimeRollbackInput,
} from "./docker-certificate-route-activator";

const certificateMaterialHelperImage = "alpine:3.22.2";

export interface CertificateRouteCommandResult {
  failed: boolean;
  stdout: string;
  stderr: string;
}

export interface CertificateRouteCommandInput {
  server: DeploymentTargetState;
  command: string;
  stdin?: string | Uint8Array;
  redactions?: readonly string[];
  timeoutMs?: number;
}

export interface CertificateRouteCommandRunner {
  run(input: CertificateRouteCommandInput): Promise<CertificateRouteCommandResult>;
}

interface DockerInspectMount {
  Type: "bind" | "volume" | "tmpfs";
  Source?: string;
  Name?: string;
  Destination: string;
  RW: boolean;
}

interface DockerInspectState {
  Config: {
    Image: string;
    Env?: string[];
    Cmd?: string[];
    Entrypoint?: string[];
    Labels?: Record<string, string>;
    WorkingDir?: string;
    User?: string;
    Healthcheck?: {
      Test?: string[];
      Interval?: number;
      Timeout?: number;
      Retries?: number;
      StartPeriod?: number;
    };
  };
  HostConfig: {
    NetworkMode?: string;
    RestartPolicy?: { Name?: string; MaximumRetryCount?: number };
    PortBindings?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
    ExtraHosts?: string[];
    Privileged?: boolean;
    ReadonlyRootfs?: boolean;
  };
  Mounts?: DockerInspectMount[];
}

function activationError(message: string, details: Record<string, string> = {}): DomainError {
  return domainError.certificateRouteReconciliationFailed(message, {
    phase: "certificate-route-runtime-activation",
    ...details,
  });
}

function safeIdentity(value: string): Result<string, DomainError> {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)
    ? ok(value)
    : err(activationError("Certificate activation identity is invalid"));
}

function unencryptedPrivateKey(material: CertificateRouteRuntimeActivationInput["material"]): Result<string, DomainError> {
  try {
    const key = createPrivateKey({
      key: material.privateKey,
      format: "pem",
      ...(material.passphrase ? { passphrase: material.passphrase } : {}),
    });
    return ok(
      key.export({
        format: "pem",
        type: "pkcs8",
      }).toString(),
    );
  } catch {
    return err(activationError("Certificate private key could not be prepared for the edge proxy"));
  }
}

function materialFiles(input: CertificateRouteRuntimeActivationInput, privateKey: string) {
  const certificateDirectory =
    input.proxyKind === "caddy"
      ? `appaloft/certificates/${input.certificateId}`
      : `certificates/${input.certificateId}`;
  const files = [
    { path: `${certificateDirectory}/certificate.pem`, content: input.material.certificateChain },
    { path: `${certificateDirectory}/private-key.pem`, content: privateKey },
  ];
  if (input.proxyKind === "traefik") {
    files.push({
      path: `certificate-${input.certificateId}.yml`,
      content: [
        "tls:",
        "  certificates:",
        `    - certFile: /etc/traefik/dynamic/${certificateDirectory}/certificate.pem`,
        `      keyFile: /etc/traefik/dynamic/${certificateDirectory}/private-key.pem`,
        "",
      ].join("\n"),
    });
  }
  return files;
}

function materialInstall(
  input: CertificateRouteRuntimeActivationInput,
  privateKey: string,
  volumes: { traefikDynamic: string; caddyData: string },
) {
  const files = materialFiles(input, privateKey);
  const volume = input.proxyKind === "traefik" ? volumes.traefikDynamic : volumes.caddyData;
  const commands = files.map(
    (file, index) =>
      `read -r n${index}; mkdir -p ${ash.quote(`/target/${file.path.slice(0, file.path.lastIndexOf("/"))}`)}; dd bs=1 count="$n${index}" of=${ash.quote(`/target/${file.path}`)} 2>/dev/null; chmod 600 ${ash.quote(`/target/${file.path}`)}`,
  );
  return {
    command: `docker run --rm -i -v ${ash.quote(`${volume}:/target`)} ${ash.quote(certificateMaterialHelperImage)} sh -c ${ash.quote(`set -eu; umask 077; ${commands.join("; ")}`)}`,
    stdin: files.map((file) => `${Buffer.byteLength(file.content)}\n${file.content}`).join(""),
  };
}

function labelAssignments(
  existing: Record<string, string> | undefined,
  replacements: string[],
  proxyKind: "traefik" | "caddy",
): Record<string, string> {
  const labels = Object.fromEntries(
    Object.entries(existing ?? {}).filter(([key]) =>
      proxyKind === "traefik" ? !key.startsWith("traefik.") : key !== "caddy" && !key.startsWith("caddy_"),
    ),
  );
  for (const assignment of replacements) {
    const separator = assignment.indexOf("=");
    if (separator < 1) continue;
    labels[assignment.slice(0, separator)] = assignment.slice(separator + 1);
  }
  return labels;
}

function renderHealthcheckArgs(healthcheck: DockerInspectState["Config"]["Healthcheck"]): string[] {
  const test = healthcheck?.Test ?? [];
  if (test[0] === "NONE") return ["--no-healthcheck"];
  if (test[0] !== "CMD" && test[0] !== "CMD-SHELL") return [];
  const command = test[0] === "CMD-SHELL" ? (test[1] ?? "") : test.slice(1).map(ash.quote).join(" ");
  return [
    "--health-cmd", ash.quote(command),
    ...(healthcheck?.Interval ? ["--health-interval", `${healthcheck.Interval}ns`] : []),
    ...(healthcheck?.Timeout ? ["--health-timeout", `${healthcheck.Timeout}ns`] : []),
    ...(healthcheck?.Retries ? ["--health-retries", String(healthcheck.Retries)] : []),
    ...(healthcheck?.StartPeriod ? ["--health-start-period", `${healthcheck.StartPeriod}ns`] : []),
  ];
}

function renderCandidateCreate(
  inspect: DockerInspectState,
  input: CertificateRouteRuntimeActivationInput,
  candidateName: string,
): Result<string, DomainError> {
  const args = ["docker", "create", "--name", ash.quote(candidateName)];
  const restart = inspect.HostConfig.RestartPolicy?.Name;
  if (restart && restart !== "no") {
    const retry = inspect.HostConfig.RestartPolicy?.MaximumRetryCount;
    args.push("--restart", ash.quote(restart === "on-failure" && retry ? `${restart}:${retry}` : restart));
  }
  const network = inspect.HostConfig.NetworkMode;
  if (network && network !== "default" && network !== "bridge") args.push("--network", ash.quote(network));
  for (const env of inspect.Config.Env ?? []) args.push("-e", ash.quote(env));
  for (const [key, value] of Object.entries(labelAssignments(inspect.Config.Labels, input.routePlan.labels, input.proxyKind))) {
    args.push("--label", ash.quote(`${key}=${value}`));
  }
  for (const mount of inspect.Mounts ?? []) {
    if (mount.Type === "tmpfs") {
      args.push("--tmpfs", ash.quote(mount.Destination));
      continue;
    }
    const source = mount.Type === "volume" ? mount.Name : mount.Source;
    if (!source) return err(activationError("Serving container mount cannot be reproduced safely"));
    args.push("-v", ash.quote(`${source}:${mount.Destination}${mount.RW ? "" : ":ro"}`));
  }
  for (const [containerPort, bindings] of Object.entries(inspect.HostConfig.PortBindings ?? {})) {
    const port = containerPort.split("/")[0];
    for (const binding of bindings ?? []) {
      const hostIp = binding.HostIp || "127.0.0.1";
      if (hostIp !== "127.0.0.1" && hostIp !== "::1") {
        return err(activationError("Public host-port bindings cannot be switched during certificate activation"));
      }
      args.push("-p", ash.quote(`${hostIp}::${port}`));
    }
  }
  for (const host of inspect.HostConfig.ExtraHosts ?? []) args.push("--add-host", ash.quote(host));
  if (inspect.HostConfig.Privileged) args.push("--privileged");
  if (inspect.HostConfig.ReadonlyRootfs) args.push("--read-only");
  if (inspect.Config.WorkingDir) args.push("-w", ash.quote(inspect.Config.WorkingDir));
  if (inspect.Config.User) args.push("-u", ash.quote(inspect.Config.User));
  if (inspect.Config.Entrypoint?.[0]) args.push("--entrypoint", ash.quote(inspect.Config.Entrypoint[0]));
  args.push(...renderHealthcheckArgs(inspect.Config.Healthcheck));
  args.push(ash.quote(inspect.Config.Image));
  for (const entrypointArg of inspect.Config.Entrypoint?.slice(1) ?? []) args.push(ash.quote(entrypointArg));
  for (const commandArg of inspect.Config.Cmd ?? []) args.push(ash.quote(commandArg));
  return ok(args.join(" "));
}

function parseInspect(output: string): Result<DockerInspectState, DomainError> {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (!Array.isArray(parsed) || !parsed[0] || typeof parsed[0] !== "object") throw new Error();
    const inspect = parsed[0] as DockerInspectState;
    if (!inspect.Config?.Image || !inspect.HostConfig) throw new Error();
    return ok(inspect);
  } catch {
    return err(activationError("Serving container inspection could not be parsed"));
  }
}

async function resolveServingContainer(
  runner: CertificateRouteCommandRunner,
  input: CertificateRouteRuntimeActivationInput,
): Promise<Result<string, DomainError>> {
  if (!input.containerSelector) return safeIdentity(input.containerName);
  const project = safeIdentity(input.containerSelector.composeProjectName);
  if (project.isErr()) return err(project.error);
  const service = safeIdentity(input.containerSelector.serviceName);
  if (service.isErr()) return err(service.error);
  const resolved = await runner.run({
    server: input.server,
    command: [
      "docker ps",
      `--filter ${ash.quote(`label=com.docker.compose.project=${project.value}`)}`,
      `--filter ${ash.quote(`label=com.docker.compose.service=${service.value}`)}`,
      `--format ${ash.quote("{{.Names}}")}`,
    ].join(" "),
    timeoutMs: 10_000,
  });
  if (resolved.failed) {
    return err(activationError("Compose serving container could not be resolved"));
  }
  const names = resolved.stdout.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  if (names.length !== 1 || !names[0]) {
    return err(
      activationError("Certificate activation requires exactly one serving Compose container", {
        matchedContainers: String(names.length),
      }),
    );
  }
  return safeIdentity(names[0]);
}

export class DockerCliCertificateRouteRuntime implements CertificateRouteRuntime {
  private readonly volumes: { traefikDynamic: string; caddyData: string };

  constructor(
    private readonly runner: CertificateRouteCommandRunner,
    options: { traefikDynamicVolumeName?: string; caddyDataVolumeName?: string } = {},
  ) {
    this.volumes = {
      traefikDynamic: options.traefikDynamicVolumeName ?? "appaloft-traefik-dynamic",
      caddyData: options.caddyDataVolumeName ?? "appaloft-caddy-data",
    };
  }

  async activate(input: CertificateRouteRuntimeActivationInput): Promise<Result<{ activationId: string; previousActivationId?: string }, DomainError>> {
    const certificateId = safeIdentity(input.certificateId);
    if (certificateId.isErr()) return err(certificateId.error);
    const servingContainer = await resolveServingContainer(this.runner, input);
    if (servingContainer.isErr()) return err(servingContainer.error);
    const containerName = servingContainer.value;
    const privateKey = unencryptedPrivateKey(input.material);
    if (privateKey.isErr()) return err(privateKey.error);
    if (input.ensurePlan) {
      for (const command of [input.ensurePlan.networkCommand, input.ensurePlan.containerCommand]) {
        const ensured = await this.runner.run({
          server: input.server,
          command,
          timeoutMs: 60_000,
        });
        if (ensured.failed) {
          return err(activationError("Edge proxy certificate runtime could not be prepared"));
        }
      }
    }
    const material = materialInstall(input, privateKey.value, this.volumes);
    const installed = await this.runner.run({
      server: input.server,
      command: material.command,
      stdin: material.stdin,
      redactions: [input.material.certificateChain, input.material.privateKey, input.material.passphrase ?? "", privateKey.value],
      timeoutMs: 30_000,
    });
    if (installed.failed) return err(activationError("Candidate certificate material could not be installed"));

    const inspected = await this.runner.run({
      server: input.server,
      command: `docker inspect ${ash.quote(containerName)}`,
      timeoutMs: 10_000,
    });
    if (inspected.failed) return err(activationError("Serving container could not be inspected"));
    const inspect = parseInspect(inspected.stdout);
    if (inspect.isErr()) return err(inspect.error);

    const suffix = `${input.deploymentId}-${certificateId.value}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
    const candidateName = `${containerName}-candidate-${suffix}`.slice(0, 120);
    const previousName = `${containerName}-previous-${suffix}`.slice(0, 120);
    const create = renderCandidateCreate(inspect.value, input, candidateName);
    if (create.isErr()) return err(create.error);
    const switchCommand = [
      "set -eu",
      `docker rm -f ${ash.quote(candidateName)} >/dev/null 2>&1 || true`,
      `docker rm -f ${ash.quote(previousName)} >/dev/null 2>&1 || true`,
      create.value,
      `docker stop ${ash.quote(containerName)} >/dev/null`,
      `docker rename ${ash.quote(containerName)} ${ash.quote(previousName)}`,
      `if docker start ${ash.quote(candidateName)} >/dev/null && docker rename ${ash.quote(candidateName)} ${ash.quote(containerName)}; then exit 0; fi`,
      `docker rm -f ${ash.quote(candidateName)} >/dev/null 2>&1 || true`,
      `docker rename ${ash.quote(previousName)} ${ash.quote(containerName)}`,
      `docker start ${ash.quote(containerName)} >/dev/null`,
      "exit 1",
    ].join("; ");
    const switched = await this.runner.run({ server: input.server, command: switchCommand, timeoutMs: 60_000 });
    if (switched.failed) return err(activationError("Candidate certificate route could not replace the serving route"));

    for (const step of input.reloadPlan?.steps ?? []) {
      if (step.mode !== "command" || !step.command) continue;
      const reloaded = await this.runner.run({
        server: input.server,
        command: step.command,
        ...(step.timeoutMs ? { timeoutMs: step.timeoutMs } : {}),
      });
      if (reloaded.failed) {
        await this.rollback({
          correlationId: input.correlationId,
          server: input.server,
          certificateId: input.certificateId,
          proxyKind: input.proxyKind,
          activationId: containerName,
          previousActivationId: previousName,
        });
        return err(activationError("Edge proxy reload failed after certificate route activation"));
      }
    }
    return ok({ activationId: containerName, previousActivationId: previousName });
  }

  async rollback(input: CertificateRouteRuntimeRollbackInput): Promise<Result<void, DomainError>> {
    if (!input.previousActivationId) return ok(undefined);
    const command = [
      "set -eu",
      `docker rm -f ${ash.quote(input.activationId)} >/dev/null 2>&1 || true`,
      `docker rename ${ash.quote(input.previousActivationId)} ${ash.quote(input.activationId)}`,
      `docker start ${ash.quote(input.activationId)} >/dev/null`,
    ].join("; ");
    const restored = await this.runner.run({ server: input.server, command, timeoutMs: 60_000 });
    if (restored.failed) return err(activationError("Previous certificate route could not be restored"));
    const volume = input.proxyKind === "traefik" ? this.volumes.traefikDynamic : this.volumes.caddyData;
    const removePaths =
      input.proxyKind === "traefik"
        ? `rm -rf ${ash.quote(`/target/certificates/${input.certificateId}`)} ${ash.quote(`/target/certificate-${input.certificateId}.yml`)}`
        : `rm -rf ${ash.quote(`/target/appaloft/certificates/${input.certificateId}`)}`;
    const removed = await this.runner.run({
      server: input.server,
      command: `docker run --rm -v ${ash.quote(`${volume}:/target`)} ${ash.quote(certificateMaterialHelperImage)} sh -c ${ash.quote(removePaths)}`,
      timeoutMs: 30_000,
    });
    return removed.failed
      ? err(activationError("Candidate certificate material could not be deactivated"))
      : ok(undefined);
  }

  async finalize(input: CertificateRouteRuntimeRollbackInput): Promise<Result<void, DomainError>> {
    if (!input.previousActivationId) return ok(undefined);
    const removed = await this.runner.run({
      server: input.server,
      command: `docker rm -f ${ash.quote(input.previousActivationId)} >/dev/null`,
      timeoutMs: 30_000,
    });
    return removed.failed
      ? err(activationError("Previous certificate route could not be retired"))
      : ok(undefined);
  }
}
