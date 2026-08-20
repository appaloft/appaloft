import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { domainError, err, ok, type Result } from "@appaloft/core";

export const OCCUPANCY_VENDORS = ["claude", "codex", "grok"] as const;
export type OccupancyVendor = (typeof OCCUPANCY_VENDORS)[number];

export const OCCUPANCY_HARNESSES = ["opencode", "pi", "omp"] as const;
export type OccupancyHarness = (typeof OCCUPANCY_HARNESSES)[number];

export const OCCUPANCY_AGENT_ALIASES = [
  "opencode",
  "pi",
  "omp",
  "claude",
  "codex",
  "grok",
] as const;
export type OccupancyAgentAlias = (typeof OCCUPANCY_AGENT_ALIASES)[number];

export const OCCUPANCY_VENDOR_LABEL: Readonly<Record<OccupancyVendor, string>> = {
  claude: "Claude",
  codex: "Codex",
  grok: "Grok",
};

/**
 * Railway-aligned `--claude` / `--codex` / `--grok` map onto the existing
 * OpenCode occupancy harness. `--opencode` / `--pi` / `--omp` are our harness
 * aliases. Do not invent a new sandbox runtime or image.
 */
export const OCCUPANCY_VENDOR_HARNESS: Readonly<Record<OccupancyVendor, OccupancyHarness>> = {
  claude: "opencode",
  codex: "opencode",
  grok: "opencode",
};

export const OCCUPANCY_DEFAULT_HARNESS: OccupancyHarness = "opencode";
export const OCCUPANCY_AGENT_PREFERENCE_SCHEMA = "appaloft.occupancy-agent/v1" as const;
export const OCCUPANCY_AGENT_PREFERENCE_FILENAME = "occupancy-agent.json";

export interface OccupancyAgentFlags {
  readonly opencode?: boolean;
  readonly pi?: boolean;
  readonly omp?: boolean;
  readonly claude?: boolean;
  readonly codex?: boolean;
  readonly grok?: boolean;
}

export type OccupancyVendorFlags = OccupancyAgentFlags;

export interface OccupancyAgentSelection {
  readonly alias?: OccupancyAgentAlias;
  readonly vendor?: OccupancyVendor;
  readonly harness: OccupancyHarness;
  readonly explicit: boolean;
}

function isOccupancyAgentAlias(value: string): value is OccupancyAgentAlias {
  return (OCCUPANCY_AGENT_ALIASES as readonly string[]).includes(value);
}

function isOccupancyHarness(value: string): value is OccupancyHarness {
  return (OCCUPANCY_HARNESSES as readonly string[]).includes(value);
}

function isOccupancyVendor(value: OccupancyAgentAlias): value is OccupancyVendor {
  return (OCCUPANCY_VENDORS as readonly string[]).includes(value);
}

export function selectedOccupancyAgentAliases(
  flags: OccupancyAgentFlags,
  harness?: OccupancyHarness,
): OccupancyAgentAlias[] {
  const selected = OCCUPANCY_AGENT_ALIASES.filter((alias) => flags[alias] === true);
  if (harness && !selected.includes(harness)) selected.push(harness);
  return selected;
}

export function selectedOccupancyVendorFlags(flags: OccupancyVendorFlags): OccupancyVendor[] {
  return OCCUPANCY_VENDORS.filter((vendor) => flags[vendor] === true);
}

export function occupancyHarnessForAlias(alias?: OccupancyAgentAlias): OccupancyHarness {
  if (!alias) return OCCUPANCY_DEFAULT_HARNESS;
  return isOccupancyVendor(alias) ? OCCUPANCY_VENDOR_HARNESS[alias] : alias;
}

export function occupancyVendorForAlias(alias?: OccupancyAgentAlias): OccupancyVendor | undefined {
  return alias && isOccupancyVendor(alias) ? alias : undefined;
}

