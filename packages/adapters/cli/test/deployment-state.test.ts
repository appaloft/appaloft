import { describe, expect, test } from "bun:test";
import {
  createSourceFingerprint,
  resolveDeploymentStateBackend,
} from "../src/commands/deployment-state";

describe("CLI deployment state foundation", () => {
  test("[CONFIG-FILE-STATE-001] SSH target defaults remote PGlite without DATABASE_URL", () => {
    const decision = resolveDeploymentStateBackend({
      entrypoint: "github-actions",
      trustedSshTarget: {
        host: "203.0.113.10",
        port: 22,
        providerKey: "generic-ssh",
        username: "deploy",
        identityFile: "/home/runner/.ssh/appaloft",
      },
    });

    expect(decision).toMatchObject({
      kind: "ssh-pglite",
      storageScope: "remote-ssh",
      databaseUrlRequired: false,
      requiresRemoteStateLifecycle: true,
    });
    expect(decision.trustedSshTarget).toEqual({
      host: "203.0.113.10",
      port: 22,
      providerKey: "generic-ssh",
      username: "deploy",
      identityFile: "/home/runner/.ssh/appaloft",
    });
  });

  test("[CONFIG-FILE-STATE-007] explicit local PGlite remains local-only", () => {
    const decision = resolveDeploymentStateBackend({
      explicitBackend: "local-pglite",
      trustedSshTarget: {
        host: "203.0.113.10",
        providerKey: "generic-ssh",
      },
    });

    expect(decision).toMatchObject({
      kind: "local-pglite",
      storageScope: "local-process",
      databaseUrlRequired: false,
      requiresRemoteStateLifecycle: false,
    });
  });

  test("[CONFIG-FILE-STATE-008] PostgreSQL control-plane override requires DATABASE_URL", () => {
    const decision = resolveDeploymentStateBackend({
      databaseUrl: "postgres://postgres:postgres@db.example.test/appaloft",
      trustedSshTarget: {
        host: "203.0.113.10",
        providerKey: "generic-ssh",
      },
    });

    expect(decision).toMatchObject({
      kind: "postgres-control-plane",
      storageScope: "control-plane",
      databaseUrlRequired: true,
      requiresRemoteStateLifecycle: false,
    });
  });

  test("[SOURCE-LINK-STATE-001] Git source fingerprint is stable across commits", () => {
    const first = createSourceFingerprint({
      provider: "github",
      providerRepositoryId: "R_kgDOExample",
      repositoryLocator: "https://github.com/Appaloft/www.git",
      baseDirectory: "apps/web",
      configPath: "appaloft.yml",
      gitRef: "main",
      commitSha: "abc123",
      scope: { kind: "branch", branch: "main" },
    });
    const second = createSourceFingerprint({
      provider: "github",
      providerRepositoryId: "R_kgDOExample",
      repositoryLocator: "https://github.com/Appaloft/www.git",
      baseDirectory: "apps/web",
      configPath: "appaloft.yml",
      gitRef: "main",
      commitSha: "def456",
      scope: { kind: "branch", branch: "main" },
    });

    expect(first.key).toBe(second.key);
    expect(first.observed.commitSha).toBe("abc123");
    expect(second.observed.commitSha).toBe("def456");
  });

  test("[SOURCE-LINK-STATE-002] source fingerprint excludes secrets and runner paths", () => {
    const fingerprint = createSourceFingerprint({
      provider: "github",
      repositoryLocator: "git@github.com:Appaloft/www.git",
      baseDirectory: "/home/runner/work/www/www/apps/web",
      configPath: "/home/runner/work/www/www/appaloft.yml",
      workspaceRoot: "/home/runner/work/www/www",
      gitRef: "main",
      commitSha: "abc123",
      scope: { kind: "branch", branch: "main" },
    });
    const serialized = JSON.stringify({
      key: fingerprint.key,
      parts: fingerprint.parts,
      scopeKey: fingerprint.scopeKey,
    });

    expect(fingerprint.parts.baseDirectory).toBe("apps/web");
    expect(fingerprint.parts.configPath).toBe("appaloft.yml");
    expect(serialized).not.toContain("/home/runner");
    expect(serialized).not.toContain("abc123");
    expect(serialized).not.toContain("OPENSSH");
    expect(serialized).not.toContain("TOKEN");
  });

  test("[SOURCE-LINK-STATE-003] preview source scope is explicit", () => {
    const branch = createSourceFingerprint({
      provider: "github",
      repositoryLocator: "https://github.com/appaloft/www",
      baseDirectory: ".",
      configPath: "appaloft.yml",
      scope: { kind: "branch", branch: "main" },
    });
    const preview = createSourceFingerprint({
      provider: "github",
      repositoryLocator: "https://github.com/appaloft/www",
      baseDirectory: ".",
      configPath: "appaloft.yml",
      scope: { kind: "preview", pullRequestNumber: 42, branch: "feature/domain-routes" },
    });

    expect(preview.key).not.toBe(branch.key);
    expect(preview.scopeKey).toBe("preview:pr:42");
    expect(branch.scopeKey).toBe("branch:main");
  });
});
