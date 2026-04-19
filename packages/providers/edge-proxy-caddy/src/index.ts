import {
  type EdgeProxyDiagnosticsInput,
  type EdgeProxyDiagnosticsPlan,
  type EdgeProxyEnsureInput,
  type EdgeProxyEnsurePlan,
  type EdgeProxyExecutionContext,
  type EdgeProxyProvider,
  type EdgeProxyProviderCapabilities,
  type EdgeProxyRouteInput,
  type ProxyConfigurationRouteView,
  type ProxyConfigurationTlsDiagnostic,
  type ProxyConfigurationView,
  type ProxyConfigurationViewInput,
  type ProxyReloadInput,
  type ProxyReloadPlan,
  type ProxyRouteRealizationInput,
  type ProxyRouteRealizationPlan,
} from "@appaloft/application";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";

export const caddyEdgeNetworkName = "appaloft-edge";
const caddyImage = "lucaslorentz/caddy-docker-proxy:2.9-alpine";

const capabilities: EdgeProxyProviderCapabilities = {
  ensureProxy: true,
  dockerLabels: true,
  reloadProxy: true,
  configurationView: true,
  runtimeLogs: false,
  diagnostics: true,
};

function hostPort(input: number | undefined, fallback: number): number {
  if (input === undefined) {
    return fallback;
  }

  return Number.isInteger(input) && input > 0 && input <= 65535 ? input : fallback;
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function labelsForCaddy(input: {
  route: EdgeProxyRouteInput;
  port: number;
  index: number;
}): string[] {
  const suffix = input.index === 0 ? "" : `_${input.index}`;
  const scheme = input.route.tlsMode === "auto" ? "https" : "http";
  const site = input.route.domains.map((domain) => `${scheme}://${domain}`).join(", ");
  const path = input.route.pathPrefix === "/" ? "" : `${input.route.pathPrefix}*`;
  const reverseProxy = `{{upstreams ${input.route.targetPort ?? input.port}}}`;

  return path
    ? [
        `caddy${suffix}=${site}`,
        `caddy${suffix}.handle_path=${path}`,
        `caddy${suffix}.handle_path.reverse_proxy=${reverseProxy}`,
      ]
    : [`caddy${suffix}=${site}`, `caddy${suffix}.reverse_proxy=${reverseProxy}`];
}

function routeScheme(route: EdgeProxyRouteInput): "http" | "https" {
  return route.tlsMode === "auto" ? "https" : "http";
}

function routeUrl(input: {
  hostname: string;
  scheme: "http" | "https";
  pathPrefix: string;
}): string {
  const path = input.pathPrefix === "/" ? "" : input.pathPrefix;
  return `${input.scheme}://${input.hostname}${path}`;
}

function routeSource(input: ProxyConfigurationViewInput): ProxyConfigurationRouteView["source"] {
  return input.routeScope === "planned" ? "generated-default" : "deployment-snapshot";
}

function routeViews(input: ProxyConfigurationViewInput): ProxyConfigurationRouteView[] {
  const source = routeSource(input);

  return input.accessRoutes.flatMap((route) =>
    route.domains.map((hostname) => {
      const scheme = routeScheme(route);
      return {
        hostname,
        scheme,
        url: routeUrl({ hostname, scheme, pathPrefix: route.pathPrefix }),
        pathPrefix: route.pathPrefix,
        tlsMode: route.tlsMode,
        ...(route.targetPort === undefined ? {} : { targetPort: route.targetPort }),
        source,
      };
    }),
  );
}

function tlsDiagnostics(input: ProxyConfigurationViewInput): ProxyConfigurationTlsDiagnostic[] {
  return input.accessRoutes.flatMap((route) =>
    route.domains.map((hostname) => {
      const scheme = routeScheme(route);
      const enabled = route.tlsMode === "auto";

      return {
        hostname,
        pathPrefix: route.pathPrefix,
        tlsMode: route.tlsMode,
        scheme,
        automation: enabled ? "provider-local" : "disabled",
        certificateSource: enabled ? "provider-local" : "none",
        appaloftCertificateManaged: false,
        message: enabled
          ? "Caddy terminates TLS through resident provider-local certificate automation; no Appaloft Certificate aggregate is created for this route."
          : "TLS is disabled for this Caddy route.",
        details: enabled
          ? {
              siteScheme: "https",
              certificateStore: "appaloft-caddy-data",
              automationOwner: "caddy-docker-proxy",
            }
          : {
              siteScheme: "http",
            },
      };
    }),
  );
}

export class CaddyEdgeProxyProvider implements EdgeProxyProvider {
  readonly key = "caddy";
  readonly displayName = "Caddy";
  readonly capabilities = capabilities;

  async ensureProxy(
    _context: EdgeProxyExecutionContext,
    input: EdgeProxyEnsureInput,
  ): Promise<Result<EdgeProxyEnsurePlan, DomainError>> {
    if (input.proxyKind !== "caddy") {
      return err(
        domainError.proxyProviderUnavailable("Caddy does not support this proxy kind", {
          phase: "proxy-ensure-plan-render",
          providerKey: this.key,
          proxyKind: input.proxyKind,
        }),
      );
    }

    const httpPort = hostPort(input.httpPort, 80);
    const httpsPort = hostPort(input.httpsPort, 443);
    const containerName = "appaloft-caddy";

    return ok({
      providerKey: this.key,
      proxyKind: "caddy",
      displayName: this.displayName,
      networkName: caddyEdgeNetworkName,
      networkCommand: `docker network inspect ${caddyEdgeNetworkName} >/dev/null 2>&1 || docker network create ${caddyEdgeNetworkName}`,
      containerName,
      containerCommand: [
        `docker inspect -f '{{.State.Running}}' ${containerName} 2>/dev/null | grep true >/dev/null || (docker rm -f ${containerName} >/dev/null 2>&1 || true; docker run -d`,
        "--restart unless-stopped",
        `--name ${containerName}`,
        `--network ${caddyEdgeNetworkName}`,
        `-p ${httpPort}:80`,
        `-p ${httpsPort}:443`,
        "-v /var/run/docker.sock:/var/run/docker.sock",
        "-v appaloft-caddy-data:/data",
        "-v appaloft-caddy-config:/config",
        `-e CADDY_INGRESS_NETWORKS=${caddyEdgeNetworkName}`,
        caddyImage,
        ")",
      ].join(" "),
      metadata: {
        httpPort: String(httpPort),
        httpsPort: String(httpsPort),
        image: caddyImage,
      },
    });
  }

  async diagnoseProxy(
    _context: EdgeProxyExecutionContext,
    input: EdgeProxyDiagnosticsInput,
  ): Promise<Result<EdgeProxyDiagnosticsPlan, DomainError>> {
    if (input.proxyKind !== "caddy") {
      return err(
        domainError.proxyProviderUnavailable("Caddy does not support this proxy kind", {
          phase: "proxy-diagnostics-plan-render",
          providerKey: this.key,
          proxyKind: input.proxyKind,
        }),
      );
    }

    const containerName = "appaloft-caddy";

    return ok({
      providerKey: this.key,
      proxyKind: "caddy",
      displayName: this.displayName,
      checks: [
        {
          name: "edge-proxy-container",
          command: [
            `actual="$(docker inspect -f 'status={{.State.Status}} image={{.Config.Image}}' ${shellQuote(containerName)} 2>/dev/null)"`,
            'printf "%s\\n" "$actual"',
            `[ "$actual" = ${shellQuote(`status=running image=${caddyImage}`)} ]`,
          ].join("; "),
          timeoutMs: 8_000,
          successMessage: "Caddy proxy container image is compatible",
          failureMessage:
            "Caddy proxy container is missing, stopped, or running an unsupported image",
          metadata: {
            containerName,
            expectedImage: caddyImage,
          },
        },
        {
          name: "edge-proxy-provider-logs",
          command: [
            `logs="$(docker logs --tail 80 ${shellQuote(containerName)} 2>&1 || true)"`,
            'printf "%s\\n" "$logs" | tail -n 20',
            '! printf "%s\\n" "$logs" | grep -E \'ERROR|Error|failed|Failed\'',
          ].join("; "),
          timeoutMs: 8_000,
          successMessage: "Caddy Docker provider logs have no recent errors",
          failureMessage: "Caddy Docker provider logs contain recent errors",
          metadata: {
            containerName,
          },
        },
      ],
      metadata: {
        image: caddyImage,
      },
    });
  }

  async realizeRoutes(
    _context: EdgeProxyExecutionContext,
    input: ProxyRouteRealizationInput,
  ): Promise<Result<ProxyRouteRealizationPlan, DomainError>> {
    const providerRoutes = input.accessRoutes.filter((route) => route.proxyKind === "caddy");
    const labels = providerRoutes.flatMap((route, index) =>
      labelsForCaddy({ route, port: input.port, index }),
    );

    return ok({
      providerKey: this.key,
      labels,
      ...(labels.length > 0 ? { networkName: caddyEdgeNetworkName } : {}),
      metadata: {
        routeCount: String(providerRoutes.length),
      },
    });
  }

  async reloadProxy(
    _context: EdgeProxyExecutionContext,
    input: ProxyReloadInput,
  ): Promise<Result<ProxyReloadPlan, DomainError>> {
    if (input.proxyKind !== "caddy") {
      return err(
        domainError.proxyProviderUnavailable("Caddy does not support this proxy kind", {
          phase: "proxy-reload-plan-render",
          providerKey: this.key,
          proxyKind: input.proxyKind,
        }),
      );
    }

    const routeCount = input.accessRoutes.filter((route) => route.proxyKind === "caddy").length;

    return ok({
      providerKey: this.key,
      proxyKind: "caddy",
      displayName: this.displayName,
      required: routeCount > 0,
      steps:
        routeCount > 0
          ? [
              {
                name: "caddy-docker-provider-reload",
                mode: "automatic",
                successMessage:
                  "Caddy Docker proxy watches container label changes and activates routes automatically",
                metadata: {
                  routeCount: String(routeCount),
                  reason: input.reason,
                },
              },
            ]
          : [],
      metadata: {
        routeCount: String(routeCount),
        routeLabelCount: String(input.routePlan.labels.length),
      },
    });
  }

  async renderConfigurationView(
    context: EdgeProxyExecutionContext,
    input: ProxyConfigurationViewInput,
  ): Promise<Result<ProxyConfigurationView, DomainError>> {
    const realized = await this.realizeRoutes(context, {
      deploymentId: input.deploymentId ?? "planned",
      port: input.port,
      accessRoutes: input.accessRoutes,
    });

    if (realized.isErr()) {
      return err(realized.error);
    }

    const routeTlsDiagnostics = tlsDiagnostics(input);
    const diagnostics = input.includeDiagnostics
      ? {
          providerKey: this.key,
          routeCount: input.accessRoutes.length,
          ...(realized.value.networkName ? { networkName: realized.value.networkName } : {}),
          tlsRoutes: routeTlsDiagnostics,
          ...(realized.value.metadata ? { metadata: realized.value.metadata } : {}),
        }
      : undefined;

    return ok({
      resourceId: input.resourceId,
      ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
      providerKey: this.key,
      routeScope: input.routeScope,
      status: input.status,
      generatedAt: input.generatedAt,
      ...(input.lastAppliedDeploymentId
        ? { lastAppliedDeploymentId: input.lastAppliedDeploymentId }
        : {}),
      stale: input.stale,
      routes: routeViews(input),
      sections:
        realized.value.labels.length > 0
          ? [
              {
                id: "caddy-docker-labels",
                title: "Caddy Docker labels",
                format: "docker-labels",
                language: "properties",
                readonly: true,
                redacted: false,
                content: realized.value.labels.join("\n"),
                source: "provider-rendered",
              },
            ]
          : [],
      warnings: [],
      ...(diagnostics ? { diagnostics } : {}),
    });
  }
}

export const caddyEdgeProxyProvider = new CaddyEdgeProxyProvider();
