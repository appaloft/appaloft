import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { ExecuteSandboxCommand, WriteSandboxFileCommand } from "@appaloft/application";
import { type Result } from "@appaloft/core";

import { resolveAppaloftSkillPath } from "./local-scratch-session.js";

export const OCCUPANCY_SKILL_ROOTS = ["skills/appaloft", ".agents/skills/appaloft"] as const;
export const OCCUPANCY_SKILL_GIT_EXCLUDES = ["/skills/", "/.agents/"] as const;

export interface OccupancySkillFile {
  readonly relativePath: string;
  readonly content: Uint8Array;
}

export async function listOccupancySkillFiles(skillDir: string): Promise<OccupancySkillFile[]> {
  const files: OccupancySkillFile[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".DS_Store" || entry.name === "node_modules") continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      files.push({
        relativePath: relative(skillDir, absolute).replaceAll("\\", "/"),
        content: await readFile(absolute),
      });
    }
  };
  await visit(skillDir);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function occupancySkillGitExcludeScript(): string {
  return [
    "mkdir -p /workspace/.git/info",
    "touch /workspace/.git/info/exclude",
    ...OCCUPANCY_SKILL_GIT_EXCLUDES.map(
      (line) =>
        `grep -qxF ${shellSingleQuote(line)} /workspace/.git/info/exclude || printf '%s\\n' ${shellSingleQuote(line)} >> /workspace/.git/info/exclude`,
    ),
  ].join(" && ");
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function offerOccupancyAppaloftSkill(input: {
  readonly workspaceId: string;
  readonly skillDir?: string;
  readonly executeCommand: (
    command: WriteSandboxFileCommand | ExecuteSandboxCommand,
  ) => Promise<Result<unknown>>;
}): Promise<{ readonly offered: boolean; readonly fileCount: number }> {
  const skillDir = input.skillDir ?? resolveAppaloftSkillPath();
  if (!skillDir) return { offered: false, fileCount: 0 };
  const files = await listOccupancySkillFiles(skillDir);
  if (files.length === 0) return { offered: false, fileCount: 0 };

  for (const root of OCCUPANCY_SKILL_ROOTS) {
    for (const file of files) {
      const command = WriteSandboxFileCommand.create({
        sandboxId: input.workspaceId,
        path: `${root}/${file.relativePath}`,
        contentBase64: Buffer.from(file.content).toString("base64"),
      });
      if (command.isErr()) return { offered: false, fileCount: 0 };
      const written = await input.executeCommand(command.value);
      if (written.isErr()) return { offered: false, fileCount: 0 };
    }
  }

  const exclude = ExecuteSandboxCommand.create({
    sandboxId: input.workspaceId,
    argv: ["sh", "-lc", occupancySkillGitExcludeScript()],
    timeoutMs: 15_000,
  });
  if (exclude.isErr()) return { offered: false, fileCount: 0 };
  const excluded = await input.executeCommand(exclude.value);
  if (excluded.isErr()) return { offered: false, fileCount: 0 };
  return { offered: true, fileCount: files.length * OCCUPANCY_SKILL_ROOTS.length };
}
