import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExecuteSandboxCommand, WriteSandboxFileCommand } from "@appaloft/application";
import { err, ok } from "@appaloft/core";

import {
  isOccupancyHomeSkillSkippedFile,
  listOccupancyHomeSkillOfferFiles,
  listOccupancySkillFiles,
  OCCUPANCY_HOME_SKILL_ROOTS,
  OCCUPANCY_SKILL_GIT_EXCLUDES,
  OCCUPANCY_SKILL_ROOTS,
  occupancySkillGitExcludeScript,
  offerOccupancyAppaloftSkill,
  offerOccupancyHomeSkills,
} from "../src/occupancy-skill-offer.js";

async function tempSkillDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "appaloft-occupancy-skill-"));
  await mkdir(join(dir, "references"), { recursive: true });
  await writeFile(join(dir, "SKILL.md"), "# Appaloft\n");
  await writeFile(join(dir, "references", "surfaces.md"), "CLI\n");
  return dir;
}

async function writeHomeSkill(
  homeDir: string,
  root: string,
  skillName: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = join(homeDir, root, skillName, relativePath);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content);
  }
}

test("[WS-REMOTE-SKILL-017] lists occupancy skill files without junk", async () => {
  const skillDir = await tempSkillDir();
  await writeFile(join(skillDir, ".DS_Store"), "junk");
  const files = await listOccupancySkillFiles(skillDir);
  expect(files.map((file) => file.relativePath).sort()).toEqual(
    ["SKILL.md", "references/surfaces.md"].sort(),
  );
});

test("[WS-REMOTE-SKILL-017] writes Appaloft skill into both occupancy roots and git-excludes them", async () => {
  const skillDir = await tempSkillDir();
  const commands: Array<WriteSandboxFileCommand | ExecuteSandboxCommand> = [];
  const offered = await offerOccupancyAppaloftSkill({
    workspaceId: "sbx_ready",
    skillDir,
    executeCommand: async (command) => {
      commands.push(command);
      return ok({});
    },
  });

  expect(offered).toEqual({ offered: true, fileCount: 4 });
  expect(commands.filter((command) => command instanceof WriteSandboxFileCommand)).toHaveLength(4);
  expect(
    commands
      .filter((command) => command instanceof WriteSandboxFileCommand)
      .map((command) => command.input.path)
      .sort(),
  ).toEqual([
    ".agents/skills/appaloft/SKILL.md",
    ".agents/skills/appaloft/references/surfaces.md",
    "skills/appaloft/SKILL.md",
    "skills/appaloft/references/surfaces.md",
  ]);
  const exclude = commands.find((command) => command instanceof ExecuteSandboxCommand);
  expect(exclude?.input.argv).toEqual(["sh", "-lc", occupancySkillGitExcludeScript()]);
  expect(OCCUPANCY_SKILL_ROOTS).toEqual(["skills/appaloft", ".agents/skills/appaloft"]);
  for (const line of OCCUPANCY_SKILL_GIT_EXCLUDES) {
    expect(occupancySkillGitExcludeScript()).toContain(line);
  }
});

test("[WS-REMOTE-SKILL-017] skill offer stays fail-soft when writes fail", async () => {
  const skillDir = await tempSkillDir();
  const offered = await offerOccupancyAppaloftSkill({
    workspaceId: "sbx_ready",
    skillDir,
    executeCommand: async () => err({ message: "sandbox unavailable" } as never),
  });
  expect(offered).toEqual({ offered: false, fileCount: 0 });
});

