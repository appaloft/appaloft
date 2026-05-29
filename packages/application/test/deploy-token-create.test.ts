import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ActiveDeployTokenByVerifierDigestSpec,
  CreatedAt,
  DeployToken,
  DeployTokenByIdSpec,
  DeployTokenId,
  type DeployTokenMutationSpec,
  DeployTokenScope,
  DeployTokenSecretSuffix,
  type DeployTokenSelectionSpec,
  DeployTokenVerifierDigest,
  DeployTokenWorkflowCommandValue,
  DisplayNameText,
  type DomainEvent,
  err,
  OrganizationId,
  ok,
  ProjectId,
  type Result,
  SourceRepositoryFullName,
} from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import {
  type AppLogger,
  CreateDeployTokenCommand,
  CreateDeployTokenCommandHandler,
  CreateDeployTokenUseCase,
  createExecutionContext,
  type DeployTokenMaterial,
  type DeployTokenMaterialIssuer,
  type DeployTokenReadModel,
  type DeployTokenRepository,
  type DeployTokenSummary,
  type EventBus,
  type ExecutionContext,
  ListDeployTokensQuery,
  ListDeployTokensQueryHandler,
  ListDeployTokensQueryService,
  type OperationCheckRequest,
  type OperationGuardDecision,
  type OperationGuardPort,
  operationCatalog,
  type RepositoryContext,
  RevokeDeployTokenCommand,
  RevokeDeployTokenCommandHandler,
  RevokeDeployTokenUseCase,
  RotateDeployTokenCommand,
  RotateDeployTokenCommandHandler,
  RotateDeployTokenUseCase,
  ShowDeployTokenQuery,
  ShowDeployTokenQueryHandler,
  ShowDeployTokenQueryService,
  toRepositoryContext,
} from "../src";

class SequentialIdGenerator {
  private sequence = 0;

