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
  "cli.remote-control-plane-login": {
    id: "cli.remote-control-plane-login",
    title: "CLI remote control-plane login",
    description:
      "How CLI login, logout, status, and context selection work for Appaloft Cloud or self-hosted control planes.",
    page: {
      "zh-CN": "reference/cli",
      "en-US": "en/reference/cli",
    },
    anchor: "cli-remote-control-plane-login",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "repository-config", "mcp"],
    aliases: [
      "appaloft login",
      "appaloft auth login",
      "appaloft context use",
      "control plane profile",
      "控制平面登录",
      "CLI profile",
    ],
    specReferences: [
      "docs/specs/074-cli-remote-control-plane-client/spec.md",
      "docs/workflows/control-plane-mode-selection-and-adoption.md",
      "docs/testing/control-plane-modes-test-matrix.md",
      "docs/decisions/ADR-025-control-plane-modes-and-action-execution.md",
    ],
  },
  "cli.remote-control-plane-dispatch": {
    id: "cli.remote-control-plane-dispatch",
    title: "CLI remote control-plane dispatch",
    description:
      "How ordinary CLI commands choose local pure SSH mode or remote HTTP/API dispatch safely.",
    page: {
      "zh-CN": "reference/cli",
      "en-US": "en/reference/cli",
    },
    anchor: "cli-remote-control-plane-dispatch",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "repository-config", "mcp"],
    aliases: [
      "remote CLI",
      "control plane mode",
      "control-plane-mode",
      "remote dispatch",
      "远程 CLI",
      "远程控制面",
    ],
    specReferences: [
      "docs/specs/074-cli-remote-control-plane-client/spec.md",
      "docs/workflows/control-plane-mode-selection-and-adoption.md",
      "docs/implementation/control-plane-modes-roadmap.md",
      "docs/testing/control-plane-modes-test-matrix.md",
      "docs/decisions/ADR-025-control-plane-modes-and-action-execution.md",
      "docs/decisions/ADR-046-typescript-sdk-interface-parity.md",
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
      "How to read, rename, describe, archive, restore, check delete safety, and delete projects without turning deployments or runtime state into project-owned actions.",
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
      "project set description",
      "project archive",
      "project restore",
      "project delete check",
      "project delete",
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
      "docs/commands/projects.set-description.md",
      "docs/commands/projects.archive.md",
      "docs/commands/projects.restore.md",
      "docs/queries/projects.delete-check.md",
      "docs/commands/projects.delete.md",
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
    webSurfaces: [
      "apps/web server list/detail and registration surfaces, including server detail rename, edge proxy configuration, typed deactivate, delete safety, and typed delete confirmation",
    ],
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
  "agent.deploy-skill": {
    id: "agent.deploy-skill",
    title: "Agent deploy skill",
    description:
      "How AI agents safely deploy Appaloft workloads without bypassing existing operations.",
    page: {
      "zh-CN": "agent/deploy-skill",
      "en-US": "en/agent/deploy-skill",
    },
    anchor: "agent-deploy-skill",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "repository-config", "mcp"],
    relatedOperation: "deployments.create",
    aliases: [
      "agent deploy",
      "AI deploy",
      "deploy skill",
      "skill",
      "Pure SSH Action",
      "Self-hosted Server Action",
      "Product-grade Preview",
      "AI 部署",
      "部署 skill",
    ],
    specReferences: [
      "docs/specs/071-url-first-deployment-entry-experience/spec.md",
      "docs/specs/072-appaloft-agent-deploy-skill/spec.md",
      "docs/agent/appaloft-deploy-skill.md",
      "skills/appaloft/references/surfaces.md",
      "skills/appaloft/references/deploy-protocol.md",
    ],
    webSurfaces: ["apps/web Quick Deploy source-first entry and completion outcome links"],
  },
  "agent.appaloft-skill": {
    id: "agent.appaloft-skill",
    title: "Appaloft skill",
    description:
      "How AI agents use the full Appaloft operation catalog as a first-class AI-facing entrypoint.",
    page: {
      "zh-CN": "agent/appaloft-skill",
      "en-US": "en/agent/appaloft-skill",
    },
    anchor: "appaloft-skill",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "web", "repository-config", "mcp"],
    aliases: [
      "appaloft skill",
      "AI entrypoint",
      "full skill",
      "npx skills add appaloft/appaloft",
      "GitHub Action deployment modes",
      "完整 skill",
      "AI 入口",
    ],
    specReferences: [
      "docs/agent/appaloft-skill.md",
      "docs/specs/072-appaloft-agent-deploy-skill/spec.md",
      "skills/appaloft/SKILL.md",
      "skills/appaloft/references/surfaces.md",
      "skills/appaloft/references/cli-entrypoints.md",
      "skills/appaloft/references/deploy-protocol.md",
    ],
    webSurfaces: ["apps/docs/src/content/docs/agent/appaloft-skill.md"],
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
    relatedOperation: "source-events.replay",
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
      "docs/commands/source-events.replay.md",
      "docs/errors/source-events.md",
      "docs/queries/source-events.show.md",
      "docs/queries/deployments.recovery-readiness.md",
    ],
    webSurfaces: [
      "apps/web Resource detail source event diagnostics and deployment recovery links",
    ],
  },
  "source.auto-deploy-retention": {
    id: "source.auto-deploy-retention",
    title: "Source event retention",
    description:
      "How to dry-run and prune retained safe source event deliveries without replaying raw webhook payloads.",
    page: {
      "zh-CN": "deploy/sources",
      "en-US": "en/deploy/sources",
    },
    anchor: "source-auto-deploy-retention",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "source-events.prune",
    aliases: [
      "source event retention",
      "source event prune",
      "webhook delivery cleanup",
      "自动部署保留",
      "source event 清理",
    ],
    specReferences: [
      "docs/commands/source-events.prune.md",
      "docs/errors/source-events.md",
      "docs/testing/source-binding-auto-deploy-test-matrix.md",
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
    surfaces: ["cli", "http-api", "web", "mcp"],
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
      "How to inspect retry, redeploy, cancel, rollback, and rollback candidate readiness before running recovery actions.",
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
      "cancel deployment",
      "部署恢复",
      "恢复就绪",
      "回滚候选",
      "取消部署",
    ],
    specReferences: [
      "docs/decisions/ADR-034-deployment-recovery-readiness.md",
      "docs/specs/012-deployment-recovery-readiness/spec.md",
      "docs/queries/deployments.recovery-readiness.md",
      "docs/commands/deployments.retry.md",
      "docs/commands/deployments.redeploy.md",
      "docs/commands/deployments.rollback.md",
      "docs/commands/deployments.cancel.md",
      "docs/commands/deployments.archive.md",
      "docs/commands/deployments.prune.md",
      "docs/workflows/deployments.cancel.md",
      "docs/workflows/deployment-archive-prune.md",
      "docs/errors/deployments.cancel.md",
      "docs/errors/deployments.archive-prune.md",
      "docs/events/deployment-archived.md",
      "docs/testing/deployments.cancel-test-matrix.md",
      "docs/testing/deployment-archive-prune-test-matrix.md",
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
    surfaces: ["cli", "http-api", "web", "mcp"],
    relatedOperation: "deployments.cleanup-preview",
    aliases: ["preview cleanup", "pull request preview", "temporary deployment", "预览清理"],
    specReferences: [
      "docs/commands/deployments.cleanup-preview.md",
      "docs/testing/deployments.cleanup-preview-test-matrix.md",
      "docs/workflows/github-action-pr-preview-deploy.md",
    ],
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
      "Pure SSH Action",
      "Self-hosted Server Action",
      "server-config-deploy",
      "control-plane-url",
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
    webSurfaces: [
      "Web preview policy readback/configuration, preview environment list/detail/delete surfaces, and Bun.WebView Resource detail Previews cleanup verification.",
    ],
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
      "docs/commands/resources.reset-health.md",
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
    surfaces: ["cli", "http-api", "web", "mcp"],
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
      "docs/specs/070-storage-volume-runtime-realization-and-cleanup/spec.md",
      "docs/decisions/ADR-064-storage-volume-runtime-realization-and-cleanup.md",
      "docs/commands/storage-volumes.create.md",
      "docs/commands/storage-volumes.rename.md",
      "docs/commands/storage-volumes.delete.md",
      "docs/commands/storage-volumes.cleanup-runtime.md",
      "docs/commands/resources.attach-storage.md",
      "docs/commands/resources.detach-storage.md",
      "docs/queries/storage-volumes.list.md",
      "docs/queries/storage-volumes.show.md",
    ],
    webSurfaces: [
      "Web Resource detail can list/create/rename/delete provider-neutral storage volume records, attach/detach Resource storage attachments, and run dry-run-first scoped runtime cleanup; Bun.WebView route coverage exercises list/create/attach/detach and dry-run-first cleanup, CLI/API/Web cleanup preserves backup/restore safety evidence, and Docker Swarm Compose stack realization is deployment-driven through generated Appaloft overrides.",
    ],
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
    surfaces: ["cli", "http-api", "web", "mcp"],
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
      "docs/specs/048-dependency-runtime-secret-value-resolution/spec.md",
      "docs/decisions/ADR-040-dependency-binding-runtime-injection-boundary.md",
      "docs/decisions/ADR-041-dependency-runtime-secret-value-resolution.md",
      "docs/commands/dependency-resources.provision.md",
      "docs/commands/dependency-resources.import.md",
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
      "Web Resource detail dependency controls can create managed Postgres/Redis resources, import external Postgres/Redis resources through the safe connection boundary, rename/delete dependency records with safety blockers, bind ready dependencies, list active bindings, rotate binding secrets with historical-snapshot acknowledgement, and unbind runtime injection targets.",
    ],
  },
  "dependency.backup-restore": {
    id: "dependency.backup-restore",
    title: "Dependency backup and restore",
    description:
      "How dependency resource backup restore points, in-place restore acknowledgements, provider-safe artifacts, and delete safety work.",
    page: {
      "zh-CN": "resources/dependencies",
      "en-US": "en/resources/dependencies",
    },
    anchor: "dependency-backup-restore",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "web", "mcp"],
    relatedOperation: "dependency-resources.create-backup",
    aliases: [
      "dependency backup",
      "dependency restore",
      "database backup",
      "restore point",
      "in-place restore",
      "backup retention",
      "依赖备份",
      "数据库恢复",
      "恢复点",
    ],
    specReferences: [
      "docs/specs/039-dependency-resource-backup-restore/spec.md",
      "docs/decisions/ADR-036-dependency-resource-backup-restore-lifecycle.md",
      "docs/testing/dependency-resource-test-matrix.md",
      "docs/commands/dependency-resources.create-backup.md",
      "docs/commands/dependency-resources.restore-backup.md",
      "docs/queries/dependency-resources.list-backups.md",
      "docs/queries/dependency-resources.show-backup.md",
      "docs/events/dependency-resource-backup-requested.md",
      "docs/events/dependency-resource-backup-completed.md",
      "docs/events/dependency-resource-backup-failed.md",
      "docs/events/dependency-resource-restore-requested.md",
      "docs/events/dependency-resource-restore-completed.md",
      "docs/events/dependency-resource-restore-failed.md",
    ],
    webSurfaces: [
      "Web Resource detail dependency backup/restore controls can create backup restore points, list safe restore point summaries, and start acknowledged in-place restores through the active HTTP/oRPC contracts.",
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
      "docs/specs/048-dependency-runtime-secret-value-resolution/spec.md",
      "docs/decisions/ADR-040-dependency-binding-runtime-injection-boundary.md",
      "docs/decisions/ADR-041-dependency-runtime-secret-value-resolution.md",
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
    surfaces: ["cli", "http-api", "web", "mcp"],
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
    webSurfaces: [
      "Resource detail scheduled-task controls expose create, configure, delete, run-now, history, logs, and docs help links.",
    ],
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
    description:
      "How to open, list, show, close, and expire terminal sessions for controlled server or resource troubleshooting.",
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
    specReferences: [
      "docs/decisions/ADR-022-operator-terminal-session-boundary.md",
      "docs/commands/terminal-sessions.open.md",
      "docs/commands/terminal-sessions.lifecycle.md",
      "docs/queries/terminal-sessions.lifecycle.md",
      "docs/workflows/operator-terminal-session.md",
      "docs/testing/operator-terminal-session-test-matrix.md",
    ],
    aliases: ["terminal", "shell", "ssh session", "terminal session lifecycle", "终端"],
    webSurfaces: [
      "apps/web/src/routes/resources/[resourceId]/+page.svelte: resource-scoped terminal open and attach",
      "apps/web/src/routes/servers/[serverId]/+page.svelte: server-scoped terminal open and attach",
      "apps/web/src/routes/instance/+page.svelte: active terminal session lifecycle list, close, and expire with Bun.WebView route coverage",
    ],
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
      "docs/commands/resources.secrets.create.md",
      "docs/commands/resources.secrets.rotate.md",
      "docs/commands/resources.secrets.delete.md",
      "docs/queries/resources.secrets.list.md",
      "docs/queries/resources.secrets.show.md",
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
    specReferences: [
      "docs/testing/routing-domain-and-tls-test-matrix.md",
      "docs/commands/domain-bindings.create.md",
    ],
    webSurfaces: [
      "apps/web/src/routes/domain-bindings/+page.svelte: standalone domain binding create form",
      "apps/web/src/routes/resources/[resourceId]/+page.svelte: resource-scoped domain binding create form",
    ],
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
    specReferences: [
      "docs/testing/routing-domain-and-tls-test-matrix.md",
      "docs/commands/domain-bindings.confirm-ownership.md",
    ],
    webSurfaces: [
      "apps/web/src/routes/domain-bindings/+page.svelte: standalone ownership confirmation action",
      "apps/web/src/routes/resources/[resourceId]/+page.svelte: resource-scoped ownership confirmation action",
    ],
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
    description:
      "How to inspect runtime and deployment logs, capture redacted runtime log archive snapshots, and prune old embedded deployment log entries or retained archive snapshots from user-facing entrypoints.",
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
    specReferences: [
      "docs/queries/resources.runtime-logs.md",
      "docs/commands/deployments.logs.prune.md",
      "docs/specs/059-resource-runtime-log-archive-retention/spec.md",
      "docs/testing/resource-runtime-logs-test-matrix.md",
      "docs/testing/deployment-log-retention-test-matrix.md",
      "docs/testing/resource-runtime-log-archive-retention-test-matrix.md",
      "docs/specs/058-deployment-log-retention/spec.md",
      "docs/decisions/ADR-052-deployment-log-retention-policy.md",
      "docs/decisions/ADR-053-resource-runtime-log-archive-retention-boundary.md",
    ],
    aliases: ["logs", "runtime logs", "deployment logs", "log archives", "日志"],
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
    specReferences: [
      "docs/workflows/resource-diagnostic-summary.md",
      "docs/queries/resources.diagnostic-summary.md",
      "docs/testing/resource-diagnostic-summary-test-matrix.md",
    ],
    webSurfaces: [
      "apps/web/src/routes/resources/[resourceId]/+page.svelte: resource detail diagnostic copy action",
      "apps/web/src/routes/deployments/[deploymentId]/+page.svelte: deployment detail diagnostic copy action",
      "apps/web/src/lib/components/console/QuickDeploySheet.svelte: Quick Deploy completion diagnostic copy action",
    ],
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
    title: "Runtime target capacity",
    description:
      "How to inspect disk, inode, Docker, and Appaloft runtime usage, then dry-run or prune safe target-owned artifacts.",
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
    aliases: ["capacity", "disk full", "build cache", "docker system df", "prune", "容量诊断"],
  },
  "diagnostics.runtime-usage": {
    id: "diagnostics.runtime-usage",
    title: "Runtime usage attribution",
    description:
      "How to inspect safe point-in-time runtime usage attribution without cleanup, sample persistence, quota, or threshold enforcement.",
    page: {
      "zh-CN": "observe/diagnostics",
      "en-US": "en/observe/diagnostics",
    },
    anchor: "runtime-usage-inspect",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "runtime-usage.inspect",
    aliases: [
      "runtime usage",
      "usage attribution",
      "resource usage",
      "capacity attribution",
      "运行时用量",
      "资源归因",
    ],
    specReferences: [
      "docs/decisions/ADR-062-runtime-usage-attribution-boundary.md",
      "docs/queries/runtime-usage.inspect.md",
      "docs/testing/runtime-usage-attribution-test-matrix.md",
    ],
  },
  "diagnostics.runtime-monitoring": {
    id: "diagnostics.runtime-monitoring",
    title: "Runtime monitoring samples and rollups",
    description:
      "How to read retained runtime monitoring samples, rollups, and deployment markers without collecting fresh data or mutating runtime targets.",
    page: {
      "zh-CN": "observe/diagnostics",
      "en-US": "en/observe/diagnostics",
    },
    anchor: "runtime-monitoring-samples-and-rollups",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "web", "mcp"],
    relatedOperation: "runtime-monitoring.rollup",
    aliases: [
      "runtime monitoring",
      "monitoring samples",
      "runtime rollup",
      "deployment markers",
      "运行时监控",
      "监控采样",
    ],
    specReferences: [
      "docs/decisions/ADR-063-runtime-monitoring-observation-boundary.md",
      "docs/queries/runtime-monitoring.samples.list.md",
      "docs/queries/runtime-monitoring.rollup.md",
      "docs/testing/runtime-monitoring-observation-test-matrix.md",
    ],
    webSurfaces: [
      "Server/resource Monitor tabs show retained samples and rollups; Project detail shows project and selected-environment rollup-only readback.",
    ],
  },
  "diagnostics.runtime-monitoring-thresholds": {
    id: "diagnostics.runtime-monitoring-thresholds",
    title: "Runtime monitoring thresholds",
    description:
      "How exact-scope runtime monitoring thresholds produce non-enforcing warning and critical readback.",
    page: {
      "zh-CN": "observe/diagnostics",
      "en-US": "en/observe/diagnostics",
    },
    anchor: "runtime-monitoring-thresholds",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "web", "mcp"],
    relatedOperation: "runtime-monitoring.thresholds.show",
    aliases: [
      "runtime thresholds",
      "monitoring thresholds",
      "CPU threshold",
      "memory threshold",
      "disk threshold",
      "threshold policy",
      "监控阈值",
    ],
    specReferences: [
      "docs/decisions/ADR-063-runtime-monitoring-observation-boundary.md",
      "docs/commands/runtime-monitoring-thresholds.configure.md",
      "docs/queries/runtime-monitoring-thresholds.show.md",
      "docs/testing/runtime-monitoring-observation-test-matrix.md",
    ],
  },
  "diagnostics.scheduled-runtime-prune-policy": {
    id: "diagnostics.scheduled-runtime-prune-policy",
    title: "Scheduled runtime prune policy",
    description:
      "How to configure and read back scheduled runtime prune policies for safe target-owned cleanup.",
    page: {
      "zh-CN": "observe/diagnostics",
      "en-US": "en/observe/diagnostics",
    },
    anchor: "scheduled-runtime-prune-policy",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "scheduled-runtime-prune-policies.configure",
    aliases: [
      "scheduled prune",
      "runtime prune policy",
      "retention policy",
      "capacity policy",
      "定时清理",
      "保留策略",
    ],
    specReferences: [
      "docs/decisions/ADR-055-scheduled-runtime-prune-automation.md",
      "docs/specs/061-scheduled-runtime-prune-automation/spec.md",
      "docs/testing/runtime-target-capacity-test-matrix.md",
    ],
  },
  "operator.work-ledger": {
    id: "operator.work-ledger",
    title: "Operator work ledger",
    description:
      "How to view durable process delivery attempts, failures, and next diagnostic actions without recovery mutations.",
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
      "docs/decisions/ADR-054-durable-process-delivery-baseline.md",
      "docs/commands/operator-work.mark-recovered.md",
      "docs/commands/operator-work.dead-letter.md",
      "docs/commands/operator-work.cancel.md",
      "docs/commands/operator-work.retry.md",
      "docs/commands/operator-work.prune.md",
      "docs/queries/operator-work.list.md",
      "docs/queries/operator-work.show.md",
      "docs/testing/operator-work-ledger-test-matrix.md",
      "docs/testing/durable-process-delivery-test-matrix.md",
      "docs/specs/010-operator-work-ledger/spec.md",
      "docs/specs/060-durable-process-delivery-baseline/spec.md",
    ],
    webSurfaces: ["Web/MCP operator console backlog and CLI/HTTP background work visibility"],
    aliases: [
      "operator work",
      "work ledger",
      "background work",
      "durable process delivery",
      "attempt visibility",
      "failed attempts",
      "后台工作",
      "工作台账",
    ],
  },
  "operator.audit-events": {
    id: "operator.audit-events",
    title: "Audit events",
    description:
      "How to inspect, export, archive, place legal holds on, and prune retained audit events with redacted payload fields, aggregate-scoped filters, and bounded global export windows.",
    page: {
      "zh-CN": "reference/errors-statuses",
      "en-US": "en/reference/errors-statuses",
    },
    anchor: "operator-audit-events",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "audit-events.list",
    specReferences: [
      "docs/queries/audit-events.list.md",
      "docs/queries/audit-events.show.md",
      "docs/queries/audit-events.export.md",
      "docs/queries/audit-events.export-global.md",
      "docs/commands/audit-events.archives.create.md",
      "docs/commands/audit-events.archives.prune.md",
      "docs/queries/audit-events.archives.list.md",
      "docs/queries/audit-events.archives.show.md",
      "docs/commands/audit-events.legal-holds.configure.md",
      "docs/commands/audit-events.legal-holds.release.md",
      "docs/queries/audit-events.legal-holds.list.md",
      "docs/queries/audit-events.legal-holds.show.md",
      "docs/commands/audit-events.prune.md",
      "docs/decisions/ADR-056-global-audit-event-export-boundary.md",
      "docs/decisions/ADR-057-audit-event-legal-hold-boundary.md",
      "docs/decisions/ADR-058-audit-event-immutable-archive-boundary.md",
      "docs/specs/062-global-audit-event-export/spec.md",
      "docs/specs/063-audit-event-legal-hold/spec.md",
      "docs/specs/064-audit-event-immutable-archive/spec.md",
      "docs/testing/audit-event-read-surface-test-matrix.md",
    ],
    aliases: [
      "audit events",
      "audit log",
      "history",
      "redacted audit",
      "global audit export",
      "audit legal hold",
      "audit archive",
      "audit prune",
      "审计事件",
      "审计日志",
    ],
  },
  "operator.provider-job-logs": {
    id: "operator.provider-job-logs",
    title: "Provider job logs",
    description:
      "How to dry-run and prune retained provider job logs without deleting deployment rows, embedded deployment logs, runtime logs, audit rows, events, process attempts, or business state.",
    page: {
      "zh-CN": "reference/errors-statuses",
      "en-US": "en/reference/errors-statuses",
    },
    anchor: "operator-provider-job-logs",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "provider-job-logs.prune",
    specReferences: [
      "docs/commands/provider-job-logs.prune.md",
      "docs/testing/provider-job-log-retention-test-matrix.md",
      "docs/specs/057-provider-job-log-retention/spec.md",
      "docs/decisions/ADR-049-provider-job-log-retention-policy.md",
    ],
    aliases: [
      "provider job logs",
      "provider logs",
      "retention prune",
      "provider job log prune",
      "provider log retention",
      "提供商任务日志",
      "提供商日志",
    ],
  },
  "operator.domain-events": {
    id: "operator.domain-events",
    title: "Domain event stream retention",
    description:
      "How to dry-run and prune retained domain event stream rows without deleting deployments, audit rows, logs, process attempts, snapshots, rollback candidates, or business state.",
    page: {
      "zh-CN": "reference/errors-statuses",
      "en-US": "en/reference/errors-statuses",
    },
    anchor: "operator-domain-events",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "domain-events.prune",
    specReferences: [
      "docs/commands/domain-events.prune.md",
      "docs/testing/domain-event-stream-retention-test-matrix.md",
      "docs/specs/065-domain-event-stream-retention/spec.md",
      "docs/decisions/ADR-059-domain-event-stream-retention-boundary.md",
    ],
    aliases: [
      "domain events",
      "domain event stream",
      "event stream retention",
      "domain event prune",
      "retained events",
      "领域事件",
      "事件流保留",
    ],
  },
  "operator.retention-defaults": {
    id: "operator.retention-defaults",
    title: "Organization retention defaults",
    description:
      "How to configure and read non-executing default retention windows for governed history categories.",
    page: {
      "zh-CN": "reference/errors-statuses",
      "en-US": "en/reference/errors-statuses",
    },
    anchor: "operator-retention-defaults",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "mcp"],
    relatedOperation: "retention-defaults.configure",
    specReferences: [
      "docs/decisions/ADR-060-organization-retention-defaults-boundary.md",
      "docs/specs/066-organization-retention-defaults/spec.md",
      "docs/testing/organization-retention-defaults-test-matrix.md",
    ],
    aliases: [
      "retention defaults",
      "organization retention",
      "retention policy defaults",
      "retention-defaults.configure",
      "保留默认值",
      "组织保留策略",
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
  "advanced.maintenance-workers": {
    id: "advanced.maintenance-workers",
    title: "Maintenance worker activation",
    description:
      "How to read configured maintenance worker activation, the certificate retry exception, and which scheduled workers are disabled by default without starting or ticking them.",
    page: {
      "zh-CN": "self-hosting/advanced",
      "en-US": "en/self-hosting/advanced",
    },
    anchor: "maintenance-worker-activation",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "system.doctor",
    specReferences: [
      "docs/testing/system-diagnostics-test-matrix.md",
      "apps/docs/src/content/docs/en/reference/configuration.md",
      "apps/docs/src/content/docs/reference/configuration.md",
    ],
    aliases: [
      "maintenance worker",
      "scheduled worker",
      "disabled by default",
      "system doctor workers",
      "维护 worker",
      "定时 worker",
    ],
    webSurfaces: [
      "apps/web/src/routes/instance/+page.svelte: read-only maintenance worker activation status with Bun.WebView route coverage",
    ],
  },
  "self-hosting.upgrades": {
    id: "self-hosting.upgrades",
    title: "Self-hosted upgrades",
    description: "Check and apply Appaloft instance upgrades from CLI or the Web console.",
    page: {
      "zh-CN": "self-hosting/upgrades",
      "en-US": "en/self-hosting/upgrades",
    },
    anchor: "self-hosting-upgrade-check",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "web"],
    relatedOperation: "system.instance-upgrade.check",
    aliases: ["upgrade", "update", "instance upgrade", "self-hosting upgrade", "升级", "更新"],
  },
  "self-hosting.action-deploy-token-auth": {
    id: "self-hosting.action-deploy-token-auth",
    title: "Self-hosted Action deploy token auth",
    description:
      "How self-hosted GitHub Actions use Appaloft deploy tokens, GitHub Secrets, scopes, and 401/403 recovery.",
    page: {
      "zh-CN": "self-hosting/action-deploy-token-auth",
      "en-US": "en/self-hosting/action-deploy-token-auth",
    },
    anchor: "self-hosting-action-deploy-token-auth",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "web", "repository-config", "mcp"],
    relatedOperation: "deploy-tokens.create",
    specReferences: [
      "docs/decisions/ADR-043-self-hosted-action-deploy-token-authorization.md",
      "docs/specs/052-self-hosted-action-deploy-token-auth/spec.md",
      "docs/workflows/self-hosted-action-api-authentication.md",
      "docs/errors/self-hosted-action-auth.md",
      "docs/testing/self-hosted-auth-test-matrix.md",
    ],
    webSurfaces: [
      "Docker install output, GitHub Action appaloft-token input, self-hosted Action API 401/403 responses, deploy-token CLI lifecycle commands, admin-protected deploy-token HTTP/API lifecycle endpoints, apps/web /organization deploy-token management, and future MCP descriptors",
    ],
    aliases: [
      "deploy token",
      "appaloft-token",
      "self-hosted action auth",
      "APPALOFT_TOKEN",
      "action_auth_missing",
      "action_auth_invalid",
      "action_auth_forbidden",
      "自托管 Action token",
      "部署 token",
    ],
  },
  "self-hosting.first-admin-bootstrap": {
    id: "self-hosting.first-admin-bootstrap",
    title: "Self-hosted first admin bootstrap",
    description:
      "How self-hosted installs create the first local admin, log in without OAuth, use bootstrap status/setup endpoints, and recover safely.",
    page: {
      "zh-CN": "self-hosting/first-admin-bootstrap",
      "en-US": "en/self-hosting/first-admin-bootstrap",
    },
    anchor: "self-hosting-first-admin-bootstrap",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["web", "cli", "http-api", "mcp"],
    relatedOperation: "auth.bootstrap-first-admin",
    specReferences: [
      "docs/decisions/ADR-044-self-hosted-first-admin-bootstrap.md",
      "docs/specs/053-self-hosted-first-admin-bootstrap/spec.md",
      "docs/workflows/self-hosted-first-admin-bootstrap.md",
      "docs/errors/self-hosted-product-auth.md",
      "docs/testing/self-hosted-product-auth-test-matrix.md",
    ],
    webSurfaces: [
      "Docker install output, appaloft auth bootstrap-status/bootstrap-first-admin CLI commands, apps/web /bootstrap/auth/first-admin onboarding, apps/web /login local sign-in, public bootstrap status/setup endpoints, and product session 401/403 recovery",
    ],
    aliases: [
      "first admin",
      "local admin",
      "bootstrap admin",
      "auth.bootstrap-status",
      "auth.bootstrap-first-admin",
      "product_auth_missing",
      "product_auth_forbidden",
      "OAuth optional",
      "首次管理员",
      "本地管理员",
    ],
  },
  "self-hosting.organization-team-management": {
    id: "self-hosting.organization-team-management",
    title: "Self-hosted organization team management",
    description:
      "How self-hosted operators inspect organization context, list members and invitations, invite operators, update roles, remove members safely, and manage deploy tokens from the organization surface.",
    page: {
      "zh-CN": "self-hosting/organization-team-management",
      "en-US": "en/self-hosting/organization-team-management",
    },
    anchor: "self-hosting-organization-team-management",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["cli", "http-api", "web", "mcp"],
    relatedOperation: "organizations.current-context",
    specReferences: [
      "docs/decisions/ADR-045-self-hosted-organization-team-operations.md",
      "docs/specs/054-self-hosted-organization-team-operations/spec.md",
      "docs/errors/self-hosted-product-auth.md",
      "docs/testing/self-hosted-product-auth-test-matrix.md",
    ],
    webSurfaces: [
      "Organization/team HTTP/API routes, organization CLI commands, apps/web /organization member and deploy-token management, and product session 401/403 recovery",
    ],
    aliases: [
      "organization context",
      "organization members",
      "organization invitations",
      "invite member",
      "member role",
      "remove member",
      "APPALOFT_AUTH_COOKIE",
      "APPALOFT_AUTHORIZATION",
      "组织成员",
      "邀请成员",
      "成员角色",
    ],
  },
  "advanced.provider-boundary": {
    id: "advanced.provider-boundary",
    title: "Provider boundary",
    description:
      "How providers expose safe capability details and configuration diagnostics without leaking provider-specific details.",
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
    specReferences: ["docs/PROVIDERS.md", "docs/testing/system-diagnostics-test-matrix.md"],
    aliases: [
      "provider",
      "capability",
      "configuration diagnostics",
      "cloud provider",
      "provider 边界",
    ],
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
    specReferences: ["docs/PLUGINS.md", "docs/testing/system-diagnostics-test-matrix.md"],
    aliases: ["plugin", "extension", "compatibility", "configuration diagnostics", "插件"],
  },
  "advanced.server-composition-extensions": {
    id: "advanced.server-composition-extensions",
    title: "Server composition extensions",
    description:
      "How integrators create and extend an Appaloft server composition through the public server package.",
    page: {
      "zh-CN": "integrations/plugins",
      "en-US": "en/integrations/plugins",
    },
    anchor: "server-composition-extensions",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["http-api", "mcp"],
    specReferences: ["docs/PLUGINS.md", "packages/server/src/index.ts"],
    aliases: [
      "@appaloft/server",
      "server composition",
      "server factory",
      "runtime extension",
      "middleware",
      "server extension",
    ],
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
  "typescript-sdk.operation-client": {
    id: "typescript-sdk.operation-client",
    title: "TypeScript SDK operation client",
    description:
      "How to install, authenticate, call operations, handle structured errors, and consume streams through the TypeScript SDK.",
    page: {
      "zh-CN": "reference/typescript-sdk",
      "en-US": "en/reference/typescript-sdk",
    },
    anchor: "typescript-sdk-operation-client",
    localeCoverage: {
      "zh-CN": "complete",
      "en-US": "complete",
    },
    surfaces: ["http-api", "mcp"],
    aliases: [
      "typescript sdk",
      "sdk client",
      "operation client",
      "typed errors",
      "streaming sdk",
      "TypeScript SDK",
    ],
    specReferences: [
      "docs/decisions/ADR-046-typescript-sdk-interface-parity.md",
      "docs/specs/052-typescript-sdk-interface-parity/spec.md",
      "docs/testing/typescript-sdk-interface-parity-test-matrix.md",
    ],
    webSurfaces: [
      "External automation and internal black-box tests use @appaloft/sdk over HTTP/oRPC operation contracts",
    ],
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
  { operationKey: "projects.set-description", status: "documented", topicId: "project.lifecycle" },
  { operationKey: "projects.archive", status: "documented", topicId: "project.lifecycle" },
  { operationKey: "projects.restore", status: "documented", topicId: "project.lifecycle" },
  { operationKey: "projects.delete-check", status: "documented", topicId: "project.lifecycle" },
  { operationKey: "projects.delete", status: "documented", topicId: "project.lifecycle" },
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
    operationKey: "runtime-usage.inspect",
    status: "documented",
    topicId: "diagnostics.runtime-usage",
  },
  {
    operationKey: "runtime-monitoring.samples.list",
    status: "documented",
    topicId: "diagnostics.runtime-monitoring",
  },
  {
    operationKey: "runtime-monitoring.rollup",
    status: "documented",
    topicId: "diagnostics.runtime-monitoring",
  },
  {
    operationKey: "runtime-monitoring.thresholds.configure",
    status: "documented",
    topicId: "diagnostics.runtime-monitoring-thresholds",
  },
  {
    operationKey: "runtime-monitoring.thresholds.show",
    status: "documented",
    topicId: "diagnostics.runtime-monitoring-thresholds",
  },
  {
    operationKey: "servers.capacity.prune",
    status: "documented",
    topicId: "diagnostics.runtime-target-capacity",
  },
  {
    operationKey: "scheduled-runtime-prune-policies.configure",
    status: "documented",
    topicId: "diagnostics.scheduled-runtime-prune-policy",
  },
  {
    operationKey: "scheduled-runtime-prune-policies.list",
    status: "documented",
    topicId: "diagnostics.scheduled-runtime-prune-policy",
  },
  {
    operationKey: "scheduled-runtime-prune-policies.show",
    status: "documented",
    topicId: "diagnostics.scheduled-runtime-prune-policy",
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
  {
    operationKey: "operator-work.mark-recovered",
    status: "documented",
    topicId: "operator.work-ledger",
  },
  {
    operationKey: "operator-work.dead-letter",
    status: "documented",
    topicId: "operator.work-ledger",
  },
  {
    operationKey: "operator-work.cancel",
    status: "documented",
    topicId: "operator.work-ledger",
  },
  {
    operationKey: "operator-work.retry",
    status: "documented",
    topicId: "operator.work-ledger",
  },
  {
    operationKey: "operator-work.prune",
    status: "documented",
    topicId: "operator.work-ledger",
  },
  {
    operationKey: "audit-events.list",
    status: "documented",
    topicId: "operator.audit-events",
  },
  {
    operationKey: "audit-events.show",
    status: "documented",
    topicId: "operator.audit-events",
  },
  {
    operationKey: "audit-events.export",
    status: "documented",
    topicId: "operator.audit-events",
  },
  {
    operationKey: "audit-events.export-global",
    status: "documented",
    topicId: "operator.audit-events",
  },
  {
    operationKey: "audit-events.archives.create",
    status: "documented",
    topicId: "operator.audit-events",
  },
  {
    operationKey: "audit-events.archives.list",
    status: "documented",
    topicId: "operator.audit-events",
  },
  {
    operationKey: "audit-events.archives.show",
    status: "documented",
    topicId: "operator.audit-events",
  },
  {
    operationKey: "audit-events.archives.prune",
    status: "documented",
    topicId: "operator.audit-events",
  },
  {
    operationKey: "audit-events.legal-holds.configure",
    status: "documented",
    topicId: "operator.audit-events",
  },
  {
    operationKey: "audit-events.legal-holds.list",
    status: "documented",
    topicId: "operator.audit-events",
  },
  {
    operationKey: "audit-events.legal-holds.show",
    status: "documented",
    topicId: "operator.audit-events",
  },
  {
    operationKey: "audit-events.legal-holds.release",
    status: "documented",
    topicId: "operator.audit-events",
  },
  {
    operationKey: "audit-events.prune",
    status: "documented",
    topicId: "operator.audit-events",
  },
  {
    operationKey: "retention-defaults.configure",
    status: "documented",
    topicId: "operator.retention-defaults",
  },
  {
    operationKey: "retention-defaults.list",
    status: "documented",
    topicId: "operator.retention-defaults",
  },
  {
    operationKey: "retention-defaults.show",
    status: "documented",
    topicId: "operator.retention-defaults",
  },
  {
    operationKey: "provider-job-logs.prune",
    status: "documented",
    topicId: "operator.provider-job-logs",
  },
  {
    operationKey: "domain-events.prune",
    status: "documented",
    topicId: "operator.domain-events",
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
    operationKey: "resources.reset-health",
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
    operationKey: "storage-volumes.cleanup-runtime",
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
    operationKey: "resources.runtime-logs.archive",
    status: "documented",
    topicId: "observability.runtime-logs",
  },
  {
    operationKey: "resources.runtime-log-archives.list",
    status: "documented",
    topicId: "observability.runtime-logs",
  },
  {
    operationKey: "resources.runtime-log-archives.show",
    status: "documented",
    topicId: "observability.runtime-logs",
  },
  {
    operationKey: "resources.runtime-log-archives.prune",
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
    operationKey: "terminal-sessions.list",
    status: "documented",
    topicId: "server.terminal-session",
  },
  {
    operationKey: "terminal-sessions.show",
    status: "documented",
    topicId: "server.terminal-session",
  },
  {
    operationKey: "terminal-sessions.close",
    status: "documented",
    topicId: "server.terminal-session",
  },
  {
    operationKey: "terminal-sessions.expire",
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
    operationKey: "resources.health-history",
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
    operationKey: "source-events.replay",
    status: "documented",
    topicId: "source.auto-deploy-recovery",
  },
  {
    operationKey: "source-events.prune",
    status: "documented",
    topicId: "source.auto-deploy-retention",
  },
  {
    operationKey: "dependency-resources.provision",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.import",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.provisioning.plan",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.provisioning.accept",
    status: "documented",
    topicId: "dependency.resource-lifecycle",
  },
  {
    operationKey: "dependency-resources.provisioning.status",
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
    topicId: "dependency.backup-restore",
  },
  {
    operationKey: "dependency-resources.list-backups",
    status: "documented",
    topicId: "dependency.backup-restore",
  },
  {
    operationKey: "dependency-resources.show-backup",
    status: "documented",
    topicId: "dependency.backup-restore",
  },
  {
    operationKey: "dependency-resources.restore-backup",
    status: "documented",
    topicId: "dependency.backup-restore",
  },
  {
    operationKey: "dependency-resources.backup-policies.configure",
    status: "documented",
    topicId: "dependency.backup-restore",
  },
  {
    operationKey: "dependency-resources.backup-policies.list",
    status: "documented",
    topicId: "dependency.backup-restore",
  },
  {
    operationKey: "dependency-resources.backup-policies.show",
    status: "documented",
    topicId: "dependency.backup-restore",
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
    operationKey: "resources.secrets.create",
    status: "documented",
    topicId: "environment.variable-precedence",
  },
  {
    operationKey: "resources.secrets.rotate",
    status: "documented",
    topicId: "environment.variable-precedence",
  },
  {
    operationKey: "resources.secrets.delete",
    status: "documented",
    topicId: "environment.variable-precedence",
  },
  {
    operationKey: "resources.secrets.list",
    status: "documented",
    topicId: "environment.variable-precedence",
  },
  {
    operationKey: "resources.secrets.show",
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
    operationKey: "deploy-tokens.create",
    status: "documented",
    topicId: "self-hosting.action-deploy-token-auth",
  },
  {
    operationKey: "deploy-tokens.list",
    status: "documented",
    topicId: "self-hosting.action-deploy-token-auth",
  },
  {
    operationKey: "deploy-tokens.show",
    status: "documented",
    topicId: "self-hosting.action-deploy-token-auth",
  },
  {
    operationKey: "deploy-tokens.rotate",
    status: "documented",
    topicId: "self-hosting.action-deploy-token-auth",
  },
  {
    operationKey: "deploy-tokens.revoke",
    status: "documented",
    topicId: "self-hosting.action-deploy-token-auth",
  },
  {
    operationKey: "auth.bootstrap-status",
    status: "documented",
    topicId: "self-hosting.first-admin-bootstrap",
  },
  {
    operationKey: "auth.bootstrap-first-admin",
    status: "documented",
    topicId: "self-hosting.first-admin-bootstrap",
  },
  {
    operationKey: "capabilities.query",
    status: "documented",
    topicId: "self-hosting.organization-team-management",
    note: "Neutral capability readback for role-aware Web, SDK, and API surfaces.",
  },
  {
    operationKey: "entitlements.query",
    status: "documented",
    topicId: "self-hosting.organization-team-management",
    note: "Neutral entitlement readback for downstream capability qualification checks.",
  },
  {
    operationKey: "organizations.current-context",
    status: "documented",
    topicId: "self-hosting.organization-team-management",
  },
  {
    operationKey: "organizations.switch-current",
    status: "documented",
    topicId: "self-hosting.organization-team-management",
  },
  {
    operationKey: "organizations.list-members",
    status: "documented",
    topicId: "self-hosting.organization-team-management",
  },
  {
    operationKey: "organizations.list-invitations",
    status: "documented",
    topicId: "self-hosting.organization-team-management",
  },
  {
    operationKey: "organizations.invite-member",
    status: "documented",
    topicId: "self-hosting.organization-team-management",
  },
  {
    operationKey: "organizations.change-member-role",
    status: "documented",
    topicId: "self-hosting.organization-team-management",
  },
  {
    operationKey: "organizations.remove-member",
    status: "documented",
    topicId: "self-hosting.organization-team-management",
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
  {
    operationKey: "deployments.cancel",
    status: "documented",
    topicId: "deployment.recovery-readiness",
  },
  {
    operationKey: "deployments.archive",
    status: "documented",
    topicId: "deployment.recovery-readiness",
  },
  {
    operationKey: "deployments.prune",
    status: "documented",
    topicId: "deployment.recovery-readiness",
  },
  { operationKey: "deployments.logs", status: "documented", topicId: "observability.runtime-logs" },
  {
    operationKey: "deployments.logs.prune",
    status: "documented",
    topicId: "observability.runtime-logs",
  },
  {
    operationKey: "deployments.stream-events",
    status: "documented",
    topicId: "deployment.lifecycle",
  },
  {
    operationKey: "source-links.list",
    status: "documented",
    topicId: "deployment.source-relink",
  },
  {
    operationKey: "source-links.show",
    status: "documented",
    topicId: "deployment.source-relink",
  },
  {
    operationKey: "source-links.relink",
    status: "documented",
    topicId: "deployment.source-relink",
  },
  {
    operationKey: "source-links.delete",
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
    operationKey: "system.integrations.list",
    status: "documented",
    topicId: "deployment.source",
  },
  {
    operationKey: "system.github-repositories.list",
    status: "documented",
    topicId: "deployment.source",
  },
  { operationKey: "system.doctor", status: "documented", topicId: "advanced.maintenance-workers" },
  {
    operationKey: "system.instance-upgrade.check",
    status: "documented",
    topicId: "self-hosting.upgrades",
  },
  {
    operationKey: "system.instance-upgrade.apply",
    status: "documented",
    topicId: "self-hosting.upgrades",
  },
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
