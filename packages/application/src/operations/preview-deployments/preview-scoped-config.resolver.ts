import { type ResourceConfigEntryView, type ResourceEffectiveConfigView } from "../../ports";

type PreviewConfigScope = ResourceConfigEntryView["scope"];
type PreviewVariableExposure = ResourceConfigEntryView["exposure"];
type PreviewVariableKind = ResourceConfigEntryView["kind"];

export interface PreviewScopedConfigSelection {
  key: string;
  exposure: PreviewVariableExposure;
}

export interface PreviewScopedRoutePolicyInput {
  mode: "none" | "generated-default-access";
  pathPrefix?: string;
}

export interface PreviewScopedConfigResolutionInput {
  resourceId: string;
  previewEnvironmentId: string;
  effectiveConfig: ResourceEffectiveConfigView;
  variableSelections?: PreviewScopedConfigSelection[];
  secretSelections?: PreviewScopedConfigSelection[];
  routePolicy?: PreviewScopedRoutePolicyInput;
}

export interface PreviewScopedVariableReference {
  key: string;
  value: string;
  exposure: PreviewVariableExposure;
  kind: PreviewVariableKind;
  sourceScope: PreviewConfigScope;
}

export interface PreviewScopedSecretReference {
  key: string;
  exposure: PreviewVariableExposure;
  kind: PreviewVariableKind;
  sourceScope: PreviewConfigScope;
}

export interface PreviewScopedRoutePolicyResolution {
  mode: "none" | "generated-default-access";
  copiedDurableRoutes: readonly string[];
  pathPrefix?: string;
}

export interface PreviewScopedConfigResolution {
  schemaVersion: "preview-scoped-config.resolve/v1";
  resourceId: string;
  previewEnvironmentId: string;
  variables: PreviewScopedVariableReference[];
  secretReferences: PreviewScopedSecretReference[];
  omittedProductionSecretKeys: string[];
  routePolicy: PreviewScopedRoutePolicyResolution;
}

function selectionIdentity(selection: PreviewScopedConfigSelection): string {
  return `${selection.key}:${selection.exposure}`;
}

function selectedEntries(
  entries: ResourceConfigEntryView[],
  selections: PreviewScopedConfigSelection[] | undefined,
): ResourceConfigEntryView[] {
  const selectionIds = new Set((selections ?? []).map(selectionIdentity));
  if (selectionIds.size === 0) {
    return [];
  }

  return entries.filter((entry) =>
    selectionIds.has(
      selectionIdentity({
        key: entry.key,
        exposure: entry.exposure,
      }),
    ),
  );
}

export class PreviewScopedConfigResolver {
  resolve(input: PreviewScopedConfigResolutionInput): PreviewScopedConfigResolution {
    const effectiveEntries = input.effectiveConfig.effectiveEntries;
    const explicitlySelectedVariables = selectedEntries(effectiveEntries, input.variableSelections);
    const explicitlySelectedSecrets = selectedEntries(effectiveEntries, input.secretSelections);

    return {
      schemaVersion: "preview-scoped-config.resolve/v1",
      resourceId: input.resourceId,
      previewEnvironmentId: input.previewEnvironmentId,
      variables: explicitlySelectedVariables
        .filter((entry) => !entry.isSecret)
        .map((entry) => ({
          key: entry.key,
          value: entry.value,
          exposure: entry.exposure,
          kind: entry.kind,
          sourceScope: entry.scope,
        })),
      secretReferences: explicitlySelectedSecrets
        .filter((entry) => entry.isSecret)
        .map((entry) => ({
          key: entry.key,
          exposure: entry.exposure,
          kind: entry.kind,
          sourceScope: entry.scope,
        })),
      omittedProductionSecretKeys: effectiveEntries
        .filter((entry) => entry.isSecret)
        .filter(
          (entry) =>
            !explicitlySelectedSecrets.some(
              (selection) => selection.key === entry.key && selection.exposure === entry.exposure,
            ),
        )
        .map((entry) => entry.key)
        .sort((left, right) => left.localeCompare(right)),
      routePolicy: {
        mode: input.routePolicy?.mode ?? "none",
        copiedDurableRoutes: [],
        ...(input.routePolicy?.pathPrefix ? { pathPrefix: input.routePolicy.pathPrefix } : {}),
      },
    };
  }
}

export function resolvePreviewScopedConfig(
  input: PreviewScopedConfigResolutionInput,
): PreviewScopedConfigResolution {
  return new PreviewScopedConfigResolver().resolve(input);
}
