import "../../../application/node_modules/reflect-metadata/Reflect.js";

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

  test("resolves a Docker tag to an immutable image digest", async () => {
    const commands: string[][] = [];
    const runner: SourceVersionCommandRunner = async (command) => {
      commands.push(command);
      return command[2] === "inspect"
        ? commandResult(
            '["ghcr.io/acme/api@sha256:8b1a9953c4611296a827abf8c47804d7f6f4e6a6d7f4aaf8f6f5c6e6d7c8b9a0"]',
          )
        : commandResult("");
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
    expect(commands[0]).toEqual(["docker", "pull", "ghcr.io/acme/api:latest"]);
    expect(commands[1]).toEqual([
      "docker",
      "image",
      "inspect",
      "--format",
      "{{json .RepoDigests}}",
      "ghcr.io/acme/api:latest",
    ]);
    if (result.isOk()) {
      expect(result.value.version.isFixed()).toBe(true);
      expect(result.value.version.reference.value).toBe("latest");
      expect(result.value.version.fixedIdentifier?.value).toBe(
        "sha256:8b1a9953c4611296a827abf8c47804d7f6f4e6a6d7f4aaf8f6f5c6e6d7c8b9a0",
      );
    }
  });
});
