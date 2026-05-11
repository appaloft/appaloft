import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  ActiveDeployTokenByVerifierDigestSpec,
  CreatedAt,
  DeployToken,
  DeployTokenByIdSpec,
  DeployTokenId,
  DeployTokenScope,
  DeployTokenSecretSuffix,
  DeployTokenVerifierDigest,
  DeployTokenWorkflowCommandValue,
  DisplayNameText,
  ExpiresAt,
  OrganizationId,
  ProjectId,
  RevokeDeployTokenSpec,
  RevokedAt,
  RotateDeployTokenSpec,
  RotatedAt,
  SourceRepositoryFullName,
  UpsertDeployTokenSpec,
} from "@appaloft/core";

function repositoryContext() {
  return toRepositoryContext(
    createExecutionContext({
      requestId: "req_deploy_token_pglite_test",
      entrypoint: "system",
    }),
  );
}

function verifier(value = "sha256:1234567890abcdef1234567890abcdef") {
  return DeployTokenVerifierDigest.create(value)._unsafeUnwrap();
}

function token(input?: { expiresAt?: string }) {
  return DeployToken.create({
    id: DeployTokenId.rehydrate("dtok_demo"),
    organizationId: OrganizationId.rehydrate("org_demo"),
    displayName: DisplayNameText.rehydrate("GitHub Action"),
    verifierDigest: verifier(),
    secretSuffix: DeployTokenSecretSuffix.rehydrate("abcd1234"),
    scope: DeployTokenScope.create({
      projectIds: [ProjectId.rehydrate("prj_demo")],
      repositoryFullNames: [SourceRepositoryFullName.rehydrate("owner/repo")],
      workflowCommands: [DeployTokenWorkflowCommandValue.rehydrate("source-link-deploy")],
    })._unsafeUnwrap(),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    ...(input?.expiresAt ? { expiresAt: ExpiresAt.rehydrate(input.expiresAt) } : {}),
  })._unsafeUnwrap();
}

async function harness() {
  const dataDir = mkdtempSync(join(tmpdir(), "appaloft-deploy-token-pglite-"));
  const { createDatabase, createMigrator, PgDeployTokenReadModel, PgDeployTokenRepository } =
    await import("../src");
  const database = await createDatabase({
    driver: "pglite",
    pgliteDataDir: dataDir,
  });
  const migrationResult = await createMigrator(database.db).migrateToLatest();
  expect(migrationResult.error).toBeUndefined();

  return {
    dataDir,
    database,
    readModel: new PgDeployTokenReadModel(database.db),
    repository: new PgDeployTokenRepository(database.db),
  };
}

describe("deploy token persistence", () => {
  test("[SELF-AUTH-TOKEN-001][SELF-AUTH-TOKEN-004] stores verifier metadata without raw token material", async () => {
    const context = repositoryContext();
    const { dataDir, database, readModel, repository } = await harness();

    try {
      const deployToken = token();
      await repository.upsert(
        context,
        deployToken,
        UpsertDeployTokenSpec.fromDeployToken(deployToken),
      );

      const row = await database.db
        .selectFrom("deploy_tokens")
        .selectAll()
        .where("id", "=", "dtok_demo")
        .executeTakeFirstOrThrow();
      expect(JSON.stringify(row)).not.toContain("apt_raw_token_fixture");
      expect(row.verifier_digest).toBe("sha256:1234567890abcdef1234567890abcdef");
      expect(row.scope).toMatchObject({
        projectIds: ["prj_demo"],
        repositoryFullNames: ["owner/repo"],
        workflowCommands: ["source-link-deploy"],
      });

      const found = await repository.findOne(
        context,
        ActiveDeployTokenByVerifierDigestSpec.create(
          verifier(),
          CreatedAt.rehydrate("2026-01-01T00:00:01.000Z"),
        ),
      );
      expect(found?.toState().id.value).toBe("dtok_demo");

      const summaries = await readModel.list(context, {
        organizationId: "org_demo",
        repositoryFullName: "owner/repo",
      });
      const summary = await readModel.findOne(context, {
        organizationId: "org_demo",
        tokenId: "dtok_demo",
      });
      expect(summaries).toHaveLength(1);
      expect(summary?.secretSuffix).toBe("abcd1234");
      expect(JSON.stringify(summary)).not.toContain("sha256:");
      expect(JSON.stringify(summary)).not.toContain("apt_raw_token_fixture");
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("[SELF-AUTH-TOKEN-002][SELF-AUTH-TOKEN-003] rotates and revokes persisted verifiers", async () => {
    const context = repositoryContext();
    const { dataDir, database, repository } = await harness();

    try {
      const deployToken = token();
      await repository.upsert(
        context,
        deployToken,
        UpsertDeployTokenSpec.fromDeployToken(deployToken),
      );

      deployToken
        .rotate({
          verifierDigest: verifier("sha256:abcdefabcdefabcdefabcdefabcdef12"),
          secretSuffix: DeployTokenSecretSuffix.rehydrate("wxyz9876"),
          rotatedAt: RotatedAt.rehydrate("2026-01-02T00:00:00.000Z"),
        })
        ._unsafeUnwrap();
      expect(
        await repository.updateOne(
          context,
          deployToken,
          RotateDeployTokenSpec.fromDeployToken(deployToken),
        ),
      ).toBe(true);

      const oldVerifier = await repository.findOne(
        context,
        ActiveDeployTokenByVerifierDigestSpec.create(
          verifier(),
          CreatedAt.rehydrate("2026-01-02T00:00:01.000Z"),
        ),
      );
      const newVerifier = await repository.findOne(
        context,
        ActiveDeployTokenByVerifierDigestSpec.create(
          verifier("sha256:abcdefabcdefabcdefabcdefabcdef12"),
          CreatedAt.rehydrate("2026-01-02T00:00:01.000Z"),
        ),
      );
      expect(oldVerifier).toBeNull();
      expect(newVerifier?.toState().secretSuffix.value).toBe("wxyz9876");

      deployToken
        .revoke({
          revokedAt: RevokedAt.rehydrate("2026-01-03T00:00:00.000Z"),
        })
        ._unsafeUnwrap();
      expect(
        await repository.updateOne(
          context,
          deployToken,
          RevokeDeployTokenSpec.fromDeployToken(deployToken),
        ),
      ).toBe(true);

      const revokedVerifier = await repository.findOne(
        context,
        ActiveDeployTokenByVerifierDigestSpec.create(
          verifier("sha256:abcdefabcdefabcdefabcdefabcdef12"),
          CreatedAt.rehydrate("2026-01-03T00:00:01.000Z"),
        ),
      );
      const byId = await repository.findOne(
        context,
        DeployTokenByIdSpec.create(DeployTokenId.rehydrate("dtok_demo")),
      );
      expect(revokedVerifier).toBeNull();
      expect(byId?.toState().status.value).toBe("revoked");
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
