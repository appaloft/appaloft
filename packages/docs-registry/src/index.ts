export const publicDocsBasePath = "/docs";

export type PublicDocsErrorKnowledgeResponsibility =
  | "user"
  | "operator"
  | "system"
  | "provider"
  | "appaloft";

export type PublicDocsErrorKnowledgeActionability =
  | "fix-input"
  | "wait-retry"
  | "run-diagnostic"
  | "auto-recoverable"
  | "report-bug"
  | "no-user-action";

export type PublicDocsErrorKnowledgeLinkRel =
  | "human-doc"
  | "llm-guide"
  | "runbook"
  | "spec"
  | "source-symbol"
  | "support";

export interface PublicDocsErrorKnowledgeLink {
  readonly rel: PublicDocsErrorKnowledgeLinkRel;
  readonly href: string;
  readonly mediaType?: string;
  readonly title?: string;
}

export type PublicDocsErrorKnowledgeRemedyKind =
  | "retry"
  | "command"
  | "workflow-action"
  | "diagnostic"
  | "none";

export interface PublicDocsErrorKnowledgeRemedy {
  readonly kind: PublicDocsErrorKnowledgeRemedyKind;
  readonly label: string;
  readonly safeByDefault: boolean;
  readonly command?: readonly string[];
}

export interface PublicDocsErrorKnowledge {
  readonly responsibility: PublicDocsErrorKnowledgeResponsibility;
  readonly actionability: PublicDocsErrorKnowledgeActionability;
  readonly operation?: string;
  readonly links?: readonly PublicDocsErrorKnowledgeLink[];
  readonly remedies?: readonly PublicDocsErrorKnowledgeRemedy[];
}

