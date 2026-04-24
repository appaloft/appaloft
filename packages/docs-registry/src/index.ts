export const publicDocsBasePath = "/docs";

export const publicDocsLocales = ["zh-CN", "en-US"] as const;
export type PublicDocsLocale = (typeof publicDocsLocales)[number];

export const defaultPublicDocsLocale: PublicDocsLocale = "zh-CN";

export const publicDocsHelpSurfaces = [
  "web",
  "cli",
  "http-api",
  "repository-config",
  "mcp",
] as const;
export type PublicDocsHelpSurface = (typeof publicDocsHelpSurfaces)[number];

export interface PublicDocsHelpTopic {
  readonly id: PublicDocsHelpTopicId;
  readonly title: string;
  readonly description: string;
  readonly page: Readonly<Record<PublicDocsLocale, string>>;
  readonly anchor: string;
  readonly localeCoverage: Readonly<
    Record<PublicDocsLocale, "complete" | "stub" | "needs-update" | "deferred">
  >;
  readonly surfaces: readonly PublicDocsHelpSurface[];
  readonly relatedOperation?: string;
  readonly aliases: readonly string[];
  readonly specReferences?: readonly string[];
  readonly webSurfaces?: readonly string[];
}

export const publicDocsHelpTopics = {
  "project.concept": {
    id: "project.concept",
    title: "Project",
    description: "How projects group resources, environments, and deployment history.",
    page: {
      "zh-CN": "resources/projects",
      "en-US": "en/resources/projects",
    },
    anchor: "concept-project",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "projects.create",
    aliases: ["project", "workspace", "应用项目", "项目"],
  },
  "resource.concept": {
    id: "resource.concept",
    title: "Resource",
    description: "What an Appaloft resource represents from the user's perspective.",
    page: {
      "zh-CN": "resources/projects",
      "en-US": "en/resources/projects",
    },
    anchor: "concept-resource",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "resources.create",
    aliases: ["resource", "app", "service", "资源"],
  },
  "project.lifecycle": {
    id: "project.lifecycle",
    title: "Project lifecycle",
    description:
      "How to read, rename, and archive projects without turning deployments into project-owned actions.",
    page: {
      "zh-CN": "resources/projects",
      "en-US": "en/resources/projects",
    },
    anchor: "project-lifecycle",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "projects.show",
    aliases: ["project show", "project rename", "project archive", "project lifecycle", "项目归档"],
    specReferences: [
      "docs/workflows/project-lifecycle.md",
      "docs/queries/projects.show.md",
      "docs/commands/projects.rename.md",
      "docs/commands/projects.archive.md",
      "docs/testing/project-lifecycle-test-matrix.md",
    ],
    webSurfaces: ["apps/web project detail/settings surfaces"],
  },
  "server.deployment-target": {
    id: "server.deployment-target",
    title: "Server deployment target",
    description: "What a server means as a deployment target in Appaloft.",
    page: {
      "zh-CN": "servers/register-connect",
      "en-US": "en/servers/register-connect",
    },
    anchor: "server-deployment-target",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "servers.register",
    aliases: [
      "server",
      "target",
      "ssh host",
      "server rename",
      "rename server",
      "edge proxy",
      "proxy kind",
      "服务器",
    ],
    specReferences: [
      "docs/workflows/deployment-target-lifecycle.md",
      "docs/queries/servers.show.md",
      "docs/commands/servers.rename.md",
      "docs/commands/servers.configure-edge-proxy.md",
      "docs/commands/servers.deactivate.md",
      "docs/queries/servers.delete-check.md",
      "docs/commands/servers.delete.md",
      "docs/events/server-renamed.md",
      "docs/events/server-edge-proxy-configured.md",
      "docs/events/server-deleted.md",
      "docs/errors/servers.lifecycle.md",
      "docs/testing/deployment-target-lifecycle-test-matrix.md",
      "docs/workflows/server-bootstrap-and-proxy.md",
    ],
    webSurfaces: ["apps/web server list/detail and registration surfaces"],
  },
  "deployment.lifecycle": {
    id: "deployment.lifecycle",
    title: "Deployment lifecycle",
    description: "Detect, plan, execute, verify, and rollback deployment stages.",
    page: {
      "zh-CN": "deploy/lifecycle",
      "en-US": "en/deploy/lifecycle",
    },
    anchor: "deployment-lifecycle",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "deployments.create",
    aliases: ["deploy", "deployment", "verify", "rollback", "部署", "回滚"],
  },
  "deployment.source": {
    id: "deployment.source",
    title: "Deployment source",
    description:
      "How local folders, Git repositories, container images, and static sites become deployment input.",
    page: {
      "zh-CN": "deploy/sources",
      "en-US": "en/deploy/sources",
    },
    anchor: "deployment-source",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "repository-config", "mcp"],
    relatedOperation: "deployments.create",
    aliases: ["source", "pathOrSource", "repository", "docker image", "static site", "来源"],
  },
  "deployment.source-relink": {
    id: "deployment.source-relink",
    title: "Source relink",
    description: "How to recover by attaching a resource to a new deployment source.",
    page: {
      "zh-CN": "deploy/recovery",
      "en-US": "en/deploy/recovery",
    },
    anchor: "deployment-source-relink",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "source-links.relink",
    aliases: ["relink", "source link", "move repository", "重新关联来源"],
  },
  "deployment.preview-cleanup": {
    id: "deployment.preview-cleanup",
    title: "Preview cleanup",
    description: "How to remove temporary preview deployments without touching production.",
    page: {
      "zh-CN": "deploy/recovery",
      "en-US": "en/deploy/recovery",
    },
    anchor: "deployment-preview-cleanup",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "mcp"],
    relatedOperation: "deployments.cleanup-preview",
    aliases: ["preview cleanup", "pull request preview", "temporary deployment", "预览清理"],
  },
  "resource.source-profile": {
    id: "resource.source-profile",
    title: "Resource source profile",
    description: "How source settings are attached to a resource before deployment.",
    page: {
      "zh-CN": "resources/profiles/source-runtime",
      "en-US": "en/resources/profiles/source-runtime",
    },
    anchor: "resource-source-profile",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "repository-config", "mcp"],
    relatedOperation: "resources.configure-source",
    aliases: ["resource source", "source profile", "git source", "资源来源"],
  },
  "resource.runtime-profile": {
    id: "resource.runtime-profile",
    title: "Resource runtime profile",
    description: "How runtime settings describe the process Appaloft should run.",
    page: {
      "zh-CN": "resources/profiles/source-runtime",
      "en-US": "en/resources/profiles/source-runtime",
    },
    anchor: "resource-runtime-profile",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "repository-config", "mcp"],
    relatedOperation: "resources.configure-runtime",
    aliases: ["runtime", "start command", "port", "运行时"],
  },
  "resource.health-profile": {
    id: "resource.health-profile",
    title: "Resource health profile",
    description: "How readiness and health checks affect deployment verification.",
    page: {
      "zh-CN": "resources/profiles/health-network",
      "en-US": "en/resources/profiles/health-network",
    },
    anchor: "resource-health-profile",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "repository-config", "mcp"],
    relatedOperation: "resources.configure-health",
    aliases: ["health", "readiness", "probe", "健康检查"],
  },
  "resource.network-profile": {
    id: "resource.network-profile",
    title: "Resource network profile",
    description: "How ports and routing inputs shape resource access.",
    page: {
      "zh-CN": "resources/profiles/health-network",
      "en-US": "en/resources/profiles/health-network",
    },
    anchor: "resource-network-profile",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "repository-config", "mcp"],
    relatedOperation: "resources.configure-network",
    aliases: ["network", "port", "proxy", "网络配置"],
  },
  "server.ssh-credential": {
    id: "server.ssh-credential",
    title: "SSH credential",
    description: "How Appaloft uses SSH credentials for server connectivity and deployment.",
    page: {
      "zh-CN": "servers/credentials/ssh-keys",
      "en-US": "en/servers/credentials/ssh-keys",
    },
    anchor: "server-ssh-credential-path",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "servers.configure-credential",
    aliases: ["ssh", "credential", "private key", "server credential", "delete credential", "凭据"],
    specReferences: [
      "docs/workflows/ssh-credential-lifecycle.md",
      "docs/queries/credentials.show.md",
      "docs/commands/credentials.delete-ssh.md",
      "docs/errors/credentials.lifecycle.md",
      "docs/testing/ssh-credential-lifecycle-test-matrix.md",
      "docs/implementation/ssh-credential-lifecycle-plan.md",
    ],
    webSurfaces: [
      "apps/web server registration, Quick Deploy credential step, credential detail surfaces, and saved credential destructive delete dialog",
    ],
  },
  "server.connectivity-test": {
    id: "server.connectivity-test",
    title: "Server connectivity test",
    description: "How to validate that Appaloft can reach and prepare a server.",
    page: {
      "zh-CN": "servers/register-connect",
      "en-US": "en/servers/register-connect",
    },
    anchor: "server-connectivity-test",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "servers.test-connectivity",
    aliases: ["connectivity", "doctor", "ssh test", "连接测试"],
  },
  "server.proxy-readiness": {
    id: "server.proxy-readiness",
    title: "Proxy readiness",
    description: "How the edge proxy affects default access and resource routing.",
    page: {
      "zh-CN": "servers/operations/proxy-and-terminal",
      "en-US": "en/servers/operations/proxy-and-terminal",
    },
    anchor: "server-proxy-readiness",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "servers.bootstrap-proxy",
    aliases: [
      "proxy",
      "caddy",
      "traefik",
      "default access",
      "configure proxy",
      "proxy kind",
      "代理",
    ],
    specReferences: [
      "docs/decisions/ADR-017-default-access-domain-and-proxy-routing.md",
      "docs/decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md",
      "docs/commands/servers.configure-edge-proxy.md",
      "docs/events/server-edge-proxy-configured.md",
      "docs/workflows/server-bootstrap-and-proxy.md",
      "docs/testing/deployment-target-lifecycle-test-matrix.md",
    ],
    webSurfaces: [
      "apps/web/src/routes/servers/[serverId]/+page.svelte: server edge proxy intent selector",
    ],
  },
  "default-access.policy": {
    id: "default-access.policy",
    title: "Default access policy",
    description:
      "How the system default and server override select generated access route behavior.",
    page: {
      "zh-CN": "access/generated-routes",
      "en-US": "en/access/generated-routes",
    },
    anchor: "default-access-policy",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "default-access-domain-policies.configure",
    aliases: ["default access policy", "provider key", "sslip", "系统默认访问策略"],
    specReferences: [
      "docs/decisions/ADR-017-default-access-domain-and-proxy-routing.md",
      "docs/commands/default-access-domain-policies.configure.md",
      "docs/workflows/default-access-domain-and-proxy-routing.md",
      "docs/testing/default-access-domain-and-proxy-routing-test-matrix.md",
    ],
    webSurfaces: [
      "apps/web/src/routes/servers/+page.svelte: system default access policy form",
      "apps/web/src/routes/servers/[serverId]/+page.svelte: server default access override form",
    ],
  },
  "server.terminal-session": {
    id: "server.terminal-session",
    title: "Terminal session",
    description: "How to open terminal sessions for controlled server or resource troubleshooting.",
    page: {
      "zh-CN": "servers/operations/proxy-and-terminal",
      "en-US": "en/servers/operations/proxy-and-terminal",
    },
    anchor: "server-terminal-session",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "terminal-sessions.open",
    aliases: ["terminal", "shell", "ssh session", "终端"],
  },
  "environment.concept": {
    id: "environment.concept",
    title: "Environment",
    description: "How environments separate deploy-time configuration sets.",
    page: {
      "zh-CN": "environments/model",
      "en-US": "en/environments/model",
    },
    anchor: "concept-environment",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "repository-config", "mcp"],
    relatedOperation: "environments.create",
    aliases: ["environment", "stage", "production", "环境"],
  },
  "environment.variable-precedence": {
    id: "environment.variable-precedence",
    title: "Variable precedence",
    description: "How Appaloft resolves environment variables and deployment snapshots.",
    page: {
      "zh-CN": "environments/variables/precedence",
      "en-US": "en/environments/variables/precedence",
    },
    anchor: "environment-variable-precedence",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "repository-config", "mcp"],
    relatedOperation: "environments.set-variable",
    aliases: ["env", "variables", "secret", "snapshot", "环境变量"],
  },
  "environment.diff-promote": {
    id: "environment.diff-promote",
    title: "Environment diff and promote",
    description: "How to compare configuration sets and promote one environment into another.",
    page: {
      "zh-CN": "environments/changes/diff-promote",
      "en-US": "en/environments/changes/diff-promote",
    },
    anchor: "environment-diff",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "environments.diff",
    aliases: ["diff", "promote", "compare env", "环境对比", "提升环境"],
  },
  "domain.generated-access-route": {
    id: "domain.generated-access-route",
    title: "Generated access URL",
    description: "How Appaloft creates the default access route for a deployed resource.",
    page: {
      "zh-CN": "access/generated-routes",
      "en-US": "en/access/generated-routes",
    },
    anchor: "access-generated-route",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "domain-bindings.create",
    aliases: ["access route", "url", "domain", "proxy", "访问地址"],
    specReferences: [
      "docs/decisions/ADR-017-default-access-domain-and-proxy-routing.md",
      "docs/workflows/default-access-domain-and-proxy-routing.md",
      "docs/testing/default-access-domain-and-proxy-routing-test-matrix.md",
    ],
    webSurfaces: [
      "apps/web/src/routes/resources/[resourceId]/+page.svelte: resource access area",
      "apps/web/src/routes/deployments/[deploymentId]/+page.svelte: deployment access URL area",
    ],
  },
  "domain.custom-domain-binding": {
    id: "domain.custom-domain-binding",
    title: "Custom domain binding",
    description: "How a custom domain is attached to a resource.",
    page: {
      "zh-CN": "access/domains/custom-domains",
      "en-US": "en/access/domains/custom-domains",
    },
    anchor: "domain-binding-purpose",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "repository-config", "mcp"],
    relatedOperation: "domain-bindings.create",
    aliases: ["custom domain", "domain binding", "hostname", "自定义域名"],
  },
  "domain.ownership-check": {
    id: "domain.ownership-check",
    title: "Domain ownership check",
    description: "How Appaloft verifies that a user controls a custom domain.",
    page: {
      "zh-CN": "access/domains/ownership",
      "en-US": "en/access/domains/ownership",
    },
    anchor: "domain-binding-ownership-check",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "domain-bindings.confirm-ownership",
    aliases: ["ownership", "dns verification", "domain verify", "所有权"],
  },
  "certificate.readiness": {
    id: "certificate.readiness",
    title: "Certificate readiness",
    description: "How imported or issued certificates make custom domains ready.",
    page: {
      "zh-CN": "access/tls/certificates",
      "en-US": "en/access/tls/certificates",
    },
    anchor: "certificate-readiness",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "certificates.issue-or-renew",
    aliases: ["certificate", "tls", "https", "证书"],
  },
  "observability.runtime-logs": {
    id: "observability.runtime-logs",
    title: "Runtime logs",
    description: "How to inspect runtime and deployment logs from user-facing entrypoints.",
    page: {
      "zh-CN": "observe/logs-health",
      "en-US": "en/observe/logs-health",
    },
    anchor: "observe-runtime-logs",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "resources.runtime-logs",
    aliases: ["logs", "runtime logs", "deployment logs", "日志"],
  },
  "observability.health-summary": {
    id: "observability.health-summary",
    title: "Health summary",
    description: "How to read health status and troubleshoot readiness failures.",
    page: {
      "zh-CN": "observe/logs-health",
      "en-US": "en/observe/logs-health",
    },
    anchor: "observe-health-summary",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "resources.health",
    aliases: ["health summary", "readiness status", "status", "健康摘要"],
  },
  "diagnostics.safe-support-payload": {
    id: "diagnostics.safe-support-payload",
    title: "Safe diagnostic summary",
    description: "What to copy for troubleshooting without exposing secret values.",
    page: {
      "zh-CN": "observe/diagnostics",
      "en-US": "en/observe/diagnostics",
    },
    anchor: "diagnostic-summary-copy-support-payload",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "resources.diagnostic-summary",
    aliases: ["diagnostic", "support payload", "logs", "secret masking", "诊断"],
  },
  "advanced.control-plane": {
    id: "advanced.control-plane",
    title: "Control-plane modes",
    description: "How local control-plane and database operations fit self-hosted usage.",
    page: {
      "zh-CN": "self-hosting/advanced",
      "en-US": "en/self-hosting/advanced",
    },
    anchor: "advanced-control-plane-modes",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "system.doctor",
    aliases: ["doctor", "database", "control plane", "控制面"],
  },
  "advanced.provider-boundary": {
    id: "advanced.provider-boundary",
    title: "Provider boundary",
    description: "How providers expose capabilities without leaking provider-specific details.",
    page: {
      "zh-CN": "integrations/providers",
      "en-US": "en/integrations/providers",
    },
    anchor: "advanced-provider-boundary",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "system.providers.list",
    aliases: ["provider", "capability", "cloud provider", "provider 边界"],
  },
  "advanced.plugin-boundary": {
    id: "advanced.plugin-boundary",
    title: "Plugin boundary",
    description: "How plugin discovery and compatibility fit Appaloft extension points.",
    page: {
      "zh-CN": "integrations/plugins",
      "en-US": "en/integrations/plugins",
    },
    anchor: "advanced-plugin-boundary",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "system.plugins.list",
    aliases: ["plugin", "extension", "compatibility", "插件"],
  },
  "http-api.openapi-reference": {
    id: "http-api.openapi-reference",
    title: "OpenAPI reference",
    description:
      "Where to find the OpenAPI document, Scalar API reference, and generated docs pages.",
    page: {
      "zh-CN": "reference/http-api",
      "en-US": "en/reference/http-api",
    },
    anchor: "api-openapi-reference",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["http-api"],
    aliases: ["openapi", "scalar", "api reference", "接口文档"],
  },
} as const satisfies Record<string, Omit<PublicDocsHelpTopic, "id"> & { id: string }>;

