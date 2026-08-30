import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  decideOccupancySkillPrefs,
  loadOccupancySkillPrefs,
  occupancyPrefsPath,
  occupancySkillSourceChoices,
  resolveOccupancySkillPrefs,
  saveOccupancySkillPrefs,
} from "../src/occupancy-skill-prefs.js";

async function writeHomeSkill(homeDir: string, root: string, name: string): Promise<void> {
  const dir = join(homeDir, root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `# ${name}\n`);
}

describe("occupancy skill prefs", () => {
  test("[WS-REMOTE-HOME-SKILL-233] stored prefs skip the setup prompt", () => {
    expect(
      decideOccupancySkillPrefs({
        stored: { enabled: true, source: "grok" },
        present: occupancySkillSourceChoices(),
        canPrompt: true,
      }),
    ).toEqual({
      prefs: { enabled: true, source: "grok" },
      needsPrompt: false,
    });
  });

  test("[WS-REMOTE-HOME-SKILL-234] --yes or non-TTY without prefs disables home copy", () => {
    expect(
      decideOccupancySkillPrefs({
        present: occupancySkillSourceChoices(),
        yes: true,
        canPrompt: true,
      }),
    ).toEqual({ prefs: { enabled: false }, needsPrompt: false });
    expect(
      decideOccupancySkillPrefs({
        present: occupancySkillSourceChoices(),
        canPrompt: false,
      }),
    ).toEqual({ prefs: { enabled: false }, needsPrompt: false });
  });

  test("[WS-REMOTE-HOME-SKILL-233] first TTY code without prefs needs the Railway-style prompt", () => {
    expect(
      decideOccupancySkillPrefs({
        present: [
          {
            source: "grok",
            homeRelative: ".grok/skills",
            label: "~/.grok/skills",
            railwayAligned: true,
          },
          {
            source: "claude",
            homeRelative: ".claude/skills",
            label: "~/.claude/skills",
            railwayAligned: true,
          },
        ],
        canPrompt: true,
      }),
    ).toEqual({
      prefs: { enabled: true, source: "grok" },
      needsPrompt: true,
    });
  });

  test("[WS-REMOTE-HOME-SKILL-235] load and save agent-prefs.json", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "appaloft-occupancy-prefs-"));
    await saveOccupancySkillPrefs({
      prefs: { enabled: true, source: "codex" },
      homeDir,
      env: { APPALOFT_HOME: join(homeDir, ".appaloft") },
    });
    expect(occupancyPrefsPath(homeDir, { APPALOFT_HOME: join(homeDir, ".appaloft") })).toBe(
      join(homeDir, ".appaloft", "agent-prefs.json"),
    );
    await expect(
      loadOccupancySkillPrefs({
        homeDir,
        env: { APPALOFT_HOME: join(homeDir, ".appaloft") },
      }),
    ).resolves.toEqual({ enabled: true, source: "codex" });
  });

  test("[WS-REMOTE-HOME-SKILL-234] resolve --yes persists disabled prefs", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "appaloft-occupancy-prefs-yes-"));
    const env = { APPALOFT_HOME: join(homeDir, ".appaloft") };
    const resolved = await resolveOccupancySkillPrefs({ homeDir, env, yes: true });
    expect(resolved).toMatchObject({
      prefs: { enabled: false },
      needsPrompt: false,
    });
    await expect(loadOccupancySkillPrefs({ homeDir, env })).resolves.toEqual({ enabled: false });
  });

  test("[WS-REMOTE-HOME-SKILL-235] present sources require SKILL.md", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "appaloft-occupancy-present-"));
    await writeHomeSkill(homeDir, ".grok/skills", "plan");
    await mkdir(join(homeDir, ".claude/skills", "empty"), { recursive: true });
    const resolved = await resolveOccupancySkillPrefs({
      homeDir,
      env: { APPALOFT_HOME: join(homeDir, ".appaloft") },
      canPrompt: true,
    });
    expect(resolved.present.map((choice) => choice.source)).toEqual(["grok"]);
    expect(resolved.needsPrompt).toBe(true);
  });
});
