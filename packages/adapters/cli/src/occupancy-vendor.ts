import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { domainError, err, ok, type Result } from "@appaloft/core";

export const OCCUPANCY_VENDORS = ["claude", "codex", "grok"] as const;
export type OccupancyVendor = (typeof OCCUPANCY_VENDORS)[number];

export const OCCUPANCY_HARNESSES = ["opencode", "pi", "omp"] as const;
export type OccupancyHarness = (typeof OCCUPANCY_HARNESSES)[number];

export const OCCUPANCY_VENDOR_LABEL: Readonly<Record<OccupancyVendor, string>> = {
  claude: "Claude",
  codex: "Codex",
  grok: "Grok",
};

/**
 * User-facing `--claude` / `--codex` / `--grok` map onto existing occupancy
 * harness IDs. Do not invent a new sandbox runtime or image. Occupancy still
 * runs OpenCode (default) or an explicit `--harness opencode|pi|omp`.
 */
export const OCCUPANCY_VENDOR_HARNESS: Readonly<Record<OccupancyVendor, OccupancyHarness>> = {
  claude: "opencode",
  codex: "opencode",
  grok: "opencode",
};

export const OCCUPANCY_DEFAULT_HARNESS: OccupancyHarness = "opencode";

export interface OccupancyVendorFlags {
  readonly claude?: boolean;
  readonly codex?: boolean;
  readonly grok?: boolean;
}

export function selectedOccupancyVendorFlags(flags: OccupancyVendorFlags): OccupancyVendor[] {
  return OCCUPANCY_VENDORS.filter((vendor) => flags[vendor] === true);
}

export function occupancyHarnessForVendor(
  vendor: OccupancyVendor | undefined,
  explicitHarness?: OccupancyHarness,
): OccupancyHarness {
  if (explicitHarness) return explicitHarness;
  if (vendor) return OCCUPANCY_VENDOR_HARNESS[vendor];
  return OCCUPANCY_DEFAULT_HARNESS;
}

export function occupancyVendorAmbiguousError(): ReturnType<typeof domainError.validation> {
  return domainError.validation("Choose one of --claude, --codex, or --grok", {
    code: "workspace_occupancy_vendor_ambiguous",
    phase: "occupancy-vendor",
    guidance: "Pass exactly one vendor flag. --harness remains the occupancy runtime override.",
  });
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

export async function resolveOccupancyVendor(input: {
  readonly flags: OccupancyVendorFlags;
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly which?: (name: string) => string | null | undefined;
}): Promise<
  Result<
    { readonly vendor?: OccupancyVendor; readonly explicit: boolean },
    ReturnType<typeof domainError.validation>
  >
> {
  const selected = selectedOccupancyVendorFlags(input.flags);
  if (selected.length > 1) return err(occupancyVendorAmbiguousError());
  const [vendor] = selected;
  if (selected.length === 1 && vendor) {
    if (!(await occupancyVendorCredentialPresent(vendor, input))) {
      return err(occupancyVendorCredentialMissingError(vendor));
    }
    return ok({ vendor, explicit: true });
  }
  const detected = await detectOccupancyVendor(input);
  return ok({ ...(detected ? { vendor: detected } : {}), explicit: false });
}