export type PublicDocsHelpTopicId = keyof typeof publicDocsHelpTopics;

export function getPublicDocsHelpTopic(topicId: PublicDocsHelpTopicId): PublicDocsHelpTopic {
  return publicDocsHelpTopics[topicId];
}

export function resolvePublicDocsHelpHref(
  topicId: PublicDocsHelpTopicId,
  input: {
    locale?: PublicDocsLocale;
    basePath?: string;
  } = {},
): string {
  const topic = getPublicDocsHelpTopic(topicId);
  const locale = input.locale ?? defaultPublicDocsLocale;
  const basePath = normalizeDocsBasePath(input.basePath ?? publicDocsBasePath);
  const page = topic.page[locale].replace(/^\/+|\/+$/g, "");

  return `${basePath}/${page}/#${topic.anchor}`;
}

export type PublicDocsOperationCoverageStatus = "documented" | "migration-gap" | "not-applicable";

export type PublicDocsOperationCoverage =
  | {
      readonly operationKey: string;
      readonly status: "documented";
      readonly topicId: PublicDocsHelpTopicId;
      readonly note?: string;
    }
  | {
      readonly operationKey: string;
      readonly status: "migration-gap";
      readonly reason: string;
      readonly targetTopicId?: PublicDocsHelpTopicId;
      readonly targetPage?: string;
    }
  | {
      readonly operationKey: string;
      readonly status: "not-applicable";
      readonly reason: string;
    };

