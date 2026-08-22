import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  ConfigScopeValue,
  CreatedAt,
  Deployment,
  DeploymentId,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DestinationId,
  DetectSummary,
  DisplayNameText,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ExecutionStrategyKindValue,
  FilePathText,
  GeneratedAt,
  PackagingModeValue,
  PlanStepText,
  ProjectId,
  ProviderKey,
  ResourceId,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  TargetKindValue,
} from "@appaloft/core";
import type { ExecutionContext } from "@appaloft/application";
import {
  CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY,
  deploymentWithLocalFolderSourceArchiveFromResourceBinding,
} from "@appaloft/application";
import { ash } from "@appaloft/ash";
import { RuntimeCommandBuilder, renderRuntimeCommandString } from "../src/runtime-commands";
import {
  buildLocalWorkspaceUploadCommand,
  buildLocalWorkspaceUploadTarExcludeArgs,
  buildPackedSourceUploadCommand,
  buildRemoteComposeFailureLogsCommand,
  buildRemoteDockerImageVersionMetadataCommand,
  buildRemoteDockerfilePresenceCommand,
  buildRemotePreviewArtifactSweepCommand,
  buildRemoteStaticPublishDirectoryPresenceCommand,
  createLocalWorkspaceUploadArchive,
  inspectDockerfileWorkspaceUploadReadiness,
  listGitAwareWorkspaceFiles,
  materializeCliPackedSourceArchive,
  normalizeLocalSourceWorkingDirectory,
  packedSourceArchiveDockerfileBytes,
  parseDockerRepoDigestFromInspect,
  parseRemoteDockerImageVersionMetadataOutput,
  resolveLocalWorkspaceWorkdir,
  resolveSshSourceUploadMaterial,
  localSourceWorkdirMissingMessage,
  recoverLocalSourceFolderFromCwd,
  resolveSshPackageLocalWorkdir,
  shouldPreferLiveGitWorkspaceOverCliPackedArchive,
  sshDockerBuildDockerfilePath,
  sshDockerUploadedWorkspaceContextPath,
  sshDockerUploadedWorkspaceFilePath,
  sshDockerfileMissingInUploadedWorkspaceMessage,
  sshStaticPublishDirectoryMissingMessage,
  SshExecutionBackend,
  summarizeSshCommandFailureOutput,
} from "../src/ssh-execution";
import { generateStaticSiteDockerBuild } from "../src/workspace-planners";

const hyphenatedStaticLocator = "/Users/nichenqin/projects/nux-c79876d8-static";
const hyphenatedStaticParent = "/Users/nichenqin/projects";
const hyphenatedStaticLeaf = "nux-c79876d8-static";
const startedAt = StartedAt.rehydrate("2026-08-21T00:00:00.000Z");

function runningStaticSshDeployment(input: {
  deploymentId: string;
  locator: string;
  workingDirectory?: string;
  displayName?: string;
  omitDisplayName?: boolean;
  cliResolvedSource?: string;
  originalLocator?: string;
  packedSourceArchive?: string;
  executionPackedSourceArchive?: string;
  executionLocalWorkdir?: string;
  emptyMetadata?: boolean;
  resourceName?: string;
}): Deployment {
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate(input.deploymentId),
    projectId: ProjectId.rehydrate("prj_hyphenated_static"),
    environmentId: EnvironmentId.rehydrate("env_local"),
    resourceId: ResourceId.rehydrate("res_static"),
    serverId: DeploymentTargetId.rehydrate("srv_4lifk0yrcecy"),
    destinationId: DestinationId.rehydrate("dst_hostinger"),
    runtimePlan: RuntimePlan.rehydrate({
      id: RuntimePlanId.rehydrate(`plan_${input.deploymentId}`),
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate(input.locator),
        displayName: DisplayNameText.rehydrate(
          input.omitDisplayName ? "workspace" : (input.displayName ?? hyphenatedStaticLeaf),
        ),
        ...(input.emptyMetadata && !input.packedSourceArchive
          ? {}
          : {
              metadata: {
                ...(input.emptyMetadata ? {} : { baseDirectory: "/" }),
                ...(input.cliResolvedSource ? { cliResolvedSource: input.cliResolvedSource } : {}),
                ...(input.originalLocator ? { originalLocator: input.originalLocator } : {}),
                ...(input.packedSourceArchive
                  ? { cliPackedSourceTarGz: input.packedSourceArchive }
                  : {}),
              },
            }),
      }),
      buildStrategy: BuildStrategyKindValue.rehydrate("static-artifact"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
        ...(input.workingDirectory
          ? { workingDirectory: FilePathText.rehydrate(input.workingDirectory) }
          : {}),
        metadata: {
          "artifact.source": "static-site",
          "static.publishDirectory": "public",
          ...(input.resourceName ? { "context.resourceName": input.resourceName } : {}),
          ...(input.executionLocalWorkdir ? { localWorkdir: input.executionLocalWorkdir } : {}),
          ...(input.executionPackedSourceArchive
            ? { cliPackedSourceTarGz: input.executionPackedSourceArchive }
            : {}),
        },
      }),
      target: DeploymentTargetDescriptor.rehydrate({
        kind: TargetKindValue.rehydrate("single-server"),
        providerKey: ProviderKey.rehydrate("generic-ssh"),
        serverIds: [DeploymentTargetId.rehydrate("srv_4lifk0yrcecy")],
      }),
      detectSummary: DetectSummary.rehydrate("Static site from public/index.html"),
      steps: [PlanStepText.rehydrate("Upload source workspace over SSH")],
      generatedAt: GeneratedAt.rehydrate("2026-08-21T00:00:00.000Z"),
    }),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate(`snap_${input.deploymentId}`),
      environmentId: EnvironmentId.rehydrate("env_local"),
      createdAt: GeneratedAt.rehydrate("2026-08-21T00:00:00.000Z"),
      precedence: [ConfigScopeValue.rehydrate("environment")],
      variables: [],
    }),
    createdAt: CreatedAt.rehydrate("2026-08-21T00:00:00.000Z"),
  })._unsafeUnwrap();

  deployment.markPlanning(startedAt)._unsafeUnwrap();
  deployment.markPlanned(startedAt)._unsafeUnwrap();
  deployment.start(startedAt)._unsafeUnwrap();
  return deployment;
}

function runningDockerfileSshDeployment(input: {
  deploymentId: string;
  locator: string;
  workingDirectory?: string;
  displayName?: string;
  omitDisplayName?: boolean;
  emptyMetadata?: boolean;
  packedSourceArchive?: string;
  executionPackedSourceArchive?: string;
  dockerfilePath?: string;
  originalLocator?: string;
  resourceName?: string;
}): Deployment {
  const dockerfilePath = input.dockerfilePath ?? "Dockerfile";
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate(input.deploymentId),
    projectId: ProjectId.rehydrate("prj_hyphenated_git"),
    environmentId: EnvironmentId.rehydrate("env_local"),
    resourceId: ResourceId.rehydrate("res_jsb186k9hriq"),
    serverId: DeploymentTargetId.rehydrate("srv_4lifk0yrcecy"),
    destinationId: DestinationId.rehydrate("dst_hostinger"),
    runtimePlan: RuntimePlan.rehydrate({
      id: RuntimePlanId.rehydrate(`plan_${input.deploymentId}`),
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate(input.locator),
        displayName: DisplayNameText.rehydrate(
          input.omitDisplayName ? "workspace" : (input.displayName ?? "appaloft-cloud"),
        ),
        ...(input.emptyMetadata && !input.packedSourceArchive && !input.originalLocator
          ? {}
          : {
              metadata: {
                ...(input.emptyMetadata ? {} : { baseDirectory: "/" }),
                ...(input.originalLocator ? { originalLocator: input.originalLocator } : {}),
                ...(input.packedSourceArchive
                  ? { cliPackedSourceTarGz: input.packedSourceArchive }
                  : {}),
              },
            }),
      }),
      buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
        ...(input.workingDirectory
          ? { workingDirectory: FilePathText.rehydrate(input.workingDirectory) }
          : {}),
        dockerfilePath: FilePathText.rehydrate(dockerfilePath),
        metadata: {
          ...(input.resourceName ? { "context.resourceName": input.resourceName } : {}),
          ...(input.executionPackedSourceArchive
            ? { cliPackedSourceTarGz: input.executionPackedSourceArchive }
            : {}),
        },
      }),
      target: DeploymentTargetDescriptor.rehydrate({
        kind: TargetKindValue.rehydrate("single-server"),
        providerKey: ProviderKey.rehydrate("generic-ssh"),
        serverIds: [DeploymentTargetId.rehydrate("srv_4lifk0yrcecy")],
      }),
      detectSummary: DetectSummary.rehydrate("Dockerfile workspace from local git checkout"),
      steps: [PlanStepText.rehydrate("Upload source workspace over SSH")],
      generatedAt: GeneratedAt.rehydrate("2026-08-21T00:00:00.000Z"),
    }),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate(`snap_${input.deploymentId}`),
      environmentId: EnvironmentId.rehydrate("env_local"),
      createdAt: GeneratedAt.rehydrate("2026-08-21T00:00:00.000Z"),
      precedence: [ConfigScopeValue.rehydrate("environment")],
      variables: [],
    }),
    createdAt: CreatedAt.rehydrate("2026-08-21T00:00:00.000Z"),
  })._unsafeUnwrap();

  deployment.markPlanning(startedAt)._unsafeUnwrap();
  deployment.markPlanned(startedAt)._unsafeUnwrap();
  deployment.start(startedAt)._unsafeUnwrap();
  return deployment;
}

