import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, relative } from "node:path";

import {
  ExecuteSandboxCommand,
  ReadSandboxFileQuery,
  WriteSandboxFileCommand,
} from "@appaloft/application";
import { type Result } from "@appaloft/core";

import { resolveAppaloftSkillPath } from "./local-scratch-session.js";

export const OCCUPANCY_SKILL_ROOTS = ["skills/appaloft", ".agents/skills/appaloft"] as const;
export const OCCUPANCY_SKILL_GIT_EXCLUDES = ["/skills/", "/.agents/"] as const;
export const OCCUPANCY_HOME_SKILL_DESTINATIONS = ["skills", ".agents/skills"] as const;
export const OCCUPANCY_HOME_SKILL_MAX_FILE_BYTES = 10 * 1024 * 1024;

export const OCCUPANCY_HOME_SKILL_ROOTS = [
  { homeRelative: ".claude/skills", railwayAligned: true },
  { homeRelative: ".codex/skills", railwayAligned: true },
  { homeRelative: ".grok/skills", railwayAligned: true },
  { homeRelative: ".agents/skills", railwayAligned: true },
  { homeRelative: ".cursor/skills", railwayAligned: false },
  { homeRelative: ".config/opencode/skills", railwayAligned: false },
] as const;

// Skill-tree copy still skips auth.json, mcp.json, tokens, and cookies.
// Vendor occupancy credentials (auth.json / Claude setup-token) use
// occupancy-credential-offer.ts and write onto occupancy HOME, not skill roots.
const SKIPPED_BASENAMES = new Set([
  "mcp.json",
  ".mcp.json",
  "tokens",
  "tokens.json",
  "cookie",
  "cookies",
  "cookies.txt",
  "auth.json",
]);

const SKIPPED_EXTENSIONS = new Set([".vsix", ".exe", ".dll", ".so", ".dylib", ".node", ".bin"]);

export interface OccupancySkillFile {
  readonly relativePath: string;
  readonly content: Uint8Array;
}

export interface OccupancyHomeSkillOfferFile extends OccupancySkillFile {
  readonly skillName: string;
  readonly railwayAligned: boolean;
}

