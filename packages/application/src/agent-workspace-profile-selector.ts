import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";

export interface WorkspaceProfileInstallationCandidate {
  readonly id: string;
  readonly installedAt: string;
}

export function workspaceProfileAmbiguousError(
  selector: string,
  installationIds: readonly string[],
): DomainError {
  const ids = [...installationIds];
  const preferred = ids[0];
  return domainError.conflict(`Agent Workspace Profile selector "${selector}" is ambiguous`, {
    code: "workspace_open_profile_ambiguous",
    selector,
    installationIds: ids,
    ...(preferred
      ? {
          guidance: `Installations: ${ids.join(", ")}. Retry with appaloft code --profile ${preferred}`,
        }
      : {}),
  });
}

export function selectWorkspaceProfileInstallation(input: {
  readonly selector: string;
  readonly candidates: readonly WorkspaceProfileInstallationCandidate[];
  readonly projectDefaultInstallationId?: string;
  readonly liveInstallationIds?: readonly string[];
}): Result<string> {
  const candidates = [...input.candidates];
  if (candidates.length === 0) {
    return err(domainError.notFound("AgentWorkspaceProfileInstallation", input.selector));
  }
  if (candidates.length === 1) {
    const [only] = candidates;
    return only
      ? ok(only.id)
      : err(domainError.notFound("AgentWorkspaceProfileInstallation", input.selector));
  }

  const liveIds = new Set(input.liveInstallationIds ?? []);
  const live = liveIds.size > 0 ? candidates.filter((candidate) => liveIds.has(candidate.id)) : [];
  if (live.length === 1 && live[0]) return ok(live[0].id);
  if (live.length > 1) {
    return err(
      workspaceProfileAmbiguousError(
        input.selector,
        live.map((candidate) => candidate.id),
      ),
    );
  }

  const projectDefault = input.projectDefaultInstallationId
    ? candidates.find((candidate) => candidate.id === input.projectDefaultInstallationId)
    : undefined;
  if (projectDefault) return ok(projectDefault.id);

  const [oldest] = [...candidates].sort((left, right) =>
    left.installedAt.localeCompare(right.installedAt),
  );
  return oldest
    ? ok(oldest.id)
    : err(domainError.notFound("AgentWorkspaceProfileInstallation", input.selector));
}
