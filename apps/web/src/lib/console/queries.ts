import {
  type AuthSessionResponse,
  type CertificateSummary,
  type DeploymentSummary,
  type DomainBindingSummary,
  type EnvironmentSummary,
  type HealthResponse,
  type ListProvidersResponse,
  type ProjectSummary,
  type ReadinessResponse,
  type ResourceSummary,
  type ServerSummary,
  type VersionResponse,
} from "@appaloft/contracts";
import { createQuery, queryOptions } from "@tanstack/svelte-query";

import { request } from "$lib/api/client";
import { orpcClient } from "$lib/orpc";

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
  const projectsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects"],
      queryFn: () => orpcClient.projects.list(),
      enabled: queryEnabled("projects"),
    }),
  );
  const serversQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers"],
      queryFn: () => orpcClient.servers.list(),
      enabled: queryEnabled("servers"),
    }),
  );
  const environmentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["environments"],
      queryFn: () => orpcClient.environments.list({}),
      enabled: queryEnabled("environments"),
    }),
  );
  const resourcesQuery = createQuery(() =>
    queryOptions({
      queryKey: ["resources"],
      queryFn: () => orpcClient.resources.list({}),
      enabled: queryEnabled("resources"),
    }),
  );
  const deploymentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments"],
      queryFn: () => orpcClient.deployments.list({}),
      enabled: queryEnabled("deployments"),
    }),
  );
  const domainBindingsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["domain-bindings"],
      queryFn: () => orpcClient.domainBindings.list({}),
      enabled: queryEnabled("domainBindings"),
    }),
  );
  const certificatesQuery = createQuery(() =>
    queryOptions({
      queryKey: ["certificates"],
      queryFn: () => orpcClient.certificates.list({}),
      enabled: queryEnabled("certificates"),
    }),
  );
  const providersQuery = createQuery(() =>
    queryOptions({
      queryKey: ["providers"],
      queryFn: () => orpcClient.providers.list(),
      enabled: queryEnabled("providers"),
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
  domainBindings: DomainBindingSummary[];
  certificates: CertificateSummary[];
  providers: ProviderSummary[];
};
