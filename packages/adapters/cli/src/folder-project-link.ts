import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve as resolvePath } from "node:path";

export const FOLDER_PROJECT_LINK_SCHEMA_VERSION = "appaloft.folder-project-link/v1";
export const FOLDER_OCCUPANCY_HOST = "folder.local";

export interface FolderProjectLink {
  readonly cwd: string;
  readonly projectId: string;
  readonly projectName?: string;
  readonly identity: string;
  readonly updatedAt: string;
}

export interface FolderProjectLinkStoreData {
  readonly schemaVersion: typeof FOLDER_PROJECT_LINK_SCHEMA_VERSION;
  readonly links: Readonly<Record<string, FolderProjectLink>>;
}

export interface FolderProjectLinkStore {
  read(): Promise<FolderProjectLinkStoreData>;
  write(data: FolderProjectLinkStoreData): Promise<void>;
}

export type FolderProjectLinkEnvironment = Readonly<Record<string, string | undefined>>;

const emptyStore: FolderProjectLinkStoreData = {
  schemaVersion: FOLDER_PROJECT_LINK_SCHEMA_VERSION,
  links: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function folderProjectLinkStorePath(
  env: FolderProjectLinkEnvironment = process.env,
): string {
  const root = env.APPALOFT_HOME?.trim() || resolvePath(homedir(), ".appaloft");
  return resolvePath(root, "folder-links.json");
}

export function normalizeFolderCwd(cwd: string): string {
  return resolvePath(cwd.trim() || ".");
}

export function folderDirectoryName(cwd: string): string {
  const normalized = normalizeFolderCwd(cwd);
  const base = normalized.split(/[\\/]/u).filter(Boolean).at(-1)?.trim();
  return base && base !== "." && base !== ".." ? base : "app";
}

export function sanitizeFolderIdentitySegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return sanitized || "app";
}

export function folderOccupancyIdentity(directoryName: string): string {
  return `${FOLDER_OCCUPANCY_HOST}/cwd/${sanitizeFolderIdentitySegment(directoryName)}`;
}

export function folderOccupancyRepository(directoryName: string): string {
  return `https://${folderOccupancyIdentity(directoryName)}.git`;
}

export function isFolderOccupancyIdentity(identity: string): boolean {
  return identity.startsWith(`${FOLDER_OCCUPANCY_HOST}/`);
}

export function folderOccupancyLocator(directoryName: string): {
  readonly repository: string;
  readonly repositoryIdentity: string;
  readonly ref: string;
  readonly branch: string;
} {
  return {
    repository: folderOccupancyRepository(directoryName),
    repositoryIdentity: folderOccupancyIdentity(directoryName),
    ref: "refs/heads/local",
    branch: "local",
  };
}

export function gitOccupancyLocator(identity: string): {
  readonly repository: string;
  readonly repositoryIdentity: string;
  readonly ref: string;
  readonly branch: string;
} {
  const normalized = identity.replace(/\.git$/u, "");
  return {
    repository: `https://${normalized}.git`,
    repositoryIdentity: normalized,
    ref: "refs/heads/main",
    branch: "main",
  };
}

export function folderOccupancyCommitSha(cwd: string): string {
  const input = normalizeFolderCwd(cwd);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `${hex}${"0".repeat(32)}`.slice(0, 40);
}

function parseLink(value: unknown): FolderProjectLink | undefined {
  if (!isRecord(value)) return undefined;
  const cwd = readOptionalString(value, "cwd");
  const projectId = readOptionalString(value, "projectId");
  const identity = readOptionalString(value, "identity");
  const updatedAt = readOptionalString(value, "updatedAt");
  if (!cwd || !projectId || !identity || !updatedAt) return undefined;
  const projectName = readOptionalString(value, "projectName");
  return {
    cwd,
    projectId,
    identity,
    updatedAt,
    ...(projectName ? { projectName } : {}),
  };
}

function parseStore(value: unknown): FolderProjectLinkStoreData {
  if (!isRecord(value)) return emptyStore;
  const linksValue = value.links;
  if (!isRecord(linksValue)) return emptyStore;
  const links: Record<string, FolderProjectLink> = {};
  for (const [key, raw] of Object.entries(linksValue)) {
    const link = parseLink(raw);
    if (link) links[normalizeFolderCwd(key)] = link;
  }
  return {
    schemaVersion: FOLDER_PROJECT_LINK_SCHEMA_VERSION,
    links,
  };
}

export function memoryFolderProjectLinkStore(
  initial: FolderProjectLinkStoreData = emptyStore,
): FolderProjectLinkStore & { snapshot(): FolderProjectLinkStoreData } {
  let data = initial;
  return {
    async read() {
      return data;
    },
    async write(next) {
      data = next;
    },
    snapshot() {
      return data;
    },
  };
}

export function fileFolderProjectLinkStore(
  env: FolderProjectLinkEnvironment = process.env,
): FolderProjectLinkStore {
  const path = folderProjectLinkStorePath(env);
  return {
    async read() {
      if (!existsSync(path)) return emptyStore;
      try {
        return parseStore(JSON.parse(await readFile(path, "utf8")));
      } catch {
        return emptyStore;
      }
    },
    async write(data) {
      await mkdir(dirname(path), { recursive: true });
      const tempPath = `${path}.${process.pid}.tmp`;
      await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
      await rename(tempPath, path);
    },
  };
}

export async function readFolderProjectLink(
  cwd: string,
  store: FolderProjectLinkStore,
): Promise<FolderProjectLink | undefined> {
  const data = await store.read();
  return data.links[normalizeFolderCwd(cwd)];
}

export async function writeFolderProjectLink(
  input: {
    readonly cwd: string;
    readonly projectId: string;
    readonly identity: string;
    readonly projectName?: string;
    readonly now?: string;
  },
  store: FolderProjectLinkStore,
): Promise<FolderProjectLink> {
  const cwd = normalizeFolderCwd(input.cwd);
  const link: FolderProjectLink = {
    cwd,
    projectId: input.projectId,
    identity: input.identity,
    updatedAt: input.now ?? new Date().toISOString(),
    ...(input.projectName ? { projectName: input.projectName } : {}),
  };
  const data = await store.read();
  await store.write({
    schemaVersion: FOLDER_PROJECT_LINK_SCHEMA_VERSION,
    links: {
      ...data.links,
      [cwd]: link,
    },
  });
  return link;
}
