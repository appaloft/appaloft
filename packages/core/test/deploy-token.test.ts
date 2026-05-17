import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTargetId,
  DeployToken,
  DeployTokenId,
  DeployTokenScope,
  DeployTokenSecretSuffix,
  DeployTokenVerifierDigest,
  DeployTokenWorkflowCommandValue,
  DisplayNameText,
  EnvironmentId,
  ExpiresAt,
  LastUsedAt,
  OrganizationId,
  ProjectId,
  ResourceId,
  RevokedAt,
  RotatedAt,
  SourceRepositoryFullName,
} from "../src";

function workflow(value: "preview-cleanup" | "server-config-deploy" | "source-link-deploy") {
  return DeployTokenWorkflowCommandValue.rehydrate(value);
}

function scope(input?: {
  projectIds?: string[];
  repositoryFullNames?: string[];
  workflows?: Array<"preview-cleanup" | "server-config-deploy" | "source-link-deploy">;
}) {
  return DeployTokenScope.create({
    projectIds: input?.projectIds?.map(ProjectId.rehydrate) ?? [],
    repositoryFullNames: input?.repositoryFullNames?.map(SourceRepositoryFullName.rehydrate) ?? [],
    workflowCommands: (input?.workflows ?? ["source-link-deploy"]).map(workflow),
  })._unsafeUnwrap();
}

function verifier(value = "sha256:1234567890abcdef1234567890abcdef") {
  return DeployTokenVerifierDigest.create(value)._unsafeUnwrap();
}

function secretSuffix(value = "abcd1234") {
  return DeployTokenSecretSuffix.create(value)._unsafeUnwrap();
}

function deployToken(input?: {
  expiresAt?: string;
  projectIds?: string[];
  repositoryFullNames?: string[];
  workflows?: Array<"preview-cleanup" | "server-config-deploy" | "source-link-deploy">;
}) {
  return DeployToken.create({
    id: DeployTokenId.rehydrate("dtok_demo"),
    organizationId: OrganizationId.rehydrate("org_demo"),
    displayName: DisplayNameText.rehydrate("GitHub Action"),
    verifierDigest: verifier(),
    secretSuffix: secretSuffix(),
    scope: scope(input),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    ...(input?.expiresAt ? { expiresAt: ExpiresAt.rehydrate(input.expiresAt) } : {}),
  })._unsafeUnwrap();
}

describe("DeployToken", () => {
  test("[SELF-AUTH-TOKEN-001] models verifier metadata without raw token material", () => {
    expect(DeployTokenVerifierDigest.create("plain-token-value").isErr()).toBe(true);
    expect(DeployTokenSecretSuffix.create("abc").isErr()).toBe(true);

    const token = deployToken();
    const state = token.toState();

    expect(state.verifierDigest.value).toBe("sha256:1234567890abcdef1234567890abcdef");
    expect(state.secretSuffix.value).toBe("abcd1234");
    expect(JSON.stringify(state)).not.toContain("plain-token-value");
    expect(JSON.stringify(token.pullDomainEvents())).not.toContain(
      "sha256:1234567890abcdef1234567890abcdef",
    );
  });

  test("[SELF-AUTH-ACTION-004][SELF-AUTH-TOKEN-001] evaluates deploy-token scope in core", () => {
    const token = deployToken({
      projectIds: ["prj_demo"],
      repositoryFullNames: ["owner/repo"],
      workflows: ["source-link-deploy", "preview-cleanup"],
    });

    expect(
      token.authorizesScope({
        projectId: ProjectId.rehydrate("prj_demo"),
        repositoryFullName: SourceRepositoryFullName.rehydrate("owner/repo"),
        workflowCommand: workflow("source-link-deploy"),
      }),
    ).toBe(true);
    expect(
      token.authorizeScope({
        projectId: ProjectId.rehydrate("prj_other"),
        repositoryFullName: SourceRepositoryFullName.rehydrate("owner/repo"),
        workflowCommand: workflow("source-link-deploy"),
      }),
    ).toEqual({
      allowed: false,
      deniedScope: "project",
      reasonCode: "scope_value_not_allowed",
    });
    expect(
      token.authorizeScope({
        projectId: ProjectId.rehydrate("prj_demo"),
        workflowCommand: workflow("source-link-deploy"),
      }),
    ).toEqual({
      allowed: false,
      deniedScope: "repository",
      reasonCode: "scope_value_missing",
    });
    expect(
      token.authorizeScope({
        projectId: ProjectId.rehydrate("prj_demo"),
        repositoryFullName: SourceRepositoryFullName.rehydrate("owner/repo"),
        workflowCommand: workflow("server-config-deploy"),
      }),
    ).toEqual({
      allowed: false,
      deniedScope: "workflow-command",
      reasonCode: "scope_value_not_allowed",
    });
  });

  test("[SELF-AUTH-TOKEN-002] rotates active token verifier and preserves scope", () => {
    const token = deployToken({ projectIds: ["prj_demo"] });

    const rotated = token.rotate({
      verifierDigest: verifier("sha256:abcdefabcdefabcdefabcdefabcdef12"),
      secretSuffix: secretSuffix("wxyz9876"),
      rotatedAt: RotatedAt.rehydrate("2026-01-02T00:00:00.000Z"),
    });

    expect(rotated.isOk()).toBe(true);
    const state = token.toState();
    expect(state.verifierDigest.value).toBe("sha256:abcdefabcdefabcdefabcdefabcdef12");
    expect(state.secretSuffix.value).toBe("wxyz9876");
    expect(state.scope.toState().projectIds.map((id) => id.value)).toEqual(["prj_demo"]);
    expect(token.pullDomainEvents().some((event) => event.type === "deploy_token.rotated")).toBe(
      true,
    );
  });

  test("[SELF-AUTH-TOKEN-003] revokes tokens idempotently and blocks future use", () => {
    const token = deployToken();

    const revoked = token.revoke({
      revokedAt: RevokedAt.rehydrate("2026-01-03T00:00:00.000Z"),
    });
    const revokedAgain = token.revoke({
      revokedAt: RevokedAt.rehydrate("2026-01-03T00:01:00.000Z"),
    });
    const markedUsed = token.markUsed(LastUsedAt.rehydrate("2026-01-03T00:02:00.000Z"));
    const rotated = token.rotate({
      verifierDigest: verifier("sha256:abcdefabcdefabcdefabcdefabcdef12"),
      secretSuffix: secretSuffix("wxyz9876"),
      rotatedAt: RotatedAt.rehydrate("2026-01-03T00:03:00.000Z"),
    });

    expect(revoked.isOk() && revoked.value.changed).toBe(true);
    expect(revokedAgain.isOk() && revokedAgain.value.changed).toBe(false);
    expect(markedUsed.isErr()).toBe(true);
    expect(rotated.isErr()).toBe(true);
    if (rotated.isErr()) {
      expect(rotated.error.code).toBe("deploy_token_rotation_blocked");
    }
  });

  test("[SELF-AUTH-TOKEN-001] rejects empty workflow command scope", () => {
    const result = DeployTokenScope.create({
      deploymentTargetIds: [DeploymentTargetId.rehydrate("srv_demo")],
      environmentIds: [EnvironmentId.rehydrate("env_demo")],
      projectIds: [ProjectId.rehydrate("prj_demo")],
      repositoryFullNames: [SourceRepositoryFullName.rehydrate("owner/repo")],
      resourceIds: [ResourceId.rehydrate("res_demo")],
      workflowCommands: [],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("validation_error");
      expect(result.error.details?.field).toBe("workflowCommands");
    }
  });
});
