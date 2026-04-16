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
  type ProxyConfigurationView,
  type ProxyConfigurationViewInput,
  type ProxyRouteRealizationInput,
  type ProxyRouteRealizationPlan,
} from "@yundu/application";
import { type DomainError, domainError, err, ok, type Result } from "@yundu/core";

export const traefikEdgeNetworkName = "yundu-edge";
const traefikImage = "traefik:v3.6.2";

const capabilities: EdgeProxyProviderCapabilities = {
  ensureProxy: true,
  dockerLabels: true,
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

function sanitizeRouteName(input: { deploymentId: string; suffix?: string }): string {
  return [input.deploymentId, input.suffix]
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9-]/g, "-");
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function traefikRule(route: EdgeProxyRouteInput): string {
  const hostRule = route.domains.map((domain) => `Host(\`${domain}\`)`).join(" || ");
  return route.pathPrefix === "/"
    ? hostRule
    : `(${hostRule}) && PathPrefix(\`${route.pathPrefix}\`)`;
}

function routeProbeCommand(input: {
  httpPort: number;
  networkName: string;
  token: string;
}): string {
  const containerName = `yundu-proxy-probe-${input.token}`;
  const router = `yundu-proxy-probe-${input.token}`;
  const service = `${router}-svc`;
  const hostname = `${router}.local.yundu.test`;
  const url = `http://127.0.0.1:${input.httpPort}/ping`;
  const hostHeader = `Host: ${hostname}`;

  return [
    `cleanup() { docker rm -f ${shellQuote(containerName)} >/dev/null 2>&1 || true; }`,
    [
      "probe_http() {",
      "if command -v curl >/dev/null 2>&1; then",
      `curl -fsS --max-time 2 -H ${shellQuote(hostHeader)} ${shellQuote(url)} >/dev/null`,
      "else",
      `wget -q --timeout=2 --header=${shellQuote(hostHeader)} -O /dev/null ${shellQuote(url)}`,
      "fi",
      "}",
    ].join(" "),
    [
      "dump_http() {",
      "if command -v curl >/dev/null 2>&1; then",
      `curl -sS -i --max-time 2 -H ${shellQuote(hostHeader)} ${shellQuote(url)} || true`,
      "else",
      `wget -S --timeout=2 --header=${shellQuote(hostHeader)} -O - ${shellQuote(url)} || true`,
      "fi",
      "}",
    ].join(" "),
    "trap cleanup EXIT",
    "cleanup",
    [
      "docker run -d",
      `--name ${shellQuote(containerName)}`,
      `--network ${shellQuote(input.networkName)}`,
      "--label traefik.enable=true",
      `--label ${shellQuote(`traefik.docker.network=${input.networkName}`)}`,
      `--label ${shellQuote(`traefik.http.routers.${router}.rule=Host(\`${hostname}\`)`)}`,
      `--label ${shellQuote(`traefik.http.routers.${router}.entrypoints=web`)}`,
      `--label ${shellQuote(`traefik.http.routers.${router}.service=${service}`)}`,
      `--label ${shellQuote(`traefik.http.services.${service}.loadbalancer.server.port=80`)}`,
      traefikImage,
      "--ping=true",
      "--entrypoints.web.address=:80",
      "--ping.entrypoint=web",
      ">/dev/null",
    ].join(" "),
    [
      "i=0",
      'while [ "$i" -lt 15 ]; do',
      "if probe_http; then",
      `printf '%s\\n' ${shellQuote(`Traefik Docker label route probe passed for ${hostname}`)}`,
      "exit 0",
      "fi",
      "i=$((i + 1))",
      "sleep 1",
      "done",
    ].join("; "),
    "dump_http",
    "exit 1",
  ].join("; ");
}

function labelsForTraefik(input: {
  deploymentId: string;
  route: EdgeProxyRouteInput;
  port: number;
  index: number;
}): string[] {
  const router = sanitizeRouteName({
    deploymentId: input.deploymentId,
    ...(input.index === 0 ? {} : { suffix: String(input.index) }),
  });
  const service = `${router}-svc`;
  const entrypoint = input.route.tlsMode === "auto" ? "websecure" : "web";

  return [
    "traefik.enable=true",
    `traefik.docker.network=${traefikEdgeNetworkName}`,
    `traefik.http.routers.${router}.rule=${traefikRule(input.route)}`,
    `traefik.http.routers.${router}.entrypoints=${entrypoint}`,
    ...(input.route.tlsMode === "auto" ? [`traefik.http.routers.${router}.tls=true`] : []),
    `traefik.http.routers.${router}.service=${service}`,
    `traefik.http.services.${service}.loadbalancer.server.port=${input.route.targetPort ?? input.port}`,
  ];
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

export class TraefikEdgeProxyProvider implements EdgeProxyProvider {
  readonly key = "traefik";
  readonly displayName = "Traefik";
  readonly capabilities = capabilities;

  async ensureProxy(
    _context: EdgeProxyExecutionContext,
    input: EdgeProxyEnsureInput,
  ): Promise<Result<EdgeProxyEnsurePlan, DomainError>> {
    if (input.proxyKind !== "traefik") {
      return err(
        domainError.proxyProviderUnavailable("Traefik does not support this proxy kind", {
          phase: "proxy-ensure-plan-render",
          providerKey: this.key,
          proxyKind: input.proxyKind,
        }),
      );
    }

    const httpPort = hostPort(input.httpPort, 80);
    const httpsPort = hostPort(input.httpsPort, 443);
    const containerName = "yundu-traefik";
    const runningWithExpectedImageCommand = [
      `docker inspect -f '{{.State.Running}}' ${containerName} 2>/dev/null | grep true >/dev/null`,
      `[ "$(docker inspect -f '{{.Config.Image}}' ${containerName} 2>/dev/null)" = "${traefikImage}" ]`,
    ].join(" && ");

    return ok({
      providerKey: this.key,
      proxyKind: "traefik",
      displayName: this.displayName,
      networkName: traefikEdgeNetworkName,
      networkCommand: `docker network inspect ${traefikEdgeNetworkName} >/dev/null 2>&1 || docker network create ${traefikEdgeNetworkName}`,
      containerName,
      containerCommand: [
        `${runningWithExpectedImageCommand} || (docker rm -f ${containerName} >/dev/null 2>&1 || true; docker run -d`,
        "--restart unless-stopped",
        `--name ${containerName}`,
        `--network ${traefikEdgeNetworkName}`,
        `-p ${httpPort}:80`,
        `-p ${httpsPort}:443`,
        "-v /var/run/docker.sock:/var/run/docker.sock:ro",
        traefikImage,
        "--providers.docker=true",
        "--providers.docker.exposedbydefault=false",
        `--providers.docker.network=${traefikEdgeNetworkName}`,
        "--entrypoints.web.address=:80",
        "--entrypoints.websecure.address=:443",
        ")",
      ].join(" "),
      metadata: {
        httpPort: String(httpPort),
        httpsPort: String(httpsPort),
        image: traefikImage,
      },
    });
  }

  async diagnoseProxy(
    _context: EdgeProxyExecutionContext,
    input: EdgeProxyDiagnosticsInput,
  ): Promise<Result<EdgeProxyDiagnosticsPlan, DomainError>> {
    if (input.proxyKind !== "traefik") {
      return err(
        domainError.proxyProviderUnavailable("Traefik does not support this proxy kind", {
          phase: "proxy-diagnostics-plan-render",
          providerKey: this.key,
          proxyKind: input.proxyKind,
        }),
      );
    }

    const httpPort = hostPort(input.httpPort, 80);
    const containerName = "yundu-traefik";
    const token = Date.now().toString(36);

    return ok({
      providerKey: this.key,
      proxyKind: "traefik",
      displayName: this.displayName,
      checks: [
        {
          name: "edge-proxy-container",
          command: [
            `actual="$(docker inspect -f 'status={{.State.Status}} image={{.Config.Image}}' ${shellQuote(containerName)} 2>/dev/null)"`,
            'printf "%s\\n" "$actual"',
            `[ "$actual" = ${shellQuote(`status=running image=${traefikImage}`)} ]`,
          ].join("; "),
          timeoutMs: 8_000,
          successMessage: "Traefik proxy container image is compatible",
          failureMessage:
            "Traefik proxy container is missing, stopped, or running an unsupported image",
          metadata: {
            containerName,
            expectedImage: traefikImage,
          },
        },
        {
          name: "edge-proxy-provider-logs",
          command: [
            `logs="$(docker logs --tail 80 ${shellQuote(containerName)} 2>&1 || true)"`,
            'printf "%s\\n" "$logs" | tail -n 20',
            '! printf "%s\\n" "$logs" | grep -E \'client version .* too old|Provider error|Failed to retrieve information of the docker client\'',
          ].join("; "),
          timeoutMs: 8_000,
          successMessage: "Traefik Docker provider logs have no compatibility errors",
          failureMessage: "Traefik Docker provider logs contain compatibility errors",
          metadata: {
            containerName,
          },
        },
        {
          name: "edge-proxy-route-probe",
          command: routeProbeCommand({
            httpPort,
            networkName: traefikEdgeNetworkName,
            token,
          }),
          timeoutMs: 30_000,
          successMessage: "Traefik can discover Docker labels and route to a probe container",
          failureMessage: "Traefik could not route to a Docker label probe container",
          metadata: {
            containerName,
            networkName: traefikEdgeNetworkName,
            expectedImage: traefikImage,
          },
        },
      ],
      metadata: {
        image: traefikImage,
        httpPort: String(httpPort),
      },
    });
  }

  async realizeRoutes(
    _context: EdgeProxyExecutionContext,
    input: ProxyRouteRealizationInput,
  ): Promise<Result<ProxyRouteRealizationPlan, DomainError>> {
    const providerRoutes = input.accessRoutes.filter((route) => route.proxyKind === "traefik");
    const labels = providerRoutes.flatMap((route, index) =>
      labelsForTraefik({
        deploymentId: input.deploymentId,
        route,
        port: input.port,
        index,
      }),
    );

    return ok({
      providerKey: this.key,
      labels,
      ...(labels.length > 0 ? { networkName: traefikEdgeNetworkName } : {}),
      metadata: {
        routeCount: String(providerRoutes.length),
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

    const diagnostics = input.includeDiagnostics
      ? {
          providerKey: this.key,
          routeCount: input.accessRoutes.length,
          ...(realized.value.networkName ? { networkName: realized.value.networkName } : {}),
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
                id: "traefik-docker-labels",
                title: "Traefik Docker labels",
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

export const traefikEdgeProxyProvider = new TraefikEdgeProxyProvider();
