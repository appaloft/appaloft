import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExecuteSandboxCommand, WriteSandboxFileCommand } from "@appaloft/application";
import { err, ok } from "@appaloft/core";

import {
  listOccupancySkillFiles,
  OCCUPANCY_SKILL_GIT_EXCLUDES,
  OCCUPANCY_SKILL_ROOTS,
  occupancySkillGitExcludeScript,
  offerOccupancyAppaloftSkill,
} from "../src/occupancy-skill-offer.js";

async function tempSkillDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "appaloft-occupancy-skill-"));
  await mkdir(join(dir, "references"), { recursive: true });
  await writeFile(join(dir, "SKILL.md"), "# Appaloft\n");
  await writeFile(join(dir, "references", "surfaces.md"), "CLI\n");
  return dir;
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
