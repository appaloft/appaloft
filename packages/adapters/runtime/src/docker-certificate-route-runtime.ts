import { createPrivateKey } from "node:crypto";

import { ash } from "@appaloft/ash";
import {
  type DeploymentTargetState,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";

import {
  type CertificateRouteRuntime,
  type CertificateRouteRuntimeActivationInput,
  type CertificateRouteRuntimeRollbackInput,
} from "./docker-certificate-route-activator";

const certificateMaterialHelperImage =
  "alpine@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412";

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

function activationError(message: string): DomainError {
  return domainError.certificateRouteReconciliationFailed(message, {
    phase: "certificate-route-runtime-activation",
  });
}

function safeIdentity(value: string): Result<string, DomainError> {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)
    ? ok(value)
    : err(activationError("Certificate activation identity is invalid"));
}

function unencryptedPrivateKey(
  material: CertificateRouteRuntimeActivationInput["material"],
): Result<string, DomainError> {
  try {
    const key = createPrivateKey({
      key: material.privateKey,
      format: "pem",
      ...(material.passphrase ? { passphrase: material.passphrase } : {}),
    });
    return ok(key.export({ format: "pem", type: "pkcs8" }).toString());
  } catch {
    return err(activationError("Certificate private key could not be prepared for the edge proxy"));
  }
}

function materialLayout(input: {
  domainBindingId: string;
  proxyKind: "traefik" | "caddy";
}) {
  const materialDirectory =
    input.proxyKind === "traefik"
      ? `/target/certificates/${input.domainBindingId}`
      : `/target/appaloft/certificates/${input.domainBindingId}`;
  return {
    materialDirectory,
    stagingDirectory: `/target/.appaloft-certificate-staging/${input.domainBindingId}`,
    backupDirectory: `/target/.appaloft-certificate-previous/${input.domainBindingId}`,
    ...(input.proxyKind === "traefik"
      ? { configurationLink: `/target/certificate-${input.domainBindingId}.yml` }
      : {}),
  };
}

function volumeFor(
  proxyKind: "traefik" | "caddy",
  volumes: { traefikDynamic: string; caddyData: string },
): string {
  return proxyKind === "traefik" ? volumes.traefikDynamic : volumes.caddyData;
}

function caddyRoutePreflightCommand(labels: readonly string[]): string {
  const filters = labels.map((label) => `--filter ${ash.quote(`label=${label}`)}`).join(" ");
  return `test -n "$(docker ps -q ${filters})"`;
}

function traefikRoutePreflightCommand(labels: readonly string[]): string {
  const filters = labels.map((label) => `--filter ${ash.quote(`label=${label}`)}`).join(" ");
  return [
    `container_ids="$(docker ps -q ${filters})"`,
    'test -n "$container_ids"',
    'for container_id in $container_ids; do ! docker inspect -f \'{{json .Config.Labels}}\' "$container_id" | grep -F \'tls.certresolver":"appaloft"\' >/dev/null; done',
  ].join("; ");
}