export const publicDocsOperationCoverage = [
  { operationKey: "projects.create", status: "documented", topicId: "project.concept" },
  { operationKey: "projects.list", status: "documented", topicId: "project.concept" },
  { operationKey: "projects.show", status: "documented", topicId: "project.lifecycle" },
  { operationKey: "projects.rename", status: "documented", topicId: "project.lifecycle" },
  { operationKey: "projects.archive", status: "documented", topicId: "project.lifecycle" },
  { operationKey: "servers.register", status: "documented", topicId: "server.deployment-target" },
  {
    operationKey: "servers.configure-credential",
    status: "documented",
    topicId: "server.ssh-credential",
  },
  {
    operationKey: "credentials.create-ssh",
    status: "documented",
    topicId: "server.ssh-credential",
  },
  {
    operationKey: "credentials.list-ssh",
    status: "documented",
    topicId: "server.ssh-credential",
  },
  {
    operationKey: "credentials.show",
    status: "documented",
    topicId: "server.ssh-credential",
  },
  {
    operationKey: "credentials.delete-ssh",
    status: "documented",
    topicId: "server.ssh-credential",
  },
  { operationKey: "servers.list", status: "documented", topicId: "server.deployment-target" },
  { operationKey: "servers.show", status: "documented", topicId: "server.deployment-target" },
  { operationKey: "servers.rename", status: "documented", topicId: "server.deployment-target" },
  {
    operationKey: "servers.configure-edge-proxy",
    status: "documented",
    topicId: "server.proxy-readiness",
  },
  { operationKey: "servers.deactivate", status: "documented", topicId: "server.deployment-target" },
  {
    operationKey: "servers.delete-check",
    status: "documented",
    topicId: "server.deployment-target",
  },
  { operationKey: "servers.delete", status: "documented", topicId: "server.deployment-target" },
  {
    operationKey: "servers.test-connectivity",
    status: "documented",
    topicId: "server.connectivity-test",
  },
  {
    operationKey: "servers.test-draft-connectivity",
    status: "documented",
    topicId: "server.connectivity-test",
  },
  {
    operationKey: "servers.bootstrap-proxy",
    status: "documented",
    topicId: "server.proxy-readiness",
  },
  { operationKey: "resources.list", status: "documented", topicId: "resource.concept" },
  { operationKey: "resources.show", status: "documented", topicId: "resource.concept" },
  { operationKey: "resources.create", status: "documented", topicId: "resource.concept" },
  { operationKey: "resources.archive", status: "documented", topicId: "resource.concept" },
  { operationKey: "resources.delete", status: "documented", topicId: "resource.concept" },
  {
    operationKey: "resources.configure-health",
    status: "documented",
    topicId: "resource.health-profile",
  },
  {
    operationKey: "resources.configure-source",
    status: "documented",
    topicId: "resource.source-profile",
  },
  {
    operationKey: "resources.configure-runtime",
    status: "documented",
    topicId: "resource.runtime-profile",
  },
  {
    operationKey: "resources.configure-network",
    status: "documented",
    topicId: "resource.network-profile",
  },
  {
    operationKey: "resources.runtime-logs",
    status: "documented",
    topicId: "observability.runtime-logs",
  },
  {
    operationKey: "terminal-sessions.open",
    status: "documented",
    topicId: "server.terminal-session",
  },
  {
    operationKey: "resources.diagnostic-summary",
    status: "documented",
    topicId: "diagnostics.safe-support-payload",
  },
  {
    operationKey: "resources.health",
    status: "documented",
    topicId: "observability.health-summary",
  },
  {
    operationKey: "resources.proxy-configuration.preview",
    status: "documented",
    topicId: "resource.network-profile",
  },
  { operationKey: "environments.create", status: "documented", topicId: "environment.concept" },
  { operationKey: "environments.list", status: "documented", topicId: "environment.concept" },
  { operationKey: "environments.show", status: "documented", topicId: "environment.concept" },
  {
    operationKey: "environments.set-variable",
    status: "documented",
    topicId: "environment.variable-precedence",
  },
  {
    operationKey: "environments.unset-variable",
    status: "documented",
    topicId: "environment.variable-precedence",
  },
  {
    operationKey: "resources.set-variable",
    status: "documented",
    topicId: "environment.variable-precedence",
  },
  {
    operationKey: "resources.unset-variable",
    status: "documented",
    topicId: "environment.variable-precedence",
  },
  {
    operationKey: "resources.effective-config",
    status: "documented",
    topicId: "environment.variable-precedence",
  },
  { operationKey: "environments.diff", status: "documented", topicId: "environment.diff-promote" },
  {
    operationKey: "environments.promote",
    status: "documented",
    topicId: "environment.diff-promote",
  },
  {
    operationKey: "deployments.cleanup-preview",
    status: "documented",
    topicId: "deployment.preview-cleanup",
  },
  { operationKey: "deployments.create", status: "documented", topicId: "deployment.lifecycle" },
  { operationKey: "deployments.list", status: "documented", topicId: "deployment.lifecycle" },
  { operationKey: "deployments.show", status: "documented", topicId: "deployment.lifecycle" },
  { operationKey: "deployments.logs", status: "documented", topicId: "observability.runtime-logs" },
  {
    operationKey: "deployments.stream-events",
    status: "documented",
    topicId: "deployment.lifecycle",
  },
  {
    operationKey: "source-links.relink",
    status: "documented",
    topicId: "deployment.source-relink",
  },
  {
    operationKey: "default-access-domain-policies.configure",
    status: "documented",
    topicId: "default-access.policy",
  },
  {
    operationKey: "domain-bindings.create",
    status: "documented",
    topicId: "domain.custom-domain-binding",
  },
  {
    operationKey: "domain-bindings.confirm-ownership",
    status: "documented",
    topicId: "domain.ownership-check",
  },
  {
    operationKey: "domain-bindings.list",
    status: "documented",
    topicId: "domain.custom-domain-binding",
  },
  {
    operationKey: "certificates.import",
    status: "documented",
    topicId: "certificate.readiness",
  },
  {
    operationKey: "certificates.issue-or-renew",
    status: "documented",
    topicId: "certificate.readiness",
  },
  { operationKey: "certificates.list", status: "documented", topicId: "certificate.readiness" },
  {
    operationKey: "system.providers.list",
    status: "documented",
    topicId: "advanced.provider-boundary",
  },
  {
    operationKey: "system.plugins.list",
    status: "documented",
    topicId: "advanced.plugin-boundary",
  },
  {
    operationKey: "system.github-repositories.list",
    status: "documented",
    topicId: "deployment.source",
  },
  { operationKey: "system.doctor", status: "documented", topicId: "advanced.control-plane" },
  { operationKey: "system.db-status", status: "documented", topicId: "advanced.control-plane" },
  { operationKey: "system.db-migrate", status: "documented", topicId: "advanced.control-plane" },
] as const satisfies readonly PublicDocsOperationCoverage[];

const publicDocsOperationCoverageByKey: ReadonlyMap<string, PublicDocsOperationCoverage> = new Map(
  publicDocsOperationCoverage.map((coverage) => [coverage.operationKey, coverage] as const),
);

export function getPublicDocsOperationCoverage(
  operationKey: string,
): PublicDocsOperationCoverage | undefined {
  return publicDocsOperationCoverageByKey.get(operationKey);
}

function normalizeDocsBasePath(input: string): string {
  const trimmed = input.trim().replace(/\/+$/g, "");

  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
