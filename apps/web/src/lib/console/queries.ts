import { createQuery, queryOptions } from "@tanstack/svelte-query";
import {
  type AuthSessionResponse,
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
} from "@yundu/contracts";

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

export function createConsoleQueries(enabled: boolean) {
  const healthQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "health"],
      queryFn: () => request<HealthResponse>("/api/health"),
      enabled,
      retry: 0,
    }),
  );
  const readinessQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "readiness"],
      queryFn: () => request<ReadinessResponse>("/api/readiness"),
      enabled,
    }),
  );
  const versionQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "version"],
      queryFn: () => request<VersionResponse>("/api/version"),
      enabled,
    }),
  );
  const authSessionQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "auth-session"],
      queryFn: () => request<AuthSessionResponse>("/api/auth/session"),
      enabled,
    }),
  );
  const projectsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects"],
      queryFn: () => orpcClient.projects.list(),
      enabled,
    }),
  );
  const serversQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers"],
      queryFn: () => orpcClient.servers.list(),
      enabled,
    }),
  );
  const environmentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["environments"],
      queryFn: () => orpcClient.environments.list({}),
      enabled,
    }),
  );
  const resourcesQuery = createQuery(() =>
    queryOptions({
      queryKey: ["resources"],
      queryFn: () => orpcClient.resources.list({}),
      enabled,
    }),
  );
  const deploymentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments"],
      queryFn: () => orpcClient.deployments.list({}),
      enabled,
    }),
  );
  const domainBindingsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["domain-bindings"],
      queryFn: () => orpcClient.domainBindings.list({}),
      enabled,
    }),
  );
  const providersQuery = createQuery(() =>
    queryOptions({
      queryKey: ["providers"],
      queryFn: () => orpcClient.providers.list(),
      enabled,
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
  providers: ProviderSummary[];
};