function errorKnowledgeGuideKey(input: { code: string; phase?: string }): string {
  return input.phase ? `${input.code}.${input.phase}` : input.code;
}

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
  "errors.knowledge-contract": {
    id: "errors.knowledge-contract",
    title: "Error knowledge contract",
    description:
      "How Appaloft errors connect stable machine fields, human documentation, and agent-readable recovery guidance.",
    page: {
      "zh-CN": "reference/errors-statuses",
      "en-US": "en/reference/errors-statuses",
    },
    anchor: "error-knowledge-contract",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    aliases: ["error knowledge", "structured errors", "llm guide", "错误知识", "错误契约"],
    specReferences: [
      "docs/decisions/ADR-033-error-knowledge-contract.md",
      "docs/errors/model.md",
      "docs/testing/error-knowledge-contract-test-matrix.md",
    ],
  },
  "errors.remote-state-lock": {
    id: "errors.remote-state-lock",
    title: "Remote state lock",
    description:
      "How to understand and recover SSH remote-state lock errors in pure CLI and GitHub Actions deployments.",
    page: {
      "zh-CN": "reference/errors-statuses",
      "en-US": "en/reference/errors-statuses",
    },
    anchor: "remote-state-lock",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "repository-config", "mcp"],
    aliases: [
      "remote state lock",
      "ssh-pglite lock",
      "SSH remote state mutation lock",
      "remote-state-lock",
      "远端状态锁",
      "部署锁",
    ],
    specReferences: [
      "docs/decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md",
      "docs/decisions/ADR-028-command-coordination-scope-and-mutation-admission.md",
      "docs/workflows/deployment-config-file-bootstrap.md",
      "docs/testing/deployment-config-file-test-matrix.md",
    ],
  },
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
      "How to read, rename, and archive projects without turning deployments or runtime state into project-owned actions.",
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
    aliases: [
      "project show",
      "project rename",
      "project archive",
      "project lifecycle",
      "project settings",
      "deployment snapshot",
      "项目归档",
      "项目设置",
    ],
    specReferences: [
      "docs/workflows/project-lifecycle.md",
      "docs/queries/projects.show.md",
      "docs/commands/projects.rename.md",
      "docs/commands/projects.archive.md",
      "docs/testing/project-lifecycle-test-matrix.md",
      "docs/specs/008-project-lifecycle-settings-closure/spec.md",
    ],
    webSurfaces: ["apps/web project detail/settings surfaces with read-only rollups"],
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
  "server.docker-swarm-target": {
    id: "server.docker-swarm-target",
    title: "Docker Swarm runtime target",
    description:
      "How Docker Swarm cluster targets are registered, admitted, executed, observed, and recovered.",
    page: {
      "zh-CN": "servers/register-connect",
      "en-US": "en/servers/register-connect",
    },
    anchor: "docker-swarm-runtime-target",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "repository-config", "mcp"],
    relatedOperation: "servers.register",
    aliases: [
      "docker swarm",
      "swarm target",
      "orchestrator cluster",
      "runtime_target_unsupported",
      "stack deploy",
      "swarm manager",
      "集群目标",
      "Swarm",
    ],
    specReferences: [
      "docs/specs/045-docker-swarm-runtime-target/spec.md",
      "docs/testing/docker-swarm-runtime-target-test-matrix.md",
      "docs/workflows/deployment-runtime-target-abstraction.md",
      "docs/implementation/runtime-target-abstraction-plan.md",
    ],
    webSurfaces: ["apps/web server registration and deployment target help links."],
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
  "source.auto-deploy-setup": {
    id: "source.auto-deploy-setup",
    title: "Source auto-deploy setup",
    description:
      "How a Resource-owned auto-deploy policy turns verified source events into ordinary deployment requests.",
    page: {
      "zh-CN": "deploy/sources",
      "en-US": "en/deploy/sources",
    },
    anchor: "source-auto-deploy-setup",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "repository-config", "mcp"],
    relatedOperation: "resources.configure-auto-deploy",
    aliases: [
      "auto deploy",
      "webhook deploy",
      "resource auto-deploy",
      "source event deploy",
      "自动部署",
      "Webhook 部署",
    ],
    specReferences: [
      "docs/decisions/ADR-037-source-event-auto-deploy-ownership.md",
      "docs/commands/resources.configure-auto-deploy.md",
      "docs/specs/042-source-binding-auto-deploy/spec.md",
      "docs/testing/source-binding-auto-deploy-test-matrix.md",
    ],
    webSurfaces: ["apps/web Resource detail auto-deploy settings"],
  },
  "source.auto-deploy-signatures": {
    id: "source.auto-deploy-signatures",
    title: "Source auto-deploy signatures",
    description:
      "How verified provider webhooks and generic signed webhooks handle secrets safely.",
    page: {
      "zh-CN": "deploy/sources",
      "en-US": "en/deploy/sources",
    },
    anchor: "source-auto-deploy-signatures",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "repository-config", "mcp"],
    relatedOperation: "source-events.ingest",
    aliases: [
      "webhook signature",
      "generic signed webhook",
      "webhook secret",
      "signature verification",
      "签名校验",
      "Webhook secret",
    ],
    specReferences: [
      "docs/decisions/ADR-037-source-event-auto-deploy-ownership.md",
      "docs/commands/source-events.ingest.md",
      "docs/errors/source-events.md",
    ],
  },
  "source.auto-deploy-dedupe": {
    id: "source.auto-deploy-dedupe",
    title: "Source event dedupe",
    description:
      "How duplicate source event delivery is recorded without creating duplicate deployments.",
    page: {
      "zh-CN": "deploy/sources",
      "en-US": "en/deploy/sources",
    },
    anchor: "source-auto-deploy-dedupe",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "source-events.list",
    aliases: [
      "source event dedupe",
      "duplicate webhook",
      "delivery id",
      "idempotency key",
      "重复投递",
      "去重",
    ],
    specReferences: [
      "docs/decisions/ADR-037-source-event-auto-deploy-ownership.md",
      "docs/commands/source-events.ingest.md",
      "docs/queries/source-events.list.md",
      "docs/queries/source-events.show.md",
      "docs/testing/source-binding-auto-deploy-test-matrix.md",
    ],
  },
  "source.auto-deploy-ignored-events": {
    id: "source.auto-deploy-ignored-events",
    title: "Ignored source events",
    description:
      "How to read source events that were verified but ignored, blocked, or failed dispatch.",
    page: {
      "zh-CN": "deploy/sources",
      "en-US": "en/deploy/sources",
    },
    anchor: "source-auto-deploy-ignored-events",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "source-events.show",
    aliases: [
      "ignored webhook",
      "blocked source event",
      "source event reason",
      "policy blocked",
      "忽略事件",
      "阻塞事件",
    ],
    specReferences: [
      "docs/errors/source-events.md",
      "docs/queries/source-events.list.md",
      "docs/queries/source-events.show.md",
      "docs/testing/source-binding-auto-deploy-test-matrix.md",
    ],
    webSurfaces: ["apps/web Resource detail source event diagnostics"],
  },
  "source.auto-deploy-recovery": {
    id: "source.auto-deploy-recovery",
    title: "Source auto-deploy recovery",
    description:
      "How to recover from failed source event dispatch without replaying unsafe webhook payloads.",
    page: {
      "zh-CN": "deploy/sources",
      "en-US": "en/deploy/sources",
    },
    anchor: "source-auto-deploy-recovery",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "source-events.show",
    aliases: [
      "auto deploy recovery",
      "source event failed",
      "webhook failed deploy",
      "dispatch failed",
      "自动部署恢复",
      "Webhook 失败",
    ],
    specReferences: [
      "docs/commands/source-events.ingest.md",
      "docs/errors/source-events.md",
      "docs/queries/source-events.show.md",
      "docs/queries/deployments.recovery-readiness.md",
    ],
    webSurfaces: [
      "apps/web Resource detail source event diagnostics and deployment recovery links",
    ],
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
  "deployment.plan-preview": {
    id: "deployment.plan-preview",
    title: "Deployment plan preview",
    description:
      "How to inspect detected framework and buildpack accelerator evidence, planner selection, support tier, commands, network, health, access routing, and unsupported reasons before execution.",
    page: {
      "zh-CN": "deploy/lifecycle",
      "en-US": "en/deploy/lifecycle",
    },
    anchor: "deployment-plan-preview",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "deployments.plan",
    aliases: ["plan preview", "detect plan", "dry run", "部署计划预览", "部署前检查"],
    specReferences: [
      "docs/specs/013-deployment-plan-preview/spec.md",
      "docs/specs/017-buildpack-accelerator-contract-and-preview-guardrails/spec.md",
      "docs/queries/deployments.plan.md",
      "docs/testing/deployment-plan-preview-test-matrix.md",
      "docs/workflows/workload-framework-detection-and-planning.md",
    ],
    webSurfaces: ["apps/web deployment creation and resource detail plan preview surfaces"],
  },
  "deployment.recovery-readiness": {
    id: "deployment.recovery-readiness",
    title: "Deployment recovery readiness",
    description:
      "How to inspect retry, redeploy, rollback, and rollback candidate readiness before running recovery actions.",
    page: {
      "zh-CN": "deploy/recovery",
      "en-US": "en/deploy/recovery",
    },
    anchor: "deployment-recovery-readiness",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "deployments.recovery-readiness",
    aliases: [
      "deployment recovery",
      "recovery readiness",
      "retry readiness",
      "rollback candidates",
      "部署恢复",
      "恢复就绪",
      "回滚候选",
    ],
    specReferences: [
      "docs/decisions/ADR-034-deployment-recovery-readiness.md",
      "docs/specs/012-deployment-recovery-readiness/spec.md",
      "docs/queries/deployments.recovery-readiness.md",
      "docs/commands/deployments.retry.md",
      "docs/commands/deployments.redeploy.md",
      "docs/commands/deployments.rollback.md",
      "docs/testing/deployment-recovery-readiness-test-matrix.md",
    ],
    webSurfaces: ["apps/web deployment detail recovery panel"],
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
  "deployment.pr-preview-action": {
    id: "deployment.pr-preview-action",
    title: "Action-only pull request previews",
    description:
      "How to run pull request previews from a user-authored GitHub Actions workflow without changing deployment admission.",
    page: {
      "zh-CN": "deploy/previews",
      "en-US": "en/deploy/previews",
    },
    anchor: "deployment-pr-preview-action-workflow",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "repository-config", "mcp"],
    relatedOperation: "deployments.create",
    aliases: [
      "pull request preview",
      "PR preview",
      "deploy-action",
      "preview output",
      "preview-url",
      "预览部署",
      "PR 预览",
    ],
    specReferences: [
      "docs/workflows/github-action-pr-preview-deploy.md",
      "docs/testing/deployment-config-file-test-matrix.md",
      "docs/implementation/github-action-deploy-action-plan.md",
      "docs/decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md",
      "docs/decisions/ADR-025-control-plane-modes-and-action-execution.md",
      "docs/decisions/ADR-028-command-coordination-scope-and-mutation-admission.md",
    ],
  },
  "deployment.product-grade-previews": {
    id: "deployment.product-grade-previews",
    title: "Product-grade preview deployments",
    description:
      "How product-grade GitHub App and control-plane preview deployments differ from Action-only previews.",
    page: {
      "zh-CN": "deploy/previews",
      "en-US": "en/deploy/previews",
    },
    anchor: "product-grade-preview-deployments",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "repository-config", "mcp"],
    aliases: [
      "product-grade preview",
      "GitHub App preview",
      "preview environment",
      "preview policy",
      "preview cleanup retries",
      "控制平面预览",
      "GitHub App 预览",
    ],
    specReferences: [
      "docs/specs/046-product-grade-preview-deployments/spec.md",
      "docs/testing/product-grade-preview-deployments-test-matrix.md",
      "docs/workflows/github-action-pr-preview-deploy.md",
      "docs/specs/042-source-binding-auto-deploy/spec.md",
      "docs/decisions/ADR-025-control-plane-modes-and-action-execution.md",
      "docs/decisions/ADR-037-source-event-auto-deploy-ownership.md",
    ],
    webSurfaces: ["Future Cloud/self-hosted preview policy and preview environment surfaces"],
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
    aliases: [
      "resource source",
      "source profile",
      "git source",
      "durable profile",
      "deployment snapshot",
      "资源来源",
    ],
    specReferences: [
      "docs/decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md",
      "docs/commands/resources.configure-source.md",
      "docs/workflows/resource-profile-lifecycle.md",
      "docs/testing/resource-profile-lifecycle-test-matrix.md",
      "docs/specs/008-resource-detail-profile-editing/spec.md",
      "docs/specs/009-resource-detail-profile-editing-closure/spec.md",
    ],
    webSurfaces: ["apps/web/src/routes/resources/[resourceId]/+page.svelte: resource source form"],
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
    aliases: [
      "runtime",
      "start command",
      "future deployment",
      "no restart",
      "deployment snapshot",
      "运行时",
    ],
    specReferences: [
      "docs/decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md",
      "docs/commands/resources.configure-runtime.md",
      "docs/workflows/resource-profile-lifecycle.md",
      "docs/testing/resource-profile-lifecycle-test-matrix.md",
      "docs/specs/008-resource-detail-profile-editing/spec.md",
      "docs/specs/009-resource-detail-profile-editing-closure/spec.md",
    ],
    webSurfaces: [
      "apps/web/src/routes/resources/[resourceId]/+page.svelte: resource runtime profile form",
    ],
  },
  "resource.profile-drift": {
    id: "resource.profile-drift",
    title: "Resource profile drift",
    description:
      "How to read and fix differences between the current Resource profile, entry config, and deployment snapshots.",
    page: {
      "zh-CN": "resources/profiles/source-runtime",
      "en-US": "en/resources/profiles/source-runtime",
    },
    anchor: "resource-profile-drift",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "repository-config", "mcp"],
    relatedOperation: "resources.show",
    aliases: [
      "profile drift",
      "resource_profile_drift",
      "existing resource drift",
      "config deploy drift",
      "deployment snapshot drift",
      "资源配置漂移",
      "资源 profile 漂移",
    ],
    specReferences: [
      "docs/specs/011-resource-profile-drift-visibility/spec.md",
      "docs/queries/resources.show.md",
      "docs/workflows/deployment-config-file-bootstrap.md",
      "docs/testing/resource-profile-lifecycle-test-matrix.md",
      "docs/testing/deployment-config-file-test-matrix.md",
    ],
    webSurfaces: [
      "apps/web/src/routes/resources/[resourceId]/+page.svelte: resource diagnostics panel",
    ],
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
    specReferences: [
      "docs/decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md",
      "docs/decisions/ADR-020-resource-health-observation.md",
      "docs/commands/resources.configure-health.md",
      "docs/workflows/resource-profile-lifecycle.md",
      "docs/workflows/resource-health-observation.md",
      "docs/testing/resource-profile-lifecycle-test-matrix.md",
      "docs/testing/resource-health-test-matrix.md",
      "docs/specs/009-resource-detail-profile-editing-closure/spec.md",
    ],
    webSurfaces: [
      "apps/web/src/routes/resources/[resourceId]/+page.svelte: resource health policy form",
    ],
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
    aliases: [
      "network",
      "port",
      "proxy",
      "listener port",
      "future deployment",
      "no restart",
      "网络配置",
    ],
    specReferences: [
      "docs/decisions/ADR-015-resource-network-profile.md",
      "docs/commands/resources.configure-network.md",
      "docs/workflows/resource-profile-lifecycle.md",
      "docs/testing/resource-profile-lifecycle-test-matrix.md",
      "docs/specs/008-resource-detail-profile-editing/spec.md",
      "docs/specs/009-resource-detail-profile-editing-closure/spec.md",
    ],
    webSurfaces: [
      "apps/web/src/routes/resources/[resourceId]/+page.svelte: resource network profile form",
    ],
  },
  "resource.access-profile": {
    id: "resource.access-profile",
    title: "Resource access profile",
    description: "How one resource opts into or out of generated default access route planning.",
    page: {
      "zh-CN": "access/generated-routes",
      "en-US": "en/access/generated-routes",
    },
    anchor: "resource-access-profile",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "resources.configure-access",
    aliases: [
      "resource access",
      "access profile",
      "generated access",
      "disable default access",
      "资源访问配置",
    ],
    specReferences: [
      "docs/decisions/ADR-017-default-access-domain-and-proxy-routing.md",
      "docs/commands/resources.configure-access.md",
      "docs/events/resource-access-configured.md",
      "docs/workflows/resource-profile-lifecycle.md",
      "docs/testing/resource-profile-lifecycle-test-matrix.md",
      "docs/specs/007-resource-access-profile-configuration/spec.md",
      "docs/specs/009-resource-detail-profile-editing-closure/spec.md",
    ],
    webSurfaces: ["apps/web/src/routes/resources/[resourceId]/+page.svelte: resource access form"],
  },
  "storage.volume-lifecycle": {
    id: "storage.volume-lifecycle",
    title: "Storage volume lifecycle",
    description:
      "How durable storage volumes and resource storage attachments are validated and managed.",
    page: {
      "zh-CN": "resources/storage-volumes",
      "en-US": "en/resources/storage-volumes",
    },
    anchor: "storage-volume-lifecycle",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "storage-volumes.create",
    aliases: [
      "storage",
      "volume",
      "bind mount",
      "named volume",
      "resource attachment",
      "persistent storage",
      "持久化存储",
    ],
    specReferences: [
      "docs/workflows/storage-volume-lifecycle.md",
      "docs/workflows/resource-profile-lifecycle.md",
      "docs/testing/storage-volume-test-matrix.md",
      "docs/specs/032-storage-volume-lifecycle-and-resource-attachment/spec.md",
      "docs/commands/storage-volumes.create.md",
      "docs/commands/storage-volumes.rename.md",
      "docs/commands/storage-volumes.delete.md",
      "docs/commands/resources.attach-storage.md",
      "docs/commands/resources.detach-storage.md",
      "docs/queries/storage-volumes.list.md",
      "docs/queries/storage-volumes.show.md",
    ],
    webSurfaces: ["Web write UI deferred; resources.show can read storage attachment summary."],
  },
  "dependency.resource-lifecycle": {
    id: "dependency.resource-lifecycle",
    title: "Dependency resource lifecycle",
    description:
      "How Postgres and Redis dependency resources, Resource bindings, runtime injection readiness, secret rotation, backup, restore, and delete safety work.",
    page: {
      "zh-CN": "resources/dependencies",
      "en-US": "en/resources/dependencies",
    },
    anchor: "dependency-resource-lifecycle",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "dependency-resources.list",
    aliases: [
      "dependency resource",
      "postgres dependency",
      "redis dependency",
      "dependency binding",
      "database backup",
      "restore point",
      "依赖资源",
      "数据库绑定",
    ],
    specReferences: [
      "docs/workflows/dependency-resource-lifecycle.md",
      "docs/testing/dependency-resource-test-matrix.md",
      "docs/specs/033-postgres-dependency-resource-lifecycle/spec.md",
      "docs/specs/034-dependency-resource-binding-baseline/spec.md",
      "docs/specs/035-dependency-binding-snapshot-reference-baseline/spec.md",
      "docs/specs/036-dependency-binding-secret-rotation/spec.md",
      "docs/specs/037-redis-dependency-resource-lifecycle/spec.md",
      "docs/specs/038-postgres-provider-native-realization/spec.md",
      "docs/specs/039-dependency-resource-backup-restore/spec.md",
      "docs/specs/047-dependency-binding-runtime-injection/spec.md",
      "docs/decisions/ADR-040-dependency-binding-runtime-injection-boundary.md",
      "docs/commands/dependency-resources.provision-postgres.md",
      "docs/commands/dependency-resources.import-postgres.md",
      "docs/commands/dependency-resources.provision-redis.md",
      "docs/commands/dependency-resources.import-redis.md",
      "docs/commands/dependency-resources.rename.md",
      "docs/commands/dependency-resources.delete.md",
      "docs/commands/dependency-resources.create-backup.md",
      "docs/commands/dependency-resources.restore-backup.md",
      "docs/commands/resources.bind-dependency.md",
      "docs/commands/resources.unbind-dependency.md",
      "docs/commands/resources.rotate-dependency-binding-secret.md",
      "docs/queries/dependency-resources.list.md",
      "docs/queries/dependency-resources.show.md",
      "docs/queries/dependency-resources.list-backups.md",
      "docs/queries/dependency-resources.show-backup.md",
      "docs/queries/resources.list-dependency-bindings.md",
      "docs/queries/resources.show-dependency-binding.md",
    ],
    webSurfaces: [
      "Web dependency-resource write UI deferred; Resource detail can read binding summaries and dependency runtime injection readiness.",
    ],
  },
  "dependency.runtime-injection": {
    id: "dependency.runtime-injection",
    title: "Dependency runtime injection",
    description:
      "How bound Postgres and imported Redis dependencies are delivered to deployments, and how plan/show report blocked runtime injection readiness.",
    page: {
      "zh-CN": "resources/dependencies",
      "en-US": "en/resources/dependencies",
    },
    anchor: "dependency-runtime-injection",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "deployments.plan",
    aliases: [
      "dependency runtime injection",
      "dependency_runtime_injection_blocked",
      "runtimeInjection",
      "DATABASE_URL",
      "REDIS_URL",
      "依赖运行时注入",
    ],
    specReferences: [
      "docs/specs/047-dependency-binding-runtime-injection/spec.md",
      "docs/decisions/ADR-040-dependency-binding-runtime-injection-boundary.md",
      "docs/queries/deployments.plan.md",
      "docs/queries/deployments.show.md",
      "docs/commands/deployments.create.md",
      "docs/testing/dependency-resource-test-matrix.md",
      "docs/testing/deployments.create-test-matrix.md",
    ],
    webSurfaces: [
      "Deployment plan/show read surfaces can link blocked dependency runtime injection readiness to this anchor.",
    ],
  },
  "scheduled-task.resource-lifecycle": {
    id: "scheduled-task.resource-lifecycle",
    title: "Scheduled task lifecycle",
    description:
      "How Resource-owned scheduled tasks, immediate runs, run history, and task logs work.",
    page: {
      "zh-CN": "resources/scheduled-tasks",
      "en-US": "en/resources/scheduled-tasks",
    },
    anchor: "scheduled-task-resource-lifecycle",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "scheduled-tasks.create",
    aliases: [
      "scheduled task",
      "cron",
      "job",
      "task run",
      "run history",
      "task logs",
      "定时任务",
      "任务日志",
    ],
    specReferences: [
      "docs/decisions/ADR-039-scheduled-task-resource-ownership.md",
      "docs/specs/044-scheduled-task-resource-shape/spec.md",
      "docs/testing/scheduled-task-resource-test-matrix.md",
      "docs/architecture/async-lifecycle-and-acceptance.md",
    ],
    webSurfaces: ["Web controls deferred; CLI, HTTP/API, and future MCP help links are active."],
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
    aliases: [
      "ssh",
      "credential",
      "private key",
      "server credential",
      "delete credential",
      "rotate credential",
      "凭据",
    ],
    specReferences: [
      "docs/workflows/ssh-credential-lifecycle.md",
      "docs/queries/credentials.show.md",
      "docs/commands/credentials.delete-ssh.md",
      "docs/commands/credentials.rotate-ssh.md",
      "docs/errors/credentials.lifecycle.md",
      "docs/testing/ssh-credential-lifecycle-test-matrix.md",
      "docs/implementation/ssh-credential-lifecycle-plan.md",
    ],
    webSurfaces: [
      "apps/web server registration, Quick Deploy credential step, credential detail surfaces, saved credential destructive delete dialog, and saved credential rotation dialog",
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
      "docs/queries/default-access-domain-policies.show.md",
      "docs/queries/default-access-domain-policies.list.md",
      "docs/workflows/default-access-domain-and-proxy-routing.md",
      "docs/testing/default-access-domain-and-proxy-routing-test-matrix.md",
      "docs/specs/004-default-access-policy-readback/spec.md",
    ],
    webSurfaces: [
      "apps/web/src/routes/servers/+page.svelte: system default access policy form and readback",
      "apps/web/src/routes/servers/[serverId]/+page.svelte: server default access override form and readback",
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
  "environment.lifecycle": {
    id: "environment.lifecycle",
    title: "Environment lifecycle",
    description:
      "How active, locked, and archived environments affect configuration and deployment admission.",
    page: {
      "zh-CN": "environments/model",
      "en-US": "en/environments/model",
    },
    anchor: "environment-lifecycle",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "environments.archive",
    aliases: [
      "environment rename",
      "environment clone",
      "environment lock",
      "environment unlock",
      "environment archive",
      "locked environment",
      "archived environment",
      "env rename",
      "env clone",
      "env lock",
      "env archive",
      "环境重命名",
      "环境克隆",
      "环境锁定",
      "环境归档",
    ],
    specReferences: [
      "docs/workflows/environment-lifecycle.md",
      "docs/commands/environments.rename.md",
      "docs/commands/environments.clone.md",
      "docs/commands/environments.lock.md",
      "docs/commands/environments.unlock.md",
      "docs/commands/environments.archive.md",
      "docs/events/environment-renamed.md",
      "docs/events/environment-locked.md",
      "docs/events/environment-unlocked.md",
      "docs/events/environment-archived.md",
      "docs/errors/environments.lifecycle.md",
      "docs/testing/environment-lifecycle-test-matrix.md",
    ],
    webSurfaces: ["apps/web project detail environment lifecycle action"],
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
    specReferences: [
      "docs/queries/environments.effective-precedence.md",
      "docs/commands/resources.set-variable.md",
      "docs/commands/resources.import-variables.md",
      "docs/commands/resources.unset-variable.md",
      "docs/testing/environment-effective-precedence-test-matrix.md",
      "docs/queries/resources.effective-config.md",
      "docs/testing/resource-profile-lifecycle-test-matrix.md",
      "docs/specs/009-resource-detail-profile-editing-closure/spec.md",
      "docs/specs/031-resource-secret-operations-and-effective-config/spec.md",
    ],
    webSurfaces: [
      "apps/web/src/routes/resources/[resourceId]/+page.svelte: resource configuration section",
    ],
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
      "docs/specs/005-resource-access-route-precedence/spec.md",
    ],
    webSurfaces: [
      "apps/web/src/routes/resources/[resourceId]/+page.svelte: resource access area",
      "apps/web/src/lib/components/console/QuickDeploySheet.svelte: completion feedback",
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
  "resource.runtime-controls": {
    id: "resource.runtime-controls",
    title: "Resource runtime controls",
    description:
      "How planned stop, start, and restart controls affect current runtime state without creating a deployment.",
    page: {
      "zh-CN": "observe/logs-health",
      "en-US": "en/observe/logs-health",
    },
    anchor: "resource-runtime-controls",
    localeCoverage: {
      "zh-CN": "stub",
      "en-US": "stub",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "resources.runtime.restart",
    aliases: ["runtime controls", "stop start restart", "运行时控制", "重启"],
    specReferences: [
      "docs/decisions/ADR-038-resource-runtime-control-ownership.md",
      "docs/specs/043-resource-runtime-controls/spec.md",
      "docs/commands/resources.runtime.stop.md",
      "docs/commands/resources.runtime.start.md",
      "docs/commands/resources.runtime.restart.md",
      "docs/errors/resource-runtime-controls.md",
      "docs/queries/resources.health.md",
      "docs/testing/resource-runtime-controls-test-matrix.md",
    ],
    webSurfaces: ["Resource detail runtime controls"],
  },
  "resource.runtime-restart-vs-redeploy": {
    id: "resource.runtime-restart-vs-redeploy",
    title: "Restart versus redeploy",
    description: "Why runtime restart does not apply source, config, secret, or profile changes.",
    page: {
      "zh-CN": "observe/logs-health",
      "en-US": "en/observe/logs-health",
    },
    anchor: "runtime-restart-vs-redeploy",
    localeCoverage: {
      "zh-CN": "stub",
      "en-US": "stub",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "resources.runtime.restart",
    aliases: ["restart vs redeploy", "redeploy", "重启不是重新部署", "重新部署"],
    specReferences: [
      "docs/decisions/ADR-038-resource-runtime-control-ownership.md",
      "docs/specs/043-resource-runtime-controls/spec.md",
      "docs/commands/resources.runtime.restart.md",
      "docs/commands/deployments.redeploy.md",
      "docs/queries/deployments.recovery-readiness.md",
      "docs/testing/resource-runtime-controls-test-matrix.md",
    ],
    webSurfaces: ["Future Resource detail runtime restart action and recovery copy"],
  },
  "resource.runtime-control-blocked-start": {
    id: "resource.runtime-control-blocked-start",
    title: "Blocked runtime start",
    description: "How to recover when a runtime start is blocked by unsafe retained metadata.",
    page: {
      "zh-CN": "observe/logs-health",
      "en-US": "en/observe/logs-health",
    },
    anchor: "runtime-control-blocked-start",
    localeCoverage: {
      "zh-CN": "stub",
      "en-US": "stub",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "resources.runtime.start",
    aliases: ["blocked start", "start blocked", "启动被阻塞", "运行时启动"],
    specReferences: [
      "docs/specs/043-resource-runtime-controls/spec.md",
      "docs/commands/resources.runtime.start.md",
      "docs/errors/resource-runtime-controls.md",
      "docs/queries/resources.health.md",
      "docs/queries/deployments.recovery-readiness.md",
      "docs/testing/resource-runtime-controls-test-matrix.md",
    ],
    webSurfaces: ["Future Resource detail runtime start blocked-state guidance"],
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
  "diagnostics.access-failure-request-id": {
    id: "diagnostics.access-failure-request-id",
    title: "Access failure request-id lookup",
    description:
      "How to look up short-retention, support-safe access failure evidence by request id.",
    page: {
      "zh-CN": "observe/diagnostics",
      "en-US": "en/observe/diagnostics",
    },
    anchor: "access-failure-request-id-lookup",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "resources.access-failure-evidence.lookup",
    specReferences: [
      "docs/specs/024-access-failure-evidence-lookup/spec.md",
      "docs/queries/resources.access-failure-evidence.lookup.md",
      "docs/testing/resource-access-failure-diagnostics-test-matrix.md",
    ],
    aliases: [
      "request id",
      "access failure",
      "failure evidence",
      "edge error",
      "访问失败",
      "请求编号",
    ],
  },
  "diagnostics.runtime-target-capacity": {
    id: "diagnostics.runtime-target-capacity",
    title: "Runtime target capacity inspect",
    description: "How to inspect disk, inode, Docker, and Appaloft runtime usage without cleanup.",
    page: {
      "zh-CN": "observe/diagnostics",
      "en-US": "en/observe/diagnostics",
    },
    anchor: "runtime-target-capacity-inspect",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "servers.capacity.inspect",
    aliases: ["capacity", "disk full", "build cache", "docker system df", "容量诊断"],
  },
  "operator.work-ledger": {
    id: "operator.work-ledger",
    title: "Operator work ledger",
    description:
      "How to view background work attempts, failures, and next diagnostic actions without recovery mutations.",
    page: {
      "zh-CN": "reference/errors-statuses",
      "en-US": "en/reference/errors-statuses",
    },
    anchor: "operator-work-ledger",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "operator-work.list",
    specReferences: [
      "docs/decisions/ADR-029-deployment-event-stream-and-recovery-boundary.md",
      "docs/queries/operator-work.list.md",
      "docs/queries/operator-work.show.md",
      "docs/testing/operator-work-ledger-test-matrix.md",
      "docs/specs/010-operator-work-ledger/spec.md",
    ],
    webSurfaces: ["Web/MCP operator console backlog and CLI/HTTP background work visibility"],
    aliases: [
      "operator work",
      "work ledger",
      "background work",
      "attempt visibility",
      "failed attempts",
      "后台工作",
      "工作台账",
    ],
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

export interface PublicDocsErrorGuide {
  readonly id: PublicDocsErrorGuideId;
  readonly code: string;
  readonly phase?: string;
  readonly responsibility: PublicDocsErrorKnowledgeResponsibility;
  readonly actionability: PublicDocsErrorKnowledgeActionability;
  readonly operation?: string;
  readonly topicId: PublicDocsHelpTopicId;
  readonly agentGuidePath: string;
  readonly remedies: readonly PublicDocsErrorKnowledgeRemedy[];
  readonly specReferences: readonly string[];
}

export const publicDocsErrorGuides = {
  "infra_error.remote-state-lock": {
    id: "infra_error.remote-state-lock",
    code: "infra_error",
    phase: "remote-state-lock",
    responsibility: "operator",
    actionability: "run-diagnostic",
    operation: "deployments.create",
    topicId: "errors.remote-state-lock",
    agentGuidePath: ".well-known/appaloft/errors/infra_error.remote-state-lock.json",
    remedies: [
      {
        kind: "retry",
        label: "Retry after the active lock holder exits or the stale-lock window passes.",
        safeByDefault: true,
      },
      {
        kind: "command",
        label: "Inspect the remote state lock owner, heartbeat, and recovered-lock journal.",
        safeByDefault: true,
        command: ["appaloft", "remote-state", "lock", "inspect"],
      },
      {
        kind: "command",
        label: "List background work attempts before choosing a recovery action.",
        safeByDefault: true,
        command: ["appaloft", "work", "list"],
      },
      {
        kind: "command",
        label:
          "Archive a stale remote state lock only after diagnostics show the heartbeat is older than the stale window.",
        safeByDefault: false,
        command: ["appaloft", "remote-state", "lock", "recover-stale"],
      },
    ],
    specReferences: [
      "docs/workflows/deployment-config-file-bootstrap.md",
      "docs/testing/deployment-config-file-test-matrix.md",
    ],
  },
  "infra_error.remote-state-resolution": {
    id: "infra_error.remote-state-resolution",
    code: "infra_error",
    phase: "remote-state-resolution",
    responsibility: "operator",
    actionability: "run-diagnostic",
    operation: "deployments.create",
    topicId: "diagnostics.runtime-target-capacity",
    agentGuidePath: ".well-known/appaloft/errors/infra_error.remote-state-resolution.json",
    remedies: [
      {
        kind: "diagnostic",
        label:
          "Inspect the SSH target capacity when remote state preparation reports no space or write failures.",
        safeByDefault: true,
        command: ["appaloft", "server", "capacity", "inspect"],
      },
      {
        kind: "command",
        label: "List background work attempts before choosing a retry or recovery action.",
        safeByDefault: true,
        command: ["appaloft", "work", "list"],
      },
      {
        kind: "retry",
        label: "Retry after freeing target capacity or resizing the target.",
        safeByDefault: true,
      },
    ],
    specReferences: [
      "docs/workflows/deployment-config-file-bootstrap.md",
      "docs/testing/deployment-config-file-test-matrix.md",
      "docs/workflows/deployment-runtime-target-abstraction.md",
    ],
  },
  runtime_target_resource_exhausted: {
    id: "runtime_target_resource_exhausted",
    code: "runtime_target_resource_exhausted",
    responsibility: "operator",
    actionability: "run-diagnostic",
    operation: "deployments.create",
    topicId: "diagnostics.runtime-target-capacity",
    agentGuidePath: ".well-known/appaloft/errors/runtime_target_resource_exhausted.json",
    remedies: [
      {
        kind: "diagnostic",
        label: "Inspect target disk, inode, Docker image, build-cache, and Appaloft runtime usage.",
        safeByDefault: true,
        command: ["appaloft", "server", "capacity", "inspect"],
      },
      {
        kind: "command",
        label: "List background work attempts before choosing a retry or recovery action.",
        safeByDefault: true,
        command: ["appaloft", "work", "list"],
      },
      {
        kind: "none",
        label: "Do not prune Docker volumes or Appaloft state roots from this diagnostic.",
        safeByDefault: true,
      },
    ],
    specReferences: [
      "docs/workflows/deployment-runtime-target-abstraction.md",
      "docs/implementation/runtime-target-abstraction-plan.md",
      "docs/testing/deployment-config-file-test-matrix.md",
    ],
  },
} as const satisfies Record<string, Omit<PublicDocsErrorGuide, "id"> & { readonly id: string }>;

export type PublicDocsErrorGuideId = keyof typeof publicDocsErrorGuides;

export function getPublicDocsErrorGuide(guideId: PublicDocsErrorGuideId): PublicDocsErrorGuide {
  return publicDocsErrorGuides[guideId];
}

export function findPublicDocsErrorGuide(input: {
  code: string;
  phase?: string;
}): PublicDocsErrorGuide | undefined {
  const guideId = errorKnowledgeGuideKey(input);
  return Object.hasOwn(publicDocsErrorGuides, guideId)
    ? publicDocsErrorGuides[guideId as PublicDocsErrorGuideId]
    : undefined;
}

export function resolvePublicDocsErrorAgentGuideHref(
  guideId: PublicDocsErrorGuideId,
  input: { basePath?: string } = {},
): string {
  const guide = getPublicDocsErrorGuide(guideId);
  const basePath = normalizeDocsBasePath(input.basePath ?? publicDocsBasePath);
  const path = guide.agentGuidePath.replace(/^\/+|\/+$/g, "");

  return `${basePath}/${path}`;
}

export function resolvePublicDocsErrorKnowledge(
  guideId: PublicDocsErrorGuideId,
  input: { locale?: PublicDocsLocale; basePath?: string } = {},
): PublicDocsErrorKnowledge {
  const guide = getPublicDocsErrorGuide(guideId);

  return {
    responsibility: guide.responsibility,
    actionability: guide.actionability,
    ...(guide.operation ? { operation: guide.operation } : {}),
    links: [
      {
        rel: "human-doc",
        href: resolvePublicDocsHelpHref(guide.topicId, input),
        mediaType: "text/html",
      },
      {
        rel: "llm-guide",
        href: resolvePublicDocsErrorAgentGuideHref(guideId, input),
        mediaType: "application/json",
      },
      ...guide.specReferences.map((href) => ({
        rel: "spec" as const,
        href,
        mediaType: "text/markdown",
      })),
    ],
    remedies: guide.remedies,
  };
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
  {
    operationKey: "credentials.rotate-ssh",
    status: "documented",
    topicId: "server.ssh-credential",
  },
  { operationKey: "servers.list", status: "documented", topicId: "server.deployment-target" },
  { operationKey: "servers.show", status: "documented", topicId: "server.deployment-target" },
  {
    operationKey: "servers.capacity.inspect",
    status: "documented",
    topicId: "diagnostics.runtime-target-capacity",
  },
  {
    operationKey: "operator-work.list",
    status: "documented",
    topicId: "operator.work-ledger",
  },
  {
    operationKey: "operator-work.show",
    status: "documented",
    topicId: "operator.work-ledger",
  },
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
    operationKey: "resources.configure-access",
    status: "documented",
    topicId: "resource.access-profile",
  },
  {
    operationKey: "resources.configure-auto-deploy",
    status: "documented",
    topicId: "source.auto-deploy-setup",
  },
  {
    operationKey: "resources.attach-storage",
    status: "documented",
    topicId: "storage.volume-lifecycle",
  },
  {
    operationKey: "resources.detach-storage",
    status: "documented",
    topicId: "storage.volume-lifecycle",
  },
  {
    operationKey: "resources.bind-dependency",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "resources.unbind-dependency",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "resources.rotate-dependency-binding-secret",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "resources.list-dependency-bindings",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "resources.show-dependency-binding",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "storage-volumes.create",
    status: "documented",
    topicId: "storage.volume-lifecycle",
  },
  {
    operationKey: "storage-volumes.list",
    status: "documented",
    topicId: "storage.volume-lifecycle",
  },
  {
    operationKey: "storage-volumes.show",
    status: "documented",
    topicId: "storage.volume-lifecycle",
  },
  {
    operationKey: "storage-volumes.rename",
    status: "documented",
    topicId: "storage.volume-lifecycle",
  },
  {
    operationKey: "storage-volumes.delete",
    status: "documented",
    topicId: "storage.volume-lifecycle",
  },
  {
    operationKey: "scheduled-tasks.create",
    status: "documented",
    topicId: "scheduled-task.resource-lifecycle",
  },
  {
    operationKey: "scheduled-tasks.list",
    status: "documented",
    topicId: "scheduled-task.resource-lifecycle",
  },
  {
    operationKey: "scheduled-tasks.show",
    status: "documented",
    topicId: "scheduled-task.resource-lifecycle",
  },
  {
    operationKey: "scheduled-tasks.configure",
    status: "documented",
    topicId: "scheduled-task.resource-lifecycle",
  },
  {
    operationKey: "scheduled-tasks.delete",
    status: "documented",
    topicId: "scheduled-task.resource-lifecycle",
  },
  {
    operationKey: "scheduled-tasks.run-now",
    status: "documented",
    topicId: "scheduled-task.resource-lifecycle",
  },
  {
    operationKey: "scheduled-task-runs.list",
    status: "documented",
    topicId: "scheduled-task.resource-lifecycle",
  },
  {
    operationKey: "scheduled-task-runs.show",
    status: "documented",
    topicId: "scheduled-task.resource-lifecycle",
  },
  {
    operationKey: "scheduled-task-runs.logs",
    status: "documented",
    topicId: "scheduled-task.resource-lifecycle",
  },
  {
    operationKey: "resources.runtime-logs",
    status: "documented",
    topicId: "observability.runtime-logs",
  },
  {
    operationKey: "resources.runtime.stop",
    status: "documented",
    topicId: "resource.runtime-controls",
  },
  {
    operationKey: "resources.runtime.start",
    status: "documented",
    topicId: "resource.runtime-controls",
  },
  {
    operationKey: "resources.runtime.restart",
    status: "documented",
    topicId: "resource.runtime-controls",
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
    operationKey: "resources.access-failure-evidence.lookup",
    status: "documented",
    topicId: "diagnostics.access-failure-request-id",
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
  {
    operationKey: "source-events.ingest",
    status: "documented",
    topicId: "source.auto-deploy-signatures",
  },
  {
    operationKey: "source-events.list",
    status: "documented",
    topicId: "source.auto-deploy-dedupe",
  },
  {
    operationKey: "source-events.show",
    status: "documented",
    topicId: "source.auto-deploy-ignored-events",
  },
  {
    operationKey: "dependency-resources.provision-postgres",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.import-postgres",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.provision-redis",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.import-redis",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.list",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.show",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.rename",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.delete",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.create-backup",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.list-backups",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.show-backup",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.restore-backup",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  { operationKey: "environments.create", status: "documented", topicId: "environment.concept" },
  { operationKey: "environments.list", status: "documented", topicId: "environment.concept" },
  { operationKey: "environments.show", status: "documented", topicId: "environment.concept" },
  {
    operationKey: "environments.rename",
    status: "documented",
    topicId: "environment.lifecycle",
  },
  {
    operationKey: "environments.clone",
    status: "documented",
    topicId: "environment.lifecycle",
  },
  {
    operationKey: "environments.archive",
    status: "documented",
    topicId: "environment.lifecycle",
  },
  {
    operationKey: "environments.lock",
    status: "documented",
    topicId: "environment.lifecycle",
  },
  {
    operationKey: "environments.unlock",
    status: "documented",
    topicId: "environment.lifecycle",
  },
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
    operationKey: "environments.effective-precedence",
    status: "documented",
    topicId: "environment.variable-precedence",
  },
  {
    operationKey: "resources.set-variable",
    status: "documented",
    topicId: "environment.variable-precedence",
  },
  {
    operationKey: "resources.import-variables",
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
  {
    operationKey: "preview-policies.configure",
    status: "documented",
    topicId: "deployment.product-grade-previews",
  },
  {
    operationKey: "preview-policies.show",
    status: "documented",
    topicId: "deployment.product-grade-previews",
  },
  {
    operationKey: "preview-environments.list",
    status: "documented",
    topicId: "deployment.product-grade-previews",
  },
  {
    operationKey: "preview-environments.show",
    status: "documented",
    topicId: "deployment.product-grade-previews",
  },
  {
    operationKey: "preview-environments.delete",
    status: "documented",
    topicId: "deployment.product-grade-previews",
  },
  { operationKey: "deployments.create", status: "documented", topicId: "deployment.lifecycle" },
  { operationKey: "deployments.list", status: "documented", topicId: "deployment.lifecycle" },
  { operationKey: "deployments.show", status: "documented", topicId: "deployment.lifecycle" },
  { operationKey: "deployments.plan", status: "documented", topicId: "deployment.plan-preview" },
  {
    operationKey: "deployments.recovery-readiness",
    status: "documented",
    topicId: "deployment.recovery-readiness",
  },
  {
    operationKey: "deployments.retry",
    status: "documented",
    topicId: "deployment.recovery-readiness",
  },
  {
    operationKey: "deployments.redeploy",
    status: "documented",
    topicId: "deployment.recovery-readiness",
  },
  {
    operationKey: "deployments.rollback",
    status: "documented",
    topicId: "deployment.recovery-readiness",
  },
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
    operationKey: "default-access-domain-policies.list",
    status: "documented",
    topicId: "default-access.policy",
  },
  {
    operationKey: "default-access-domain-policies.show",
    status: "documented",
    topicId: "default-access.policy",
  },
  {
    operationKey: "domain-bindings.create",
    status: "documented",
    topicId: "domain.custom-domain-binding",
  },
  {
    operationKey: "domain-bindings.show",
    status: "documented",
    topicId: "domain.custom-domain-binding",
  },
  {
    operationKey: "domain-bindings.configure-route",
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
    operationKey: "domain-bindings.delete-check",
    status: "documented",
    topicId: "domain.custom-domain-binding",
  },
  {
    operationKey: "domain-bindings.delete",
    status: "documented",
    topicId: "domain.custom-domain-binding",
  },
  {
    operationKey: "domain-bindings.retry-verification",
    status: "documented",
    topicId: "domain.ownership-check",
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
  { operationKey: "certificates.show", status: "documented", topicId: "certificate.readiness" },
  { operationKey: "certificates.retry", status: "documented", topicId: "certificate.readiness" },
  { operationKey: "certificates.revoke", status: "documented", topicId: "certificate.readiness" },
  { operationKey: "certificates.delete", status: "documented", topicId: "certificate.readiness" },
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