test("[WS-REMOTE-HOME-SKILL-182] copies only allowlisted HOME skill roots", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "appaloft-home-skills-"));
  await writeHomeSkill(homeDir, ".claude/skills", "claude-review", {
    "SKILL.md": "# Claude review\n",
  });
  await writeHomeSkill(homeDir, ".codex/skills", "codex-ship", { "SKILL.md": "# Codex ship\n" });
  await writeHomeSkill(homeDir, ".grok/skills", "grok-plan", { "SKILL.md": "# Grok plan\n" });
  await writeHomeSkill(homeDir, ".agents/skills", "agents-note", { "SKILL.md": "# Agents\n" });
  await writeHomeSkill(homeDir, ".cursor/skills", "cursor-edit", { "SKILL.md": "# Cursor\n" });
  await writeHomeSkill(homeDir, ".config/opencode/skills", "opencode-loop", {
    "SKILL.md": "# OpenCode\n",
  });
  await writeHomeSkill(homeDir, ".not-a-host/skills", "ignored", { "SKILL.md": "# No\n" });
  await writeHomeSkill(homeDir, ".cursor/skills-cursor", "plugin-only", {
    "SKILL.md": "# Plugin\n",
  });

  const listed = await listOccupancyHomeSkillOfferFiles(homeDir);
  expect(listed.map((file) => file.skillName).sort()).toEqual(
    ["agents-note", "claude-review", "codex-ship", "cursor-edit", "grok-plan", "opencode-loop"].sort(),
  );
  expect(OCCUPANCY_HOME_SKILL_ROOTS.map((root) => root.homeRelative)).toEqual([
    ".claude/skills",
    ".codex/skills",
    ".grok/skills",
    ".agents/skills",
    ".cursor/skills",
    ".config/opencode/skills",
  ]);
  expect(
    OCCUPANCY_HOME_SKILL_ROOTS.filter((root) => !root.railwayAligned).map((root) => root.homeRelative),
  ).toEqual([".cursor/skills", ".config/opencode/skills"]);

  const commands: Array<WriteSandboxFileCommand | ExecuteSandboxCommand> = [];
  const offered = await offerOccupancyHomeSkills({
    workspaceId: "sbx_ready",
    homeDir,
    executeCommand: async (command) => {
      commands.push(command);
      return ok({});
    },
    destinationExists: async () => false,
  });

  expect(offered.offered).toBe(true);
  expect(offered.fileCount).toBe(12);
  const written = commands
    .filter((command) => command instanceof WriteSandboxFileCommand)
    .map((command) => command.input.path)
    .sort();
  expect(written).toEqual([
    ".agents/skills/agents-note/SKILL.md",
    ".agents/skills/claude-review/SKILL.md",
    ".agents/skills/codex-ship/SKILL.md",
    ".agents/skills/cursor-edit/SKILL.md",
    ".agents/skills/grok-plan/SKILL.md",
    ".agents/skills/opencode-loop/SKILL.md",
    "skills/agents-note/SKILL.md",
    "skills/claude-review/SKILL.md",
    "skills/codex-ship/SKILL.md",
    "skills/cursor-edit/SKILL.md",
    "skills/grok-plan/SKILL.md",
    "skills/opencode-loop/SKILL.md",
  ]);
  expect(written.some((path) => path.includes("ignored") || path.includes("plugin-only"))).toBe(
    false,
  );
});

test("[WS-REMOTE-HOME-SKILL-183] skips missing HOME skill directories", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "appaloft-home-missing-"));
  await writeHomeSkill(homeDir, ".claude/skills", "only-claude", { "SKILL.md": "# One\n" });

  const listed = await listOccupancyHomeSkillOfferFiles(homeDir);
  expect(listed.map((file) => file.skillName)).toEqual(["only-claude"]);

  const offered = await offerOccupancyHomeSkills({
    workspaceId: "sbx_ready",
    homeDir,
    executeCommand: async () => ok({}),
    destinationExists: async () => false,
  });
  expect(offered).toEqual({ offered: true, fileCount: 2, skippedExisting: 0 });
});

test("[WS-REMOTE-HOME-SKILL-184] skips entries without SKILL.md", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "appaloft-home-noskill-"));
  await writeHomeSkill(homeDir, ".claude/skills", "readme-only", { "README.md": "# No skill\n" });
  await writeHomeSkill(homeDir, ".claude/skills", "real-skill", { "SKILL.md": "# Real\n" });
  await mkdir(join(homeDir, ".codex/skills", "empty-dir"), { recursive: true });

  const listed = await listOccupancyHomeSkillOfferFiles(homeDir);
  expect(listed.map((file) => file.skillName)).toEqual(["real-skill"]);
});