/** @deprecated Use occupancyHarnessForAlias. `--harness` is compatibility only. */
export function occupancyHarnessForVendor(
  vendor: OccupancyVendor | undefined,
  explicitHarness?: OccupancyHarness,
): OccupancyHarness {
  if (explicitHarness) return occupancyHarnessForAlias(explicitHarness);
  if (vendor) return occupancyHarnessForAlias(vendor);
  return OCCUPANCY_DEFAULT_HARNESS;
}

export function occupancyVendorAmbiguousError(): ReturnType<typeof domainError.validation> {
  return domainError.validation(
    "Choose one of --opencode, --pi, --omp, --claude, --codex, or --grok",
    {
      code: "workspace_occupancy_vendor_ambiguous",
      phase: "occupancy-vendor",
      guidance:
        "Pass exactly one agent alias. --harness opencode|pi|omp is compatibility only and cannot combine with a different alias.",
    },
  );
}

export function occupancyVendorCredentialMissingError(
  vendor: OccupancyVendor,
): ReturnType<typeof domainError.validation> {
  const label = OCCUPANCY_VENDOR_LABEL[vendor];
  const guidance =
    vendor === "claude"
      ? "Run claude setup-token on this laptop, save it under APPALOFT_HOME/claude-setup-token or ~/.claude/setup-token, then retry appaloft code --claude. Occupancy does not copy the Claude chat cookie."
      : vendor === "codex"
        ? "Sign in so ~/.codex/auth.json exists, then retry appaloft code --codex."
        : "Sign in so ~/.grok/auth.json exists, then retry appaloft code --grok.";
  return domainError.validation(`${label} is not signed in on this laptop`, {
    code: "workspace_occupancy_vendor_credential_missing",
    phase: "occupancy-vendor-credential",
    guidance,
  });
}

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

export function occupancyAppaloftHome(
  homeDir: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = env.APPALOFT_HOME?.trim();
  return explicit && explicit.length > 0 ? explicit : join(homeDir, ".appaloft");
}

export function occupancyAgentPreferencePath(
  homeDir: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(occupancyAppaloftHome(homeDir, env), OCCUPANCY_AGENT_PREFERENCE_FILENAME);
}

export async function loadOccupancyAgentPreference(
  input: { readonly homeDir?: string; readonly env?: NodeJS.ProcessEnv } = {},
): Promise<OccupancyAgentAlias | undefined> {
  const homeDir = input.homeDir ?? homedir();
  const env = input.env ?? process.env;
  const raw = await readFile(occupancyAgentPreferencePath(homeDir, env), "utf8").catch(
    () => undefined,
  );
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const record = parsed as { schemaVersion?: unknown; alias?: unknown };
    if (record.schemaVersion !== OCCUPANCY_AGENT_PREFERENCE_SCHEMA) return undefined;
    return typeof record.alias === "string" && isOccupancyAgentAlias(record.alias)
      ? record.alias
      : undefined;
  } catch {
    return undefined;
  }
}

