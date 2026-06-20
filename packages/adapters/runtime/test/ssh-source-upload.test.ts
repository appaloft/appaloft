import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import {
  buildLocalWorkspaceUploadCommand,
  buildLocalWorkspaceUploadTarExcludeArgs,
  buildRemoteDockerImageVersionMetadataCommand,
  buildRemotePreviewArtifactSweepCommand,
  parseDockerRepoDigestFromInspect,
  parseRemoteDockerImageVersionMetadataOutput,
  SshExecutionBackend,
} from "../src/ssh-execution";

describe("SSH source upload", () => {
  test("[DEP-CREATE-PKG-001] local workspace upload excludes cache and dependency directories", () => {
    const args = buildLocalWorkspaceUploadTarExcludeArgs();

    expect(args).toEqual([
      "--exclude",
      ".git",
      "--exclude",
      ".turbo",
      "--exclude",
      "node_modules",
      "--exclude",
      ".svelte-kit",
      "--exclude",
      ".next/cache",
      "--exclude",
      "coverage",
    ]);
  });

  test("[DEP-CREATE-PKG-001] git workspace upload respects git ignore rules", () => {
    const command = buildLocalWorkspaceUploadCommand({
      localWorkdir: "/tmp/appaloft source",
      remotePrepareCommand: "mkdir -p /var/lib/appaloft/runtime/source",
      sshArgs: ["-p", "22", "deploy@example.test"],
    });

    expect(command).toContain("git -C '/tmp/appaloft source' rev-parse --is-inside-work-tree");
    expect(command).toContain(
      "git -C '/tmp/appaloft source' ls-files -z --cached --recurse-submodules",
    );
    expect(command).toContain(
      "git -C '/tmp/appaloft source' ls-files -z --others --exclude-standard",
    );
    expect(command).toContain("tar --null -czf - -C '/tmp/appaloft source' --files-from -");
    expect(command).toContain("else tar -czf -");
    expect(command).toContain("'--exclude' '.turbo'");
    expect(command).toContain("ssh '-p' '22' 'deploy@example.test'");
  });
});

describe("SSH Docker image version metadata", () => {
  test("renders remote Docker pull before digest inspect", () => {
    const command = buildRemoteDockerImageVersionMetadataCommand("ghcr.io/acme/api:latest");

    const syntaxCheck = spawnSync("sh", ["-n", "-c", command], { encoding: "utf8" });

    expect(syntaxCheck.status).toBe(0);
    expect(command).toContain("docker pull 'ghcr.io/acme/api:latest' >&2");
    expect(command).toContain(" && docker image inspect --format '{{json .RepoDigests}}'");
    expect(command).toContain(" && docker image inspect --format '{{.Id}}'");
  });

  test("parses a repo digest returned by remote docker image inspect", () => {
    const digest =
      "sha256:8b1a9953c4611296a827abf8c47804d7f6f4e6a6d7f4aaf8f6f5c6e6d7c8b9a0";

    expect(parseDockerRepoDigestFromInspect(`["ghcr.io/acme/api@${digest}"]`)).toBe(digest);
    expect(parseDockerRepoDigestFromInspect(`ghcr.io/acme/api@${digest}`)).toBe(digest);
    expect(parseDockerRepoDigestFromInspect(`[]\n${digest}`)).toBe(digest);
    expect(parseDockerRepoDigestFromInspect("[]")).toBeUndefined();
  });

  test("falls back to Docker pull digest when inspect output does not include repo digests", () => {
    const digest =
      "sha256:0afb71a39e51637b4d5b4010d90e68bc502d3ca1d2a4d953eb5fcd7d86330ccd";

    expect(
      parseRemoteDockerImageVersionMetadataOutput({
        stdout: "[]",
        stderr: `latest: Pulling from n8nio/n8n\nDigest: ${digest}\nStatus: Downloaded newer image for n8nio/n8n:latest`,
      }),
    ).toBe(digest);
  });

  test("parses digest from raw SSH output before applying timeline redactions", async () => {
    const digest =
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const rawStdout = `["ghcr.io/acme/api@${digest}"]`;
    const backend = new SshExecutionBackend(
      "/tmp/appaloft-runtime",
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );
    const recordedCommands: unknown[] = [];

    (backend as never as { runRemoteCommand: (input: unknown) => Promise<unknown> }).runRemoteCommand =
      async (input) => {
        recordedCommands.push(input);
        const redactions = (input as { redactions?: readonly string[] }).redactions ?? [];
        const stdout = redactions.reduce(
          (text, secret) => text.replaceAll(secret, "[redacted]"),
          rawStdout,
        );
        return { failed: false, stdout, stderr: "", exitCode: 0 };
      };

    const result = await (
      backend as never as {
        resolveRemoteDockerImageVersionMetadata: (input: unknown) => Promise<unknown>;
      }
    ).resolveRemoteDockerImageVersionMetadata({
      context: {},
      deploymentId: "dep_digest_redaction",
      state: {
        runtimePlan: {
          source: { kind: "docker-image", version: { isUnknown: () => true } },
        },
      },
      target: { host: "deploy@example.test", publicHost: "example.test", port: "22" },
      runtimeDir: "/tmp/appaloft-runtime",
      env: {},
      redactions: ["a"],
      image: "ghcr.io/acme/api:latest",
      timeline: [],
    });

    expect(recordedCommands).toEqual([
      expect.not.objectContaining({ redactions: expect.anything() }),
    ]);
    expect(result).toEqual({
      status: "resolved",
      metadata: {
        imageDigest: digest,
        sourceVersion: digest,
        sourceVersionKind: "image-digest",
      },
    });
  });
});

describe("SSH preview artifact cleanup", () => {
  test("[DEPLOYMENTS-CLEANUP-PREVIEW-007] renders a POSIX sh-compatible sibling artifact sweep", () => {
    const command = buildRemotePreviewArtifactSweepCommand({
      remoteRuntimeRoot: "/var/lib/appaloft/runtime",
      sourceFingerprint:
        "source-fingerprint%3Av1:preview%3Apr%3A51:github:provider-repository%3A1240442607:.:appaloft.preview.yaml",
    });

    const syntaxCheck = spawnSync("sh", ["-n", "-c", command], { encoding: "utf8" });
    const dashSyntaxCheck = spawnSync("dash", ["-n", "-c", command], { encoding: "utf8" });

    expect(syntaxCheck.status).toBe(0);
    expect(dashSyntaxCheck.status).toBe(0);
    expect(command).toContain('for marker in "$@"; do\nif grep -Fq "$fingerprint" "$marker"; then');
    expect(command).not.toContain("then;");
    expect(command).not.toContain("for marker do; if");
  });
});
