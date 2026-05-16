import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cliPath = join(import.meta.dir, "../bin/appaloft-skills.js");
const repositorySkillsRoot = join(import.meta.dir, "../../../skills");
const packageSkillsRoot = join(import.meta.dir, "../skills");

function runCli(args: string[], env: Record<string, string> = {}) {
  return Bun.spawnSync(["node", cliPath, ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
}

function listFiles(root: string, prefix = ""): string[] {
  return readdirSync(join(root, prefix))
    .flatMap((entry) => {
      const relativePath = join(prefix, entry);
      const absolutePath = join(root, relativePath);
      if (statSync(absolutePath).isDirectory()) {
        return listFiles(root, relativePath);
      }
      return [relativePath];
    })
    .sort();
}

function expectSkillMirror(skillName: string) {
  const repositorySkill = join(repositorySkillsRoot, skillName);
  const packageSkill = join(packageSkillsRoot, skillName);
  const repositoryFiles = listFiles(repositorySkill);
  const packageFiles = listFiles(packageSkill);

  expect(packageFiles).toEqual(repositoryFiles);
  for (const relativePath of repositoryFiles) {
    expect(readFileSync(join(packageSkill, relativePath), "utf8")).toBe(
      readFileSync(join(repositorySkill, relativePath), "utf8"),
    );
  }
}

describe("@appaloft/skills installer", () => {
  test("[APPALOFT-SKILL-INSTALL-001] installs the full Appaloft skill through the direct fallback", async () => {
    const target = mkdtempSync(join(tmpdir(), "appaloft-skill-"));
    try {
      const result = runCli([
        "install",
        "appaloft/appaloft",
        "--target",
        "directory",
        "--path",
        target,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Installed skill appaloft");
      expect(await Bun.file(join(target, "appaloft", "SKILL.md")).text()).toContain(
        "name: appaloft",
      );
      expect(
        await Bun.file(join(target, "appaloft", "references", "cli-entrypoints.md")).text(),
      ).toContain("appaloft deploy [path-or-source]");
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test("[AGENT-SKILL-INSTALL-001] installs the deploy skill into a directory target", async () => {
    const target = mkdtempSync(join(tmpdir(), "appaloft-agent-skill-"));
    try {
      const result = runCli([
        "install",
        "appaloft/deploy",
        "--target",
        "directory",
        "--path",
        target,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Installed skill appaloft-deploy");
      expect(await Bun.file(join(target, "appaloft-deploy", "SKILL.md")).text()).toContain(
        "name: appaloft-deploy",
      );
      expect(
        await Bun.file(join(target, "appaloft-deploy", "references", "protocol.md")).text(),
      ).toContain("appaloft deploy ./dist --as static-site");
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test("[AGENT-SKILL-INSTALL-002] refuses to overwrite without force", () => {
    const target = mkdtempSync(join(tmpdir(), "appaloft-agent-skill-"));
    try {
      expect(
        runCli(["install", "deploy", "--target", "directory", "--path", target]).exitCode,
      ).toBe(0);

      const result = runCli(["install", "deploy", "--target", "directory", "--path", target]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("Re-run with --force");
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test("[AGENT-SKILL-INSTALL-003] uses CODEX_HOME for the codex target", async () => {
    const codexHome = mkdtempSync(join(tmpdir(), "appaloft-codex-home-"));
    try {
      const result = runCli(["install", "deploy", "--target", "codex"], { CODEX_HOME: codexHome });

      expect(result.exitCode).toBe(0);
      expect(
        await Bun.file(join(codexHome, "skills", "appaloft-deploy", "SKILL.md")).text(),
      ).toContain("Appaloft Deploy");
    } finally {
      rmSync(codexHome, { recursive: true, force: true });
    }
  });

  test("[AGENT-SKILL-INSTALL-004] describes installation as file copy, not deployment", () => {
    const result = runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("copies skill files only");
    expect(result.stdout.toString()).toContain("does not run deployments");
    expect(result.stdout.toString()).toContain("npx skills add appaloft/appaloft");
  });

  test("[AGENT-SKILL-SOURCE-001] mirrors standard repository skill sources into the npm fallback package", () => {
    expectSkillMirror("appaloft");
    expectSkillMirror("appaloft-deploy");
  });

  test("[AGENT-SKILL-SOURCE-002] keeps the short repository install focused on the public Appaloft skill", () => {
    expect(readFileSync(join(repositorySkillsRoot, "appaloft", "SKILL.md"), "utf8")).not.toContain(
      "internal: true",
    );
    expect(
      readFileSync(join(repositorySkillsRoot, "appaloft-deploy", "SKILL.md"), "utf8"),
    ).toContain("internal: true");
    expect(
      readFileSync(join(repositorySkillsRoot, "domain-driven-develop", "SKILL.md"), "utf8"),
    ).toContain("internal: true");
  });

  test("[APPALOFT-SKILL-CATALOG-001] full skill covers every CLI catalog entry", async () => {
    const operationCatalogSource = await Bun.file(
      join(import.meta.dir, "../../application/src/operation-catalog.ts"),
    ).text();
    const cliEntryReference = await Bun.file(
      join(repositorySkillsRoot, "appaloft/references/cli-entrypoints.md"),
    ).text();
    const cliCommands = [...operationCatalogSource.matchAll(/cli: "([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(cliCommands.length).toBeGreaterThan(150);
    for (const command of cliCommands) {
      expect(cliEntryReference).toContain(command);
    }
  });
});
