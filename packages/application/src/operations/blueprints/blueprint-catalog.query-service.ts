import {
  type BlueprintApplicationBundlePlanError,
  type BlueprintIssue,
  type BlueprintManifest,
  type BlueprintRegistry,
  createBlueprintApplicationBundlePlan,
  createBlueprintInstallPlan,
} from "@appaloft/blueprints";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  type BlueprintManifestResponse,
  type BlueprintRegistryEntryResponse,
  type CreateBlueprintInstallPlanResponse,
  type ListBlueprintsResponse,
  type ShowBlueprintResponse,
} from "./blueprint-catalog.schema";
import { type CreateBlueprintInstallPlanQuery } from "./create-blueprint-install-plan.query";
import { type ShowBlueprintQuery } from "./show-blueprint.query";

function blueprintIssuesError(message: string, issues: readonly BlueprintIssue[]): DomainError {
  return domainError.validation(message, {
    issues: issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
  });
}

function applicationBundleError(error: BlueprintApplicationBundlePlanError) {
  return domainError.infra("Blueprint application bundle plan is invalid", {
    code: error.code,
    message: error.message,
    componentId: error.componentId ?? null,
  });
}

function fallbackResourceSlugPrefix(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

@injectable()
export class BlueprintCatalogQueryService {
  constructor(@inject(tokens.blueprintRegistry) private readonly registry: BlueprintRegistry) {}

  async list(context: ExecutionContext): Promise<Result<ListBlueprintsResponse>> {
    void context;
    return ok({ items: [...(await this.registry.list())] });
  }

  async show(
    context: ExecutionContext,
    query: ShowBlueprintQuery,
  ): Promise<Result<ShowBlueprintResponse>> {
    void context;
    const entries = await this.registry.list();
    const entry = entries.find((candidate) => candidate.id === query.slug);
    const resolved = await this.registry.resolve(query.slug);

    if (!resolved.ok) {
      return err(domainError.notFound("blueprint", query.slug));
    }

    return ok({
      entry: entry ?? {
        id: resolved.value.id,
        name: resolved.value.name,
        version: resolved.value.version,
        summary: resolved.value.summary,
        sourcePath: query.slug,
        tags: resolved.value.tags,
        ...(resolved.value.defaultVariant ? { defaultVariant: resolved.value.defaultVariant } : {}),
        variants: Object.entries(resolved.value.variants).map(([id, variant]) => ({
          id,
          ...(variant.label ? { label: variant.label } : {}),
          ...(variant.summary ? { summary: variant.summary } : {}),
        })),
      },
      manifest: resolved.value as unknown as BlueprintManifestResponse,
    });
  }

  async createInstallPlan(
    context: ExecutionContext,
    query: CreateBlueprintInstallPlanQuery,
  ): Promise<Result<CreateBlueprintInstallPlanResponse>> {
    void context;
    const shown = await this.show(context, { slug: query.slug } as ShowBlueprintQuery);
    if (shown.isErr()) {
      return err(shown.error);
    }

    const { entry, manifest } = shown.value as unknown as {
      readonly entry: BlueprintRegistryEntryResponse;
      readonly manifest: BlueprintManifest;
    };
    const plan = createBlueprintInstallPlan({
      manifest,
      ...(query.input.variant ? { variant: query.input.variant } : {}),
      ...(query.input.profile ? { profile: query.input.profile } : {}),
      ...(query.input.parameters ? { parameters: query.input.parameters } : {}),
      target: {
        ...(query.input.target?.projectId ? { projectId: query.input.target.projectId } : {}),
        projectName: query.input.target?.projectName ?? manifest.name,
        ...(query.input.target?.environmentId
          ? { environmentId: query.input.target.environmentId }
          : {}),
        environmentName: query.input.target?.environmentName ?? "production",
        resourceSlugPrefix:
          query.input.target?.resourceSlugPrefix ?? fallbackResourceSlugPrefix(entry.id),
      },
    });

    if (!plan.ok) {
      return err(blueprintIssuesError("Blueprint install plan is invalid", plan.issues));
    }

    const applicationBundle = createBlueprintApplicationBundlePlan({ plan: plan.value });
    if (!applicationBundle.ok) {
      return err(applicationBundleError(applicationBundle.error));
    }

    return ok({
      entry,
      plan: plan.value,
      applicationBundle: applicationBundle.value,
    });
  }
}
