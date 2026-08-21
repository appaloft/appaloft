import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { ash } from "@appaloft/ash";
import { RuntimeCommandBuilder, renderRuntimeCommandString } from "../src/runtime-commands";
import {
  buildLocalWorkspaceUploadCommand,
  buildLocalWorkspaceUploadTarExcludeArgs,
  buildRemoteComposeFailureLogsCommand,
  buildRemoteDockerImageVersionMetadataCommand,
  buildRemotePreviewArtifactSweepCommand,
  buildRemoteStaticPublishDirectoryPresenceCommand,
  normalizeLocalSourceWorkingDirectory,
  parseDockerRepoDigestFromInspect,
  parseRemoteDockerImageVersionMetadataOutput,
  resolveLocalWorkspaceWorkdir,
  sshDockerUploadedWorkspaceContextPath,
  sshDockerUploadedWorkspaceFilePath,
  sshStaticPublishDirectoryMissingMessage,
  SshExecutionBackend,
  summarizeSshCommandFailureOutput,
} from "../src/ssh-execution";
import { generateStaticSiteDockerBuild } from "../src/workspace-planners";

describe("SSH source upload", () => {
  test("[DEP-CREATE-PKG-007] source workdir keeps the hyphenated folder when it is missing here", () => {
    const locator = "/Users/nichenqin/projects/nux-9859a0e9-static";
    const parent = "/Users/nichenqin/projects";
    const workdir = normalizeLocalSourceWorkingDirectory(locator);

    expect(workdir).toBe(locator);
    expect(workdir).toContain("nux-9859a0e9-static");
    expect(workdir).not.toBe(parent);
    expect(workdir.endsWith("/projects")).toBe(false);

    const packaged = resolveLocalWorkspaceWorkdir({
      workingDirectory: locator,
      locator,
      metadata: { baseDirectory: "/" },
    });
    expect(packaged).toBe(locator);
    expect(packaged).not.toBe(parent);

    const escaped = resolveLocalWorkspaceWorkdir({
      workingDirectory: locator,
      locator,
      metadata: { baseDirectory: ".." },
    });
    expect(escaped).toBe(locator);
    expect(escaped).not.toBe(parent);

    const missingMessage = `Source working directory does not exist: ${packaged}`;
    expect(missingMessage).toContain("nux-9859a0e9-static");
    expect(missingMessage).not.toBe(`Source working directory does not exist: ${parent}`);
  });

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

    expect(command).toMatchSnapshot();
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

describe("SSH Docker build context", () => {
  test("[DEP-CREATE-PKG-005][DEP-CREATE-ADM-026A] uses the uploaded workspace so public/index.html is in context", () => {
    const remoteRoot = "/var/lib/appaloft/runtime/ssh-deployments/dep_i28tpjmubc32";
    const remoteWorkdir = `${remoteRoot}/source`;
    const uploadedPublicIndex = `${remoteWorkdir}/public/index.html`;
    const contextPath = sshDockerUploadedWorkspaceContextPath(remoteWorkdir);
    const dockerBuild = generateStaticSiteDockerBuild({
      execution: {
        metadata: {
          "static.publishDirectory": "public",
        },
      } as never,
    });

    expect(contextPath).toBe(remoteWorkdir);
    expect(contextPath).not.toBe(".");
    expect(contextPath).not.toBe(remoteRoot);
    expect(sshDockerUploadedWorkspaceFilePath(remoteWorkdir, "public/index.html")).toBe(
      uploadedPublicIndex,
    );
    expect(uploadedPublicIndex.startsWith(`${contextPath}/`)).toBe(true);
    expect(dockerBuild?.dockerfile).toContain('COPY ["public/","/usr/share/nginx/html/"]');
    expect(dockerBuild?.dockerfile).not.toContain('COPY ["/public/","/usr/share/nginx/html/"]');
    expect(dockerBuild?.dockerfile).not.toContain('COPY [".","/usr/share/nginx/html/"]');

    const spec = RuntimeCommandBuilder.docker().buildImage({
      image: "appaloft-image-dep_i28tpjmubc32:latest",
      dockerfilePath: `${remoteRoot}/Dockerfile.appaloft-static`,
      contextPath,
    });
    const command = renderRuntimeCommandString(spec, { quote: ash.quote });

    expect(spec.contextPath.value).toBe(remoteWorkdir);
    expect(command).toContain(`'${remoteWorkdir}'`);
    expect(command).toContain(`-f '${remoteRoot}/Dockerfile.appaloft-static'`);
    expect(command.endsWith(" '.'")).toBe(false);
    expect(command).not.toContain("cd ");
  });

  test("[DEP-CREATE-PKG-005][DEP-CREATE-PKG-006] fixture public/index.html is inside context and missing public/ fails", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "appaloft-reverify-public-"));
    const uploadedWorkspace = join(fixtureRoot, "source");
    const generatedOnlyWorkspace = join(fixtureRoot, "generated-only");
    mkdirSync(join(uploadedWorkspace, "public"), { recursive: true });
    writeFileSync(join(uploadedWorkspace, "public", "index.html"), "<!doctype html><title>ok</title>");
    mkdirSync(join(generatedOnlyWorkspace, ".appaloft", "docker-build"), { recursive: true });
    writeFileSync(join(generatedOnlyWorkspace, ".appaloft", "docker-build", "nginx.conf"), "server {}\n");

    try {
      const presenceCommand = buildRemoteStaticPublishDirectoryPresenceCommand({
        remoteWorkdir: uploadedWorkspace,
        publishDirectory: "public",
      });
      const present = spawnSync("sh", ["-lc", presenceCommand], { encoding: "utf8" });

      expect(join(uploadedWorkspace, "public", "index.html").startsWith(`${uploadedWorkspace}/`)).toBe(
        true,
      );
      expect(presenceCommand).toContain("test -d");
      expect(presenceCommand).toContain(ash.quote(`${uploadedWorkspace}/public`));
      expect(present.status).toBe(0);
      expect(present.stdout).not.toContain("not found in uploaded workspace");

      const missingCommand = buildRemoteStaticPublishDirectoryPresenceCommand({
        remoteWorkdir: generatedOnlyWorkspace,
        publishDirectory: "/public",
      });
      const missing = spawnSync("sh", ["-lc", missingCommand], { encoding: "utf8" });
      const missingMessage = sshStaticPublishDirectoryMissingMessage("public");

      expect(missing.status).not.toBe(0);
      expect(missing.stdout).toContain(missingMessage);
      expect(missing.stdout).toContain(
        "static publish directory public/ not found in uploaded workspace",
      );
      expect(missing.stdout).toContain(".appaloft");
      expect(missingMessage).toBe("static publish directory public/ not found in uploaded workspace");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-005] surfaces BuildKit last lines on SSH docker build failure", () => {
    const summary = summarizeSshCommandFailureOutput({
      stdout: "",
      stderr: [
        "#5 [2/4] COPY [public/,/usr/share/nginx/html/]",
        '#5 ERROR: "/public": not found',
        'Dockerfile line 2: COPY ["public/","/usr/share/nginx/html/"]',
      ].join("\n"),
    });

    expect(summary).toContain('"/public": not found');
    expect(`SSH Docker image build failed: ${summary}`).toContain('"/public": not found');
  });
});