export async function listOccupancySkillFiles(
  skillDir: string,
  options?: {
    readonly skipRelativePath?: (relativePath: string) => boolean;
    readonly maxFileBytes?: number;
  },
): Promise<OccupancySkillFile[]> {
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
      const relativePath = relative(skillDir, absolute).replaceAll("\\", "/");
      if (options?.skipRelativePath?.(relativePath)) continue;
      if (options?.maxFileBytes !== undefined) {
        const info = await stat(absolute);
        if (info.size > options.maxFileBytes) continue;
      }
      files.push({
        relativePath,
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

export function isOccupancyHomeSkillSkippedFile(relativePath: string): boolean {
  for (const segment of relativePath.replaceAll("\\", "/").split("/")) {
    const base = segment.toLowerCase();
    if (SKIPPED_BASENAMES.has(base)) return true;
    if (base === ".env" || base.startsWith(".env.")) return true;
    if (SKIPPED_EXTENSIONS.has(extname(base))) return true;
  }
  return false;
}

export async function listOccupancyHomeSkillOfferFiles(
  homeDir: string,
): Promise<OccupancyHomeSkillOfferFile[]> {
  const offered: OccupancyHomeSkillOfferFile[] = [];
  const seenSkillNames = new Set<string>();

  for (const root of OCCUPANCY_HOME_SKILL_ROOTS) {
    const rootPath = join(homeDir, root.homeRelative);
    const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => undefined);
    if (!entries) continue;
    for (const entry of entries) {
      if (!entry.isDirectory() || seenSkillNames.has(entry.name)) continue;
      const skillDir = join(rootPath, entry.name);
      const skillFile = await stat(join(skillDir, "SKILL.md")).catch(() => undefined);
      if (!skillFile?.isFile()) continue;
      seenSkillNames.add(entry.name);
      const files = await listOccupancySkillFiles(skillDir, {
        skipRelativePath: isOccupancyHomeSkillSkippedFile,
        maxFileBytes: OCCUPANCY_HOME_SKILL_MAX_FILE_BYTES,
      });
      for (const file of files) {
        offered.push({
          ...file,
          skillName: entry.name,
          railwayAligned: root.railwayAligned,
        });
      }
    }
  }

  return offered;
}

export function occupancyHomeSkillDestinationExists(input: {
  readonly workspaceId: string;
  readonly executeQuery: (query: ReadSandboxFileQuery) => Promise<Result<unknown>>;
}): (path: string) => Promise<boolean> {
  return async (path) => {
    const query = ReadSandboxFileQuery.create({
      sandboxId: input.workspaceId,
      path,
    });
    if (query.isErr()) return true;
    const read = await input.executeQuery(query.value);
    return read.isOk();
  };
}

async function writeOccupancySkillFiles(input: {
  readonly workspaceId: string;
  readonly destinations: readonly string[];
  readonly files: readonly OccupancySkillFile[];
  readonly executeCommand: (
    command: WriteSandboxFileCommand | ExecuteSandboxCommand,
  ) => Promise<Result<unknown>>;
  readonly destinationExists?: (path: string) => Promise<boolean>;
}): Promise<{ readonly written: number; readonly skippedExisting: number } | undefined> {
  let written = 0;
  let skippedExisting = 0;
  for (const destination of input.destinations) {
    for (const file of input.files) {
      const path = `${destination}/${file.relativePath}`;
      if (input.destinationExists && (await input.destinationExists(path))) {
        skippedExisting += 1;
        continue;
      }
      const command = WriteSandboxFileCommand.create({
        sandboxId: input.workspaceId,
        path,
        contentBase64: Buffer.from(file.content).toString("base64"),
      });
      if (command.isErr()) return undefined;
      const result = await input.executeCommand(command.value);
      if (result.isErr()) return undefined;
      written += 1;
    }
  }
  return { written, skippedExisting };
}

async function gitExcludeOccupancySkills(input: {
  readonly workspaceId: string;
  readonly executeCommand: (
    command: WriteSandboxFileCommand | ExecuteSandboxCommand,
  ) => Promise<Result<unknown>>;
}): Promise<boolean> {
  const exclude = ExecuteSandboxCommand.create({
    sandboxId: input.workspaceId,
    argv: ["sh", "-lc", occupancySkillGitExcludeScript()],
    timeoutMs: 15_000,
  });
  if (exclude.isErr()) return false;
  const excluded = await input.executeCommand(exclude.value);
  return excluded.isOk();
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

  const written = await writeOccupancySkillFiles({
    workspaceId: input.workspaceId,
    destinations: OCCUPANCY_SKILL_ROOTS,
    files,
    executeCommand: input.executeCommand,
  });
  if (!written) return { offered: false, fileCount: 0 };
  if (!(await gitExcludeOccupancySkills(input))) return { offered: false, fileCount: 0 };
  return { offered: true, fileCount: written.written };
}

export async function offerOccupancyHomeSkills(input: {
  readonly workspaceId: string;
  readonly homeDir?: string;
  readonly executeCommand: (
    command: WriteSandboxFileCommand | ExecuteSandboxCommand,
  ) => Promise<Result<unknown>>;
  readonly destinationExists: (path: string) => Promise<boolean>;
}): Promise<{
  readonly offered: boolean;
  readonly fileCount: number;
  readonly skippedExisting: number;
}> {
  const files = await listOccupancyHomeSkillOfferFiles(input.homeDir ?? homedir());
  if (files.length === 0) {
    return { offered: false, fileCount: 0, skippedExisting: 0 };
  }

  let written = 0;
  let skippedExisting = 0;
  for (const file of files) {
    const result = await writeOccupancySkillFiles({
      workspaceId: input.workspaceId,
      destinations: OCCUPANCY_HOME_SKILL_DESTINATIONS.map(
        (destination) => `${destination}/${file.skillName}`,
      ),
      files: [{ relativePath: file.relativePath, content: file.content }],
      executeCommand: input.executeCommand,
      destinationExists: input.destinationExists,
    });
    if (!result) return { offered: false, fileCount: 0, skippedExisting: 0 };
    written += result.written;
    skippedExisting += result.skippedExisting;
  }

  if (written === 0) {
    return { offered: false, fileCount: 0, skippedExisting };
  }
  if (!(await gitExcludeOccupancySkills(input))) {
    return { offered: false, fileCount: 0, skippedExisting };
  }
  return { offered: true, fileCount: written, skippedExisting };
}
