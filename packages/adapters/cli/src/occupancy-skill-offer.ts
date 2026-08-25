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

export const OCCUPANCY_SKILL_SOURCES = [
  "claude",
  "codex",
  "grok",
  "agents",
  "cursor",
  "opencode",
] as const;
export type OccupancySkillSource = (typeof OCCUPANCY_SKILL_SOURCES)[number];

export const OCCUPANCY_HOME_SKILL_ROOTS = [
  { source: "claude", homeRelative: ".claude/skills", railwayAligned: true },
  { source: "codex", homeRelative: ".codex/skills", railwayAligned: true },
  { source: "grok", homeRelative: ".grok/skills", railwayAligned: true },
  { source: "agents", homeRelative: ".agents/skills", railwayAligned: true },
  { source: "cursor", homeRelative: ".cursor/skills", railwayAligned: false },
  { source: "opencode", homeRelative: ".config/opencode/skills", railwayAligned: false },
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
  return files.sort(compareOccupancySkillCopyOrder);
}

export function compareOccupancySkillCopyOrder(
  left: { readonly relativePath: string },
  right: { readonly relativePath: string },
): number {
  const leftSkillMd = occupancySkillBasename(left.relativePath) === "SKILL.md" ? 0 : 1;
  const rightSkillMd = occupancySkillBasename(right.relativePath) === "SKILL.md" ? 0 : 1;
  if (leftSkillMd !== rightSkillMd) return leftSkillMd - rightSkillMd;
  return left.relativePath.localeCompare(right.relativePath);
}

function occupancySkillBasename(relativePath: string): string {
  return relativePath.replaceAll("\\", "/").split("/").pop() ?? relativePath;
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
  options?: { readonly source?: OccupancySkillSource },
): Promise<OccupancyHomeSkillOfferFile[]> {
  const offered: OccupancyHomeSkillOfferFile[] = [];
  const seenSkillNames = new Set<string>();

  for (const root of OCCUPANCY_HOME_SKILL_ROOTS) {
    if (options?.source && root.source !== options.source) continue;
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
  readonly source?: OccupancySkillSource;
  readonly enabled?: boolean;
  readonly executeCommand: (
    command: WriteSandboxFileCommand | ExecuteSandboxCommand,
  ) => Promise<Result<unknown>>;
  readonly destinationExists: (path: string) => Promise<boolean>;
}): Promise<{
  readonly offered: boolean;
  readonly fileCount: number;
  readonly skillCount: number;
  readonly skippedExisting: number;
}> {
  if (input.enabled === false) {
    return { offered: false, fileCount: 0, skillCount: 0, skippedExisting: 0 };
  }
  const files = await listOccupancyHomeSkillOfferFiles(input.homeDir ?? homedir(), {
    ...(input.source ? { source: input.source } : {}),
  });
  if (files.length === 0) {
    return { offered: false, fileCount: 0, skillCount: 0, skippedExisting: 0 };
  }

  const bySkill = new Map<string, OccupancyHomeSkillOfferFile[]>();
  for (const file of files) {
    const current = bySkill.get(file.skillName) ?? [];
    current.push(file);
    bySkill.set(file.skillName, current);
  }

  let written = 0;
  let skippedExisting = 0;
  let skillCount = 0;
  for (const [skillName, skillFiles] of bySkill) {
    const ordered = [...skillFiles].sort(compareOccupancySkillCopyOrder);
    const destinations = OCCUPANCY_HOME_SKILL_DESTINATIONS.map(
      (destination) => `${destination}/${skillName}`,
    );
    const skillMd = ordered.find(
      (file) => occupancySkillBasename(file.relativePath) === "SKILL.md",
    );
    if (!skillMd) continue;

    const manifest = await writeOccupancySkillFiles({
      workspaceId: input.workspaceId,
      destinations,
      files: [{ relativePath: skillMd.relativePath, content: skillMd.content }],
      executeCommand: input.executeCommand,
      destinationExists: input.destinationExists,
    });
    if (!manifest || (manifest.written === 0 && manifest.skippedExisting === 0)) {
      continue;
    }
    written += manifest.written;
    skippedExisting += manifest.skippedExisting;

    const remainder = ordered.filter((file) => file !== skillMd);
    if (remainder.length > 0) {
      const rest = await writeOccupancySkillFiles({
        workspaceId: input.workspaceId,
        destinations,
        files: remainder.map((file) => ({
          relativePath: file.relativePath,
          content: file.content,
        })),
        executeCommand: input.executeCommand,
        destinationExists: input.destinationExists,
      });
      if (rest) {
        written += rest.written;
        skippedExisting += rest.skippedExisting;
      }
    }
    skillCount += 1;
  }

  if (skillCount === 0) {
    return { offered: false, fileCount: written, skillCount: 0, skippedExisting };
  }
  if (!(await gitExcludeOccupancySkills(input))) {
    return { offered: true, fileCount: written, skillCount, skippedExisting };
  }
  return { offered: true, fileCount: written, skillCount, skippedExisting };
}
