import {
  type AuthSessionResponse,
  type CertificateSummary,
  type DeploymentSummary,
  type DomainBindingSummary,
  type EnvironmentSummary,
  type HealthResponse,
  type ListProvidersResponse,
  type PreviewEnvironmentSummary,
  type ProjectSummary,
  type ReadinessResponse,
  type ResourceSummary,
  type ServerSummary,
  type VersionResponse,
} from "@appaloft/contracts";
import { createQuery, queryOptions } from "@tanstack/svelte-query";

import { request } from "$lib/api/client";
import { canRunProductQueries } from "$lib/console/auth-query-gate";
import { orpcClient } from "$lib/orpc";

export const defaultConsoleListLimit = 100;

export const defaultAuthSession: AuthSessionResponse = {
  enabled: false,
  provider: "none",
  loginRequired: false,
  deferredAuth: false,
  session: null,
  providers: [],
};

export type ProviderSummary = ListProvidersResponse["items"][number];

type ConsoleQueryKey =
  | "health"
  | "readiness"
  | "version"
  | "authSession"
  | "projects"
  | "servers"
  | "environments"
  | "resources"
  | "deployments"
  | "previewEnvironments"
  | "domainBindings"
  | "certificates"
  | "providers";

type ConsoleQueryOverrides = Partial<Record<ConsoleQueryKey, boolean>>;

export function createConsoleQueries(enabled: boolean, overrides: ConsoleQueryOverrides = {}) {
  const queryEnabled = (key: ConsoleQueryKey) => overrides[key] ?? enabled;

  const healthQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "health"],
      queryFn: () => request<HealthResponse>("/api/health"),
      enabled: queryEnabled("health"),
      retry: 0,
    }),
  );
  const readinessQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "readiness"],
      queryFn: () => request<ReadinessResponse>("/api/readiness"),
      enabled: queryEnabled("readiness"),
    }),
  );
  const versionQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "version"],
      queryFn: () => request<VersionResponse>("/api/version"),
      enabled: queryEnabled("version"),
    }),
  );
  const authSessionQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "auth-session"],
      queryFn: () => request<AuthSessionResponse>("/api/auth/session"),
      enabled: queryEnabled("authSession"),
    }),
  );
  const productQueryEnabled = (key: ConsoleQueryKey) =>
    queryEnabled(key) && canRunProductQueries(authSessionQuery.data);
  const projectsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects", { limit: defaultConsoleListLimit }],
      queryFn: () => orpcClient.projects.list({ limit: defaultConsoleListLimit }),
      enabled: productQueryEnabled("projects"),
    }),
  );
  const serversQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers", { limit: defaultConsoleListLimit }],
      queryFn: () => orpcClient.servers.list({ limit: defaultConsoleListLimit }),
      enabled: productQueryEnabled("servers"),
    }),
  );
  const environmentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["environments", { limit: defaultConsoleListLimit }],
      queryFn: () => orpcClient.environments.list({ limit: defaultConsoleListLimit }),
      enabled: productQueryEnabled("environments"),
    }),
  );
  const resourcesQuery = createQuery(() =>
    queryOptions({
      queryKey: ["resources", { limit: defaultConsoleListLimit }],
      queryFn: () => orpcClient.resources.list({ limit: defaultConsoleListLimit }),
      enabled: productQueryEnabled("resources"),
    }),
  );
  const deploymentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", { limit: defaultConsoleListLimit }],
      queryFn: () => orpcClient.deployments.list({ limit: defaultConsoleListLimit }),
      enabled: productQueryEnabled("deployments"),
    }),
  );
  const previewEnvironmentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["preview-environments"],
      queryFn: () => orpcClient.previewEnvironments.list({}),
      enabled: productQueryEnabled("previewEnvironments"),
    }),
  );
  const domainBindingsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["domain-bindings"],
      queryFn: () => orpcClient.domainBindings.list({}),
      enabled: productQueryEnabled("domainBindings"),
    }),
  );
  const certificatesQuery = createQuery(() =>
    queryOptions({
      queryKey: ["certificates"],
      queryFn: () => orpcClient.certificates.list({}),
      enabled: productQueryEnabled("certificates"),
    }),
  );
  const providersQuery = createQuery(() =>
    queryOptions({
      queryKey: ["providers"],
      queryFn: () => orpcClient.providers.list(),
      enabled: productQueryEnabled("providers"),
    }),
  );

  return {
    healthQuery,
    readinessQuery,
    versionQuery,
    authSessionQuery,
    projectsQuery,
    serversQuery,
    environmentsQuery,
    resourcesQuery,
    deploymentsQuery,
    previewEnvironmentsQuery,
    domainBindingsQuery,
    certificatesQuery,
    providersQuery,
  };
}

export type ConsoleQueryData = {
  projects: ProjectSummary[];
  servers: ServerSummary[];
  environments: EnvironmentSummary[];
  resources: ResourceSummary[];
  deployments: DeploymentSummary[];
  previewEnvironments: PreviewEnvironmentSummary[];
  domainBindings: DomainBindingSummary[];
  certificates: CertificateSummary[];
  providers: ProviderSummary[];
};
