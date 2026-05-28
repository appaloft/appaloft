import "reflect-metadata";

import {
  type ServerAppliedRouteDesiredStateStore as CliServerAppliedRouteStateStore,
  type CliSourceLinkStore,
  createCliProgram,
  SshRemoteStateLifecycle,
  sshRemoteStateTargetFromDecision,
} from "@appaloft/adapter-cli";
import {
  type CommandBus,
  type DeploymentProgressObserver,
  type IdGenerator,
  MarkServerAppliedRouteAppliedSpec,
  MarkServerAppliedRouteFailedSpec,
  type QueryBus,
  ServerAppliedRouteStateByRouteSetIdSpec,
  ServerAppliedRouteStateBySourceFingerprintSpec,
  ServerAppliedRouteStateByTargetSpec,
  type ServerAppliedRouteStateRepository,
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkRecord,
  type SourceLinkRepository,
  type TerminalSessionGateway,
  tokens,
  UpsertServerAppliedRouteDesiredStateSpec,
  UpsertSourceLinkSpec,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";
import { domainError, err, ok } from "@appaloft/core";
import {
  type AppaloftServer,
  type AppaloftServerOptions,
  createAppaloftServer,
} from "@appaloft/server";
import { type DependencyContainer } from "tsyringe";
import { type RemotePgliteStateSyncSession } from "./remote-pglite-state-sync";

export interface AppComposition extends AppaloftServer {
  cliProgram: ReturnType<typeof createCliProgram>;
  commandBus: CommandBus;
  queryBus: QueryBus;
}

export interface ShellRuntimeOptions
  extends Omit<AppaloftServerOptions, "config" | "flags" | "remotePgliteStateSyncSession"> {
  remotePgliteStateSyncSession?: RemotePgliteStateSyncSession;
}

function resolveToken<T>(dependencyContainer: DependencyContainer, token: symbol): T {
  return dependencyContainer.resolve(token as never) as T;
}

function createCliSourceLinkStore(repository: SourceLinkRepository): CliSourceLinkStore {
  return {
    read(sourceFingerprint) {
      return repository.findOne(SourceLinkBySourceFingerprintSpec.create(sourceFingerprint));
    },
    async requireSameTargetOrMissing(sourceFingerprint, target) {
      const existing = await repository.findOne(
        SourceLinkBySourceFingerprintSpec.create(sourceFingerprint),
      );
      if (existing.isErr() || !existing.value) {
        return existing;
      }
      const record = existing.value;
      if (
        record.projectId === target.projectId &&
        record.environmentId === target.environmentId &&
        record.resourceId === target.resourceId &&
        record.serverId === target.serverId &&
        record.destinationId === target.destinationId
      ) {
        return existing;
      }

      return err(
        domainError.validation("Source link points at another deployment context", {
          phase: "source-link-resolution",
          sourceFingerprint,
          projectId: record.projectId,
          environmentId: record.environmentId,
          resourceId: record.resourceId,
        }),
      );
    },
    createIfMissing: async (input) => {
      const existing = await repository.findOne(
        SourceLinkBySourceFingerprintSpec.create(input.sourceFingerprint),
      );
      if (existing.isErr()) {
        return err(existing.error);
      }
      if (existing.value) {
        return ok(existing.value);
      }

      const record: SourceLinkRecord = {
        sourceFingerprint: input.sourceFingerprint,
        projectId: input.target.projectId,
        environmentId: input.target.environmentId,
        resourceId: input.target.resourceId,
        updatedAt: input.updatedAt,
        ...(input.target.serverId ? { serverId: input.target.serverId } : {}),
        ...(input.target.destinationId ? { destinationId: input.target.destinationId } : {}),
      };
      return repository.upsert(record, UpsertSourceLinkSpec.fromRecord(record));
    },
    recordDependencyProvenance: async (input) => {
      const existing = await repository.findOne(
        SourceLinkBySourceFingerprintSpec.create(input.sourceFingerprint),
      );
      if (existing.isErr()) {
        return err(existing.error);
      }
      if (existing.value) {
        const record = existing.value;
        if (
          record.projectId !== input.target.projectId ||
          record.environmentId !== input.target.environmentId ||
          record.resourceId !== input.target.resourceId ||
          record.serverId !== input.target.serverId ||
          record.destinationId !== input.target.destinationId
        ) {
          return err(
            domainError.validation("Source link points at another deployment context", {
              phase: "source-link-resolution",
              sourceFingerprint: input.sourceFingerprint,
              projectId: record.projectId,
              environmentId: record.environmentId,
              resourceId: record.resourceId,
            }),
          );
        }
      }

      const record: SourceLinkRecord = {
        ...(existing.value ?? {}),
        sourceFingerprint: input.sourceFingerprint,
        projectId: input.target.projectId,
        environmentId: input.target.environmentId,
        resourceId: input.target.resourceId,
        updatedAt: input.updatedAt,
        ...(input.target.serverId ? { serverId: input.target.serverId } : {}),
        ...(input.target.destinationId ? { destinationId: input.target.destinationId } : {}),
        dependencyProvenance: input.dependencyProvenance,
        ...(existing.value?.reason ? { reason: existing.value.reason } : {}),
      };
      return repository.upsert(record, UpsertSourceLinkSpec.fromRecord(record));
    },
  };
}

function createCliServerAppliedRouteStore(
  repository: ServerAppliedRouteStateRepository,
): CliServerAppliedRouteStateStore {
  return {
    upsertDesired(input) {
      const record = {
        routeSetId: [
          input.target.projectId,
          input.target.environmentId,
          input.target.resourceId,
          input.target.serverId,
          input.target.destinationId ?? "default",
        ].join(":"),
        projectId: input.target.projectId,
        environmentId: input.target.environmentId,
        resourceId: input.target.resourceId,
        serverId: input.target.serverId,
        ...(input.target.destinationId ? { destinationId: input.target.destinationId } : {}),
        ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
        domains: input.domains,
        status: "desired" as const,
        updatedAt: input.updatedAt,
      };
      return repository.upsert(record, UpsertServerAppliedRouteDesiredStateSpec.fromRecord(record));
    },
    read(target) {
      return repository.findOne(ServerAppliedRouteStateByTargetSpec.create(target));
    },
    async markApplied(input) {
      const routeSetId =
        input.routeSetId ??
        [
          input.target.projectId,
          input.target.environmentId,
          input.target.resourceId,
          input.target.serverId,
          input.target.destinationId ?? "default",
        ].join(":");

      return repository.updateOne(
        ServerAppliedRouteStateByRouteSetIdSpec.create(routeSetId),
        MarkServerAppliedRouteAppliedSpec.create({
          deploymentId: input.deploymentId,
          updatedAt: input.updatedAt,
          ...(input.providerKey ? { providerKey: input.providerKey } : {}),
          ...(input.proxyKind ? { proxyKind: input.proxyKind } : {}),
        }),
      );
    },
    async markFailed(input) {
      const routeSetId =
        input.routeSetId ??
        [
          input.target.projectId,
          input.target.environmentId,
          input.target.resourceId,
          input.target.serverId,
          input.target.destinationId ?? "default",
        ].join(":");

      return repository.updateOne(
        ServerAppliedRouteStateByRouteSetIdSpec.create(routeSetId),
        MarkServerAppliedRouteFailedSpec.create({
          deploymentId: input.deploymentId,
          updatedAt: input.updatedAt,
          phase: input.phase,
          errorCode: input.errorCode,
          retryable: input.retryable,
          ...(input.message ? { message: input.message } : {}),
          ...(input.providerKey ? { providerKey: input.providerKey } : {}),
          ...(input.proxyKind ? { proxyKind: input.proxyKind } : {}),
        }),
      );
    },
    deleteDesired(target) {
      return repository.deleteOne(ServerAppliedRouteStateByTargetSpec.create(target));
    },
    deleteDesiredBySourceFingerprint(sourceFingerprint) {
      return repository.deleteMany(
        ServerAppliedRouteStateBySourceFingerprintSpec.create(sourceFingerprint),
      );
    },
  };
}

export async function createAppComposition(
  flags?: Partial<AppConfig>,
  options?: ShellRuntimeOptions,
): Promise<AppComposition> {
  const server = await createAppaloftServer({
    ...options,
    ...(flags ? { flags } : {}),
  });
  const commandBus = resolveToken<CommandBus>(server.container, tokens.commandBus);
  const queryBus = resolveToken<QueryBus>(server.container, tokens.queryBus);
  const idGenerator = resolveToken<IdGenerator>(server.container, tokens.idGenerator);
  const terminalSessionGateway = resolveToken<TerminalSessionGateway>(
    server.container,
    tokens.terminalSessionGateway,
  );
  const deploymentProgressObserver = resolveToken<DeploymentProgressObserver>(
    server.container,
    tokens.deploymentProgressReporter,
  );
  const sourceLinkRepository = resolveToken<SourceLinkRepository>(
    server.container,
    tokens.sourceLinkRepository,
  );
  const serverAppliedRouteStateRepository = resolveToken<ServerAppliedRouteStateRepository>(
    server.container,
    tokens.serverAppliedRouteStateRepository,
  );

  const cliProgram = createCliProgram({
    version: server.config.appVersion,
    startServer: server.startServer,
    commandBus,
    queryBus,
    executionContextFactory: server.executionContextFactory,
    terminalSessionGateway,
    deploymentProgressObserver,
    sourceLinkStore: createCliSourceLinkStore(sourceLinkRepository),
    serverAppliedRouteStore: createCliServerAppliedRouteStore(serverAppliedRouteStateRepository),
    prepareDeploymentStateBackend: async (decision) => {
      if (options?.remotePgliteStateSyncSession && decision.kind === "ssh-pglite") {
        return ok({
          dataRoot: options.remotePgliteStateSyncSession.dataRoot,
          schemaVersion: 1,
          release: options.remotePgliteStateSyncSession.releaseForCliRuntime,
        });
      }

      if (!decision.requiresRemoteStateLifecycle) {
        return ok({
          dataRoot: "",
          schemaVersion: 0,
          release: async () => ok(undefined),
        });
      }

      const target = sshRemoteStateTargetFromDecision(decision);
      if (target.isErr()) {
        return err(target.error);
      }

      return await new SshRemoteStateLifecycle({
        target: target.value,
        dataRoot: `${server.config.remoteRuntimeRoot.replace(/\/+$/, "")}/state`,
        owner: "appaloft-cli",
        correlationId: idGenerator.next("remote_state"),
      }).prepare();
    },
  });

  return {
    ...server,
    cliProgram,
    commandBus,
    queryBus,
  };
}
