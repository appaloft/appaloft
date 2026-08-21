import { describe, expect, test } from "bun:test";
import { DisplayNameText, SourceDescriptor, SourceKindValue, SourceLocator } from "@appaloft/core";
import {
  CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY,
  CLI_RESOLVED_SOURCE_METADATA_KEY,
  ORIGINAL_LOCATOR_METADATA_KEY,
  cliPackedSourceArchiveFromLocalSource,
  explicitCliResolvedSource,
  localFolderSourceExecutionMetadata,
  localFolderSourceExecutionMetadataFromSource,
  retainCliResolvedSource,
  retainLocalFolderSourceFields,
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
});
