import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  type Clock,
  type DeployTokenRepository,
  type ExecutionContext,
  type RepositoryContext,
} from "@appaloft/application";
import {
  CreatedAt,
  DeployToken,
  DeployTokenId,
  type DeployTokenMutationSpec,
  DeployTokenScope,
  type DeployTokenSelectionSpec,
  DeployTokenWorkflowCommandValue,
  DisplayNameText,
  OrganizationId,
  SourceRepositoryFullName,
} from "@appaloft/core";

import {
  BetterAuthDeployTokenMaterialIssuer,
  PersistedActionDeployTokenAuthorizationPort,
} from "../src";

const context = {
  entrypoint: "system",
  locale: "en-US",
  requestId: "req_action_deploy_token_authorization_test",
  t: (key: string) => key,
  tracer: {
    startActiveSpan(_name: string, _options: object, callback: () => unknown) {
      return Promise.resolve(callback());
    },
  },
} as ExecutionContext;

const clock: Clock = {
  now: () => "2026-05-17T00:00:00.000Z",
};

class MemoryDeployTokenRepository implements DeployTokenRepository {
  constructor(private deployToken: DeployToken) {}

  async findOne(
    _context: RepositoryContext,
    _spec: DeployTokenSelectionSpec,
  ): Promise<DeployToken | null> {
    return this.deployToken;
  }

  async upsert(
    _context: RepositoryContext,
    deployToken: DeployToken,
    _spec: DeployTokenMutationSpec,
  ): Promise<void> {
    this.deployToken = deployToken;
  }

  async updateOne(
    _context: RepositoryContext,
    deployToken: DeployToken,
    _spec: DeployTokenMutationSpec,
  ): Promise<boolean> {
    this.deployToken = deployToken;
    return true;
  }
}

async function createRepositoryScopedToken() {
  const material = await new BetterAuthDeployTokenMaterialIssuer().issue(context);
  if (material.isErr()) {
    throw new Error(material.error.message);
  }

  const scope = DeployTokenScope.create({
    repositoryFullNames: [SourceRepositoryFullName.rehydrate("appaloft/appaloft-cloud")],
    workflowCommands: [DeployTokenWorkflowCommandValue.rehydrate("server-config-deploy")],
  })._unsafeUnwrap();

  const deployToken = DeployToken.create({
    id: DeployTokenId.rehydrate("dpt_repository_scoped"),
    organizationId: OrganizationId.rehydrate("org_self_hosted"),
    displayName: DisplayNameText.rehydrate("Repository scoped deploy token"),
    verifierDigest: material.value.verifierDigest,
    secretSuffix: material.value.secretSuffix,
    scope,
    createdAt: CreatedAt.rehydrate("2026-05-17T00:00:00.000Z"),
  })._unsafeUnwrap();

  return {
    deployToken,
    rawToken: material.value.token,
  };
}

describe("PersistedActionDeployTokenAuthorizationPort", () => {
  test("[SELF-AUTH-ACTION-004] reports missing repository scope for repo-scoped tokens", async () => {
    const { deployToken, rawToken } = await createRepositoryScopedToken();
    const port = new PersistedActionDeployTokenAuthorizationPort({
      clock,
      repository: new MemoryDeployTokenRepository(deployToken),
    });

    const result = await port.authorize(context, {
      method: "POST",
      path: "/api/action/deployments/from-config-package",
      token: rawToken,
      workflow: "server-config-deploy",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "action_auth_forbidden",
      details: {
        deniedScope: "repository",
        missingScope: "repository",
        phase: "action-authorization",
        reasonCode: "scope_value_missing",
        workflow: "server-config-deploy",
      },
    });
  });

  test("[SELF-AUTH-ACTION-004] authorizes matching repository scope", async () => {
    const { deployToken, rawToken } = await createRepositoryScopedToken();
    const port = new PersistedActionDeployTokenAuthorizationPort({
      clock,
      repository: new MemoryDeployTokenRepository(deployToken),
    });

    const result = await port.authorize(context, {
      method: "POST",
      path: "/api/action/deployments/from-config-package",
      requestedScope: {
        repositoryFullName: "appaloft/appaloft-cloud",
      },
      token: rawToken,
      workflow: "server-config-deploy",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      actor: {
        id: "dpt_repository_scoped",
        kind: "deploy-token",
        label: "Repository scoped deploy token",
      },
      organizationId: "org_self_hosted",
    });
  });
});