test("[WS-REMOTE-HOME-SKILL-185] skips secrets and does not upload mcp.json", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "appaloft-home-secrets-"));
  await writeHomeSkill(homeDir, ".claude/skills", "safe-skill", {
    "SKILL.md": "# Safe\n",
    "mcp.json": '{"servers":[]}',
    ".env": "TOKEN=secret",
    "tokens": "abc",
    "cookies": "session=1",
    "plugin.vsix": "binary",
    "notes.md": "keep\n",
  });

  expect(isOccupancyHomeSkillSkippedFile("mcp.json")).toBe(true);
  expect(isOccupancyHomeSkillSkippedFile(".env.local")).toBe(true);
  expect(isOccupancyHomeSkillSkippedFile("plugin.vsix")).toBe(true);
  expect(isOccupancyHomeSkillSkippedFile("SKILL.md")).toBe(false);

  const listed = await listOccupancyHomeSkillOfferFiles(homeDir);
  expect(listed.map((file) => file.relativePath).sort()).toEqual(["SKILL.md", "notes.md"]);

  const commands: Array<WriteSandboxFileCommand | ExecuteSandboxCommand> = [];
  await offerOccupancyHomeSkills({
    workspaceId: "sbx_ready",
    homeDir,
    executeCommand: async (command) => {
      commands.push(command);
      return ok({});
    },
    destinationExists: async () => false,
  });

  const written = commands
    .filter((command) => command instanceof WriteSandboxFileCommand)
    .map((command) => command.input.path);
  expect(written.sort()).toEqual([
    ".agents/skills/safe-skill/SKILL.md",
    ".agents/skills/safe-skill/notes.md",
    "skills/safe-skill/SKILL.md",
    "skills/safe-skill/notes.md",
  ]);
  expect(written.some((path) => path.endsWith("mcp.json"))).toBe(false);
  expect(written.some((path) => path.includes(".env") || path.includes("tokens"))).toBe(false);
});

test("[WS-REMOTE-HOME-SKILL-186] HOME skill offer is add-only", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "appaloft-home-addonly-"));
  await writeHomeSkill(homeDir, ".claude/skills", "existing", { "SKILL.md": "# New\n" });
  await writeHomeSkill(homeDir, ".codex/skills", "fresh", { "SKILL.md": "# Fresh\n" });

  const commands: Array<WriteSandboxFileCommand | ExecuteSandboxCommand> = [];
  const offered = await offerOccupancyHomeSkills({
    workspaceId: "sbx_ready",
    homeDir,
    executeCommand: async (command) => {
      commands.push(command);
      return ok({});
    },
    destinationExists: async (path) =>
      path === "skills/existing/SKILL.md" || path === ".agents/skills/existing/SKILL.md",
  });

  expect(offered).toEqual({ offered: true, fileCount: 2, skippedExisting: 2 });
  expect(
    commands
      .filter((command) => command instanceof WriteSandboxFileCommand)
      .map((command) => command.input.path)
      .sort(),
  ).toEqual([".agents/skills/fresh/SKILL.md", "skills/fresh/SKILL.md"]);
});

test("[WS-REMOTE-SKILL-017] first-party Appaloft offer stays independent of HOME skills", async () => {
  const skillDir = await tempSkillDir();
  const homeDir = await mkdtemp(join(tmpdir(), "appaloft-home-first-party-"));
  await writeHomeSkill(homeDir, ".agents/skills", "appaloft", {
    "SKILL.md": "# Laptop appaloft\n",
  });

  const firstParty: string[] = [];
  await offerOccupancyAppaloftSkill({
    workspaceId: "sbx_ready",
    skillDir,
    executeCommand: async (command) => {
      if (command instanceof WriteSandboxFileCommand) firstParty.push(command.input.path);
      return ok({});
    },
  });
  expect(firstParty).toEqual(
    expect.arrayContaining(["skills/appaloft/SKILL.md", ".agents/skills/appaloft/SKILL.md"]),
  );

  const homeWrites: string[] = [];
  await offerOccupancyHomeSkills({
    workspaceId: "sbx_ready",
    homeDir,
    executeCommand: async (command) => {
      if (command instanceof WriteSandboxFileCommand) homeWrites.push(command.input.path);
      return ok({});
    },
    destinationExists: async (path) => firstParty.includes(path),
  });
  expect(homeWrites).toEqual([]);
});
