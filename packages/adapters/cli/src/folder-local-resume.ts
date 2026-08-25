import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve as resolvePath } from "node:path";

export const FOLDER_LOCAL_RESUME_SCHEMA_VERSION = "appaloft.folder-local-resume/v1";

export interface FolderLocalResume {
  readonly repositoryIdentity: string;
  readonly workspaceId: string;
  readonly runtimeId?: string;
  readonly agentId?: string;
  readonly name?: string;
  readonly targetServerId?: string;
  readonly profile?: string;
  readonly updatedAt: string;
}


export interface FolderLocalResumeStoreData {
  readonly schemaVersion: typeof FOLDER_LOCAL_RESUME_SCHEMA_VERSION;
  readonly items: Readonly<Record<string, FolderLocalResume>>;
}

export interface FolderLocalResumeStore {
  read(): Promise<FolderLocalResumeStoreData>;
  write(data: FolderLocalResumeStoreData): Promise<void>;
}

export type FolderLocalResumeEnvironment = Readonly<Record<string, string | undefined>>;

const emptyStore: FolderLocalResumeStoreData = {
  schemaVersion: FOLDER_LOCAL_RESUME_SCHEMA_VERSION,
  items: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function folderLocalResumeStorePath(
  env: FolderLocalResumeEnvironment = process.env,
): string {
  const root = env.APPALOFT_HOME?.trim() || resolvePath(homedir(), ".appaloft");
  return resolvePath(root, "folder-local-resume.json");
}

export function folderLocalResumeKey(input: {
  readonly repositoryIdentity: string;
  readonly profile?: string;
}): string {
  return [input.repositoryIdentity.trim(), input.profile?.trim() ?? ""].join("\0");
}

function parseResume(value: unknown): FolderLocalResume | undefined {
  if (!isRecord(value)) return undefined;
  const repositoryIdentity = readOptionalString(value, "repositoryIdentity");
  const workspaceId = readOptionalString(value, "workspaceId");
  if (!repositoryIdentity || !workspaceId) return undefined;
  const updatedAt = readOptionalString(value, "updatedAt") ?? new Date(0).toISOString();
  const runtimeId = readOptionalString(value, "runtimeId");
  const agentId = readOptionalString(value, "agentId");
  const name = readOptionalString(value, "name");
  const targetServerId = readOptionalString(value, "targetServerId");
  const profile = readOptionalString(value, "profile");
  return {
    repositoryIdentity,
    workspaceId,
    updatedAt,
    ...(runtimeId ? { runtimeId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(name ? { name } : {}),
    ...(targetServerId ? { targetServerId } : {}),
    ...(profile ? { profile } : {}),
  };

}

function parseStore(value: unknown): FolderLocalResumeStoreData {
  if (!isRecord(value) || value.schemaVersion !== FOLDER_LOCAL_RESUME_SCHEMA_VERSION) {
    return emptyStore;
  }
  if (!isRecord(value.items)) return emptyStore;
  const items: Record<string, FolderLocalResume> = {};
  for (const [key, item] of Object.entries(value.items)) {
    const parsed = parseResume(item);
    if (parsed) items[key] = parsed;
  }
  return { schemaVersion: FOLDER_LOCAL_RESUME_SCHEMA_VERSION, items };
}

export function memoryFolderLocalResumeStore(
  initial: FolderLocalResumeStoreData = emptyStore,
): FolderLocalResumeStore & { snapshot(): FolderLocalResumeStoreData } {
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

export function fileFolderLocalResumeStore(
  env: FolderLocalResumeEnvironment = process.env,
): FolderLocalResumeStore {
  const path = folderLocalResumeStorePath(env);
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

export async function readFolderLocalResume(
  input: {
    readonly repositoryIdentity: string;
    readonly targetServerId?: string;
    readonly profile?: string;
  },
  store: FolderLocalResumeStore,
): Promise<FolderLocalResume | undefined> {
  const data = await store.read();
  const exact = data.items[folderLocalResumeKey(input)];
  if (exact) return exact;
  return Object.values(data.items).find(
    (item) => item.repositoryIdentity === input.repositoryIdentity,
  );
}

export async function writeFolderLocalResume(
  input: {
    readonly repositoryIdentity: string;
    readonly workspaceId: string;
    readonly runtimeId?: string;
    readonly agentId?: string;
    readonly name?: string;
    readonly targetServerId?: string;
    readonly profile?: string;
    readonly now?: string;
  },
  store: FolderLocalResumeStore,
): Promise<FolderLocalResume> {
  const resume: FolderLocalResume = {
    repositoryIdentity: input.repositoryIdentity,
    workspaceId: input.workspaceId,
    updatedAt: input.now ?? new Date().toISOString(),
    ...(input.runtimeId ? { runtimeId: input.runtimeId } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.name ? { name: input.name } : {}),
    ...(input.targetServerId ? { targetServerId: input.targetServerId } : {}),
    ...(input.profile ? { profile: input.profile } : {}),
  };

  const data = await store.read();
  await store.write({
    schemaVersion: FOLDER_LOCAL_RESUME_SCHEMA_VERSION,
    items: {
      ...data.items,
      [folderLocalResumeKey(input)]: resume,
    },
  });
  return resume;
}