function installCommand(
  input: CertificateRouteRuntimeActivationInput,
  privateKey: string,
  volumes: { traefikDynamic: string; caddyData: string },
) {
  const layout = materialLayout(input);
  const certificatePath = `${layout.stagingDirectory}/material/certificate.pem`;
  const privateKeyPath = `${layout.stagingDirectory}/material/private-key.pem`;
  const configuration = layout.configurationLink
    ? [
        "tls:",
        "  certificates:",
        `    - certFile: /etc/traefik/dynamic/certificates/${input.domainBindingId}/certificate.pem`,
        `      keyFile: /etc/traefik/dynamic/certificates/${input.domainBindingId}/private-key.pem`,
        "",
      ].join("\n")
    : undefined;
  const files = [
    { path: certificatePath, content: input.material.certificateChain },
    { path: privateKeyPath, content: privateKey },
    ...(configuration
      ? [{ path: `${layout.stagingDirectory}/material/configuration.yml`, content: configuration }]
      : []),
  ];
  const reads = files.map(
    (file, index) =>
      `read -r n${index}; dd bs=1 count="$n${index}" of=${ash.quote(file.path)} 2>/dev/null; chmod 600 ${ash.quote(file.path)}`,
  );
  const restore = [
    `rm -rf ${ash.quote(layout.materialDirectory)}`,
    `[ ! -d ${ash.quote(`${layout.backupDirectory}/material`)} ] || mv ${ash.quote(`${layout.backupDirectory}/material`)} ${ash.quote(layout.materialDirectory)}`,
    `rm -rf ${ash.quote(layout.stagingDirectory)}`,
  ].join("; ");
  const script = [
    "set -eu",
    "umask 077",
    `rm -rf ${ash.quote(layout.stagingDirectory)}`,
    `mkdir -p ${ash.quote(`${layout.stagingDirectory}/material`)}`,
    ...reads,
    "previous=0",
    `trap ${ash.quote(restore)} EXIT`,
    `if [ -d ${ash.quote(`${layout.backupDirectory}/material`)} ]; then rm -rf ${ash.quote(layout.materialDirectory)}; mkdir -p ${ash.quote(layout.materialDirectory.slice(0, layout.materialDirectory.lastIndexOf("/")))}; mv ${ash.quote(`${layout.backupDirectory}/material`)} ${ash.quote(layout.materialDirectory)}; fi`,
    `rm -rf ${ash.quote(layout.backupDirectory)}; mkdir -p ${ash.quote(layout.backupDirectory)}`,
    `if [ -d ${ash.quote(layout.materialDirectory)} ]; then previous=1; mkdir -p ${ash.quote(layout.backupDirectory)}; mv ${ash.quote(layout.materialDirectory)} ${ash.quote(`${layout.backupDirectory}/material`)}; fi`,
    `mkdir -p ${ash.quote(layout.materialDirectory.slice(0, layout.materialDirectory.lastIndexOf("/")))}`,
    `mv ${ash.quote(`${layout.stagingDirectory}/material`)} ${ash.quote(layout.materialDirectory)}`,
    ...(layout.configurationLink
      ? [
          `ln -sfn ${ash.quote(`certificates/${input.domainBindingId}/configuration.yml`)} ${ash.quote(layout.configurationLink)}`,
        ]
      : []),
    `rm -rf ${ash.quote(layout.stagingDirectory)}`,
    "trap - EXIT",
    'printf "previous=%s\\n" "$previous"',
  ].join("; ");
  const volume = volumeFor(input.proxyKind, volumes);
  return {
    command: `docker run --rm -i -v ${ash.quote(`${volume}:/target`)} ${ash.quote(certificateMaterialHelperImage)} sh -c ${ash.quote(script)}`,
    stdin: files.map((file) => `${Buffer.byteLength(file.content)}\n${file.content}`).join(""),
  };
}

function materialMaintenanceCommand(input: {
  domainBindingId: string;
  proxyKind: "traefik" | "caddy";
  restore: boolean;
  hadPrevious: boolean;
  volumes: { traefikDynamic: string; caddyData: string };
}): string {
  const layout = materialLayout(input);
  const commands = input.restore
    ? [
        `rm -rf ${ash.quote(layout.materialDirectory)}`,
        ...(input.hadPrevious
          ? [
              `mv ${ash.quote(`${layout.backupDirectory}/material`)} ${ash.quote(layout.materialDirectory)}`,
            ]
          : []),
        `rm -rf ${ash.quote(layout.backupDirectory)}`,
      ]
    : [`rm -rf ${ash.quote(layout.backupDirectory)}`];
  const volume = volumeFor(input.proxyKind, input.volumes);
  return `docker run --rm -v ${ash.quote(`${volume}:/target`)} ${ash.quote(certificateMaterialHelperImage)} sh -c ${ash.quote(`set -eu; ${commands.join("; ")}`)}`;
}

export class DockerCliCertificateRouteRuntime implements CertificateRouteRuntime {
  private readonly volumes: { traefikDynamic: string; caddyData: string };
  private readonly caddyContainerName: string;
  private readonly traefikContainerName: string;

  constructor(
    private readonly runner: CertificateRouteCommandRunner,
    options: {
      traefikDynamicVolumeName?: string;
      caddyDataVolumeName?: string;
      caddyContainerName?: string;
      traefikContainerName?: string;
    } = {},
  ) {
    this.volumes = {
      traefikDynamic: options.traefikDynamicVolumeName ?? "appaloft-traefik-dynamic",
      caddyData: options.caddyDataVolumeName ?? "appaloft-caddy-data",
    };
    this.caddyContainerName = options.caddyContainerName ?? "appaloft-caddy";
    this.traefikContainerName = options.traefikContainerName ?? "appaloft-traefik";
  }

