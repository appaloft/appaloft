import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { connect as connectTcp, isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect as connectTls } from "node:tls";
import {
  deploymentProofConfigurationFingerprint,
  deploymentProofEnvironmentKeyFingerprint,
  type DeploymentProofManagedRoute,
  type DeploymentProofRuntimeEvidence,
  type DeploymentProofRuntimeEvidenceInput,
  type DeploymentProofRuntimeEvidenceReader,
  type DeploymentSummary,
  type ExecutionContext,
  type ServerRepository,
  toRepositoryContext,
} from "@appaloft/application";
import { ash, type AshScript } from "@appaloft/ash";
import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  deploymentRouteIdentityHeaderName,
  ok,
  type DeploymentTargetState,
  type Result,
} from "@appaloft/core";
import { runBufferedProcess } from "./buffered-process";

export interface DockerInspectState {
  Id?: string;
  Image?: string;
  Created?: string;
  State?: { Running?: boolean; StartedAt?: string; Health?: { Status?: string } };
  Config?: { Image?: string; Labels?: Record<string, string>; Env?: string[] };
  Spec?: {
    Labels?: Record<string, string>;
    TaskTemplate?: { ContainerSpec?: { Image?: string; Env?: string[] } };
  };
  UpdatedAt?: string;
}

export type DeploymentProofRouteFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function directHttpResponse(url: URL, signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    let received = "";
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    const onConnect = (): void => {
      socket.write(
        [
          `GET ${url.pathname || "/"}${url.search} HTTP/1.1`,
          `Host: ${url.host}`,
          "User-Agent: Appaloft-Deployment-Proof",
          "Accept: */*",
          "Connection: close",
          "",
          "",
        ].join("\r\n"),
      );
    };
    const socket =
      url.protocol === "https:"
        ? connectTls(
            {
              host: url.hostname,
              port,
              ...(isIP(url.hostname) === 0 ? { servername: url.hostname } : {}),
            },
            onConnect,
          )
        : connectTcp({ host: url.hostname, port }, onConnect);
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      socket.destroy();
      reject(error);
    };
    const abort = (): void => fail(new Error("managed public route request aborted"));
    if (signal?.aborted) {
      fail(new Error("managed public route request aborted"));
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    socket.setEncoding("latin1");
    socket.setTimeout(5_000, () => fail(new Error("managed public route request timed out")));
    socket.on("error", fail);
    socket.on("end", () => fail(new Error("managed public route closed before response headers")));
    socket.on("data", (chunk: string) => {
      if (settled) return;
      received += chunk;
      const headerEnd = received.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const [statusLine = "", ...headerLines] = received.slice(0, headerEnd).split("\r\n");
      const status = Number(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/u.exec(statusLine)?.[1] ?? 500);
      const headers = new Headers();
      for (const line of headerLines) {
        const separator = line.indexOf(":");
        if (separator > 0) {
          headers.append(line.slice(0, separator), line.slice(separator + 1).trim());
        }
      }
      settled = true;
      signal?.removeEventListener("abort", abort);
      socket.destroy();
      resolve(new Response(null, { status, headers }));
    });
  });
}

async function directManagedRouteFetch(
  input: string,
  init: RequestInit = {},
  redirectCount = 0,
): Promise<Response> {
  const url = new URL(input);
  const response = await directHttpResponse(url, init.signal);
  const location = response.headers.get("location");
  if (init.redirect !== "follow" || !location || response.status < 300 || response.status >= 400) {
    return response;
  }
  if (redirectCount >= 5) throw new Error("managed public route exceeded redirect limit");
  return await directManagedRouteFetch(new URL(location, url).toString(), init, redirectCount + 1);
}

function joinRoutePath(pathPrefix: string, healthPath: string): string {
  const prefix = pathPrefix === "/" ? "" : pathPrefix.replace(/\/+$/u, "");
  const path = healthPath.startsWith("/") ? healthPath : `/${healthPath}`;
  return `${prefix}${path}` || "/";
}