function writeProductionSizedDockerfile(folder: string): { path: string; bytes: number } {
  const path = join(folder, "Dockerfile");
  const contents = [
    "FROM node:22-bookworm-slim",
    "WORKDIR /app",
    "COPY . .",
    "CMD [\"node\",\"server.js\"]",
    `# production-sized Dockerfile (${"keep-root-dockerfile ".repeat(180).trim()})`,
    "",
  ].join("\n");
  writeFileSync(path, contents);
  return { path, bytes: Buffer.byteLength(contents) };
}

function initGitWorktree(folder: string): void {
  mkdirSync(folder, { recursive: true });
  const initialized = spawnSync("git", ["-C", folder, "init"], { encoding: "utf8" });
  expect(initialized.status).toBe(0);
}

function createEmptyGitAwareTarArchive(outputPath: string): Buffer {
  const packed = spawnSync("tar", ["--null", "-czf", outputPath, "--files-from", "-"], {
    input: "",
    encoding: "buffer",
  });
  expect(packed.status).toBe(0);
  const bytes = readFileSync(outputPath);
  expect(bytes.byteLength).toBeGreaterThan(0);
  expect(bytes.byteLength).toBeLessThan(100);
  return bytes;
}

function writeLocalSshShim(binDir: string): void {
  const sshPath = join(binDir, "ssh");
  writeFileSync(
    sshPath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "command=\"\"",
      "host_seen=0",
      "while [[ $# -gt 0 ]]; do",
      "  case \"$1\" in",
      "    -p|-i|-o|-l)",
      "      shift 2",
      "      ;;",
      "    -*)",
      "      shift",
      "      ;;",
      "    *)",
      "      if [[ $host_seen -eq 0 ]]; then",
      "        host_seen=1",
      "        shift",
      "      else",
      "        command=\"$1\"",
      "        shift",
      "      fi",
      "      ;;",
      "  esac",
      "done",
      "exec bash -lc \"$command\"",
      "",
    ].join("\n"),
  );
  chmodSync(sshPath, 0o755);
}

function capturingProgressReporter(): {
  reports: Array<{ message: string; status?: string }>;
  reporter: { report: (_context: unknown, event: { message: string; status?: string }) => void };
} {
  const reports: Array<{ message: string; status?: string }> = [];
  return {
    reports,
    reporter: {
      report: (_context, event) => {
        reports.push({ message: event.message, ...(event.status ? { status: event.status } : {}) });
      },
    },
  };
}

type PrepareSshSourceBackend = {
  prepareSshSource: (
    context: ExecutionContext,
    current: Deployment,
    timeline: unknown[],
    input: {
      runtimeDir: string;
      remoteRoot: string;
      target: { host: string; publicHost: string; port: string };
      env: NodeJS.ProcessEnv;
    },
  ) => Promise<
    | {
        prepared: true;
        source: { remoteWorkdir?: string; metadata?: Record<string, string> };
      }
    | { prepared: false; deployment: Deployment }
  >;
};

