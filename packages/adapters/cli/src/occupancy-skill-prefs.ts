import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";

import { withImmediateInquireCancel } from "./folder-project-onboarding.js";
import { type CliInteraction } from "./interaction.js";
import {
  listOccupancyHomeSkillOfferFiles,
  OCCUPANCY_HOME_SKILL_ROOTS,
  type OccupancySkillSource,
} from "./occupancy-skill-offer.js";
import { occupancyAppaloftHome } from "./occupancy-vendor.js";

export const OCCUPANCY_PREFS_FILENAME = "agent-prefs.json";
export const OCCUPANCY_PREFS_SCHEMA = "appaloft.agent-prefs/v1" as const;


export const OCCUPANCY_SKILL_SYNC_CONFIRM = "Bring your local skills to every agent?";
export const OCCUPANCY_SKILL_SOURCE_SELECT = "Which skills directory?";

export interface OccupancySkillPrefs {
  readonly enabled: boolean;
  readonly source?: OccupancySkillSource;
}

export interface OccupancySkillSourceChoice {
  readonly source: OccupancySkillSource;
  readonly homeRelative: string;
  readonly label: string;
  readonly railwayAligned: boolean;
}

export function occupancyPrefsPath(homeDir: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(occupancyAppaloftHome(homeDir, env), OCCUPANCY_PREFS_FILENAME);
}

export function occupancySkillSourceChoices(): readonly OccupancySkillSourceChoice[] {
  return OCCUPANCY_HOME_SKILL_ROOTS.map((root) => ({
    source: root.source,
    homeRelative: root.homeRelative,
    label: `~/${root.homeRelative}`,
    railwayAligned: root.railwayAligned,
  }));
}

export async function listPresentOccupancySkillSources(
  homeDir: string,
): Promise<OccupancySkillSourceChoice[]> {
  const present: OccupancySkillSourceChoice[] = [];
  for (const choice of occupancySkillSourceChoices()) {
    const files = await listOccupancyHomeSkillOfferFiles(homeDir, { source: choice.source });
    if (files.length === 0) continue;
    present.push(choice);
  }
  return present;
}

export function decideOccupancySkillPrefs(input: {
  readonly stored?: OccupancySkillPrefs;
  readonly present: readonly OccupancySkillSourceChoice[];
  readonly yes?: boolean;
  readonly canPrompt?: boolean;
}): { readonly prefs: OccupancySkillPrefs; readonly needsPrompt: boolean } {
  if (input.stored) {
    return { prefs: input.stored, needsPrompt: false };
  }
  if (input.yes || !input.canPrompt) {
    return { prefs: { enabled: false }, needsPrompt: false };
  }
  return {
    prefs: { enabled: true, ...(input.present[0] ? { source: input.present[0].source } : {}) },
    needsPrompt: true,
  };
}

export async function loadOccupancySkillPrefs(
  input: { readonly homeDir?: string; readonly env?: NodeJS.ProcessEnv } = {},
): Promise<OccupancySkillPrefs | undefined> {
  const homeDir = input.homeDir ?? homedir();
  const env = input.env ?? process.env;
  const raw = await readFile(occupancyPrefsPath(homeDir, env), "utf8").catch(() => undefined);
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const record = parsed as {
      schemaVersion?: unknown;
      skills?: { enabled?: unknown; source?: unknown };
    };
    if (record.schemaVersion !== OCCUPANCY_PREFS_SCHEMA) return undefined;
    if (typeof record.skills?.enabled !== "boolean") return undefined;
    const source = occupancySkillSourceChoices().find(
      (choice) => choice.source === record.skills?.source,
    )?.source;
    return {
      enabled: record.skills.enabled,
      ...(source ? { source } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function saveOccupancySkillPrefs(input: {
  readonly prefs: OccupancySkillPrefs;
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const homeDir = input.homeDir ?? homedir();
  const env = input.env ?? process.env;
  await mkdir(occupancyAppaloftHome(homeDir, env), { recursive: true });
  await writeFile(
    occupancyPrefsPath(homeDir, env),
    `${JSON.stringify(
      {
        schemaVersion: OCCUPANCY_PREFS_SCHEMA,
        skills: {
          enabled: input.prefs.enabled,
          ...(input.prefs.source ? { source: input.prefs.source } : {}),
        },
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
}

export function inquireOccupancySkillPrefs(input: {
  readonly present: readonly OccupancySkillSourceChoice[];
  readonly interaction: CliInteraction;
}) {
  return withImmediateInquireCancel(
    Effect.gen(function* () {
      const enabled = yield* input.interaction.confirm({
        message: OCCUPANCY_SKILL_SYNC_CONFIRM,
        defaultValue: true,
      });
      if (!enabled || input.present.length === 0) {
        return { enabled } satisfies OccupancySkillPrefs;
      }
      if (input.present.length === 1 && input.present[0]) {
        return { enabled: true, source: input.present[0].source } satisfies OccupancySkillPrefs;
      }
      const source = yield* input.interaction.select<OccupancySkillSource>({
        message: OCCUPANCY_SKILL_SOURCE_SELECT,
        choices: input.present.map((choice) => ({
          title: choice.label,
          value: choice.source,
        })),
      });
      return { enabled: true, source } satisfies OccupancySkillPrefs;
    }),
  );
}

export async function resolveOccupancySkillPrefs(input: {
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly yes?: boolean;
  readonly canPrompt?: boolean;
}): Promise<{
  readonly prefs: OccupancySkillPrefs;
  readonly present: readonly OccupancySkillSourceChoice[];
  readonly needsPrompt: boolean;
  readonly stored?: OccupancySkillPrefs;
}> {
  const homeDir = input.homeDir ?? homedir();
  const env = input.env ?? process.env;
  const stored = await loadOccupancySkillPrefs({ homeDir, env });
  const present = await listPresentOccupancySkillSources(homeDir);
  const decided = decideOccupancySkillPrefs({
    present,
    ...(stored ? { stored } : {}),
    ...(input.yes ? { yes: true } : {}),
    ...(input.canPrompt ? { canPrompt: true } : {}),
  });
  if (!decided.needsPrompt && !stored) {
    await saveOccupancySkillPrefs({ prefs: decided.prefs, homeDir, env }).catch(() => undefined);
  }
  return {
    ...decided,
    present,
    ...(stored ? { stored } : {}),
  };
}