interface DeploymentProofManagedRouteProbe {
  requireSuccessfulResponse: boolean;
  routeBehavior: "serve" | "redirect";
  url: string;
  expectedRedirectTo?: string;
  expectedRedirectStatus?: 301 | 302 | 307 | 308;
}

const deploymentProofRedirectQuery = "appaloft-proof=redirect";

function managedRouteKey(input: {
  domainName: string;
  pathPrefix: string;
  tlsMode: DeploymentProofManagedRoute["tlsMode"];
}): string {
  const scheme = input.tlsMode === "auto" ? "https" : "http";
  return `${scheme}://${input.domainName}${input.pathPrefix}`;
}

function managedRouteProbes(
  deployment: DeploymentSummary,
  currentManagedRoutes: readonly DeploymentProofManagedRoute[] = [],
): DeploymentProofManagedRouteProbe[] {
  const healthPath = deployment.runtimePlan.execution.healthCheckPath ?? "/";
  const canonicalRouteByOrigin = new Map<
    string,
    { domain: string; pathPrefix: string; scheme: string }
  >();
  const authoritativeCurrentRouteKeys = new Set(
    currentManagedRoutes
      .filter((route) => route.proxyKind !== "none")
      .map((route) => managedRouteKey(route)),
  );
  const plannedRouteKeys = new Set<string>();
  for (const route of deployment.runtimePlan.execution.accessRoutes ?? []) {
    if (route.proxyKind === "none" || route.routeBehavior === "redirect" || route.redirectTo) {
      continue;
    }
    const scheme = route.tlsMode === "auto" ? "https" : "http";
    for (const domain of route.domains) {
      const plannedRouteKey = managedRouteKey({
        domainName: domain,
        pathPrefix: route.pathPrefix,
        tlsMode: route.tlsMode,
      });
      if (authoritativeCurrentRouteKeys.has(plannedRouteKey)) continue;
      plannedRouteKeys.add(plannedRouteKey);
      const origin = `${scheme}://${domain}`;
      const current = canonicalRouteByOrigin.get(origin);
      if (!current || route.pathPrefix.length < current.pathPrefix.length) {
        canonicalRouteByOrigin.set(origin, { domain, pathPrefix: route.pathPrefix, scheme });
      }
    }
  }
  const probes: DeploymentProofManagedRouteProbe[] = [
    ...canonicalRouteByOrigin.values(),
  ].map(({ domain, pathPrefix, scheme }) => ({
    requireSuccessfulResponse: true,
    routeBehavior: "serve",
    url: `${scheme}://${domain}${joinRoutePath(pathPrefix, healthPath)}`,
  }));
  const currentRouteKeys = new Set<string>();
  for (const route of currentManagedRoutes) {
    if (route.proxyKind === "none") continue;
    const routeKey = managedRouteKey(route);
    if (currentRouteKeys.has(routeKey)) continue;
    currentRouteKeys.add(routeKey);
    const routeBehavior = route.routeBehavior ?? (route.redirectTo ? "redirect" : "serve");
    const redirectScheme = route.tlsMode === "auto" ? "https" : "http";
    const redirectSuffix = `${route.pathPrefix}?${deploymentProofRedirectQuery}`;
    probes.push({
      requireSuccessfulResponse: false,
      routeBehavior,
      url: routeBehavior === "redirect" ? `${routeKey}?${deploymentProofRedirectQuery}` : routeKey,
      ...(routeBehavior === "redirect" && route.redirectTo
        ? {
            expectedRedirectTo: `${redirectScheme}://${route.redirectTo}${redirectSuffix}`,
            expectedRedirectStatus: route.redirectStatus ?? 308,
          }
        : {}),
    });
  }
  return probes;
}

