export const workspaceNavigation = [
  { id: "projects", href: "/projects" },
  { id: "infrastructure", href: "/infrastructure" },
  { id: "activity", href: "/activity" },
  { id: "marketplace", href: "/marketplace" },
  { id: "settings", href: "/settings" },
] as const;

export const projectNavigation = [
  { id: "overview" },
  { id: "deployments" },
  { id: "observability" },
  { id: "settings" },
] as const;

export const resourceNavigation = [
  { id: "overview" },
  { id: "deployments" },
  { id: "configuration" },
  { id: "logs-metrics" },
  { id: "networking" },
  { id: "settings" },
] as const;

export type WorkspaceDestination = (typeof workspaceNavigation)[number]["id"];
export type ProjectDestination = (typeof projectNavigation)[number]["id"];
export type ResourceDestination = (typeof resourceNavigation)[number]["id"];

interface CollectionState {
  environmentId?: string;
  view?: string;
  search?: string;
  sort?: string;
  cursor?: string;
  filters: string[];
}

export type DashboardRoute =
  | ({ kind: "workspace"; destination: WorkspaceDestination } & CollectionState)
  | ({
      kind: "project";
      projectId: string;
      destination: ProjectDestination;
    } & CollectionState)
  | ({
      kind: "resource";
      projectId: string;
      resourceId: string;
      destination: ResourceDestination;
    } & CollectionState)
  | { kind: "utility"; destination: "patterns"; filters: string[] }
  | { kind: "not-found"; pathname: string; filters: string[] };

const workspaceDestinations = new Set<WorkspaceDestination>(
  workspaceNavigation.map(({ id }) => id),
);
const projectDestinations = new Set<ProjectDestination>(projectNavigation.map(({ id }) => id));
const resourceDestinations = new Set<ResourceDestination>(resourceNavigation.map(({ id }) => id));

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function collectionState(url: URL): CollectionState {
  const value = (key: string) => url.searchParams.get(key)?.trim() || undefined;

  return {
    ...(value("environment") ? { environmentId: value("environment") } : {}),
    ...(value("view") ? { view: value("view") } : {}),
    ...(value("search") ? { search: value("search") } : {}),
    ...(value("sort") ? { sort: value("sort") } : {}),
    ...(value("cursor") ? { cursor: value("cursor") } : {}),
    filters: url.searchParams
      .getAll("filter")
      .map((filter) => filter.trim())
      .filter(Boolean)
      .toSorted(),
  };
}

export function parseDashboardRoute(input: string | URL): DashboardRoute {
  const url = input instanceof URL ? input : new URL(input, "http://dashboard.appaloft.local");
  const segments = url.pathname.split("/").filter(Boolean);
  const state = collectionState(url);

  if (segments.length === 1 && segments[0] === "patterns") {
    return { kind: "utility", destination: "patterns", filters: state.filters };
  }

  if (segments.length === 1 && workspaceDestinations.has(segments[0] as WorkspaceDestination)) {
    return { kind: "workspace", destination: segments[0] as WorkspaceDestination, ...state };
  }

  if (segments[0] === "projects" && segments[1]) {
    const projectId = decode(segments[1]);

    if (
      segments[2] === "resources" &&
      segments[3] &&
      resourceDestinations.has((segments[4] || "overview") as ResourceDestination)
    ) {
      return {
        kind: "resource",
        projectId,
        resourceId: decode(segments[3]),
        destination: (segments[4] || "overview") as ResourceDestination,
        ...state,
      };
    }

    if (projectDestinations.has((segments[2] || "overview") as ProjectDestination)) {
      return {
        kind: "project",
        projectId,
        destination: (segments[2] || "overview") as ProjectDestination,
        ...state,
      };
    }
  }

  return { kind: "not-found", pathname: url.pathname, filters: state.filters };
}

function appendCollectionState(url: URL, state: CollectionState): void {
  const values = [
    ["environment", state.environmentId],
    ["view", state.view],
    ["search", state.search],
    ["sort", state.sort],
    ["cursor", state.cursor],
  ] as const;

  for (const [key, value] of values) {
    if (value) url.searchParams.set(key, value);
  }

  for (const filter of state.filters.toSorted()) {
    url.searchParams.append("filter", filter);
  }
}

export function serializeDashboardRoute(route: DashboardRoute): string {
  if (route.kind === "not-found") return route.pathname;
  if (route.kind === "utility") return `/${route.destination}`;

  let pathname: string;

  if (route.kind === "workspace") {
    pathname = `/${route.destination}`;
  } else if (route.kind === "project") {
    pathname = `/projects/${encodeURIComponent(route.projectId)}/${route.destination}`;
  } else {
    pathname = `/projects/${encodeURIComponent(route.projectId)}/resources/${encodeURIComponent(route.resourceId)}/${route.destination}`;
  }

  const url = new URL(pathname, "http://dashboard.appaloft.local");
  appendCollectionState(url, route);
  return `${url.pathname}${url.search}`;
}

export function projectDestinationHref(
  projectId: string,
  destination: ProjectDestination,
  environmentId = "production",
): string {
  return serializeDashboardRoute({
    kind: "project",
    projectId,
    destination,
    environmentId,
    filters: [],
  });
}

export function resourceDestinationHref(
  projectId: string,
  resourceId: string,
  destination: ResourceDestination,
  environmentId = "production",
): string {
  return serializeDashboardRoute({
    kind: "resource",
    projectId,
    resourceId,
    destination,
    environmentId,
    view: "list",
    filters: [],
  });
}
