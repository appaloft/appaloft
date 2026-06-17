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
import { orpc } from "$lib/orpc";

export const defaultConsoleListLimit = 100;

export const defaultAuthSession: AuthSessionResponse = {
  accountSecurity: {
    enabled: false,
    passwordState: "unknown",
  },
  accountRecovery: {
    enabled: false,
  },
  enabled: false,
  emailVerification: {
    enabled: false,
    otpEnabled: false,
    required: false,
  },
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
      staleTime: 30_000,
    }),
  );
  const productQueryEnabled = (key: ConsoleQueryKey) =>
    queryEnabled(key) && canRunProductQueries(authSessionQuery.data);
  const projectsQuery = createQuery(() =>
    orpc.projects.list.queryOptions({
      input: { limit: defaultConsoleListLimit },
      enabled: productQueryEnabled("projects"),
    }),
  );
  const serversQuery = createQuery(() =>
    orpc.servers.list.queryOptions({
      input: { limit: defaultConsoleListLimit },
      enabled: productQueryEnabled("servers"),
    }),
  );
  const environmentsQuery = createQuery(() =>
    orpc.environments.list.queryOptions({
      input: { limit: defaultConsoleListLimit },
      enabled: productQueryEnabled("environments"),
    }),
  );
  const resourcesQuery = createQuery(() =>
    orpc.resources.list.queryOptions({
      input: { limit: defaultConsoleListLimit },
      enabled: productQueryEnabled("resources"),
    }),
  );
  const deploymentsQuery = createQuery(() =>
    orpc.deployments.list.queryOptions({
      input: { limit: defaultConsoleListLimit },
      enabled: productQueryEnabled("deployments"),
    }),
  );
  const previewEnvironmentsQuery = createQuery(() =>
    orpc.previewEnvironments.list.queryOptions({
      input: { limit: defaultConsoleListLimit },
      enabled: productQueryEnabled("previewEnvironments"),
    }),
  );
  const domainBindingsQuery = createQuery(() =>
    orpc.domainBindings.list.queryOptions({
      input: { limit: defaultConsoleListLimit },
      enabled: productQueryEnabled("domainBindings"),
    }),
  );
  const certificatesQuery = createQuery(() =>
    orpc.certificates.list.queryOptions({
      input: { limit: defaultConsoleListLimit },
      enabled: productQueryEnabled("certificates"),
    }),
  );
  const providersQuery = createQuery(() =>
    orpc.providers.list.queryOptions({
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