  next(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence}`;
  }
}

class MemoryDeployTokenRepository implements DeployTokenRepository {
  saved: DeployToken | undefined;

  async findOne(
    _context: RepositoryContext,
    spec: DeployTokenSelectionSpec,
  ): Promise<DeployToken | null> {
    if (!this.saved) {
      return null;
    }

    if (spec instanceof DeployTokenByIdSpec) {
      return this.saved.toState().id.equals(spec.id) ? this.saved : null;
    }

    if (spec instanceof ActiveDeployTokenByVerifierDigestSpec) {
      return this.saved.matchesVerifierDigest(spec.verifierDigest) &&
        this.saved.canAuthorizeAt(spec.at)
        ? this.saved
        : null;
    }

    return null;
  }

  async upsert(
    _context: RepositoryContext,
    deployToken: DeployToken,
    _spec: DeployTokenMutationSpec,
  ): Promise<void> {
    this.saved = deployToken;
  }

  async updateOne(
    _context: RepositoryContext,
    deployToken: DeployToken,
    _spec: DeployTokenMutationSpec,
  ): Promise<boolean> {
    this.saved = deployToken;
    return true;
  }
}

class MemoryDeployTokenReadModel implements DeployTokenReadModel {
  constructor(private readonly summaries: DeployTokenSummary[]) {}

  async list(
    _context: RepositoryContext,
    input: Parameters<DeployTokenReadModel["list"]>[1],
  ): Promise<DeployTokenSummary[]> {
    return this.summaries
      .filter((summary) => summary.organizationId === input.organizationId)
      .filter((summary) => !input.status || summary.status === input.status)
      .filter(
        (summary) => !input.resourceId || summary.scope.resourceIds.includes(input.resourceId),
      )
      .filter(
        (summary) =>
          !input.repositoryFullName ||
          summary.scope.repositoryFullNames.includes(input.repositoryFullName),
      )
      .slice(0, input.limit ?? 100);
  }

  async findOne(
    _context: RepositoryContext,
    input: Parameters<DeployTokenReadModel["findOne"]>[1],
  ): Promise<DeployTokenSummary | null> {
    return (
      this.summaries.find(
        (summary) =>
          summary.organizationId === input.organizationId && summary.tokenId === input.tokenId,
      ) ?? null
    );
  }
}

class FixedDeployTokenMaterialIssuer implements DeployTokenMaterialIssuer {
  readonly token = "aplt_dt_rawtokenvalue00000000";

  async issue(_context: ExecutionContext): Promise<Result<DeployTokenMaterial>> {
    const verifierDigest = DeployTokenVerifierDigest.create(
      "sha256:00000000000000000000000000000000",
    );
    const secretSuffix = DeployTokenSecretSuffix.create("00000000");
    if (verifierDigest.isErr()) {
      return err(verifierDigest.error);
    }
    if (secretSuffix.isErr()) {
      return err(secretSuffix.error);
    }
    return ok({
      token: this.token,
      verifierDigest: verifierDigest.value,
      secretSuffix: secretSuffix.value,
    });
  }
}

class QueuedDeployTokenMaterialIssuer implements DeployTokenMaterialIssuer {
  private index = 0;

  constructor(private readonly materials: DeployTokenMaterial[]) {}

  async issue(_context: ExecutionContext): Promise<Result<DeployTokenMaterial>> {
    const material = this.materials[this.index];
    this.index += 1;

    if (!material) {
      return err({
        code: "deploy_token_material_unavailable",
        category: "infra",
        message: "No deploy token material is queued for this test",
        retryable: false,
      });
    }

    return ok(material);
  }
}

class CapturingEventBus implements EventBus {
  readonly published: DomainEvent[] = [];

  async publish(_context: ExecutionContext, events: DomainEvent[]): Promise<void> {
    this.published.push(...events);
  }
}

class DenyingOperationGuardPort implements OperationGuardPort {
  readonly requests: OperationCheckRequest[] = [];

  async checkOperation(
    _context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationGuardDecision> {
    this.requests.push(request);
    return {
      allowed: false,
      checks: [
        {
          allowed: false,
          checkKey: "test.quota",
          kind: "quota",
          reason: "test-operation-denied",
        },
      ],
      deniedBy: {
        checkKey: "test.quota",
        kind: "quota",
      },
      reason: "test-operation-denied",
    };
  }
}

const noopLogger: AppLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

function deployTokenMaterial(input: {
  digest: string;
  suffix: string;
  token: string;
}): DeployTokenMaterial {
  const verifierDigest = DeployTokenVerifierDigest.create(input.digest);
  const secretSuffix = DeployTokenSecretSuffix.create(input.suffix);
  if (verifierDigest.isErr()) {
    throw new Error(verifierDigest.error.message);
  }
  if (secretSuffix.isErr()) {
    throw new Error(secretSuffix.error.message);
  }

  return {
    token: input.token,
    verifierDigest: verifierDigest.value,
    secretSuffix: secretSuffix.value,
  };
}

function createStoredDeployToken(input?: { digest?: string; suffix?: string }) {
  return DeployToken.create({
    id: DeployTokenId.rehydrate("dpt_existing"),
    organizationId: OrganizationId.rehydrate("org_self_hosted"),
    displayName: DisplayNameText.rehydrate("GitHub Action deploy token"),
    verifierDigest: DeployTokenVerifierDigest.rehydrate(
      input?.digest ?? "sha256:11111111111111111111111111111111",
    ),
    secretSuffix: DeployTokenSecretSuffix.rehydrate(input?.suffix ?? "11111111"),
    scope: DeployTokenScope.create({
      projectIds: [ProjectId.rehydrate("prj_demo")],
      repositoryFullNames: [SourceRepositoryFullName.rehydrate("appaloft/demo")],
      workflowCommands: [DeployTokenWorkflowCommandValue.rehydrate("server-config-deploy")],
    })._unsafeUnwrap(),
    createdAt: CreatedAt.rehydrate("2026-05-10T08:00:00.000Z"),
  })._unsafeUnwrap();
}

function deployTokenSummary(input?: Partial<DeployTokenSummary>): DeployTokenSummary {
  return {
    tokenId: "dpt_existing",
    organizationId: "org_self_hosted",
    displayName: "GitHub Action deploy token",
    status: "active",
    secretSuffix: "11111111",
    scope: {
      deploymentTargetIds: [],
      environmentIds: [],
      projectIds: ["prj_demo"],
      repositoryFullNames: ["appaloft/demo"],
      resourceIds: ["res_demo"],
      workflowCommands: ["server-config-deploy"],
    },
    createdAt: "2026-05-10T08:00:00.000Z",
    ...input,
  };
}

describe("CreateDeployTokenUseCase", () => {
  test("[SELF-AUTH-TOKEN-001] returns raw token once and persists verifier metadata only", async () => {
    const repository = new MemoryDeployTokenRepository();
    const materialIssuer = new FixedDeployTokenMaterialIssuer();
    const eventBus = new CapturingEventBus();
    const useCase = new CreateDeployTokenUseCase(
      repository,
      materialIssuer,
      new FixedClock("2026-05-10T08:00:00.000Z"),
      new SequentialIdGenerator(),
      eventBus,
      noopLogger,
    );

    const result = await useCase.execute(createTestContext(), {
      organizationId: "org_self_hosted",
      displayName: "GitHub Action deploy token",
      scope: {
        projectIds: ["prj_demo"],
        repositoryFullNames: ["appaloft/demo"],
        workflowCommands: ["server-config-deploy"],
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }

    expect(result.value).toMatchObject({
      token: materialIssuer.token,
      tokenId: "dpt_1",
      organizationId: "org_self_hosted",
      displayName: "GitHub Action deploy token",
      secretSuffix: "00000000",
      createdAt: "2026-05-10T08:00:00.000Z",
      scopes: {
        projectIds: ["prj_demo"],
        repositoryFullNames: ["appaloft/demo"],
        workflowCommands: ["server-config-deploy"],
      },
    });
    expect(repository.saved).toBeDefined();

    const savedState = repository.saved?.toState();
    expect(savedState?.verifierDigest.value).toBe("sha256:00000000000000000000000000000000");
    expect(savedState?.secretSuffix.value).toBe("00000000");
    expect(JSON.stringify(savedState)).not.toContain(materialIssuer.token);
    expect(eventBus.published.map((event) => event.type)).toContain("deploy_token.created");
  });

  test("[SELF-AUTH-TOKEN-GUARD-001] create deploy token can be denied before material issue or persistence", async () => {
    const repository = new MemoryDeployTokenRepository();
    const materialIssuer = new FixedDeployTokenMaterialIssuer();
    const eventBus = new CapturingEventBus();
    const guard = new DenyingOperationGuardPort();
    const useCase = new CreateDeployTokenUseCase(
      repository,
      materialIssuer,
      new FixedClock("2026-05-10T08:00:00.000Z"),
      new SequentialIdGenerator(),
      eventBus,
      noopLogger,
      guard,
    );

    const result = await useCase.execute(createTestContext(), {
      organizationId: "org_self_hosted",
      displayName: "GitHub Action deploy token",
      scope: {
        projectIds: ["prj_demo"],
        repositoryFullNames: ["appaloft/demo"],
        workflowCommands: ["server-config-deploy"],
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.quota",
        checkKind: "quota",
        operationKey: "deploy-tokens.create",
        organizationId: "org_self_hosted",
        projectId: "prj_demo",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toHaveLength(1);
    expect(guard.requests[0]).toMatchObject({
      operationKey: "deploy-tokens.create",
      organizationId: "org_self_hosted",
      resourceRefs: {
        projectId: "prj_demo",
      },
    });
    expect(repository.saved).toBeUndefined();
    expect(eventBus.published).toHaveLength(0);
  });
});

describe("RotateDeployTokenUseCase", () => {
  test("[SELF-AUTH-TOKEN-002] returns a new raw token once and invalidates the old verifier", async () => {
    const repository = new MemoryDeployTokenRepository();
    repository.saved = createStoredDeployToken();
    const eventBus = new CapturingEventBus();
    const materialIssuer = new QueuedDeployTokenMaterialIssuer([
      deployTokenMaterial({
        token: "aplt_dt_rotatedtoken22222222",
        digest: "sha256:22222222222222222222222222222222",
        suffix: "22222222",
      }),
    ]);
    const useCase = new RotateDeployTokenUseCase(
      repository,
      materialIssuer,
      new FixedClock("2026-05-10T09:00:00.000Z"),
      eventBus,
      noopLogger,
    );

    const result = await useCase.execute(createTestContext(), {
      tokenId: "dpt_existing",
      organizationId: "org_self_hosted",
      confirmation: {
        tokenId: "dpt_existing",
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }

    expect(result.value).toMatchObject({
      tokenId: "dpt_existing",
      token: "aplt_dt_rotatedtoken22222222",
      rotatedAt: "2026-05-10T09:00:00.000Z",
      scopes: {
        projectIds: ["prj_demo"],
        repositoryFullNames: ["appaloft/demo"],
        workflowCommands: ["server-config-deploy"],
      },
    });

    const activeAt = CreatedAt.rehydrate("2026-05-10T09:00:01.000Z");
    const oldDigest = DeployTokenVerifierDigest.rehydrate(
      "sha256:11111111111111111111111111111111",
    );
    const newDigest = DeployTokenVerifierDigest.rehydrate(
      "sha256:22222222222222222222222222222222",
    );

    await expect(
      repository.findOne(
        toRepositoryContextForTest(),
        ActiveDeployTokenByVerifierDigestSpec.create(oldDigest, activeAt),
      ),
    ).resolves.toBeNull();
    await expect(
      repository.findOne(
        toRepositoryContextForTest(),
        ActiveDeployTokenByVerifierDigestSpec.create(newDigest, activeAt),
      ),
    ).resolves.toBe(repository.saved);
    expect(JSON.stringify(repository.saved?.toState())).not.toContain(
      "aplt_dt_rotatedtoken22222222",
    );
    expect(eventBus.published.map((event) => event.type)).toContain("deploy_token.rotated");
  });
});

describe("RevokeDeployTokenUseCase", () => {
  test("[SELF-AUTH-TOKEN-003] records revocation and blocks future active verifier lookup", async () => {
    const repository = new MemoryDeployTokenRepository();
    repository.saved = createStoredDeployToken();
    const eventBus = new CapturingEventBus();
    const useCase = new RevokeDeployTokenUseCase(
      repository,
      new FixedClock("2026-05-10T10:00:00.000Z"),
      eventBus,
      noopLogger,
    );

    const result = await useCase.execute(createTestContext(), {
      tokenId: "dpt_existing",
      organizationId: "org_self_hosted",
      confirmation: {
        tokenId: "dpt_existing",
      },
      reason: "rotated in GitHub Secrets",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }

    expect(result.value).toEqual({
      tokenId: "dpt_existing",
      revokedAt: "2026-05-10T10:00:00.000Z",
    });
    expect(repository.saved?.toState().status.value).toBe("revoked");

    await expect(
      repository.findOne(
        toRepositoryContextForTest(),
        ActiveDeployTokenByVerifierDigestSpec.create(
          DeployTokenVerifierDigest.rehydrate("sha256:11111111111111111111111111111111"),
          CreatedAt.rehydrate("2026-05-10T10:00:01.000Z"),
        ),
      ),
    ).resolves.toBeNull();
    expect(eventBus.published.map((event) => event.type)).toContain("deploy_token.revoked");
  });
});

describe("Deploy token command handlers", () => {
  test("catalog exposes deploy-token lifecycle operations through protected public transports", () => {
    expect(
      operationCatalog
        .filter((entry) => entry.domain === "deploy-tokens")
        .map((entry) => ({
          key: entry.key,
          messageName: entry.messageName,
          handlerName: entry.handlerName,
          transports: entry.transports,
        })),
    ).toEqual([
      {
        key: "deploy-tokens.create",
        messageName: "CreateDeployTokenCommand",
        handlerName: "CreateDeployTokenCommandHandler",
        transports: {
          cli: "appaloft deploy-token create",
          orpc: { method: "POST", path: "/api/deploy-tokens" },
        },
      },
      {
        key: "deploy-tokens.list",
        messageName: "ListDeployTokensQuery",
        handlerName: "ListDeployTokensQueryHandler",
        transports: {
          cli: "appaloft deploy-token list",
          orpc: { method: "GET", path: "/api/deploy-tokens" },
        },
      },
      {
        key: "deploy-tokens.show",
        messageName: "ShowDeployTokenQuery",
        handlerName: "ShowDeployTokenQueryHandler",
        transports: {
          cli: "appaloft deploy-token show <tokenId>",
          orpc: { method: "GET", path: "/api/deploy-tokens/{tokenId}" },
        },
      },
      {
        key: "deploy-tokens.rotate",
        messageName: "RotateDeployTokenCommand",
        handlerName: "RotateDeployTokenCommandHandler",
        transports: {
          cli: "appaloft deploy-token rotate <tokenId> --confirm <tokenId>",
          orpc: { method: "POST", path: "/api/deploy-tokens/{tokenId}/rotate" },
        },
      },
      {
        key: "deploy-tokens.revoke",
        messageName: "RevokeDeployTokenCommand",
        handlerName: "RevokeDeployTokenCommandHandler",
        transports: {
          cli: "appaloft deploy-token revoke <tokenId> --confirm <tokenId>",
          orpc: { method: "POST", path: "/api/deploy-tokens/{tokenId}/revoke" },
        },
      },
    ]);
  });

  test("[SELF-AUTH-TOKEN-001] create command handler dispatches through CreateDeployTokenUseCase", async () => {
    const repository = new MemoryDeployTokenRepository();
    const useCase = new CreateDeployTokenUseCase(
      repository,
      new FixedDeployTokenMaterialIssuer(),
      new FixedClock("2026-05-10T08:00:00.000Z"),
      new SequentialIdGenerator(),
      new CapturingEventBus(),
      noopLogger,
    );
    const command = CreateDeployTokenCommand.create({
      organizationId: "org_self_hosted",
      displayName: "GitHub Action deploy token",
      scope: {
        workflowCommands: ["source-link-deploy"],
      },
    })._unsafeUnwrap();

    const result = await new CreateDeployTokenCommandHandler(useCase).handle(
      createTestContext(),
      command,
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      tokenId: "dpt_1",
      token: "aplt_dt_rawtokenvalue00000000",
      scopes: {
        workflowCommands: ["source-link-deploy"],
      },
    });
  });

  test("[SELF-AUTH-TOKEN-002] rotate command handler dispatches through RotateDeployTokenUseCase", async () => {
    const repository = new MemoryDeployTokenRepository();
    repository.saved = createStoredDeployToken();
    const useCase = new RotateDeployTokenUseCase(
      repository,
      new QueuedDeployTokenMaterialIssuer([
        deployTokenMaterial({
          token: "aplt_dt_rotatedtoken22222222",
          digest: "sha256:22222222222222222222222222222222",
          suffix: "22222222",
        }),
      ]),
      new FixedClock("2026-05-10T09:00:00.000Z"),
      new CapturingEventBus(),
      noopLogger,
    );
    const command = RotateDeployTokenCommand.create({
      tokenId: "dpt_existing",
      organizationId: "org_self_hosted",
      confirmation: {
        tokenId: "dpt_existing",
      },
    })._unsafeUnwrap();

    const result = await new RotateDeployTokenCommandHandler(useCase).handle(
      createTestContext(),
      command,
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      tokenId: "dpt_existing",
      token: "aplt_dt_rotatedtoken22222222",
      scopes: {
        workflowCommands: ["server-config-deploy"],
      },
    });
  });

  test("[SELF-AUTH-TOKEN-003] revoke command handler dispatches through RevokeDeployTokenUseCase", async () => {
    const repository = new MemoryDeployTokenRepository();
    repository.saved = createStoredDeployToken();
    const useCase = new RevokeDeployTokenUseCase(
      repository,
      new FixedClock("2026-05-10T10:00:00.000Z"),
      new CapturingEventBus(),
      noopLogger,
    );
    const command = RevokeDeployTokenCommand.create({
      tokenId: "dpt_existing",
      organizationId: "org_self_hosted",
      confirmation: {
        tokenId: "dpt_existing",
      },
      reason: "rotated in GitHub Secrets",
    })._unsafeUnwrap();

    const result = await new RevokeDeployTokenCommandHandler(useCase).handle(
      createTestContext(),
      command,
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      tokenId: "dpt_existing",
      revokedAt: "2026-05-10T10:00:00.000Z",
    });
  });
});

describe("Deploy token query handlers", () => {
  test("[SELF-AUTH-TOKEN-004] list query returns only safe deploy-token metadata", async () => {
    const readModel = new MemoryDeployTokenReadModel([
      deployTokenSummary(),
      deployTokenSummary({
        tokenId: "dpt_other_org",
        organizationId: "org_other",
      }),
    ]);
    const query = ListDeployTokensQuery.create({
      organizationId: "org_self_hosted",
      repositoryFullName: "appaloft/demo",
      resourceId: "res_demo",
      limit: 10,
    })._unsafeUnwrap();

    const result = await new ListDeployTokensQueryHandler(
      new ListDeployTokensQueryService(readModel),
    ).handle(createTestContext(), query);

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.items).toHaveLength(1);
    expect(output.items[0]).toMatchObject({
      tokenId: "dpt_existing",
      organizationId: "org_self_hosted",
      secretSuffix: "11111111",
      scope: {
        repositoryFullNames: ["appaloft/demo"],
        resourceIds: ["res_demo"],
      },
    });
    expect(JSON.stringify(output)).not.toContain("sha256:");
    expect(JSON.stringify(output)).not.toContain("aplt_dt_");
  });

  test("[SELF-AUTH-TOKEN-004] show query returns one safe deploy-token summary", async () => {
    const readModel = new MemoryDeployTokenReadModel([deployTokenSummary()]);
    const query = ShowDeployTokenQuery.create({
      organizationId: "org_self_hosted",
      tokenId: "dpt_existing",
    })._unsafeUnwrap();

    const result = await new ShowDeployTokenQueryHandler(
      new ShowDeployTokenQueryService(readModel),
    ).handle(createTestContext(), query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      tokenId: "dpt_existing",
      displayName: "GitHub Action deploy token",
      secretSuffix: "11111111",
    });
  });

  test("show query returns deploy-token-read not_found when token is absent", async () => {
    const readModel = new MemoryDeployTokenReadModel([]);
    const query = ShowDeployTokenQuery.create({
      organizationId: "org_self_hosted",
      tokenId: "dpt_missing",
    })._unsafeUnwrap();

    const result = await new ShowDeployTokenQueryHandler(
      new ShowDeployTokenQueryService(readModel),
    ).handle(createTestContext(), query);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        phase: "deploy-token-read",
        tokenId: "dpt_missing",
      },
    });
  });
});

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    entrypoint: "cli",
  });
}

function toRepositoryContextForTest(): RepositoryContext {
  return toRepositoryContext(createTestContext());
}