  async activate(
    input: CertificateRouteRuntimeActivationInput,
  ): Promise<Result<{ activationId: string; previousActivationId?: string }, DomainError>> {
    const domainBindingId = safeIdentity(input.domainBindingId);
    if (domainBindingId.isErr()) return err(domainBindingId.error);
    const privateKey = unencryptedPrivateKey(input.material);
    if (privateKey.isErr()) return err(privateKey.error);
    for (const command of [input.ensurePlan?.networkCommand, input.ensurePlan?.containerCommand]) {
      if (!command) continue;
      const ensured = await this.runner.run({ server: input.server, command, timeoutMs: 60_000 });
      if (ensured.failed) return err(activationError("Edge proxy certificate runtime could not be prepared"));
    }
    if (input.proxyKind === "caddy" || input.proxyKind === "traefik") {
      const routeReady = await this.runner.run({
        server: input.server,
        command:
          input.proxyKind === "caddy"
            ? caddyRoutePreflightCommand(input.routePlan.labels)
            : traefikRoutePreflightCommand(input.routePlan.labels),
        timeoutMs: 30_000,
      });
      if (routeReady.failed) {
        return err(
          activationError(
            `${input.proxyKind === "caddy" ? "Caddy" : "Traefik"} serving workload must be redeployed with binding-scoped TLS labels before certificate activation`,
          ),
        );
      }
    }
    const material = installCommand(input, privateKey.value, this.volumes);
    const installed = await this.runner.run({
      server: input.server,
      command: material.command,
      stdin: material.stdin,
      redactions: [
        input.material.certificateChain,
        input.material.privateKey,
        input.material.passphrase ?? "",
        privateKey.value,
      ],
      timeoutMs: 30_000,
    });
    if (installed.failed) return err(activationError("Candidate certificate material could not be installed"));
    const previousActivationId = installed.stdout.includes("previous=1")
      ? domainBindingId.value
      : undefined;
    const commandSteps = (input.reloadPlan?.steps ?? []).filter(
      (step) => step.mode === "command" && Boolean(step.command),
    );
    if (input.proxyKind === "traefik" && commandSteps.length === 0) {
      commandSteps.push({
        name: "restart-traefik-certificate-store",
        mode: "command",
        command: `docker restart ${ash.quote(this.traefikContainerName)}`,
        successMessage: "Traefik reloaded binding-scoped certificate material",
      });
    }
    for (const step of commandSteps) {
      if (step.mode !== "command" || !step.command) continue;
      const reloaded = await this.runner.run({
        server: input.server,
        command: step.command,
        ...(step.timeoutMs ? { timeoutMs: step.timeoutMs } : {}),
      });
      if (reloaded.failed) {
        const rollback = await this.rollback({
          server: input.server,
          domainBindingId: domainBindingId.value,
          proxyKind: input.proxyKind,
          activationId: domainBindingId.value,
          ...(previousActivationId ? { previousActivationId } : {}),
        });
        if (rollback.isErr()) {
          return err(
            activationError(
              "Edge proxy reload failed and previous certificate material could not be restored",
            ),
          );
        }
        return err(activationError("Edge proxy reload failed after certificate material activation"));
      }
    }
    return ok({
      activationId: domainBindingId.value,
      ...(previousActivationId ? { previousActivationId } : {}),
    });
  }

  async rollback(input: CertificateRouteRuntimeRollbackInput): Promise<Result<void, DomainError>> {
    const command = materialMaintenanceCommand({
      domainBindingId: input.domainBindingId,
      proxyKind: input.proxyKind,
      restore: true,
      hadPrevious: Boolean(input.previousActivationId),
      volumes: this.volumes,
    });
    const restored = await this.runner.run({ server: input.server, command, timeoutMs: 30_000 });
    if (restored.failed) return err(activationError("Previous certificate material could not be restored"));
    if (input.proxyKind === "caddy" || input.proxyKind === "traefik") {
      const containerName =
        input.proxyKind === "caddy" ? this.caddyContainerName : this.traefikContainerName;
      const reloaded = await this.runner.run({
        server: input.server,
        command: `docker restart ${ash.quote(containerName)}`,
        timeoutMs: 60_000,
      });
      if (reloaded.failed) {
        return err(activationError("Edge proxy could not reload restored certificate material"));
      }
    }
    return ok(undefined);
  }

  async finalize(input: CertificateRouteRuntimeRollbackInput): Promise<Result<void, DomainError>> {
    const command = materialMaintenanceCommand({
      domainBindingId: input.domainBindingId,
      proxyKind: input.proxyKind,
      restore: false,
      hadPrevious: Boolean(input.previousActivationId),
      volumes: this.volumes,
    });
    const removed = await this.runner.run({ server: input.server, command, timeoutMs: 30_000 });
    return removed.failed
      ? err(activationError("Previous certificate material could not be retired"))
      : ok(undefined);
  }
}
