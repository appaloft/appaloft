import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  type DeployTokenRepository,
  type RepositoryContext,
} from "@appaloft/application";
import {
  BetterAuthDeployTokenMaterialIssuer,
  PersistedActionDeployTokenAuthorizationPort,
  StaticActionDeployTokenAuthorizationPort,
} from "@appaloft/auth-better";
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
  OrganizationId,
  ProjectId,
  SourceRepositoryFullName,
} from "@appaloft/core";

const context = createExecutionContext({
  entrypoint: "http",
  requestId: "req_action_deploy_token_auth_test",
});

class InMemoryDeployTokenRepository implements DeployTokenRepository {
  public updateCount = 0;

  constructor(private deployToken: DeployToken) {}

  findOne(_context: RepositoryContext, spec: DeployTokenSelectionSpec) {
    if (spec instanceof DeployTokenByIdSpec) {
      return Promise.resolve(
        this.deployToken.toState().id.equals(spec.id) ? this.deployToken : null,
      );
    }

    if (spec instanceof ActiveDeployTokenByVerifierDigestSpec) {
      const deployToken = this.deployToken;
      return Promise.resolve(
        deployToken.matchesVerifierDigest(spec.verifierDigest) &&
          deployToken.canAuthorizeAt(spec.at)
          ? deployToken
          : null,
      );
    }

    return Promise.resolve(null);
  }

  upsert(_context: RepositoryContext, deployToken: DeployToken, _spec: DeployTokenMutationSpec) {
    this.deployToken = deployToken;
    return Promise.resolve();
  }

  updateOne(_context: RepositoryContext, deployToken: DeployToken, _spec: DeployTokenMutationSpec) {
    this.deployToken = deployToken;
    this.updateCount += 1;
    return Promise.resolve(true);
  }
}

async function verifierDigest(token: string) {
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

async function deployToken(input?: { projectId?: string; rawToken?: string }) {
  return DeployToken.create({
    id: DeployTokenId.rehydrate("dtok_persisted"),
    organizationId: OrganizationId.rehydrate("org_demo"),
    displayName: DisplayNameText.rehydrate("GitHub Action"),
    verifierDigest: DeployTokenVerifierDigest.rehydrate(
      await verifierDigest(input?.rawToken ?? "persisted-token"),
    ),
    secretSuffix: DeployTokenSecretSuffix.rehydrate("abcd1234"),
    scope: DeployTokenScope.create({
      projectIds: [ProjectId.rehydrate(input?.projectId ?? "prj_allowed")],
      repositoryFullNames: [SourceRepositoryFullName.rehydrate("owner/repo")],
      workflowCommands: [DeployTokenWorkflowCommandValue.rehydrate("source-link-deploy")],
    })._unsafeUnwrap(),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

describe("StaticActionDeployTokenAuthorizationPort", () => {
  test("[SELF-AUTH-ACTION-002] rejects invalid static deploy tokens", async () => {
    const port = new StaticActionDeployTokenAuthorizationPort({
      token: "expected-token",
    });

    const result = await port.authorize(context, {
      method: "POST",
      path: "/api/action/deployments/from-source-link",
      token: "wrong-token",
      workflow: "source-link-deploy",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "action_auth_invalid",
      details: {
        workflow: "source-link-deploy",
      },
    });
  });

  test("[SELF-AUTH-ACTION-003] accepts the configured static deploy token as an Action actor", async () => {
    const port = new StaticActionDeployTokenAuthorizationPort({
      token: "expected-token",
    });

    const result = await port.authorize(context, {
      method: "POST",
      path: "/api/action/deployments/from-config-package",
      token: "expected-token",
      workflow: "server-config-deploy",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      actor: {
        kind: "deploy-token",
        id: "dtok_static_self_hosted",
        label: "Self-hosted deploy token",
      },
      scope: {
        environmentIds: [],
        projectIds: [],
        repositoryFullNames: [],
        resourceIds: [],
        serverIds: [],
      },
    });
  });

  test("[SELF-AUTH-ACTION-004] rejects static deploy token scope mismatches", async () => {
    const port = new StaticActionDeployTokenAuthorizationPort({
      scope: {
        projectId: "prj_allowed",
        workflows: ["source-link-deploy"],
      },
      token: "expected-token",
    });

    const result = await port.authorize(context, {
      method: "POST",
      path: "/api/action/deployments/from-source-link",
      requestedScope: {
        projectId: "prj_blocked",
      },
      token: "expected-token",
      workflow: "source-link-deploy",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "action_auth_forbidden",
      details: {
        missingScope: "project",
        phase: "action-authorization",
        projectId: "prj_blocked",
        workflow: "source-link-deploy",
      },
    });
  });
});

describe("PersistedActionDeployTokenAuthorizationPort", () => {
  test("[SELF-AUTH-ACTION-003][SELF-AUTH-TOKEN-001] accepts persisted deploy token verifiers as Action actors", async () => {
    const repository = new InMemoryDeployTokenRepository(await deployToken());
    const port = new PersistedActionDeployTokenAuthorizationPort({
      clock: {
        now: () => "2026-01-01T00:00:10.000Z",
      },
      repository,
    });

    const result = await port.authorize(context, {
      method: "POST",
      path: "/api/action/deployments/from-source-link",
      requestedScope: {
        projectId: "prj_allowed",
        repositoryFullName: "owner/repo",
      },
      token: "persisted-token",
      workflow: "source-link-deploy",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      actor: {
        kind: "deploy-token",
        id: "dtok_persisted",
        label: "GitHub Action",
      },
      organizationId: "org_demo",
      scope: {
        environmentIds: [],
        projectIds: ["prj_allowed"],
        repositoryFullNames: ["owner/repo"],
        resourceIds: [],
        serverIds: [],
      },
    });
    expect(repository.updateCount).toBe(1);
  });

  test("[SELF-AUTH-ACTION-004] rejects persisted deploy token scope mismatches", async () => {
    const repository = new InMemoryDeployTokenRepository(await deployToken());
    const port = new PersistedActionDeployTokenAuthorizationPort({
      clock: {
        now: () => "2026-01-01T00:00:10.000Z",
      },
      repository,
    });

    const result = await port.authorize(context, {
      method: "POST",
      path: "/api/action/deployments/from-source-link",
      requestedScope: {
        projectId: "prj_blocked",
        repositoryFullName: "owner/repo",
      },
      token: "persisted-token",
      workflow: "source-link-deploy",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "action_auth_forbidden",
      details: {
        deniedScope: "project",
        missingScope: "project",
        phase: "action-authorization",
        projectId: "prj_blocked",
        reasonCode: "scope_value_not_allowed",
        repositoryFullName: "owner/repo",
        workflow: "source-link-deploy",
      },
    });
    expect(repository.updateCount).toBe(0);
  });
});

describe("BetterAuthDeployTokenMaterialIssuer", () => {
  test("[SELF-AUTH-TOKEN-001] issues raw token material with verifier digest and safe suffix", async () => {
    const issuer = new BetterAuthDeployTokenMaterialIssuer();

    const result = await issuer.issue(context);

    expect(result.isOk()).toBe(true);
    const material = result._unsafeUnwrap();
    expect(material.token).toStartWith("aplt_dt_");
    expect(material.secretSuffix.value).toBe(material.token.slice(-8));
    expect(material.verifierDigest.value).toBe(await verifierDigest(material.token));
    expect(material.verifierDigest.value).not.toContain(material.token);
  });
});
