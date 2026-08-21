import { describe, expect, test } from "bun:test";
import {
  isFormattablePath,
  isLintablePath,
  resolveLintBaseRef,
  selectFormatTargets,
  selectLintTargets,
} from "../ci/lint-changed";

describe("changed-file JS lint selection", () => {
  test("[LINT-CHANGED-001] selects JS/TS files and ignores rustfmt-owned Workspace TUI paths", () => {
    expect(
      selectLintTargets([
        "packages/core/src/index.ts",
        "apps/workspace-control-tui/src/main.rs",
        "docs/TESTING.md",
        "bun.lock",
      ]),
    ).toEqual(["packages/core/src/index.ts"]);
    expect(isLintablePath("packages/core/src/index.ts")).toBe(true);
    expect(isLintablePath("apps/workspace-control-tui/src/main.rs")).toBe(false);
    expect(isLintablePath("lefthook.yml")).toBe(false);
  });

  test("[LINT-CHANGED-002] formats JSON/CSS with JS but not lockfiles or Svelte", () => {
    expect(
      selectFormatTargets([
        "package.json",
        "apps/web/src/app.css",
        "apps/web/src/routes/+page.svelte",
        "bun.lock",
        "Cargo.lock",
      ]),
    ).toEqual(["apps/web/src/app.css", "package.json"]);
    expect(isFormattablePath("package.json")).toBe(true);
    expect(isFormattablePath("apps/web/src/routes/+page.svelte")).toBe(false);
  });

  test("[LINT-CHANGED-003] fail-closes when a GitHub or local lint base cannot be resolved", () => {
    expect(() =>
      resolveLintBaseRef({
        eventName: "pull_request",
        baseRef: "main",
        refExists: () => false,
      }),
    ).toThrow(/failing closed/);
    expect(() =>
      resolveLintBaseRef({
        eventName: "push",
        beforeSha: "0000000000000000000000000000000000000000",
        refExists: () => true,
      }),
    ).toThrow(/failing closed/);
    expect(() =>
      resolveLintBaseRef({
        eventName: "",
        refExists: () => false,
      }),
    ).toThrow(/failing closed/);
    expect(
      resolveLintBaseRef({
        eventName: "pull_request",
        baseRef: "main",
        refExists: (ref) => ref === "origin/main",
      }),
    ).toBe("origin/main");
    expect(
      resolveLintBaseRef({
        eventName: "",
        refExists: (ref) => ref === "origin/main",
      }),
    ).toBe("origin/main");
  });
});