describe("SSH source upload", () => {
  test("[DEP-CREATE-PKG-007] live stored shape without workingDirectory dirnames the projects parent", () => {
    const leaf = "/Users/nichenqin/projects/nux-d9042824-static";
    const parent = "/Users/nichenqin/projects";
    expect(existsSync(leaf)).toBe(false);
    expect(existsSync(parent)).toBe(false);
    // Live persist for res_rkd0hzp0yvp5: locator=leaf, archive present,
    // workingDirectory ABSENT. Older workers then dirname the missing leaf.
    const legacyExistsSyncPath = dirname(leaf);
    expect(legacyExistsSyncPath).toBe(parent);
    expect(`Source working directory does not exist: ${legacyExistsSyncPath}`).toBe(
      "Source working directory does not exist: /Users/nichenqin/projects",
    );
  });

  test("[DEP-CREATE-PKG-007] live leaf+archive with no workingDirectory applies the archive before existsSync", async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-nux-d9042824-"));
    const parent = join(hostRoot, "projects");
    const leaf = "nux-d9042824-static";
    const folder = join(parent, leaf);
    const macParent = "/Users/nichenqin/projects";
    const macFolder = `${macParent}/${leaf}`;
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    mkdirSync(join(folder, "public"), { recursive: true });
    writeFileSync(
      join(folder, "public", "index.html"),
      "<!doctype html><title>nux-d9042824-static</title>",
    );
    expect(existsSync(join(folder, ".git"))).toBe(false);

    const archiveFile = join(hostRoot, "source.tgz");
    const packed = spawnSync("tar", ["-czf", archiveFile, "-C", folder, "."], {
      encoding: "utf8",
    });
    expect(packed.status).toBe(0);
    const packedSourceArchive = readFileSync(archiveFile).toString("base64");
    expect(packedSourceArchive.length).toBeGreaterThan(0);

    const listingArchive = materializeCliPackedSourceArchive({
      runtimeDir,
      packedSourceArchive,
    });
    const listing = spawnSync("tar", ["-tzf", listingArchive], { encoding: "utf8" });
    expect(listing.status).toBe(0);
    expect(listing.stdout).toContain("public/index.html");
    expect(listing.stdout.split("\n").some((line) => line.endsWith("/projects"))).toBe(false);

    const deployment = runningStaticSshDeployment({
      deploymentId: "dep_tu084dr7fln1",
      locator: macFolder,
      displayName: leaf,
      emptyMetadata: true,
      originalLocator: macFolder,
      cliResolvedSource: macFolder,
      packedSourceArchive,
    });
    expect(deployment.toState().runtimePlan.execution.workingDirectory).toBeUndefined();
    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    try {
      process.chdir(runtimeDir);
      expect(process.cwd()).toBe(runtimeDir);
      expect(existsSync(macParent)).toBe(false);
      expect(existsSync(macFolder)).toBe(false);

      const packagePath = resolveSshPackageLocalWorkdir({
        locator: macFolder,
        displayName: leaf,
        originalLocator: macFolder,
        cliResolvedSource: macFolder,
        metadata: {
          originalLocator: macFolder,
          cliResolvedSource: macFolder,
          cliPackedSourceTarGz: packedSourceArchive,
        },
      });
      expect(packagePath).toBe(macFolder);
      expect(packagePath).not.toBe(macParent);
      expect(dirname(packagePath)).toBe(macParent);

      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_007_nux_d9042824_live_shape", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_tu084dr7fln1",
          target: { host: "127.0.0.1", publicHost: "127.0.0.1", port: "1" },
          env: {},
        },
      );

      const resultState = prepared.prepared ? deployment.toState() : prepared.deployment.toState();
      const messages = resultState.timeline.map((entry) => entry.message);
      const missing = messages.filter((message) =>
        message.startsWith("Source working directory does not exist:"),
      );
      expect(missing).toEqual([]);
      expect(messages.some((message) => message.endsWith(macParent))).toBe(false);
      expect(messages.some((message) => message.endsWith("/projects"))).toBe(false);
      expect(resultState.runtimePlan.execution.metadata?.errorCode).not.toBe(
        "source_workdir_missing",
      );
      expect(resultState.runtimePlan.execution.metadata?.localWorkdir).not.toBe(macParent);
      if (!prepared.prepared) {
        expect(resultState.runtimePlan.execution.metadata?.errorCode).toBe(
          "ssh_source_upload_failed",
        );
      }
    } finally {
      process.chdir(previousCwd);
      rmSync(hostRoot, { recursive: true, force: true });
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-007] source workdir keeps the hyphenated folder when it is missing here", () => {
    const locator = hyphenatedStaticLocator;
    const parent = hyphenatedStaticParent;
    const workdir = normalizeLocalSourceWorkingDirectory(locator);

    expect(workdir).toBe(locator);
    expect(workdir).toContain(hyphenatedStaticLeaf);
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

    const dirnameAlready = resolveLocalWorkspaceWorkdir({
      workingDirectory: parent,
      locator,
      metadata: { baseDirectory: "/" },
    });
    expect(dirnameAlready).toBe(locator);
    expect(dirnameAlready).toContain(hyphenatedStaticLeaf);
    expect(dirnameAlready).not.toBe(parent);

    const missingMessage = `Source working directory does not exist: ${dirnameAlready}`;
    expect(missingMessage).toContain(hyphenatedStaticLeaf);
    expect(missingMessage).not.toBe(`Source working directory does not exist: ${parent}`);
  });

  test("[DEP-CREATE-PKG-007] recover refuses a generic parent basename as the source leaf", () => {
    const parent = "/Users/nichenqin/projects";
    const folder = `${parent}/nux-67e3a052-static`;

    expect(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
      }),
    ).not.toBe(folder);
    expect(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
        displayName: "workspace",
      }),
    ).not.toBe(folder);
    expect(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
        displayName: "projects",
      }),
    ).not.toBe(folder);
    expect(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
        originalLocator: folder,
      }),
    ).toBe(folder);
    expect(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
        displayName: "workspace",
        originalLocator: folder,
      }),
    ).toBe(folder);
    expect(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
        displayName: "projects",
        originalLocator: folder,
      }),
    ).toBe(folder);
    expect(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
      }),
    ).not.toEqual(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
        originalLocator: folder,
      }),
    );
  });

  test("[DEP-CREATE-PKG-007] hyphenated appaloft-cloud under projects is not reported as the parent", () => {
    const parent = "/Users/nichenqin/projects";
    const folder = `${parent}/appaloft-cloud`;

    expect(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
        displayName: "projects",
      }),
    ).toBe(parent);
    expect(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
        displayName: "appaloft-cloud",
      }),
    ).toBe(folder);
    expect(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
        originalLocator: folder,
        displayName: "workspace",
      }),
    ).toBe(folder);
    expect(
      resolveSshPackageLocalWorkdir({
        locator: parent,
        workingDirectory: parent,
        displayName: "appaloft-cloud",
      }),
    ).toBe(folder);

    const parentMissing = localSourceWorkdirMissingMessage(parent);
    expect(parentMissing).not.toBe(`Source working directory does not exist: ${parent}`);
    expect(parentMissing.endsWith("/projects")).toBe(false);
    expect(localSourceWorkdirMissingMessage(folder)).toBe(
      `Source working directory does not exist: ${folder}`,
    );
    expect(localSourceWorkdirMissingMessage(folder)).toContain("appaloft-cloud");
  });

  test("[DEP-CREATE-PKG-007] reconstructs a non-git hyphenated nux leaf under projects from the resource name", () => {
    const parent = "/Users/nichenqin/projects";
    const leaf = "nux-d73d53b6-static";
    const folder = `${parent}/${leaf}`;
    const resourceName = `${leaf}-8xrly6`;

    expect(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
        displayName: "projects",
        resourceName,
      }),
    ).toBe(folder);
    expect(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
        displayName: "workspace",
        resourceName,
      }),
    ).toBe(folder);
    expect(
      recoverLocalSourceFolderFromCwd({
        plannedRoot: parent,
        locator: parent,
        resourceName,
      }),
    ).toBe(folder);
    expect(
      resolveSshPackageLocalWorkdir({
        locator: parent,
        workingDirectory: parent,
        displayName: "projects",
        resourceName,
      }),
    ).toBe(folder);
    expect(
      resolveSshPackageLocalWorkdir({
        locator: parent,
        workingDirectory: parent,
        resourceName,
      }),
    ).toBe(folder);
    expect(localSourceWorkdirMissingMessage(folder)).toContain(leaf);
    expect(localSourceWorkdirMissingMessage(folder)).not.toBe(
      `Source working directory does not exist: ${parent}`,
    );
    expect(
      resolveSshPackageLocalWorkdir({
        locator: parent,
        workingDirectory: parent,
        displayName: "projects",
        metadata: { "context.resourceName": resourceName },
      }),
    ).toBe(folder);
  });

  test("[DEP-CREATE-PKG-007] detached worker names the nux leaf, not the projects parent", async () => {
    const parent = "/Users/nichenqin/projects";
    const leaf = "nux-d73d53b6-static";
    const folder = `${parent}/${leaf}`;
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    const deployment = runningStaticSshDeployment({
      deploymentId: "dep_nux_d73d53b6_parent",
      locator: parent,
      workingDirectory: parent,
      displayName: "projects",
      emptyMetadata: true,
      resourceName: `${leaf}-8xrly6`,
    });
    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    try {
      process.chdir(runtimeDir);
      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_007_nux_leaf", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_nux_d73d53b6_parent",
          target: { host: "deploy@example.test", publicHost: "example.test", port: "22" },
          env: {},
        },
      );

      expect(prepared.prepared).toBe(false);
      if (prepared.prepared) {
        throw new Error("expected SSH package to fail without a CLI-host archive");
      }

      const messages = prepared.deployment.toState().timeline.map((entry) => entry.message);
      const missing = messages.find((message) =>
        message.startsWith("Source working directory does not exist:"),
      );
      expect(missing).toBe(`Source working directory does not exist: ${folder}`);
      expect(missing).toContain(leaf);
      expect(missing).not.toBe(`Source working directory does not exist: ${parent}`);
      expect(missing?.endsWith("/projects")).toBe(false);
      expect(prepared.deployment.toState().runtimePlan.execution.metadata?.errorCode).toBe(
        "source_workdir_missing",
      );
      expect(prepared.deployment.toState().runtimePlan.execution.metadata?.localWorkdir).toBe(
        folder,
      );
    } finally {
      process.chdir(previousCwd);
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-007][QUICK-DEPLOY-ENTRY-008B] CLI-packed nux-d73d53b6-static is applied; worker does not package /Users/nichenqin/projects", async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-nux-d73d53b6-"));
    const parent = join(hostRoot, "projects");
    const leaf = "nux-d73d53b6-static";
    const folder = join(parent, leaf);
    const macParent = "/Users/nichenqin/projects";
    const macFolder = `${macParent}/${leaf}`;
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    mkdirSync(join(folder, "public"), { recursive: true });
    writeFileSync(join(folder, "public", "index.html"), "<!doctype html><title>nux</title>");
    expect(existsSync(join(folder, ".git"))).toBe(false);

    const archiveFile = join(hostRoot, "source.tgz");
    const packed = spawnSync("tar", ["-czf", archiveFile, "-C", folder, "."], {
      encoding: "utf8",
    });
    expect(packed.status).toBe(0);
    const packedSourceArchive = readFileSync(archiveFile).toString("base64");
    expect(packedSourceArchive.length).toBeGreaterThan(0);

    const listingArchive = materializeCliPackedSourceArchive({
      runtimeDir,
      packedSourceArchive,
    });
    const listing = spawnSync("tar", ["-tzf", listingArchive], { encoding: "utf8" });
    expect(listing.status).toBe(0);
    expect(listing.stdout).toContain("public/index.html");
    expect(listing.stdout).not.toContain(`${leaf}/`);
    expect(listing.stdout.split("\n").some((line) => line.endsWith("/projects"))).toBe(false);

    const deployment = runningStaticSshDeployment({
      deploymentId: "dep_x1cx53heufjk",
      locator: macParent,
      workingDirectory: macParent,
      displayName: "projects",
      emptyMetadata: true,
      packedSourceArchive,
      resourceName: `${leaf}-8xrly6`,
    });
    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    try {
      process.chdir(runtimeDir);
      expect(process.cwd()).toBe(runtimeDir);
      expect(existsSync(macParent)).toBe(false);
      expect(existsSync(macFolder)).toBe(false);

      const packagePath = resolveSshPackageLocalWorkdir({
        locator: macParent,
        workingDirectory: macParent,
        displayName: "projects",
        metadata: { "context.resourceName": `${leaf}-8xrly6` },
      });
      expect(packagePath).toBe(macFolder);
      expect(packagePath).not.toBe(macParent);

      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_007_nux_d73d53b6_packed", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_x1cx53heufjk",
          target: { host: "127.0.0.1", publicHost: "127.0.0.1", port: "1" },
          env: {},
        },
      );

      const messages = prepared.prepared
        ? []
        : prepared.deployment.toState().timeline.map((entry) => entry.message);
      expect(
        messages.some((message) =>
          message.startsWith("Source working directory does not exist:"),
        ),
      ).toBe(false);
      expect(messages.some((message) => message.endsWith(macParent))).toBe(false);
      expect(messages.some((message) => message.endsWith("/projects"))).toBe(false);
      if (!prepared.prepared) {
        expect(prepared.deployment.toState().runtimePlan.execution.metadata?.errorCode).not.toBe(
          "source_workdir_missing",
        );
        expect(prepared.deployment.toState().runtimePlan.execution.metadata?.localWorkdir).not.toBe(
          macParent,
        );
        expect(prepared.deployment.toState().runtimePlan.execution.metadata?.url).toBeUndefined();
        expect(
          prepared.deployment.toState().runtimePlan.execution.metadata?.publicUrl,
        ).toBeUndefined();
      }
    } finally {
      process.chdir(previousCwd);
      rmSync(hostRoot, { recursive: true, force: true });
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-007][QUICK-DEPLOY-ENTRY-008B] applies the CLI archive from execution.metadata when source.metadata is empty", async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-nux-04a0bb31-"));
    const parent = join(hostRoot, "projects");
    const leaf = "nux-04a0bb31-static";
    const folder = join(parent, leaf);
    const macParent = "/Users/nichenqin/projects";
    const macFolder = `${macParent}/${leaf}`;
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    mkdirSync(join(folder, "public"), { recursive: true });
    writeFileSync(join(folder, "public", "index.html"), "<!doctype html><title>nux</title>");
    expect(existsSync(join(folder, ".git"))).toBe(false);

    const archiveFile = join(hostRoot, "source.tgz");
    const packed = spawnSync("tar", ["-czf", archiveFile, "-C", folder, "."], {
      encoding: "utf8",
    });
    expect(packed.status).toBe(0);
    const packedSourceArchive = readFileSync(archiveFile).toString("base64");
    expect(packedSourceArchive.length).toBeGreaterThan(0);

    const deployment = runningStaticSshDeployment({
      deploymentId: "dep_pzxguqavq8jw",
      locator: macParent,
      workingDirectory: macParent,
      displayName: "projects",
      emptyMetadata: true,
      executionPackedSourceArchive: packedSourceArchive,
    });
    expect(deployment.toState().runtimePlan.source.metadata).toBeUndefined();
    expect(deployment.toState().runtimePlan.execution.metadata?.cliPackedSourceTarGz).toBe(
      packedSourceArchive,
    );
    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    try {
      process.chdir(runtimeDir);
      expect(process.cwd()).toBe(runtimeDir);
      expect(existsSync(macParent)).toBe(false);
      expect(existsSync(macFolder)).toBe(false);

      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_007_execution_archive", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_pzxguqavq8jw",
          target: { host: "127.0.0.1", publicHost: "127.0.0.1", port: "1" },
          env: {},
        },
      );

      const messages = prepared.prepared
        ? []
        : prepared.deployment.toState().timeline.map((entry) => entry.message);
      expect(
        messages.some((message) =>
          message.startsWith("Source working directory does not exist:"),
        ),
      ).toBe(false);
      expect(messages).not.toContain(`Source working directory does not exist: ${macParent}`);
      expect(messages.some((message) => message.endsWith("/projects"))).toBe(false);
      expect(existsSync(join(runtimeDir, "cli-source.tgz"))).toBe(true);
      if (!prepared.prepared) {
        expect(prepared.deployment.toState().runtimePlan.execution.metadata?.errorCode).not.toBe(
          "source_workdir_missing",
        );
      }
    } finally {
      process.chdir(previousCwd);
      rmSync(hostRoot, { recursive: true, force: true });
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-007] live c01dc5f5 rehydrate bag applies resource-binding archive before Mac existsSync", async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-nux-c01dc5f5-"));
    const parent = join(hostRoot, "projects");
    const leaf = "nux-c01dc5f5-static";
    const folder = join(parent, leaf);
    const macParent = "/Users/nichenqin/projects";
    const macFolder = `${macParent}/${leaf}`;
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    mkdirSync(join(folder, "public"), { recursive: true });
    writeFileSync(
      join(folder, "public", "index.html"),
      "<!doctype html><title>nux-c01dc5f5-static</title>",
    );
    expect(existsSync(join(folder, ".git"))).toBe(false);

    const archiveFile = join(hostRoot, "source.tgz");
    const packed = spawnSync("tar", ["-czf", archiveFile, "-C", folder, "."], {
      encoding: "utf8",
    });
    expect(packed.status).toBe(0);
    const packedSourceArchive = readFileSync(archiveFile).toString("base64");
    expect(packedSourceArchive.length).toBeGreaterThan(0);

    const listingArchive = materializeCliPackedSourceArchive({
      runtimeDir,
      packedSourceArchive,
    });
    const listing = spawnSync("tar", ["-tzf", listingArchive], { encoding: "utf8" });
    expect(listing.status).toBe(0);
    expect(listing.stdout).toContain("public/index.html");

    // Live persist shape after Cloud persist + rehydrate: leaf workdir,
    // emptied source.metadata, execution.metadata.localWorkdir is the
    // parent, archive ABSENT on the plan, present only on the resource
    // binding the worker can still load.
    const persistedPlan = runningStaticSshDeployment({
      deploymentId: "dep_0tzi4ys1wlug",
      locator: macFolder,
      workingDirectory: macFolder,
      displayName: leaf,
      emptyMetadata: true,
      executionLocalWorkdir: macParent,
    });
    expect(persistedPlan.toState().runtimePlan.execution.workingDirectory).toBe(macFolder);
    expect(persistedPlan.toState().runtimePlan.source.metadata).toBeUndefined();
    expect(persistedPlan.toState().runtimePlan.execution.metadata?.localWorkdir).toBe(macParent);
    expect(
      persistedPlan.toState().runtimePlan.execution.metadata?.[
        CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY
      ],
    ).toBeUndefined();

    const deployment = deploymentWithLocalFolderSourceArchiveFromResourceBinding(persistedPlan, {
      locator: macFolder,
      originalLocator: macFolder,
      metadata: { [CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]: packedSourceArchive },
    });
    expect(
      deployment.toState().runtimePlan.execution.metadata?.[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY],
    ).toBe(packedSourceArchive);
    expect(deployment.toState().runtimePlan.execution.metadata?.localWorkdir).toBe(macParent);
    expect(deployment.toState().runtimePlan.execution.workingDirectory).toBe(macFolder);
    expect(deployment.toState().runtimePlan.execution.workingDirectory).not.toBe(macParent);

    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    try {
      process.chdir(runtimeDir);
      expect(process.cwd()).toBe(runtimeDir);
      expect(existsSync(macParent)).toBe(false);
      expect(existsSync(macFolder)).toBe(false);

      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true; source: { metadata?: Record<string, string> } }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_007_c01dc5f5_rehydrate", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_0tzi4ys1wlug",
          target: { host: "127.0.0.1", publicHost: "127.0.0.1", port: "1" },
          env: {},
        },
      );

      const messages = prepared.prepared
        ? []
        : prepared.deployment.toState().timeline.map((entry) => entry.message);
      expect(
        messages.some((message) => message.startsWith("Source working directory does not exist:")),
      ).toBe(false);
      expect(messages).not.toContain(`Source working directory does not exist: ${macParent}`);
      expect(messages).not.toContain(`Source working directory does not exist: ${macFolder}`);
      expect(messages.some((message) => message.endsWith("/projects"))).toBe(false);
      expect(existsSync(join(runtimeDir, "cli-source.tgz"))).toBe(true);
      if (prepared.prepared) {
        expect(prepared.source.metadata?.archiveApplied).toBe("yes");
      } else {
        expect(prepared.deployment.toState().runtimePlan.execution.metadata?.archiveApplied).toBe(
          "yes",
        );
        expect(prepared.deployment.toState().runtimePlan.execution.metadata?.errorCode).not.toBe(
          "source_workdir_missing",
        );
        expect(prepared.deployment.toState().runtimePlan.execution.metadata?.localWorkdir).not.toBe(
          macParent,
        );
      }
    } finally {
      process.chdir(previousCwd);
      rmSync(hostRoot, { recursive: true, force: true });
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-007] detached worker does not name the projects parent for appaloft-cloud", async () => {
    const parent = "/Users/nichenqin/projects";
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    const deployment = runningStaticSshDeployment({
      deploymentId: "dep_appaloft_cloud_parent",
      locator: parent,
      workingDirectory: parent,
      displayName: "projects",
      emptyMetadata: true,
    });
    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    try {
      process.chdir(runtimeDir);
      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_007_cloud", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_appaloft_cloud_parent",
          target: { host: "deploy@example.test", publicHost: "example.test", port: "22" },
          env: {},
        },
      );

      expect(prepared.prepared).toBe(false);
      if (prepared.prepared) {
        throw new Error("expected SSH package to fail without a CLI-host archive");
      }

      const messages = prepared.deployment.toState().timeline.map((entry) => entry.message);
      const missing = messages.find((message) =>
        message.startsWith("Source working directory does not exist:"),
      );
      expect(missing).toBeDefined();
      expect(missing).not.toBe(`Source working directory does not exist: ${parent}`);
      expect(missing?.endsWith("/projects")).toBe(false);
      expect(prepared.deployment.toState().runtimePlan.execution.metadata?.errorCode).toBe(
        "source_workdir_missing",
      );
    } finally {
      process.chdir(previousCwd);
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-007] recovers the hyphenated cwd when locator and workdir are already the parent", () => {
    const parent = mkdtempSync(join(tmpdir(), "projects-"));
    const locator = join(parent, hyphenatedStaticLeaf);
    mkdirSync(join(locator, "public"), { recursive: true });
    writeFileSync(join(locator, "public", "index.html"), "<!doctype html><title>ok</title>");

    try {
      const packaged = resolveLocalWorkspaceWorkdir({
        workingDirectory: parent,
        locator: parent,
        displayName: hyphenatedStaticLeaf,
        metadata: { baseDirectory: "/" },
        cwd: locator,
      });

      expect(packaged).toBe(locator);
      expect(packaged).toContain(hyphenatedStaticLeaf);
      expect(packaged).not.toBe(parent);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-007] SSH package exists-check uses the full cwd when workingDirectory is already the parent", async () => {
    const locator = hyphenatedStaticLocator;
    const parent = hyphenatedStaticParent;
    const deployment = runningStaticSshDeployment({
      deploymentId: "dep_n9usn2o434m1",
      locator,
      workingDirectory: parent,
    });
    const backend = new SshExecutionBackend(
      "/tmp/appaloft-runtime",
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    expect(deployment.toState().runtimePlan.source.locator).toBe(locator);
    expect(deployment.toState().runtimePlan.execution.workingDirectory).toBe(parent);

    const prepared = await (
      backend as never as {
        prepareSshSource: (
          context: ExecutionContext,
          current: Deployment,
          timeline: unknown[],
          input: {
            runtimeDir: string;
            remoteRoot: string;
            target: { host: string; publicHost: string; port: string };
            env: NodeJS.ProcessEnv;
          },
        ) => Promise<
          | { prepared: true }
          | { prepared: false; deployment: Deployment }
        >;
      }
    ).prepareSshSource(
      { requestId: "req_pkg_007", entrypoint: "cli" } as ExecutionContext,
      deployment,
      [],
      {
        runtimeDir: "/tmp/appaloft-runtime",
        remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_n9usn2o434m1",
        target: { host: "deploy@example.test", publicHost: "example.test", port: "22" },
        env: {},
      },
    );

    expect(prepared.prepared).toBe(false);
    if (prepared.prepared) {
      throw new Error("expected SSH package to fail when the Mac cwd is missing here");
    }

    const messages = prepared.deployment
      .toState()
      .timeline.map((entry) => entry.message);
    const missing = messages.find((message) =>
      message.startsWith("Source working directory does not exist:"),
    );

    expect(missing).toBe(`Source working directory does not exist: ${locator}`);
    expect(missing).toContain(hyphenatedStaticLeaf);
    expect(missing).not.toBe(`Source working directory does not exist: ${parent}`);
    expect(prepared.deployment.toState().runtimePlan.execution.metadata?.errorCode).toBe(
      "source_workdir_missing",
    );
  });

  test("[DEP-CREATE-PKG-007][QUICK-DEPLOY-ENTRY-008B] SSH package uses originalLocator when locator, workdir, and metadata are the parent live shape", async () => {
    const parent = "/Users/nichenqin/projects";
    const leaf = "nux-67e3a052-static";
    const folder = join(parent, leaf);
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-pkg-007-live-"));
    const hostParent = join(hostRoot, "projects");
    const hostFolder = join(hostParent, leaf);
    mkdirSync(join(hostFolder, "public"), { recursive: true });
    writeFileSync(join(hostFolder, "public", "index.html"), "<!doctype html><title>ok</title>");

    try {
      process.chdir(runtimeDir);

      const packaged = resolveSshPackageLocalWorkdir({
        locator: parent,
        workingDirectory: parent,
        displayName: "workspace",
        originalLocator: hostFolder,
      });
      expect(packaged).toBe(hostFolder);
      expect(packaged).not.toBe(parent);
      expect(existsSync(packaged)).toBe(true);
      expect(existsSync(join(packaged, "public", "index.html"))).toBe(true);

      const fromProjectsDisplayName = resolveSshPackageLocalWorkdir({
        locator: parent,
        workingDirectory: parent,
        displayName: "projects",
        originalLocator: hostFolder,
      });
      expect(fromProjectsDisplayName).toBe(hostFolder);

      const archive = join(runtimeDir, "source.tgz");
      const packed = spawnSync("tar", ["-czf", archive, "-C", packaged, "."], {
        encoding: "utf8",
      });
      expect(packed.status).toBe(0);
      const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
      expect(listing.status).toBe(0);
      expect(listing.stdout).toContain("public/index.html");
      expect(listing.stdout.split("\n").some((line) => line.endsWith("/projects"))).toBe(false);

      const missing = resolveSshPackageLocalWorkdir({
        locator: parent,
        workingDirectory: parent,
        displayName: "workspace",
        originalLocator: folder,
      });
      expect(missing).toBe(folder);
      expect(missing).toContain(leaf);
      expect(`Source working directory does not exist: ${missing}`).toContain(leaf);
      expect(`Source working directory does not exist: ${missing}`).not.toBe(
        `Source working directory does not exist: ${parent}`,
      );

      const deployment = runningStaticSshDeployment({
        deploymentId: "dep_67e3a052_live",
        locator: parent,
        workingDirectory: parent,
        omitDisplayName: true,
        originalLocator: folder,
      });
      expect(deployment.toState().runtimePlan.source.metadata?.cliResolvedSource).toBeUndefined();
      const backend = new SshExecutionBackend(
        runtimeDir,
        { warn: () => undefined } as never,
        { record: async () => ({ isErr: () => false }) } as never,
        { report: () => undefined } as never,
      );
      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_007_live_original", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_67e3a052_live",
          target: { host: "deploy@example.test", publicHost: "example.test", port: "22" },
          env: {},
        },
      );

      expect(prepared.prepared).toBe(false);
      if (prepared.prepared) {
        throw new Error("expected SSH package to fail when the Mac cwd is missing here");
      }
      const messages = prepared.deployment.toState().timeline.map((entry) => entry.message);
      const missingMessage = messages.find((message) =>
        message.startsWith("Source working directory does not exist:"),
      );
      expect(missingMessage).toBe(`Source working directory does not exist: ${folder}`);
      expect(missingMessage).toContain(leaf);
      expect(missingMessage).not.toBe(`Source working directory does not exist: ${parent}`);
      expect(prepared.deployment.toState().runtimePlan.execution.metadata?.errorCode).toBe(
        "source_workdir_missing",
      );
    } finally {
      process.chdir(previousCwd);
      rmSync(hostRoot, { recursive: true, force: true });
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-007] SSH package exists-check uses the CLI-resolved source when locator and workdir are already the parent, displayName is omitted, and cwd is runtimeDir", async () => {
    const parent = "/Users/nichenqin/projects";
    const leaf = "nux-772b6112-static";
    const cliResolvedSource = join(parent, leaf);
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    const deployment = runningStaticSshDeployment({
      deploymentId: "dep_772b6112_pkg",
      locator: parent,
      workingDirectory: parent,
      omitDisplayName: true,
      cliResolvedSource,
    });
    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    expect(deployment.toState().runtimePlan.source.locator).toBe(parent);
    expect(deployment.toState().runtimePlan.execution.workingDirectory).toBe(parent);
    expect(deployment.toState().runtimePlan.source.displayName).toBe("workspace");
    expect(deployment.toState().runtimePlan.source.displayName).not.toBe(leaf);
    expect(deployment.toState().runtimePlan.source.metadata?.cliResolvedSource).toBe(
      cliResolvedSource,
    );

    try {
      process.chdir(runtimeDir);

      const localWorkdir = resolveLocalWorkspaceWorkdir({
        workingDirectory: parent,
        locator: parent,
        metadata: { baseDirectory: "/", cliResolvedSource },
        cwd: runtimeDir,
        cliResolvedSource,
      });
      expect(localWorkdir).toBe(cliResolvedSource);
      expect(localWorkdir).toContain(leaf);
      expect(localWorkdir).not.toBe(parent);
      expect(process.cwd()).toBe(runtimeDir);
      expect(process.cwd()).not.toBe(cliResolvedSource);

      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_007_cli_resolved", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_772b6112_pkg",
          target: { host: "deploy@example.test", publicHost: "example.test", port: "22" },
          env: {},
        },
      );

      expect(prepared.prepared).toBe(false);
      if (prepared.prepared) {
        throw new Error("expected SSH package to fail when the Mac cwd is missing here");
      }

      const messages = prepared.deployment.toState().timeline.map((entry) => entry.message);
      const missing = messages.find((message) =>
        message.startsWith("Source working directory does not exist:"),
      );

      expect(missing).toBe(`Source working directory does not exist: ${cliResolvedSource}`);
      expect(missing).toContain(leaf);
      expect(missing).not.toBe(`Source working directory does not exist: ${parent}`);
      expect(missing?.endsWith("/projects")).toBe(false);
      expect(prepared.deployment.toState().runtimePlan.execution.metadata?.errorCode).toBe(
        "source_workdir_missing",
      );
    } finally {
      process.chdir(previousCwd);
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-007] SSH package exists-check and tar read the hyphenated folder that exists on disk", async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-pkg-007-host-"));
    const parent = join(hostRoot, "projects");
    const leaf = "nux-772b6112-static";
    const folder = join(parent, leaf);
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    mkdirSync(join(folder, "public"), { recursive: true });
    writeFileSync(join(folder, "public", "index.html"), "<!doctype html><title>ok</title>");

    const deployment = runningStaticSshDeployment({
      deploymentId: "dep_772b6112_disk",
      locator: parent,
      workingDirectory: parent,
      omitDisplayName: true,
      cliResolvedSource: folder,
    });
    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    try {
      process.chdir(runtimeDir);

      const localWorkdir = resolveSshPackageLocalWorkdir({
        locator: parent,
        workingDirectory: parent,
        metadata: { baseDirectory: "/", cliResolvedSource: folder },
      });
      expect(localWorkdir).toBe(folder);
      expect(localWorkdir).not.toBe(parent);
      expect(existsSync(localWorkdir)).toBe(true);
      expect(existsSync(join(localWorkdir, "public", "index.html"))).toBe(true);
      expect(process.cwd()).toBe(runtimeDir);
      expect(process.cwd()).not.toBe(folder);

      const archive = join(runtimeDir, "source.tgz");
      const packed = spawnSync("tar", ["-czf", archive, "-C", localWorkdir, "."], {
        encoding: "utf8",
      });
      expect(packed.status).toBe(0);
      const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
      expect(listing.status).toBe(0);
      expect(listing.stdout).toContain("public/index.html");
      expect(listing.stdout).not.toContain(`${leaf}/`);
      expect(listing.stdout.split("\n").some((line) => line.endsWith("/projects"))).toBe(false);

      const uploadCommand = buildLocalWorkspaceUploadCommand({
        localWorkdir,
        remotePrepareCommand: "mkdir -p /var/lib/appaloft/runtime/source",
        sshArgs: ["-p", "22", "deploy@example.test"],
      });
      expect(uploadCommand).toContain(ash.quote(folder));
      expect(uploadCommand).not.toContain(ash.quote(parent));

      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_007_disk", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_772b6112_disk",
          target: { host: "127.0.0.1", publicHost: "127.0.0.1", port: "1" },
          env: {},
        },
      );

      const messages = prepared.prepared
        ? []
        : prepared.deployment.toState().timeline.map((entry) => entry.message);
      expect(
        messages.some((message) =>
          message.startsWith("Source working directory does not exist:"),
        ),
      ).toBe(false);
      expect(messages.some((message) => message.endsWith(parent))).toBe(false);
      if (!prepared.prepared) {
        expect(prepared.deployment.toState().runtimePlan.execution.metadata?.errorCode).not.toBe(
          "source_workdir_missing",
        );
      }
    } finally {
      process.chdir(previousCwd);
      rmSync(hostRoot, { recursive: true, force: true });
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-007] SSH package exists-check reconstructs the hyphenated folder when locator and workdir are already the parent and cwd is runtimeDir", async () => {
    const parent = "/Users/nichenqin/projects";
    const leaf = "nux-54065181-static";
    const expected = join(parent, leaf);
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    const deployment = runningStaticSshDeployment({
      deploymentId: "dep_54065181_pkg",
      locator: parent,
      workingDirectory: parent,
      displayName: leaf,
    });
    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    expect(deployment.toState().runtimePlan.source.locator).toBe(parent);
    expect(deployment.toState().runtimePlan.execution.workingDirectory).toBe(parent);
    expect(deployment.toState().runtimePlan.source.displayName).toBe(leaf);

    try {
      process.chdir(runtimeDir);

      const localWorkdir = resolveLocalWorkspaceWorkdir({
        workingDirectory: parent,
        locator: parent,
        displayName: leaf,
        metadata: { baseDirectory: "/" },
      });
      expect(localWorkdir).toBe(expected);
      expect(localWorkdir).toContain(leaf);
      expect(localWorkdir).not.toBe(parent);
      expect(process.cwd()).toBe(runtimeDir);
      expect(process.cwd()).not.toBe(expected);

      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_007_runtime_dir", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_54065181_pkg",
          target: { host: "deploy@example.test", publicHost: "example.test", port: "22" },
          env: {},
        },
      );

      expect(prepared.prepared).toBe(false);
      if (prepared.prepared) {
        throw new Error("expected SSH package to fail when the Mac cwd is missing here");
      }

      const messages = prepared.deployment.toState().timeline.map((entry) => entry.message);
      const missing = messages.find((message) =>
        message.startsWith("Source working directory does not exist:"),
      );

      expect(missing).toBe(`Source working directory does not exist: ${expected}`);
      expect(missing).toContain(leaf);
      expect(missing).not.toBe(`Source working directory does not exist: ${parent}`);
      expect(missing?.endsWith("/projects")).toBe(false);
      expect(prepared.deployment.toState().runtimePlan.execution.metadata?.errorCode).toBe(
        "source_workdir_missing",
      );
    } finally {
      process.chdir(previousCwd);
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-007][QUICK-DEPLOY-ENTRY-008B] detached worker applies the CLI-host archive when the hyphenated cwd is absent", async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-pkg-007-cli-pack-"));
    const parent = join(hostRoot, "projects");
    const leaf = "nux-055483c0-static";
    const folder = join(parent, leaf);
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    mkdirSync(join(folder, "public"), { recursive: true });
    writeFileSync(join(folder, "public", "index.html"), "<!doctype html><title>ok</title>");

    const archiveFile = join(hostRoot, "source.tgz");
    const packed = spawnSync("tar", ["-czf", archiveFile, "-C", folder, "."], {
      encoding: "utf8",
    });
    expect(packed.status).toBe(0);
    const packedSourceArchive = readFileSync(archiveFile).toString("base64");
    expect(packedSourceArchive.length).toBeGreaterThan(0);

    rmSync(folder, { recursive: true, force: true });
    expect(existsSync(folder)).toBe(false);
    expect(existsSync(join(folder, "public", "index.html"))).toBe(false);

    const listingArchive = materializeCliPackedSourceArchive({
      runtimeDir,
      packedSourceArchive,
    });
    const listing = spawnSync("tar", ["-tzf", listingArchive], { encoding: "utf8" });
    expect(listing.status).toBe(0);
    expect(listing.stdout).toContain("public/index.html");
    expect(listing.stdout).not.toContain(`${leaf}/`);
    expect(listing.stdout.split("\n").some((line) => line.endsWith("/projects"))).toBe(false);

    const macParent = "/Users/nichenqin/projects";
    const deployment = runningStaticSshDeployment({
      deploymentId: "dep_055483c0_packed",
      locator: macParent,
      workingDirectory: macParent,
      omitDisplayName: true,
      emptyMetadata: true,
      packedSourceArchive,
    });
    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    try {
      process.chdir(runtimeDir);
      expect(process.cwd()).toBe(runtimeDir);
      expect(existsSync(folder)).toBe(false);
      expect(existsSync(macParent)).toBe(false);

      const uploadCommand = buildPackedSourceUploadCommand({
        localArchivePath: listingArchive,
        remotePrepareCommand: "mkdir -p /var/lib/appaloft/runtime/source",
        sshArgs: ["-p", "22", "deploy@example.test"],
      });
      expect(uploadCommand).toContain(listingArchive);
      expect(uploadCommand).not.toContain(macParent);
      expect(uploadCommand).not.toContain(folder);

      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_007_cli_packed", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_055483c0_packed",
          target: { host: "127.0.0.1", publicHost: "127.0.0.1", port: "1" },
          env: {},
        },
      );

      const messages = prepared.prepared
        ? []
        : prepared.deployment.toState().timeline.map((entry) => entry.message);
      expect(
        messages.some((message) =>
          message.startsWith("Source working directory does not exist:"),
        ),
      ).toBe(false);
      expect(messages.some((message) => message.endsWith(macParent))).toBe(false);
      expect(messages.some((message) => message.endsWith("/projects"))).toBe(false);
      if (!prepared.prepared) {
        expect(prepared.deployment.toState().runtimePlan.execution.metadata?.errorCode).not.toBe(
          "source_workdir_missing",
        );
        expect(prepared.deployment.toState().runtimePlan.execution.metadata?.url).toBeUndefined();
        expect(
          prepared.deployment.toState().runtimePlan.execution.metadata?.publicUrl,
        ).toBeUndefined();
      }
    } finally {
      process.chdir(previousCwd);
      rmSync(hostRoot, { recursive: true, force: true });
      rmSync(runtimeDir, { recursive: true, force: true });
    }
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

  test("[DEP-CREATE-PKG-009] skip-pack git appaloft-cloud leftover empty binding archive uploads the real Dockerfile", async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-cloud-git-"));
    const folder = join(hostRoot, "appaloft-cloud");
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    initGitWorktree(folder);
    const dockerfile = writeProductionSizedDockerfile(folder);
    expect(dockerfile.bytes).toBeGreaterThan(1000);
    const added = spawnSync("git", ["-C", folder, "add", "Dockerfile"], { encoding: "utf8" });
    expect(added.status).toBe(0);
    expect(listGitAwareWorkspaceFiles(folder)).toContain("Dockerfile");
    expect(folder.endsWith("appaloft-cloud")).toBe(true);
    expect(folder.includes("nux-")).toBe(false);

    const emptyArchiveFile = join(hostRoot, "empty.tgz");
    const emptyArchive = createEmptyGitAwareTarArchive(emptyArchiveFile).toString("base64");
    const emptyListing = spawnSync("tar", ["-tzf", emptyArchiveFile], { encoding: "utf8" });
    expect(emptyListing.status).toBe(0);
    expect(emptyListing.stdout.trim()).toBe("");
    expect(packedSourceArchiveDockerfileBytes({
      archivePath: emptyArchiveFile,
      dockerfilePath: "Dockerfile",
    })).toBeUndefined();

    const persistedPlan = runningDockerfileSshDeployment({
      deploymentId: "dep_skip_pack_leftover",
      locator: folder,
      workingDirectory: folder,
      displayName: "appaloft-cloud",
      emptyMetadata: true,
    });
    expect(persistedPlan.toState().runtimePlan.source.metadata).toBeUndefined();
    expect(
      persistedPlan.toState().runtimePlan.execution.metadata?.[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY],
    ).toBeUndefined();
    expect(persistedPlan.toState().runtimePlan.buildStrategy).toBe("dockerfile");
    expect(persistedPlan.toState().runtimePlan.execution.dockerfilePath).toBe("Dockerfile");

    const deployment = deploymentWithLocalFolderSourceArchiveFromResourceBinding(persistedPlan, {
      locator: folder,
      originalLocator: folder,
      metadata: { [CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]: emptyArchive },
    });
    expect(
      deployment.toState().runtimePlan.execution.metadata?.[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY],
    ).toBe(emptyArchive);

    const material = resolveSshSourceUploadMaterial({
      localWorkdir: folder,
      packedSourceArchive: emptyArchive,
    });
    expect(shouldPreferLiveGitWorkspaceOverCliPackedArchive(folder)).toBe(true);
    expect(material.kind).toBe("live-folder");
    expect(material.localWorkdir).toBe(folder);

    const liveArchivePath = join(hostRoot, "live.tgz");
    const liveArchive = createLocalWorkspaceUploadArchive({
      localWorkdir: folder,
      outputPath: liveArchivePath,
    });
    expect(liveArchive.ok).toBe(true);
    expect(liveArchive.fileCount).toBeGreaterThan(0);
    const uploadedDockerfileBytes = packedSourceArchiveDockerfileBytes({
      archivePath: liveArchivePath,
      dockerfilePath: "Dockerfile",
    });
    expect(uploadedDockerfileBytes).toBe(dockerfile.bytes);
    expect(uploadedDockerfileBytes).toBeGreaterThan(2);
    const readiness = inspectDockerfileWorkspaceUploadReadiness({
      dockerfilePath: "Dockerfile",
      localWorkdir: folder,
    });
    expect(readiness.ready).toBe(true);
    if (readiness.ready) {
      expect(readiness.source).toBe("live-folder");
      expect(readiness.dockerfileBytes).toBe(dockerfile.bytes);
    }

    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    try {
      process.chdir(runtimeDir);
      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true; source: { metadata?: Record<string, string> } }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_009_skip_pack_leftover", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_skip_pack_leftover",
          target: { host: "127.0.0.1", publicHost: "127.0.0.1", port: "1" },
          env: {},
        },
      );

      expect(existsSync(join(runtimeDir, "cli-source.tgz"))).toBe(false);
      expect(prepared.prepared).toBe(false);
      if (prepared.prepared) {
        throw new Error("expected SSH to the closed test port to fail after live-folder materialize");
      }
      const failed = prepared.deployment.toState();
      expect(failed.runtimePlan.execution.metadata?.archiveApplied).toBe("no");
      expect(failed.runtimePlan.execution.metadata?.errorCode).toBe("ssh_source_upload_failed");
      expect(failed.timeline.some((entry) => entry.message === "Remote source workspace is ready")).toBe(
        false,
      );
      expect(
        failed.timeline.some((entry) =>
          entry.message.includes(sshDockerfileMissingInUploadedWorkspaceMessage("Dockerfile")),
        ),
      ).toBe(false);
    } finally {
      process.chdir(previousCwd);
      rmSync(hostRoot, { recursive: true, force: true });
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-010] empty git-aware tar does not report dockerfile workspace ready", async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-empty-git-"));
    const folder = join(hostRoot, "appaloft-empty-git");
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    initGitWorktree(folder);
    expect(folder.includes("nux-")).toBe(false);
    expect(listGitAwareWorkspaceFiles(folder)).toEqual([]);

    const emptyArchiveFile = join(hostRoot, "empty.tgz");
    const emptyBytes = createEmptyGitAwareTarArchive(emptyArchiveFile);
    const emptyListing = spawnSync("tar", ["-tzf", emptyArchiveFile], { encoding: "utf8" });
    expect(emptyListing.status).toBe(0);
    expect(emptyListing.stdout.trim()).toBe("");
    expect(
      inspectDockerfileWorkspaceUploadReadiness({
        dockerfilePath: "Dockerfile",
        packedArchivePath: emptyArchiveFile,
      }).ready,
    ).toBe(false);
    expect(
      packedSourceArchiveDockerfileBytes({
        archivePath: emptyArchiveFile,
        dockerfilePath: "Dockerfile",
      }),
    ).toBeUndefined();

    const liveEmptyArchive = join(hostRoot, "live-empty.tgz");
    const liveCreated = createLocalWorkspaceUploadArchive({
      localWorkdir: folder,
      outputPath: liveEmptyArchive,
    });
    expect(liveCreated.ok).toBe(true);
    expect(liveCreated.fileCount).toBe(0);
    expect(
      inspectDockerfileWorkspaceUploadReadiness({
        dockerfilePath: "Dockerfile",
        localWorkdir: folder,
      }),
    ).toEqual({
      ready: false,
      reason: "git_aware_file_list_empty",
      message: "git-aware workspace file list is empty",
    });

    const presenceCommand = buildRemoteDockerfilePresenceCommand({
      remoteWorkdir: "/var/lib/appaloft/runtime/ssh-deployments/dep_empty_git/source",
      dockerfilePath: "Dockerfile",
    });
    expect(presenceCommand).toContain("test -s");
    expect(presenceCommand).toContain(sshDockerfileMissingInUploadedWorkspaceMessage("Dockerfile"));

    const deployment = runningDockerfileSshDeployment({
      deploymentId: "dep_empty_git",
      locator: folder,
      workingDirectory: folder,
      displayName: "appaloft-empty-git",
      emptyMetadata: true,
      executionPackedSourceArchive: emptyBytes.toString("base64"),
    });
    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    try {
      process.chdir(runtimeDir);
      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_010_empty_git", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_empty_git",
          target: { host: "127.0.0.1", publicHost: "127.0.0.1", port: "1" },
          env: {},
        },
      );

      expect(prepared.prepared).toBe(false);
      if (prepared.prepared) {
        throw new Error("expected empty git-aware dockerfile workspace to fail closed");
      }
      const failed = prepared.deployment.toState();
      expect(failed.timeline.some((entry) => entry.message === "Remote source workspace is ready")).toBe(
        false,
      );
      expect(failed.runtimePlan.execution.metadata?.errorCode).toBe("ssh_source_upload_failed");
      expect(failed.runtimePlan.execution.metadata?.dockerfileReadiness).toBe(
        "git_aware_file_list_empty",
      );
      expect(failed.timeline.some((entry) => entry.message === "git-aware workspace file list is empty")).toBe(
        true,
      );
    } finally {
      process.chdir(previousCwd);
      rmSync(hostRoot, { recursive: true, force: true });
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-010] leftover empty packed archive without a live folder fails closed", async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-empty-packed-"));
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    const emptyArchiveFile = join(hostRoot, "empty.tgz");
    const emptyArchive = createEmptyGitAwareTarArchive(emptyArchiveFile).toString("base64");
    const missingLeaf = "/Users/nichenqin/projects/appaloft-cloud";
    expect(existsSync(missingLeaf)).toBe(false);
    expect(missingLeaf.includes("nux-")).toBe(false);

    const deployment = runningDockerfileSshDeployment({
      deploymentId: "dep_empty_packed_detached",
      locator: missingLeaf,
      workingDirectory: missingLeaf,
      displayName: "appaloft-cloud",
      emptyMetadata: true,
      executionPackedSourceArchive: emptyArchive,
    });
    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      { report: () => undefined } as never,
    );

    try {
      process.chdir(runtimeDir);
      const prepared = await (
        backend as never as {
          prepareSshSource: (
            context: ExecutionContext,
            current: Deployment,
            timeline: unknown[],
            input: {
              runtimeDir: string;
              remoteRoot: string;
              target: { host: string; publicHost: string; port: string };
              env: NodeJS.ProcessEnv;
            },
          ) => Promise<
            | { prepared: true }
            | { prepared: false; deployment: Deployment }
          >;
        }
      ).prepareSshSource(
        { requestId: "req_pkg_010_empty_packed", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_empty_packed_detached",
          target: { host: "127.0.0.1", publicHost: "127.0.0.1", port: "1" },
          env: {},
        },
      );

      expect(prepared.prepared).toBe(false);
      if (prepared.prepared) {
        throw new Error("expected empty leftover archive to fail before reporting ready");
      }
      const failed = prepared.deployment.toState();
      expect(failed.timeline.some((entry) => entry.message === "Remote source workspace is ready")).toBe(
        false,
      );
      expect(failed.runtimePlan.execution.metadata?.errorCode).toBe("ssh_source_upload_failed");
      expect(failed.runtimePlan.execution.metadata?.dockerfileReadiness).toBe("dockerfile_missing");
      expect(
        failed.timeline.some((entry) =>
          entry.message === sshDockerfileMissingInUploadedWorkspaceMessage("Dockerfile"),
        ),
      ).toBe(true);
    } finally {
      process.chdir(previousCwd);
      rmSync(hostRoot, { recursive: true, force: true });
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-009] skip-pack git appaloft-cloud leftover binding extracts over SSH and docker -f matches presence", async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-cloud-git-ready-"));
    const folder = join(hostRoot, "appaloft-cloud");
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const remoteRoot = mkdtempSync(join(tmpdir(), "appaloft-remote-"));
    const sshBin = mkdtempSync(join(tmpdir(), "appaloft-ssh-bin-"));
    const previousCwd = process.cwd();
    writeLocalSshShim(sshBin);
    initGitWorktree(folder);
    const dockerfile = writeProductionSizedDockerfile(folder);
    expect(dockerfile.bytes).toBeGreaterThan(1000);
    const added = spawnSync("git", ["-C", folder, "add", "Dockerfile"], { encoding: "utf8" });
    expect(added.status).toBe(0);
    expect(listGitAwareWorkspaceFiles(folder)).toContain("Dockerfile");
    expect(folder.endsWith("appaloft-cloud")).toBe(true);
    expect(folder.includes("nux-")).toBe(false);

    const emptyArchiveFile = join(hostRoot, "empty.tgz");
    const emptyArchive = createEmptyGitAwareTarArchive(emptyArchiveFile).toString("base64");
    const persistedPlan = runningDockerfileSshDeployment({
      deploymentId: "dep_skip_pack_ready",
      locator: folder,
      workingDirectory: folder,
      displayName: "appaloft-cloud",
      emptyMetadata: true,
    });
    expect(persistedPlan.toState().resourceId.value).toBe("res_jsb186k9hriq");
    const deployment = deploymentWithLocalFolderSourceArchiveFromResourceBinding(persistedPlan, {
      locator: folder,
      originalLocator: folder,
      metadata: { [CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]: emptyArchive },
    });
    expect(shouldPreferLiveGitWorkspaceOverCliPackedArchive(folder)).toBe(true);

    const { reports, reporter } = capturingProgressReporter();
    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      reporter as never,
    );

    try {
      process.chdir(runtimeDir);
      const prepared = await (backend as never as PrepareSshSourceBackend).prepareSshSource(
        { requestId: "req_pkg_009_skip_pack_ready", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot,
          target: { host: "127.0.0.1", publicHost: "127.0.0.1", port: "22" },
          env: {
            ...process.env,
            PATH: `${sshBin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
          },
        },
      );

      expect(existsSync(join(runtimeDir, "cli-source.tgz"))).toBe(false);
      expect(prepared.prepared).toBe(true);
      if (!prepared.prepared) {
        throw new Error("expected live git skip-pack extract to report remote workspace ready");
      }

      expect(reports.some((entry) => entry.message === "Remote source workspace is ready")).toBe(
        true,
      );
      expect(
        reports.some(
          (entry) => entry.message === "Remote source workspace is ready" && entry.status === "succeeded",
        ),
      ).toBe(true);

      const remoteWorkdir = prepared.source.remoteWorkdir ?? `${remoteRoot}/source`;
      const extractedDockerfile = join(remoteWorkdir, "Dockerfile");
      expect(existsSync(extractedDockerfile)).toBe(true);
      expect(statSync(extractedDockerfile).size).toBe(dockerfile.bytes);
      expect(statSync(extractedDockerfile).size).toBeGreaterThan(2);

      const presencePath = sshDockerBuildDockerfilePath(remoteWorkdir, "Dockerfile");
      const presenceCommand = buildRemoteDockerfilePresenceCommand({
        remoteWorkdir,
        dockerfilePath: "Dockerfile",
      });
      expect(presencePath).toBe(sshDockerUploadedWorkspaceFilePath(remoteWorkdir, "Dockerfile"));
      expect(presencePath).toBe(`${remoteWorkdir}/Dockerfile`);
      expect(presenceCommand).toContain(ash.quote(presencePath));

      const buildCommand = renderRuntimeCommandString(
        RuntimeCommandBuilder.docker().buildImage({
          image: "appaloft-image-dep_skip_pack_ready:latest",
          dockerfilePath: presencePath,
          contextPath: sshDockerUploadedWorkspaceContextPath(remoteWorkdir),
        }),
        { quote: ash.quote },
      );
      expect(buildCommand).toContain(`-f '${presencePath}'`);
      expect(buildCommand).not.toMatch(/-f 'Dockerfile'(?:\s|$)/u);
      expect(buildCommand).toContain(`'${remoteWorkdir}'`);
    } finally {
      process.chdir(previousCwd);
      rmSync(hostRoot, { recursive: true, force: true });
      rmSync(runtimeDir, { recursive: true, force: true });
      rmSync(remoteRoot, { recursive: true, force: true });
      rmSync(sshBin, { recursive: true, force: true });
    }
  });

  test("[DEP-CREATE-PKG-010] leftover empty archive on reconstructed leaf/resourceName does not report ready", async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "appaloft-empty-reconstructed-"));
    const runtimeDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-"));
    const previousCwd = process.cwd();
    const emptyArchiveFile = join(hostRoot, "empty.tgz");
    const emptyArchive = createEmptyGitAwareTarArchive(emptyArchiveFile).toString("base64");
    const parent = "/Users/nichenqin/projects";
    const leaf = "appaloft-cloud";
    const resourceName = "res_jsb186k9hriq";
    const locator = `${parent}/${leaf}`;
    const reconstructed = `${locator}/${resourceName}`;
    expect(existsSync(locator)).toBe(false);
    expect(existsSync(reconstructed)).toBe(false);
    expect(
      resolveSshPackageLocalWorkdir({
        locator,
        workingDirectory: locator,
        displayName: "workspace",
        resourceName,
      }),
    ).toBe(reconstructed);

    const deployment = runningDockerfileSshDeployment({
      deploymentId: "dep_empty_reconstructed_leaf",
      locator,
      workingDirectory: locator,
      omitDisplayName: true,
      emptyMetadata: true,
      resourceName,
      executionPackedSourceArchive: emptyArchive,
    });
    expect(deployment.toState().runtimePlan.source.metadata?.originalLocator).toBeUndefined();
    expect(deployment.toState().resourceId.value).toBe("res_jsb186k9hriq");

    const { reports, reporter } = capturingProgressReporter();
    const backend = new SshExecutionBackend(
      runtimeDir,
      { warn: () => undefined } as never,
      { record: async () => ({ isErr: () => false }) } as never,
      reporter as never,
    );

    try {
      process.chdir(runtimeDir);
      const prepared = await (backend as never as PrepareSshSourceBackend).prepareSshSource(
        { requestId: "req_pkg_010_reconstructed_leaf", entrypoint: "cli" } as ExecutionContext,
        deployment,
        [],
        {
          runtimeDir,
          remoteRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_empty_reconstructed_leaf",
          target: { host: "127.0.0.1", publicHost: "127.0.0.1", port: "1" },
          env: {},
        },
      );

      expect(prepared.prepared).toBe(false);
      if (prepared.prepared) {
        throw new Error("expected leftover empty archive on reconstructed leaf/resourceName to fail closed");
      }
      expect(reports.some((entry) => entry.message === "Remote source workspace is ready")).toBe(
        false,
      );
      const failed = prepared.deployment.toState();
      expect(failed.timeline.some((entry) => entry.message === "Remote source workspace is ready")).toBe(
        false,
      );
      expect(failed.runtimePlan.execution.metadata?.errorCode).toBe("ssh_source_upload_failed");
      expect(failed.runtimePlan.execution.metadata?.dockerfileReadiness).toBe("dockerfile_missing");
      expect(
        failed.timeline.some(
          (entry) => entry.message === sshDockerfileMissingInUploadedWorkspaceMessage("Dockerfile"),
        ),
      ).toBe(true);
    } finally {
      process.chdir(previousCwd);
      rmSync(hostRoot, { recursive: true, force: true });
      rmSync(runtimeDir, { recursive: true, force: true });
    }
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

  test("[DEP-CREATE-PKG-009] dockerfile strategy -f is the uploaded workspace Dockerfile, not a CWD-relative path", () => {
    const remoteWorkdir = "/var/lib/appaloft/runtime/ssh-deployments/dep_jsb186k9hriq/source";
    const presencePath = sshDockerBuildDockerfilePath(remoteWorkdir, "Dockerfile");
    const presenceCommand = buildRemoteDockerfilePresenceCommand({
      remoteWorkdir,
      dockerfilePath: "Dockerfile",
    });
    const spec = RuntimeCommandBuilder.docker().buildImage({
      image: "appaloft-image-dep_jsb186k9hriq:latest",
      dockerfilePath: presencePath,
      contextPath: sshDockerUploadedWorkspaceContextPath(remoteWorkdir),
    });
    const command = renderRuntimeCommandString(spec, { quote: ash.quote });

    expect(presencePath).toBe(`${remoteWorkdir}/Dockerfile`);
    expect(presencePath).toBe(sshDockerUploadedWorkspaceFilePath(remoteWorkdir, "Dockerfile"));
    expect(presenceCommand).toContain(ash.quote(presencePath));
    expect(command).toContain(`-f '${presencePath}'`);
    expect(command).not.toMatch(/-f 'Dockerfile'(?:\s|$)/u);
    expect(command).toContain(`'${remoteWorkdir}'`);
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