describe("SSH Compose failure diagnostics", () => {
  test("[DEP-CREATE-ASYNC-004B] captures bounded stack logs before failed candidate cleanup", () => {
    const command = buildRemoteComposeFailureLogsCommand({
      composeFile: "/srv/stocktruth/docker-compose.production.yml",
      additionalComposeFiles: ["/srv/stocktruth/.appaloft.compose.labels.override.yml"],
      projectName: "appaloft-dep_failed",
      tail: 200,
    });

    expect(command).toMatchSnapshot();
    expect(command).toContain("docker compose -p 'appaloft-dep_failed'");
    expect(command).toContain("-f '/srv/stocktruth/docker-compose.production.yml'");
    expect(command).toContain("-f '/srv/stocktruth/.appaloft.compose.labels.override.yml'");
    expect(command).toContain("logs --no-color --tail '200'");
    expect(command).not.toContain("--follow");
  });
});

describe("SSH Docker image version metadata", () => {
  test("renders remote Docker pull before digest inspect", () => {
    const command = buildRemoteDockerImageVersionMetadataCommand("ghcr.io/acme/api:latest");

    const syntaxCheck = spawnSync("sh", ["-n", "-c", command], { encoding: "utf8" });

    expect(command).toMatchSnapshot();
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

    expect(command).toMatchSnapshot();
    expect(syntaxCheck.status).toBe(0);
    expect(dashSyntaxCheck.status).toBe(0);
    expect(command).toContain('for marker in "$@"; do\nif grep -Fq "$fingerprint" "$marker"; then');
    expect(command).not.toContain("then;");
    expect(command).not.toContain("for marker do; if");
  });
});
