import {
  err,
  ProjectId,
  ResourceId,
  type Result,
  StaticArtifactPublication,
  StaticArtifactPublicationId,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type IdGenerator,
  type PublishStaticArtifactInput,
  type StaticArtifactPublicationJournalPort,
  type StaticArtifactPublisherPort,
  type StaticArtifactRouteProviderPort,
  type StaticArtifactStorePort,
} from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class PortBackedStaticArtifactPublisher implements StaticArtifactPublisherPort {
  constructor(
    @inject(tokens.staticArtifactStorePort)
    private readonly artifactStore: StaticArtifactStorePort,
    @inject(tokens.staticArtifactRouteProviderPort)
    private readonly routeProvider: StaticArtifactRouteProviderPort,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    private readonly publicationJournal?: StaticArtifactPublicationJournalPort,
  ) {}

  async publish(
    context: ExecutionContext,
    input: PublishStaticArtifactInput,
  ): Promise<Result<StaticArtifactPublication>> {
    const projectId = parseProjectId(input.projectId);
    if (projectId.isErr()) return err(projectId.error);
    const resourceId = parseResourceId(input.resourceId);
    if (resourceId.isErr()) return err(resourceId.error);

    const storedManifest = await this.artifactStore.storeManifest(context, {
      projectId: projectId.value.value,
      resourceId: resourceId.value.value,
      manifest: input.manifest,
      ...(input.files ? { files: input.files } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
    if (storedManifest.isErr()) return err(storedManifest.error);

    const publicationId = StaticArtifactPublicationId.create(
      this.idGenerator.next("static_artifact_publication"),
    );
    if (publicationId.isErr()) return err(publicationId.error);

    const basePublication = StaticArtifactPublication.create({
      publicationId: publicationId.value,
      projectId: projectId.value,
      resourceId: resourceId.value,
      manifest: input.manifest,
      storedManifest: storedManifest.value,
    });
    if (basePublication.isErr()) return err(basePublication.error);

    const routeActivation = await this.routeProvider.activateRoute(context, {
      publication: basePublication.value,
      routeKind: input.promoteAlias ? "alias" : "immutable",
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
    if (routeActivation.isErr()) return err(routeActivation.error);

    const publication = StaticArtifactPublication.create({
      publicationId: publicationId.value,
      projectId: projectId.value,
      resourceId: resourceId.value,
      manifest: input.manifest,
      storedManifest: storedManifest.value,
      routeActivation: routeActivation.value,
    });
    if (publication.isErr()) return err(publication.error);

    if (this.publicationJournal) {
      const journaled = await this.publicationJournal.recordPublication(context, {
        publication: publication.value,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
      if (journaled.isErr()) return err(journaled.error);
    }

    return publication;
  }
}

function parseProjectId(value: string): Result<ProjectId> {
  return ProjectId.create(value);
}

function parseResourceId(value: string): Result<ResourceId> {
  return ResourceId.create(value);
}
