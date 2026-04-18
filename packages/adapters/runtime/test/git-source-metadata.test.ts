import { describe, expect, test } from "bun:test";
import {
  parseResolvedGitCommitSha,
  shortGitCommitSha,
  sourceCommitShaMetadataKey,
} from "../src/git-source-metadata";

describe("git source metadata", () => {
  test("parses resolved git object ids from rev-parse output", () => {
    expect(
      parseResolvedGitCommitSha("57EA0764B8F0A491FD1D30BEDC5CBE281744B36C\n"),
    ).toBe("57ea0764b8f0a491fd1d30bedc5cbe281744b36c");
    expect(parseResolvedGitCommitSha("not-a-commit\n")).toBeUndefined();
  });

  test("exposes the execution metadata key used by runtime adapters", () => {
    expect(sourceCommitShaMetadataKey).toBe("source.commitSha");
    expect(shortGitCommitSha("57ea0764b8f0a491fd1d30bedc5cbe281744b36c")).toBe("57ea0764b8f0");
  });
});
