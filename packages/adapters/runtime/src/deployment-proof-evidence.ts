import { connect as connectTcp, isIP } from "node:net";
import { connect as connectTls } from "node:tls";
import {
  deploymentProofConfigurationFingerprint,
  deploymentProofEnvironmentKeyFingerprint,
  type DeploymentProofRuntimeEvidence,
  type DeploymentProofRuntimeEvidenceReader,
  type DeploymentSummary,
  type ExecutionContext,
} from "@appaloft/application";
import { deploymentRouteIdentityHeaderName, ok, type Result } from "@appaloft/core";

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

function managedRouteUrls(deployment: DeploymentSummary): string[] {
  const healthPath = deployment.runtimePlan.execution.healthCheckPath ?? "/";
  return (deployment.runtimePlan.execution.accessRoutes ?? [])
    .filter(
      (route) =>
        route.proxyKind !== "none" &&
        route.routeBehavior !== "redirect" &&
        !route.redirectTo,
    )
    .flatMap((route) =>
      route.domains.map((domain) => {
        const scheme = route.tlsMode === "auto" ? "https" : "http";
        return `${scheme}://${domain}${joinRoutePath(route.pathPrefix, healthPath)}`;
      }),
    );
}

export async function readDeploymentProofManagedRouteEvidence(
  deployment: DeploymentSummary,
  fetchImpl: DeploymentProofRouteFetch = directManagedRouteFetch,
): Promise<DeploymentProofRuntimeEvidence["access"]> {
  const urls = managedRouteUrls(deployment);
  if (urls.length === 0) {
    return {
      status: "passed",
      routeTargetsWorkload: true,
      summary: "No managed public route identity is required",
    };
  }

  for (const url of urls) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          redirect: "follow",
          signal: AbortSignal.timeout(5_000),
        });
      } catch (error) {
        return {
          status: "failed",
          routeTargetsWorkload: false,
          summary: `Managed public route probe failed for ${url}: ${
            error instanceof Error ? error.message : "unknown fetch error"
          }`,
          reasonCode: "public_route_probe_failed",
        };
      }

      if (!response.ok) {
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
      if (observedDeploymentId === deployment.id) break;
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
    summary: `Managed public route served deployment ${deployment.id}`,
  };
}

async function run(args: string[]): Promise<{ ok: boolean; stdout: string }> {
  try {
    const process = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    const [stdout, exitCode] = await Promise.all([new Response(process.stdout).text(), process.exited]);
    return { ok: exitCode === 0, stdout: stdout.trim() };
  } catch {
    return { ok: false, stdout: "" };
  }
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
  async read(_context: ExecutionContext, deployment: DeploymentSummary): Promise<Result<DeploymentProofRuntimeEvidence>> {
    const provider = deployment.runtimePlan.target.providerKey;
    if (provider === "generic-ssh") return ok(unavailable(deployment, "generic_ssh_runtime_readback_unavailable"));

    if (provider === "docker-swarm") {
      const serviceId = await run(["docker", "service", "ls", "-q", "--filter", `label=appaloft.resource-id=${deployment.resourceId}`]);
      if (!serviceId.ok || !serviceId.stdout.split(/\s+/u)[0]) return ok(unavailable(deployment, "docker_swarm_service_unavailable"));
      const inspect = await run(["docker", "service", "inspect", serviceId.stdout.split(/\s+/u)[0]!, "--format", "{{json .}}"]);
      if (!inspect.ok) return ok(unavailable(deployment, "docker_swarm_inspect_unavailable"));
      try {
        const evidence = deploymentProofEvidenceFromDockerInspect(
          deployment,
          JSON.parse(inspect.stdout) as DockerInspectState,
        );
        return ok({
          ...evidence,
          access: await readDeploymentProofManagedRouteEvidence(deployment),
        });
      } catch {
        return ok(unavailable(deployment, "docker_swarm_inspect_invalid"));
      }
    }

    if (provider !== "local-shell") return ok(unavailable(deployment, "runtime_target_readback_unsupported"));
    const containerId = await run(["docker", "ps", "-aq", "--filter", `label=appaloft.resource-id=${deployment.resourceId}`]);
    const firstContainerId = containerId.stdout.split(/\s+/u)[0];
    if (!containerId.ok || !firstContainerId) return ok(unavailable(deployment, "docker_container_unavailable"));
    const inspect = await run(["docker", "inspect", firstContainerId, "--format", "{{json .}}"]);
    if (!inspect.ok) return ok(unavailable(deployment, "docker_inspect_unavailable"));
    try {
      const evidence = deploymentProofEvidenceFromDockerInspect(
        deployment,
        JSON.parse(inspect.stdout) as DockerInspectState,
      );
      return ok({
        ...evidence,
        access: await readDeploymentProofManagedRouteEvidence(deployment),
      });
    } catch {
      return ok(unavailable(deployment, "docker_inspect_invalid"));
    }
  }
}
