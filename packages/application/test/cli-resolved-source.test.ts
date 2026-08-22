import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DetectSummary,
  DisplayNameText,
  ExecutionStrategyKindValue,
  FilePathText,
  GeneratedAt,
  PackagingModeValue,
  PlanStepText,
  ProviderKey,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  TargetKindValue,
} from "@appaloft/core";
import {
  CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY,
  CLI_RESOLVED_SOURCE_METADATA_KEY,
  ORIGINAL_LOCATOR_METADATA_KEY,
  cliPackedSourceArchiveFromLocalSource,
  explicitCliResolvedSource,
  isGenericLocalSourceLeaf,
  localFolderSourceExecutionMetadata,
  localFolderSourceExecutionMetadataFromSource,
  localFolderSourceFieldsFromResourceBinding,
  localFolderWorkerPackageRoot,
  retainCliResolvedSource,
  retainLocalFolderSourceFields,
  retainLocalFolderSourceFieldsFromResourceBinding,
  withLocalFolderWorkerPackageRoot,
} from "../src/cli-resolved-source";

describe("CLI-resolved source", () => {
  test("[DEP-CREATE-PKG-007] does not treat a dirname'd locator as the CLI-resolved path", () => {
    const parent = "/Users/nichenqin/projects";
    const folder = `${parent}/nux-772b6112-static`;

    expect(
      explicitCliResolvedSource({
        metadata: { baseDirectory: "/" },
      }),
    ).toBeUndefined();
    expect(
      explicitCliResolvedSource({
        metadata: { [CLI_RESOLVED_SOURCE_METADATA_KEY]: folder },
      }),
    ).toBe(folder);
    expect(
      explicitCliResolvedSource({
        cliResolvedSource: folder,
        metadata: { [CLI_RESOLVED_SOURCE_METADATA_KEY]: parent },
      }),
    ).toBe(folder);
  });

  test("[DEP-CREATE-PKG-007] keeps the CLI-resolved path on a detected parent locator", () => {
    const parent = "/Users/nichenqin/projects";
    const folder = `${parent}/nux-772b6112-static`;
    const source = SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate(parent),
      displayName: DisplayNameText.rehydrate("workspace"),
      metadata: { baseDirectory: "/" },
    });

    const retained = retainCliResolvedSource(source, folder);
    expect(retained.locator).toBe(folder);
    expect(retained.metadata?.originalLocator).toBe(folder);
    expect(retained.metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY]).toBe(folder);
    expect(
      retainCliResolvedSource(source, undefined).metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY],
    ).toBe(undefined);
  });

  test("[DEP-CREATE-PKG-007] restores locator from originalLocator without cliResolvedSource", () => {
    const parent = "/Users/nichenqin/projects";
    const folder = `${parent}/nux-67e3a052-static`;
    const source = SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate(parent),
      displayName: DisplayNameText.rehydrate("workspace"),
      metadata: { baseDirectory: "/" },
    });

    const retained = retainLocalFolderSourceFields(source, { originalLocator: folder });
    expect(retained.locator).toBe(folder);
    expect(retained.metadata?.originalLocator).toBe(folder);
    expect(retained.metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY]).toBeUndefined();
  });

  test("[DEP-CREATE-PKG-007] keeps a CLI-host packed archive when locator is already the parent", () => {
    const parent = "/Users/nichenqin/projects";
    const packedSourceArchive = "H4sIAAAAAAAAAytKLSpILC4u1gMA";
    const source = SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate(parent),
      displayName: DisplayNameText.rehydrate("workspace"),
      metadata: { baseDirectory: "/" },
    });

    const retained = retainLocalFolderSourceFields(source, { packedSourceArchive });
    expect(retained.locator).toBe(parent);
    expect(retained.metadata?.[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]).toBe(packedSourceArchive);
    expect(retained.metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY]).toBeUndefined();
  });

  test("[DEP-CREATE-PKG-007] reads the CLI archive from execution.metadata when source.metadata is empty", () => {
    const packedSourceArchive = "H4sIAAAAAAAAAytKLSpILC4u1gMA";
    const folder = "/Users/nichenqin/projects/nux-04a0bb31-static";

    expect(
      cliPackedSourceArchiveFromLocalSource({
        sourceMetadata: { baseDirectory: "/" },
        executionMetadata: {
          "artifact.source": "static-site",
          [CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]: packedSourceArchive,
        },
      }),
    ).toBe(packedSourceArchive);
    expect(
      cliPackedSourceArchiveFromLocalSource({
        sourceMetadata: { baseDirectory: "/" },
      }),
    ).toBeUndefined();

    const stamped = localFolderSourceExecutionMetadata({
      workingDirectory: folder,
      packedSourceArchive,
    });
    expect(stamped[ORIGINAL_LOCATOR_METADATA_KEY]).toBe(folder);
    expect(stamped[CLI_RESOLVED_SOURCE_METADATA_KEY]).toBe(folder);
    expect(stamped[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]).toBe(packedSourceArchive);
    expect(stamped[ORIGINAL_LOCATOR_METADATA_KEY]).not.toBe("/Users/nichenqin/projects");

    const fromSource = localFolderSourceExecutionMetadataFromSource({
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate("/Users/nichenqin/projects"),
        displayName: DisplayNameText.rehydrate("projects"),
        metadata: {
          [ORIGINAL_LOCATOR_METADATA_KEY]: folder,
          [CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]: packedSourceArchive,
        },
      }),
    });
    expect(fromSource[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]).toBe(packedSourceArchive);
    expect(fromSource[ORIGINAL_LOCATOR_METADATA_KEY]).toBe(folder);
    expect(fromSource[ORIGINAL_LOCATOR_METADATA_KEY]).not.toBe("/Users/nichenqin/projects");
  });

  test("[DEP-CREATE-PKG-007] reads leaf and archive from a persisted resource binding after metadata is emptied", () => {
    const parent = "/Users/nichenqin/projects";
    const folder = `${parent}/nux-ae9c38f3-static`;
    const packedSourceArchive = "H4sIAAAAAAAAAytKLSpILC4u1gMA";
    const emptied = SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate(parent),
      displayName: DisplayNameText.rehydrate("projects"),
    });

    const fromFirstClass = localFolderSourceFieldsFromResourceBinding({
      locator: parent,
      originalLocator: folder,
    });
    expect(fromFirstClass.originalLocator).toBe(folder);
    expect(fromFirstClass.originalLocator).not.toBe(parent);
    expect(fromFirstClass.packedSourceArchive).toBeUndefined();

    const fromLocatorLeaf = localFolderSourceFieldsFromResourceBinding({
      locator: folder,
    });
    expect(fromLocatorLeaf.originalLocator).toBe(folder);

    const fromArchiveMetadata = localFolderSourceFieldsFromResourceBinding({
      locator: parent,
      metadata: { [CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]: packedSourceArchive },
    });
    expect(fromArchiveMetadata.packedSourceArchive).toBe(packedSourceArchive);

    const retained = retainLocalFolderSourceFieldsFromResourceBinding(emptied, {
      locator: parent,
      originalLocator: folder,
      metadata: { [CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]: packedSourceArchive },
    });
    expect(retained.locator).toBe(folder);
    expect(retained.locator).not.toBe(parent);
    expect(retained.metadata?.[ORIGINAL_LOCATOR_METADATA_KEY]).toBe(folder);
    expect(retained.metadata?.[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]).toBe(packedSourceArchive);
  });

  test("[DEP-CREATE-PKG-007] stamps the hyphenated leaf onto a plan that omitted workingDirectory", () => {
    const parent = "/Users/nichenqin/projects";
    const folder = `${parent}/nux-d9042824-static`;
    const packedSourceArchive = "H4sIAAAAAAAAAytKLSpILC4u1gMA";
    expect(localFolderWorkerPackageRoot({ locator: folder, originalLocator: folder })).toBe(folder);
    expect(
      localFolderWorkerPackageRoot({
        locator: folder,
        originalLocator: folder,
        workingDirectory: parent,
      }),
    ).toBe(folder);
    expect(localFolderWorkerPackageRoot({ workingDirectory: parent })).toBeUndefined();
    expect(isGenericLocalSourceLeaf("projects")).toBe(true);
    expect(isGenericLocalSourceLeaf("projects-jcPcj6")).toBe(true);
    expect(
      localFolderWorkerPackageRoot({
        locator: "/tmp/projects-jcPcj6",
        workingDirectory: "/tmp/projects-jcPcj6",
        displayName: "nux-c79876d8-static",
      }),
    ).toBe("/tmp/projects-jcPcj6/nux-c79876d8-static");

    const omitted = RuntimePlan.rehydrate({
      id: RuntimePlanId.rehydrate("plan_tu084dr7fln1"),
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate(folder),
        displayName: DisplayNameText.rehydrate("nux-d9042824-static"),
        metadata: {
          [ORIGINAL_LOCATOR_METADATA_KEY]: folder,
          [CLI_RESOLVED_SOURCE_METADATA_KEY]: folder,
          [CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]: packedSourceArchive,
        },
      }),
      buildStrategy: BuildStrategyKindValue.rehydrate("static-artifact"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
        metadata: { "artifact.source": "static-site" },
      }),
      target: DeploymentTargetDescriptor.rehydrate({
        kind: TargetKindValue.rehydrate("single-server"),
        providerKey: ProviderKey.rehydrate("generic-ssh"),
        serverIds: [DeploymentTargetId.rehydrate("srv_4lifk0yrcecy")],
      }),
      detectSummary: DetectSummary.rehydrate("Static site from public/index.html"),
      steps: [PlanStepText.rehydrate("Upload source workspace over SSH")],
      generatedAt: GeneratedAt.rehydrate("2026-08-22T01:04:23.000Z"),
    });
    expect(omitted.execution.workingDirectory).toBeUndefined();

    const stamped = withLocalFolderWorkerPackageRoot(omitted);
    expect(stamped.execution.workingDirectory).toBe(folder);
    expect(stamped.execution.workingDirectory).not.toBe(parent);

    const parentWorkdir = omitted.withExecution(
      RuntimeExecutionPlan.rehydrate({
        ...omitted.execution.toState(),
        workingDirectory: FilePathText.rehydrate(parent),
      }),
    );
    expect(withLocalFolderWorkerPackageRoot(parentWorkdir).execution.workingDirectory).toBe(folder);
  });
});
