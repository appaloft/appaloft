import { describe, expect, test } from "bun:test";
import { createExecutionContext } from "@appaloft/application";
import {
  DisplayNameText,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  VersionReference,
} from "@appaloft/core";
import {
  FileSystemSourceVersionDetector,
  type SourceVersionCommandResult,
  type SourceVersionCommandRunner,
} from "../src";

const context = createExecutionContext({
  entrypoint: "cli",
  requestId: "req_source_version_detector",
});

function commandResult(stdout: string, exitCode = 0): SourceVersionCommandResult {
  return { exitCode, stdout, stderr: "" };
}

describe("FileSystemSourceVersionDetector", () => {
  test("resolves a remote Git branch to a fixed commit SHA", async () => {
    const commands: string[][] = [];
    const runner: SourceVersionCommandRunner = async (command) => {
      commands.push(command);
      return commandResult("0123456789abcdef0123456789abcdef01234567\trefs/heads/develop\n");
    };
    const detector = new FileSystemSourceVersionDetector(runner);
    const requested = VersionReference.createForSource({
      sourceKind: "git",
      value: "develop",
      referenceKind: "branch",
    })._unsafeUnwrap();
    const source = SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("git-public"),
      locator: SourceLocator.rehydrate("https://github.com/acme/api.git"),
      displayName: DisplayNameText.rehydrate("api"),
    });

    const result = await detector.detect(context, { source, requestedVersion: requested });

    expect(result.isOk()).toBe(true);
    expect(commands[0]).toEqual([
      "git",
      "ls-remote",
      "https://github.com/acme/api.git",
      "refs/heads/develop",
    ]);
    if (result.isOk()) {
      expect(result.value.version.isFixed()).toBe(true);
      expect(result.value.version.reference.value).toBe("develop");
      expect(result.value.version.fixedIdentifier?.value).toBe(
        "0123456789abcdef0123456789abcdef01234567",
      );
    }
  });

  test("leaves Docker tag resolution to the runtime target result", async () => {
    const commands: string[][] = [];
    const runner: SourceVersionCommandRunner = async (command) => {
      commands.push(command);
      return commandResult("");
    };
    const detector = new FileSystemSourceVersionDetector(runner);
    const requested = VersionReference.createForSource({
      sourceKind: "docker-image",
      value: "latest",
      referenceKind: "image-tag",
    })._unsafeUnwrap();
    const source = SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("docker-image"),
      locator: SourceLocator.rehydrate("ghcr.io/acme/api:latest"),
      displayName: DisplayNameText.rehydrate("api"),
    });

    const result = await detector.detect(context, { source, requestedVersion: requested });

    expect(result.isOk()).toBe(true);
    expect(commands).toEqual([]);
    if (result.isOk()) {
      expect(result.value.version.isUnknown()).toBe(true);
      expect(result.value.reasoning).toEqual([
        "Docker image version could not be resolved to an immutable digest",
      ]);
    }
  });
});
