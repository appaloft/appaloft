import {
  createAdapterSpanName,
  type DeploymentHealthCheck,
  type DeploymentHealthChecker,
  type DeploymentHealthResult,
  type ExecutionContext,
} from "@yundu/application";
import { ok, type Deployment, type Result } from "@yundu/core";

function normalizeHealthCheckPath(path: string | undefined): string {
  if (!path || path.trim() === "") {
    return "/";
  }

  return path.startsWith("/") ? path : `/${path}`;
}

function joinRouteAndHealthPath(pathPrefix: string, healthPath: string): string {
  const normalizedPrefix = pathPrefix === "/" ? "" : pathPrefix.replace(/\/$/, "");
  return healthPath === "/" ? `${normalizedPrefix}/` : `${normalizedPrefix}${healthPath}`;
}

function pushUniqueUrl(urls: string[], url: string | undefined): string[] {
  if (!url || urls.includes(url)) {
    return urls;
  }

  return [...urls, url];
}

function deploymentHealthUrls(deployment: Deployment): string[] {
  const state = deployment.toState();
  const execution = state.runtimePlan.execution;
  const metadata = execution.metadata ?? {};
  const targetMetadata = state.runtimePlan.target.metadata ?? {};
  const healthPath = normalizeHealthCheckPath(execution.healthCheckPath);
  let urls: string[] = [];

  urls = pushUniqueUrl(urls, metadata.publicUrl);
  urls = pushUniqueUrl(urls, metadata.url);

  for (const route of execution.accessRoutes) {
    const path = joinRouteAndHealthPath(route.pathPrefix, healthPath);

    if (route.domains.length > 0) {
      const scheme = route.tlsMode === "auto" ? "https" : "http";
      for (const domain of route.domains) {
        urls = pushUniqueUrl(urls, `${scheme}://${domain}${path}`);
      }
      continue;
    }

    if (route.proxyKind === "none" && targetMetadata.serverHost) {
      const port = route.targetPort ?? execution.port;
      if (port) {
        urls = pushUniqueUrl(urls, `http://${targetMetadata.serverHost}:${port}${path}`);
      }
    }
  }

  return urls;
}

async function fetchHealth(url: string): Promise<{
  ok: boolean;
  durationMs: number;
  message: string;
  statusCode?: number;
}> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    return {
      ok: response.ok,
      durationMs,
      message: response.ok
        ? `Health check passed for ${url}`
        : `Health check returned HTTP ${response.status} for ${url}`,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      message: `Health check failed for ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function resultStatus(checks: DeploymentHealthCheck[]): DeploymentHealthResult["status"] {
  const passed = checks.filter((check) => check.status === "passed").length;

  if (passed === checks.length && checks.length > 0) {
    return "healthy";
  }

  if (passed > 0) {
    return "degraded";
  }

  return "unreachable";
}

export class RuntimeDeploymentHealthChecker implements DeploymentHealthChecker {
  async check(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<DeploymentHealthResult>> {
    return context.tracer.startActiveSpan(
      createAdapterSpanName("runtime_deployment_health_checker", "check"),
      {
        attributes: {},
      },
      async () => {
        const deploymentId = deployment.toState().id.value;
        const urls = deploymentHealthUrls(deployment);

        if (urls.length === 0) {
          return ok({
            deploymentId,
            checkedAt: new Date().toISOString(),
            status: "unreachable",
            checks: [
              {
                name: "deployment-health-url",
                status: "failed",
                message: "Deployment has no public health URL or access route metadata",
                durationMs: 0,
              },
            ],
          });
        }

        const checks: DeploymentHealthCheck[] = [];

        for (const url of urls) {
          const result = await fetchHealth(url);
          checks.push({
            name: url,
            status: result.ok ? "passed" : "failed",
            message: result.message,
            durationMs: result.durationMs,
            metadata: {
              url,
              ...(result.statusCode ? { statusCode: String(result.statusCode) } : {}),
            },
          });
        }

        return ok({
          deploymentId,
          checkedAt: new Date().toISOString(),
          status: resultStatus(checks),
          checks,
        });
      },
    );
  }
}

