import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { ScalarValueObject } from "../shared/value-object";

function sandboxNameValidation(message: string) {
  return domainError.validation(message, {
    phase: "execution-sandbox-admission",
    field: "name",
  });
}

const adjectives = [
  "amber",
  "brisk",
  "calm",
  "clear",
  "copper",
  "crisp",
  "eager",
  "faint",
  "gentle",
  "golden",
  "hidden",
  "ivory",
  "jolly",
  "keen",
  "lucid",
  "merry",
  "mild",
  "noble",
  "proud",
  "quiet",
  "rapid",
  "resonant",
  "royal",
  "rustic",
  "silent",
  "silver",
  "steady",
  "swift",
  "tender",
  "tidy",
  "vivid",
  "warm",
] as const;

const nouns = [
  "brook",
  "canyon",
  "cedar",
  "clover",
  "dusk",
  "ember",
  "fern",
  "glacier",
  "grove",
  "harbor",
  "haven",
  "islet",
  "lantern",
  "maple",
  "meadow",
  "nexus",
  "orchard",
  "pebble",
  "pine",
  "quarry",
  "ridge",
  "river",
  "silence",
  "spruce",
  "summit",
  "tide",
  "valley",
  "villa",
  "willow",
  "zenith",
] as const;

const generatedNamePattern = /^[a-z]+-[a-z]+$/;
const directoryNamePattern = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const repoAtShaPattern = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?@[A-Za-z0-9]{4,40}$/;
const maximumNameLength = 80;

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function generatedPair(seed: number): string {
  const adjective = adjectives[seed % adjectives.length];
  const noun = nouns[Math.floor(seed / adjectives.length) % nouns.length];
  return `${adjective}-${noun}`;
}

function sanitizeDirectoryName(value: string): string | undefined {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  if (!sanitized || sanitized.toLowerCase().startsWith("sbx_")) return undefined;
  if (!/^[A-Za-z]/.test(sanitized)) return undefined;
  return sanitized;
}

function folderDirectoryFromIdentity(identity: string): string | undefined {
  const normalized = identity.trim().toLowerCase();
  if (!normalized.includes("folder.local")) return undefined;
  const segment = identity.split("/").filter(Boolean).at(-1);
  return segment ? sanitizeDirectoryName(segment) : undefined;
}

function repoAtShortSha(identity: string, commitSha: string): string | undefined {
  const trimmed = identity.trim();
  if (!trimmed || trimmed.toLowerCase().includes("folder.local")) return undefined;
  const withoutHost = trimmed
    .replace(/^(github\.com|gitlab\.com|bitbucket\.org)\//iu, "")
    .replace(/\.git$/u, "");
  const segments = withoutHost.split("/").filter(Boolean);
  const repo = segments.at(-1);
  if (!repo || repo.toLowerCase().startsWith("sbx_")) return undefined;
  const sha = commitSha.trim();
  if (sha.length < 7) return undefined;
  return `${repo}@${sha.slice(0, 7)}`;
}

export interface SandboxDisplayNameSource {
  readonly name?: string;
  readonly directoryName?: string;
  readonly repositoryIdentity?: string;
  readonly commitSha?: string;
}

const sandboxDisplayNameBrand: unique symbol = Symbol("SandboxDisplayName");

export class SandboxDisplayName extends ScalarValueObject<string> {
  private [sandboxDisplayNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<SandboxDisplayName> {
    const normalized = value.trim();
    if (
      !normalized ||
      normalized.length > maximumNameLength ||
      normalized.toLowerCase().startsWith("sbx_") ||
      !(
        generatedNamePattern.test(normalized) ||
        directoryNamePattern.test(normalized) ||
        repoAtShaPattern.test(normalized)
      )
    ) {
      return err(sandboxNameValidation("Sandbox display name is invalid"));
    }
    return ok(new SandboxDisplayName(normalized));
  }

  static rehydrate(value: string): SandboxDisplayName {
    return new SandboxDisplayName(value.trim());
  }

  static generate(random: () => number = Math.random): SandboxDisplayName {
    const adjective = adjectives[Math.floor(random() * adjectives.length)] ?? "resonant";
    const noun = nouns[Math.floor(random() * nouns.length)] ?? "silence";
    return new SandboxDisplayName(`${adjective}-${noun}`);
  }

  static fromLegacySandboxId(sandboxId: string): SandboxDisplayName {
    return new SandboxDisplayName(generatedPair(hashText(sandboxId.trim())));
  }

  static resolve(input: SandboxDisplayNameSource): SandboxDisplayName {
    const explicit = input.name?.trim();
    if (explicit) {
      const created = SandboxDisplayName.create(explicit);
      if (created.isOk()) return created.value;
    }
    const directory = input.directoryName
      ? sanitizeDirectoryName(input.directoryName)
      : input.repositoryIdentity
        ? folderDirectoryFromIdentity(input.repositoryIdentity)
        : undefined;
    if (directory) {
      const created = SandboxDisplayName.create(directory);
      if (created.isOk()) return created.value;
    }
    if (input.repositoryIdentity && input.commitSha) {
      const repoName = repoAtShortSha(input.repositoryIdentity, input.commitSha);
      if (repoName) {
        const created = SandboxDisplayName.create(repoName);
        if (created.isOk()) return created.value;
      }
    }
    return SandboxDisplayName.generate();
  }

  isGeneratedKebabPair(): boolean {
    return generatedNamePattern.test(this.value);
  }
}
