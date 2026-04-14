export const environmentKinds = [
  "local",
  "development",
  "test",
  "staging",
  "production",
  "preview",
  "custom",
] as const;

export type EnvironmentKind = (typeof environmentKinds)[number];

export const sourceKinds = [
  "local-folder",
  "local-git",
  "remote-git",
  "git-public",
  "git-github-app",
  "git-deploy-key",
  "zip-artifact",
  "dockerfile-inline",
  "docker-compose-inline",
  "docker-image",
  "compose",
] as const;

export type SourceKind = (typeof sourceKinds)[number];

export const runtimePlanStrategies = [
  "auto",
  "dockerfile",
  "docker-compose",
  "prebuilt-image",
  "workspace-commands",
] as const;

export type RuntimePlanStrategy = (typeof runtimePlanStrategies)[number];

export const buildStrategyKinds = [
  "dockerfile",
  "compose-deploy",
  "buildpack",
  "static-artifact",
  "prebuilt-image",
  "workspace-commands",
] as const;

export type BuildStrategyKind = (typeof buildStrategyKinds)[number];

export const packagingModes = [
  "split-deploy",
  "all-in-one-docker",
  "compose-bundle",
  "host-process-runtime",
  "optional-future-binary",
] as const;

export type PackagingMode = (typeof packagingModes)[number];

export const executionStrategyKinds = [
  "docker-container",
  "docker-compose-stack",
  "host-process",
] as const;

export type ExecutionStrategyKind = (typeof executionStrategyKinds)[number];

export const targetKinds = ["single-server", "future-multi-server", "future-k8s"] as const;

export type TargetKind = (typeof targetKinds)[number];

export const edgeProxyKinds = ["none", "traefik", "caddy"] as const;

export type EdgeProxyKind = (typeof edgeProxyKinds)[number];

export const edgeProxyStatuses = ["pending", "starting", "ready", "failed", "disabled"] as const;

export type EdgeProxyStatus = (typeof edgeProxyStatuses)[number];

export const tlsModes = ["auto", "disabled"] as const;

export type TlsMode = (typeof tlsModes)[number];

export const deploymentTargetCredentialKinds = ["local-ssh-agent", "ssh-private-key"] as const;

export type DeploymentTargetCredentialKind = (typeof deploymentTargetCredentialKinds)[number];

export const destinationKinds = ["docker", "compose", "host-process", "generic"] as const;

export type DestinationKind = (typeof destinationKinds)[number];

export const resourceKinds = [
  "application",
  "service",
  "database",
  "cache",
  "compose-stack",
  "worker",
  "static-site",
  "external",
] as const;

export type ResourceKind = (typeof resourceKinds)[number];

export const resourceServiceKinds = [
  "web",
  "api",
  "worker",
  "database",
  "cache",
  "service",
] as const;

export type ResourceServiceKind = (typeof resourceServiceKinds)[number];

export const deploymentStatuses = [
  "created",
  "planning",
  "planned",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "rolled-back",
] as const;

export type DeploymentStatus = (typeof deploymentStatuses)[number];

export const configScopes = [
  "defaults",
  "system",
  "organization",
  "project",
  "environment",
  "deployment",
] as const;

export type ConfigScope = (typeof configScopes)[number];

export const variableKinds = [
  "plain-config",
  "secret",
  "provider-specific",
  "deployment-strategy",
] as const;

export type VariableKind = (typeof variableKinds)[number];

export const variableExposures = ["build-time", "runtime"] as const;

export type VariableExposure = (typeof variableExposures)[number];

export const logLevels = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof logLevels)[number];

export const deploymentLogSources = ["yundu", "application"] as const;

export type DeploymentLogSource = (typeof deploymentLogSources)[number];