export async function readDeploymentProofManagedRouteEvidence(
  deployment: DeploymentSummary,
  fetchImpl: DeploymentProofRouteFetch = directManagedRouteFetch,
  currentManagedRoutes: readonly DeploymentProofManagedRoute[] = [],
): Promise<DeploymentProofRuntimeEvidence["access"]> {
  const probes = managedRouteProbes(deployment, currentManagedRoutes);
  if (probes.length === 0) {
    return {
      status: "passed",
      routeTargetsWorkload: true,
      summary: "No managed public route identity is required",
    };
  }

  const routes: NonNullable<DeploymentProofRuntimeEvidence["access"]["routes"]> = [];
  for (const probe of probes) {
    const { requireSuccessfulResponse, routeBehavior, url } = probe;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          redirect: requireSuccessfulResponse ? "follow" : "manual",
          signal: AbortSignal.timeout(5_000),
        });
      } catch (error) {
        return {
          status: "failed",
          routeTargetsWorkload: false,
          routes: [
            ...routes,
            {
              url,
              routeBehavior,
              ...(routeBehavior === "serve" ? { expectedDeploymentId: deployment.id } : {}),
              ...(probe.expectedRedirectTo
                ? { expectedRedirectTo: probe.expectedRedirectTo }
                : {}),
              ...(probe.expectedRedirectStatus
                ? { expectedRedirectStatus: probe.expectedRedirectStatus }
                : {}),
              matched: false,
              reasonCode: "public_route_probe_failed",
            },
          ],
          summary: `Managed public route probe failed for ${url}: ${
            error instanceof Error ? error.message : "unknown fetch error"
          }`,
          reasonCode: "public_route_probe_failed",
        };
      }

      if (routeBehavior === "redirect") {
        const observedLocation = response.headers.get("location");
        const observedRedirectTo = observedLocation
          ? new URL(observedLocation, url).toString()
          : undefined;
        const expectedRedirectTo = probe.expectedRedirectTo
          ? new URL(probe.expectedRedirectTo).toString()
          : undefined;
        if (response.status !== probe.expectedRedirectStatus) {
          if (attempt < 5) {
            await Bun.sleep(200);
            continue;
          }
          return {
            status: "failed",
            routeTargetsWorkload: routes.every((route) => route.routeBehavior !== "serve" || route.matched),
            routes: [
              ...routes,
              {
                url,
                routeBehavior,
                ...(expectedRedirectTo ? { expectedRedirectTo } : {}),
                ...(probe.expectedRedirectStatus
                  ? { expectedRedirectStatus: probe.expectedRedirectStatus }
                  : {}),
                observedStatus: response.status,
                ...(observedRedirectTo ? { observedRedirectTo } : {}),
                matched: false,
                reasonCode: "public_route_redirect_status_mismatch",
              },
            ],
            summary: `Managed public redirect returned HTTP ${response.status} instead of ${probe.expectedRedirectStatus} for ${url}`,
            reasonCode: "public_route_redirect_status_mismatch",
          };
        }
        if (observedRedirectTo !== expectedRedirectTo) {
          if (attempt < 5) {
            await Bun.sleep(200);
            continue;
          }
          return {
            status: "failed",
            routeTargetsWorkload: routes.every((route) => route.routeBehavior !== "serve" || route.matched),
            routes: [
              ...routes,
              {
                url,
                routeBehavior,
                ...(expectedRedirectTo ? { expectedRedirectTo } : {}),
                ...(probe.expectedRedirectStatus
                  ? { expectedRedirectStatus: probe.expectedRedirectStatus }
                  : {}),
                observedStatus: response.status,
                ...(observedRedirectTo ? { observedRedirectTo } : {}),
                matched: false,
                reasonCode: "public_route_redirect_destination_mismatch",
              },
            ],
            summary: `Managed public redirect returned ${observedRedirectTo ?? "no Location"} instead of ${expectedRedirectTo ?? "the governed destination"} for ${url}`,
            reasonCode: "public_route_redirect_destination_mismatch",
          };
        }
        routes.push({
          url,
          routeBehavior,
          ...(expectedRedirectTo ? { expectedRedirectTo } : {}),
          ...(probe.expectedRedirectStatus
            ? { expectedRedirectStatus: probe.expectedRedirectStatus }
            : {}),
          observedStatus: response.status,
          ...(observedRedirectTo ? { observedRedirectTo } : {}),
          matched: true,
        });
        break;
      }

      if (!response.ok && (requireSuccessfulResponse || response.status >= 500)) {
        if ([502, 503, 504].includes(response.status) && attempt < 5) {
          await Bun.sleep(200);
          continue;
        }
        return {
          status: "failed",
          routeTargetsWorkload: false,
          summary: `Managed public route returned HTTP ${response.status} for ${url}`,
          reasonCode: "public_route_http_failed",
        };
      }

      const observedDeploymentId = response.headers.get(deploymentRouteIdentityHeaderName);
      if (observedDeploymentId === deployment.id) {
        routes.push({
          url,
          routeBehavior,
          expectedDeploymentId: deployment.id,
          observedDeploymentId,
          observedStatus: response.status,
          matched: true,
        });
        break;
      }
      if (attempt < 5) {
        await Bun.sleep(200);
        continue;
      }
      if (!observedDeploymentId) {
        return {
          status: "failed",
          routeTargetsWorkload: false,
          summary: `Managed public route did not return deployment identity for ${url}`,
          reasonCode: "public_route_deployment_identity_missing",
        };
      }
      return {
        status: "failed",
        routeTargetsWorkload: false,
        summary:
          `Managed public route served deployment ${observedDeploymentId} ` +
          `instead of ${deployment.id}`,
        reasonCode: "public_route_deployment_identity_mismatch",
      };
    }
  }

  return {
    status: "passed",
    routeTargetsWorkload: true,
    routes,
    summary: `Managed public route evidence matched deployment ${deployment.id}`,
  };
}