export async function saveOccupancyAgentPreference(input: {
  readonly alias: OccupancyAgentAlias;
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const homeDir = input.homeDir ?? homedir();
  const env = input.env ?? process.env;
  const path = occupancyAgentPreferencePath(homeDir, env);
  await mkdir(occupancyAppaloftHome(homeDir, env), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify(
      {
        schemaVersion: OCCUPANCY_AGENT_PREFERENCE_SCHEMA,
        alias: input.alias,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
}

export async function occupancyVendorCredentialPresent(
  vendor: OccupancyVendor,
  input: {
    readonly homeDir?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly which?: (name: string) => string | null | undefined;
  } = {},
): Promise<boolean> {
  const homeDir = input.homeDir ?? homedir();
  const env = input.env ?? process.env;
  if (vendor === "grok") {
    return pathExists(join(homeDir, ".grok", "auth.json"));
  }
  if (vendor === "codex") {
    return pathExists(join(homeDir, ".codex", "auth.json"));
  }
  if (env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) return true;
  if (await pathExists(join(occupancyAppaloftHome(homeDir, env), "claude-setup-token"))) {
    return true;
  }
  return pathExists(join(homeDir, ".claude", "setup-token"));
}

export async function detectOccupancyVendor(input: {
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly which?: (name: string) => string | null | undefined;
}): Promise<OccupancyVendor | undefined> {
  const which = input.which ?? ((name: string) => Bun.which(name));
  for (const vendor of OCCUPANCY_VENDORS) {
    if (await occupancyVendorCredentialPresent(vendor, input)) return vendor;
  }
  for (const vendor of OCCUPANCY_VENDORS) {
    if (which(vendor)) return vendor;
  }
  return undefined;
}

async function persistAlias(
  alias: OccupancyAgentAlias,
  input: {
    readonly homeDir?: string;
    readonly env?: NodeJS.ProcessEnv;
  },
): Promise<void> {
  try {
    await saveOccupancyAgentPreference({
      alias,
      ...(input.homeDir ? { homeDir: input.homeDir } : {}),
      ...(input.env ? { env: input.env } : {}),
    });
  } catch {
    // Preference write is fail-soft; occupy still proceeds.
  }
}

function selectionForAlias(
  alias: OccupancyAgentAlias,
  explicit: boolean,
  vendor?: OccupancyVendor,
): OccupancyAgentSelection {
  const resolvedVendor = vendor ?? occupancyVendorForAlias(alias);
  return {
    alias,
    harness: occupancyHarnessForAlias(alias),
    explicit,
    ...(resolvedVendor ? { vendor: resolvedVendor } : {}),
  };
}

export async function resolveOccupancyAgent(input: {
  readonly flags: OccupancyAgentFlags;
  readonly harness?: OccupancyHarness;
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly which?: (name: string) => string | null | undefined;
}): Promise<Result<OccupancyAgentSelection, ReturnType<typeof domainError.validation>>> {
  const selected = selectedOccupancyAgentAliases(
    input.flags,
    input.harness && isOccupancyHarness(input.harness) ? input.harness : undefined,
  );
  if (selected.length > 1) return err(occupancyVendorAmbiguousError());

  const persistInput = {
    ...(input.homeDir ? { homeDir: input.homeDir } : {}),
    ...(input.env ? { env: input.env } : {}),
  };
  const [alias] = selected;
  if (selected.length === 1 && alias) {
    const vendor = occupancyVendorForAlias(alias);
    if (vendor && !(await occupancyVendorCredentialPresent(vendor, input))) {
      return err(occupancyVendorCredentialMissingError(vendor));
    }
    await persistAlias(alias, persistInput);
    return ok(selectionForAlias(alias, true, vendor ?? (await detectOccupancyVendor(input))));
  }

  const saved = await loadOccupancyAgentPreference(persistInput);
  if (saved) {
    const savedVendor = occupancyVendorForAlias(saved);
    if (!savedVendor || (await occupancyVendorCredentialPresent(savedVendor, input))) {
      return ok(
        selectionForAlias(saved, false, savedVendor ?? (await detectOccupancyVendor(input))),
      );
    }
  }

  const detected = await detectOccupancyVendor(input);
  if (detected) {
    await persistAlias(detected, persistInput);
    return ok(selectionForAlias(detected, false, detected));
  }
  return ok({
    harness: OCCUPANCY_DEFAULT_HARNESS,
    explicit: false,
  });
}

export async function resolveOccupancyVendor(input: {
  readonly flags: OccupancyVendorFlags;
  readonly harness?: OccupancyHarness;
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly which?: (name: string) => string | null | undefined;
}): Promise<
  Result<
    { readonly vendor?: OccupancyVendor; readonly explicit: boolean },
    ReturnType<typeof domainError.validation>
  >
> {
  const resolved = await resolveOccupancyAgent(input);
  if (resolved.isErr()) return resolved;
  return ok({
    explicit: resolved.value.explicit,
    ...(resolved.value.vendor ? { vendor: resolved.value.vendor } : {}),
  });
}