export type DeploymentProofCommandRunner = (
  args: string[],
) => Promise<{ ok: boolean; stdout: string }>;

const deploymentProofCommandTimeoutMs = 10_000;

export async function runDeploymentProofCommand(
  args: string[],
  timeoutMs = deploymentProofCommandTimeoutMs,
): Promise<{ ok: boolean; stdout: string }> {
  const result = await runBufferedProcess({
    command: args,
    timeoutMs,
    timeoutMessage: "Deployment proof runtime readback timed out",
  });
  return { ok: !result.failed, stdout: result.stdout.trim() };
}

interface SshProofTarget {
  cleanup(): Promise<void>;
  host: string;
  identityFile: string;
  port: string;
}

export interface DeploymentProofIdentityFileOperations {
  chmod(path: string, mode: number): Promise<void>;
  mkdtemp(prefix: string): Promise<string>;
  rm(path: string, options: { force: boolean; recursive: boolean }): Promise<void>;
  writeFile(path: string, data: string, options: { mode: number }): Promise<void>;
}

const defaultIdentityFileOperations: DeploymentProofIdentityFileOperations = {
  chmod,
  mkdtemp,
  rm,
  writeFile,
};

export async function writeDeploymentProofSshIdentityFile(
  privateKey: string,
  operations: DeploymentProofIdentityFileOperations = defaultIdentityFileOperations,
): Promise<{ cleanup(): Promise<void>; identityFile: string }> {
  const directory = await operations.mkdtemp(join(tmpdir(), "appaloft-deployment-proof-ssh-"));
  const identityFile = join(directory, "id_deployment_proof");
  try {
    await operations.writeFile(
      identityFile,
      privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`,
      { mode: 0o600 },
    );
    await operations.chmod(identityFile, 0o600);
  } catch (error) {
    await operations.rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    cleanup: () => operations.rm(directory, { recursive: true, force: true }),
    identityFile,
  };
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

async function sshProofTarget(server: DeploymentTargetState): Promise<SshProofTarget | undefined> {
  const credential = server.credential;
  const privateKey = credential?.privateKey?.value;
  if (credential?.kind.value !== "ssh-private-key" || !privateKey) return undefined;
  const identity = await writeDeploymentProofSshIdentityFile(privateKey);

  return {
    cleanup: identity.cleanup,
    host: hostWithUsername(server.host.value, credential?.username?.value),
    identityFile: identity.identityFile,
    port: String(server.port.value),
  };
}

function sshProofArgs(target: SshProofTarget, remoteCommand: string): string[] {
  return [
    "-p",
    target.port,
    "-i",
    target.identityFile,
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=5",
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
    target.host,
    remoteCommand,
  ];
}

export function renderGenericSshDeploymentProofInspectScript(
  deployment: DeploymentSummary,
): AshScript {
  const deploymentFilter = `label=appaloft.deployment-id=${deployment.id}`;
  const resourceFilter = `label=appaloft.resource-id=${deployment.resourceId}`;
  const targetServiceName = deployment.runtimePlan.execution.metadata?.targetServiceName;
  const selectContainer = targetServiceName
    ? ash`container_id="$(docker ps -q --filter ${ash.arg(deploymentFilter)} --filter ${ash.arg(resourceFilter)} --filter ${ash.arg(`label=com.docker.compose.service=${targetServiceName}`)} | sed -n '1p')"`
    : ash`container_id="$(docker ps -q --filter ${ash.arg(deploymentFilter)} --filter ${ash.arg(resourceFilter)} | sed -n '1p')"`;

  return ash`
    set -eu
    ${selectContainer}
    if [ -z "$container_id" ]; then
      printf '%s\n' 'No running labeled workload found for deployment proof' >&2
      exit 42
    fi
    docker inspect --format ${ash.arg("{{json .}}")} "$container_id"
  `;
}

function unavailable(deployment: DeploymentSummary, reasonCode: string): DeploymentProofRuntimeEvidence {
  const observedAt = new Date().toISOString();
  return {
    available: false,
    observedAt,
    reasonCode,
    artifact: { available: false, reasonCode: "artifact_identity_unavailable" },
    workload: { available: false, reasonCode: "runtime_readback_unavailable" },
    configuration: { available: false, reasonCode: "configuration_evidence_unavailable" },
    health: { status: "unavailable", summary: "Current runtime health is unavailable", reasonCode: "internal_health_unavailable" },
    access: { status: "unavailable", summary: "Current access route evidence is unavailable", reasonCode: "public_access_unavailable" },
    recovery: {
      ...(deployment.runtimePlan.execution.metadata?.previousDeploymentId
        ? { rollbackCandidateDeploymentId: deployment.runtimePlan.execution.metadata.previousDeploymentId }
        : {}),
      reasonCode: "recovery_evidence_unavailable",
    },
  };
}

export function deploymentProofEvidenceFromDockerInspect(
  deployment: DeploymentSummary,
  inspect: DockerInspectState,
): DeploymentProofRuntimeEvidence {
  const labels = inspect.Config?.Labels ?? inspect.Spec?.Labels ?? {};
  const observedDeploymentId = labels["appaloft.deployment-id"];
  const configurationFingerprint = labels["appaloft.configuration-fingerprint"];
  const plannedFingerprint = deploymentProofConfigurationFingerprint(deployment.environmentSnapshot.variables);
  const plannedKeys = [
    ...new Set([
      ...deployment.environmentSnapshot.variables
        .filter((variable) => variable.exposure === "runtime")
        .map((variable) => variable.key),
      ...(deployment.dependencyBindingReferences ?? [])
        .filter(
          (reference) =>
            reference.scope === "runtime-only" &&
            reference.injectionMode === "env" &&
            reference.snapshotReadiness.status === "ready",
        )
        .map((reference) => reference.targetName),
    ]),
  ].sort();
  const observedEnvironmentEntries =
    inspect.Config?.Env ?? inspect.Spec?.TaskTemplate?.ContainerSpec?.Env;
  const observedKeys = observedEnvironmentEntries
    ? [
        ...new Set(
          observedEnvironmentEntries.map((entry) => {
            const separator = entry.indexOf("=");
            return separator < 0 ? entry : entry.slice(0, separator);
          }),
        ),
      ].filter((key) => key.length > 0)
    : undefined;
  const matchesPlannedKeySet = observedKeys
    ? plannedKeys.every((key) => observedKeys.includes(key))
    : false;
  const observedPlannedKeys = observedKeys
    ? plannedKeys.filter((key) => observedKeys.includes(key))
    : undefined;
  const running = inspect.State?.Running ?? true;
  const healthStatus = inspect.State?.Health?.Status;
  const healthPassed = running && healthStatus !== "unhealthy";
  const imageReference = inspect.Config?.Image ?? inspect.Spec?.TaskTemplate?.ContainerSpec?.Image;
  return {
    available: true,
    observedAt: new Date().toISOString(),
    artifact: {
      available: Boolean(inspect.Image || imageReference),
      ...(imageReference ? { reference: imageReference } : {}),
      ...(inspect.Image ? { resolvedIdentity: inspect.Image } : imageReference ? { resolvedIdentity: imageReference } : {}),
      ...(!inspect.Image && !imageReference ? { reasonCode: "artifact_identity_unavailable" } : {}),
    },
    workload: {
      available: Boolean(inspect.Id),
      ...(inspect.Id ? { identity: inspect.Id } : {}),
      ...(observedDeploymentId ? { generation: observedDeploymentId, deploymentId: observedDeploymentId } : {}),
      ...(inspect.State?.StartedAt ?? inspect.UpdatedAt ?? inspect.Created
        ? { startedAt: inspect.State?.StartedAt ?? inspect.UpdatedAt ?? inspect.Created }
        : {}),
      ...(!inspect.Id ? { reasonCode: "workload_identity_unavailable" } : {}),
    },
    configuration: {
      available: Boolean(configurationFingerprint && observedKeys),
      ...(configurationFingerprint
        ? {
            fingerprint: configurationFingerprint,
            matchesPlanned:
              configurationFingerprint === plannedFingerprint && matchesPlannedKeySet,
          }
        : {}),
      ...(observedPlannedKeys
        ? {
            keyCount: observedPlannedKeys.length,
            plannedKeyCount: plannedKeys.length,
            keyFingerprint: deploymentProofEnvironmentKeyFingerprint(observedPlannedKeys),
            matchesPlannedKeySet,
          }
        : {}),
      ...(!configurationFingerprint || !observedKeys
        ? { reasonCode: "configuration_environment_key_evidence_unavailable" }
        : {}),
    },
    health: { status: healthPassed ? "passed" : "failed", summary: healthPassed ? "Observed workload is running and healthy" : "Observed workload is not healthy" },
    access: {
      status: "unavailable",
      summary: "Public route identity has not been observed yet",
      reasonCode: "public_route_identity_unobserved",
    },
    recovery: {
      previousRuntimeRetained: Boolean(deployment.runtimePlan.execution.metadata?.previousDeploymentId),
      ...(deployment.runtimePlan.execution.metadata?.previousDeploymentId ? { rollbackCandidateDeploymentId: deployment.runtimePlan.execution.metadata.previousDeploymentId } : {}),
    },
  };
}

export class RuntimeDeploymentProofEvidenceReader implements DeploymentProofRuntimeEvidenceReader {
  constructor(
    private readonly serverRepository?: ServerRepository,
    private readonly commandRunner: DeploymentProofCommandRunner = runDeploymentProofCommand,
    private readonly routeFetch: DeploymentProofRouteFetch = directManagedRouteFetch,
  ) {}

  async read(
    context: ExecutionContext,
    deployment: DeploymentSummary,
    input: DeploymentProofRuntimeEvidenceInput = { currentManagedRoutes: [] },
  ): Promise<Result<DeploymentProofRuntimeEvidence>> {
    const provider = deployment.runtimePlan.target.providerKey;
    if (provider === "generic-ssh") {
      const serverId = deployment.runtimePlan.target.serverIds[0];
      if (!serverId || !this.serverRepository) {
        return ok(unavailable(deployment, "generic_ssh_runtime_readback_unavailable"));
      }
      const server = await this.serverRepository.findOne(
        toRepositoryContext(context),
        DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate(serverId)),
      );
      const state = server?.toState();
      if (!state) {
        return ok(unavailable(deployment, "generic_ssh_runtime_target_unavailable"));
      }
      const target = await sshProofTarget(state);
      if (!target) {
        return ok(unavailable(deployment, "generic_ssh_governed_credential_unavailable"));
      }
      try {
        const inspect = await this.commandRunner([
          "ssh",
          ...sshProofArgs(
            target,
            ash.render(renderGenericSshDeploymentProofInspectScript(deployment)),
          ),
        ]);
        if (!inspect.ok) {
          return ok(unavailable(deployment, "generic_ssh_docker_inspect_unavailable"));
        }
        try {
          const evidence = deploymentProofEvidenceFromDockerInspect(
            deployment,
            JSON.parse(inspect.stdout) as DockerInspectState,
          );
          return ok({
            ...evidence,
            access: await readDeploymentProofManagedRouteEvidence(
              deployment,
              this.routeFetch,
              input.currentManagedRoutes,
            ),
          });
        } catch {
          return ok(unavailable(deployment, "generic_ssh_docker_inspect_invalid"));
        }
      } finally {
        await target.cleanup();
      }
    }

    if (provider === "docker-swarm") {
      const serviceId = await this.commandRunner(["docker", "service", "ls", "-q", "--filter", `label=appaloft.resource-id=${deployment.resourceId}`]);
      if (!serviceId.ok || !serviceId.stdout.split(/\s+/u)[0]) return ok(unavailable(deployment, "docker_swarm_service_unavailable"));
      const inspect = await this.commandRunner(["docker", "service", "inspect", serviceId.stdout.split(/\s+/u)[0]!, "--format", "{{json .}}"]);
      if (!inspect.ok) return ok(unavailable(deployment, "docker_swarm_inspect_unavailable"));
      try {
        const evidence = deploymentProofEvidenceFromDockerInspect(
          deployment,
          JSON.parse(inspect.stdout) as DockerInspectState,
        );
        return ok({
          ...evidence,
          access: await readDeploymentProofManagedRouteEvidence(
            deployment,
            this.routeFetch,
            input.currentManagedRoutes,
          ),
        });
      } catch {
        return ok(unavailable(deployment, "docker_swarm_inspect_invalid"));
      }
    }

    if (provider !== "local-shell") return ok(unavailable(deployment, "runtime_target_readback_unsupported"));
    const containerId = await this.commandRunner(["docker", "ps", "-aq", "--filter", `label=appaloft.resource-id=${deployment.resourceId}`]);
    const firstContainerId = containerId.stdout.split(/\s+/u)[0];
    if (!containerId.ok || !firstContainerId) return ok(unavailable(deployment, "docker_container_unavailable"));
    const inspect = await this.commandRunner(["docker", "inspect", firstContainerId, "--format", "{{json .}}"]);
    if (!inspect.ok) return ok(unavailable(deployment, "docker_inspect_unavailable"));
    try {
      const evidence = deploymentProofEvidenceFromDockerInspect(
        deployment,
        JSON.parse(inspect.stdout) as DockerInspectState,
      );
      return ok({
        ...evidence,
        access: await readDeploymentProofManagedRouteEvidence(
          deployment,
          this.routeFetch,
          input.currentManagedRoutes,
        ),
      });
    } catch {
      return ok(unavailable(deployment, "docker_inspect_invalid"));
    }
  }
}
