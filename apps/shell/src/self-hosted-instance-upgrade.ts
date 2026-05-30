import {
  type InstanceUpgradeApplyResult,
  type InstanceUpgradeCheckResult,
  type InstanceUpgradePort,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";
import { domainError, err, ok, type Result } from "@appaloft/core";

const defaultInstallerUrl = "https://appaloft.com/install.sh";
const releaseApiUrl = "https://api.github.com/repos/appaloft/appaloft/releases/latest";
const latestReleaseUrl = "https://github.com/appaloft/appaloft/releases/latest";

function enabled(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function stripVersionPrefix(value: string): string {
  return value.trim().replace(/^v/i, "");
}

function displayVersion(value: string): string {
  const normalized = stripVersionPrefix(value);
  return normalized === "latest" ? "latest" : normalized;
}

function parseSemver(value: string): readonly [number, number, number] | null {
  const match = stripVersionPrefix(value).match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function isNewerVersion(candidate: string, current: string): boolean {
  const parsedCandidate = parseSemver(candidate);
  const parsedCurrent = parseSemver(current);
  if (!parsedCandidate || !parsedCurrent) {
    return stripVersionPrefix(candidate) !== stripVersionPrefix(current);
  }

  for (const index of [0, 1, 2] as const) {
    const candidatePart = parsedCandidate[index];
    const currentPart = parsedCurrent[index];
    if (candidatePart > currentPart) {
      return true;
    }

    if (candidatePart < currentPart) {
      return false;
    }
  }

  return false;
}

function tailText(value: string, maxLength = 4000): string {
  return value.length <= maxLength ? value : value.slice(value.length - maxLength);
}

function upgradeCommandFor(targetVersion: string): string {
  return `curl -fsSL ${defaultInstallerUrl} | sudo sh -s -- --version ${targetVersion}`;
}

function stringFromUnknownRecord(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCommitSha(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/^git:/i, "");
  return trimmed && /^[a-f0-9]{7,40}$/i.test(trimmed) ? trimmed : null;
}

async function readCurrentCommitSha(): Promise<string | null> {
  for (const key of [
    "APPALOFT_INSTANCE_COMMIT_SHA",
    "APPALOFT_GIT_COMMIT_SHA",
    "APPALOFT_COMMIT_SHA",
    "GITHUB_SHA",
    "VERCEL_GIT_COMMIT_SHA",
    "SOURCE_VERSION",
  ]) {
    const commitSha = normalizeCommitSha(process.env[key]);
    if (commitSha) {
      return commitSha;
    }
  }

  try {
    const processHandle = Bun.spawn(["git", "rev-parse", "HEAD"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const [exitCode, stdout] = await Promise.all([
      processHandle.exited,
      new Response(processHandle.stdout).text(),
    ]);
    return exitCode === 0 ? normalizeCommitSha(stdout) : null;
  } catch {
    return null;
  }
}

async function readLatestReleaseVersion(): Promise<{
  version: string | null;
  releaseNotesUrl?: string;
}> {
  const override = process.env.APPALOFT_INSTANCE_UPGRADE_LATEST_VERSION?.trim();
  if (override) {
    const version = stripVersionPrefix(override);
    return {
      version,
      releaseNotesUrl: `https://github.com/appaloft/appaloft/releases/tag/v${version}`,
    };
  }

  try {
    const response = await fetch(releaseApiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "appaloft-instance-upgrade-check",
      },
    });

    if (!response.ok) {
      return { version: null };
    }

    const body: unknown = await response.json();
    if (!body || typeof body !== "object") {
      return { version: null };
    }

    const record = body as Record<string, unknown>;
    const tagName = stringFromUnknownRecord(record, "tag_name");
    const releaseNotesUrl = stringFromUnknownRecord(record, "html_url");
    return {
      version: tagName ? stripVersionPrefix(tagName) : null,
      ...(releaseNotesUrl ? { releaseNotesUrl } : {}),
    };
  } catch {
    return { version: null };
  }
}

export class SelfHostedInstanceUpgradePort implements InstanceUpgradePort {
  constructor(private readonly config: AppConfig) {}

  async check(input: { targetVersion?: string } = {}): Promise<Result<InstanceUpgradeCheckResult>> {
    const [latestRelease, currentCommitSha] = await Promise.all([
      readLatestReleaseVersion(),
      readCurrentCommitSha(),
    ]);
    const currentVersion = displayVersion(this.config.appVersion);
    const targetVersion = displayVersion(input.targetVersion ?? latestRelease.version ?? "latest");
    const updateAvailable =
      targetVersion === "latest"
        ? latestRelease.version !== null && isNewerVersion(latestRelease.version, currentVersion)
        : isNewerVersion(targetVersion, currentVersion);
    const applySupported = enabled(process.env.APPALOFT_INSTANCE_UPGRADE_APPLY_ENABLED);
    const releaseNotesUrl =
      latestRelease.releaseNotesUrl ??
      (targetVersion === "latest"
        ? latestReleaseUrl
        : `https://github.com/appaloft/appaloft/releases/tag/v${targetVersion}`);

    return ok({
      schemaVersion: "system.instance-upgrade.check/v1",
      currentVersion,
      ...(currentCommitSha ? { currentCommitSha } : {}),
      targetVersion,
      latestVersion: latestRelease.version,
      updateAvailable,
      checkedAt: new Date().toISOString(),
      checkStatus: updateAvailable ? "available" : latestRelease.version ? "current" : "unknown",
      releaseNotesUrl,
      upgradeCommand: upgradeCommandFor(targetVersion),
      applySupported,
      ...(applySupported
        ? {}
        : {
            applyUnsupportedReason:
              "Host-side instance upgrade execution is disabled. Set APPALOFT_INSTANCE_UPGRADE_APPLY_ENABLED=1 on a host process that can run Docker and the installer.",
          }),
    });
  }

  async apply(input: {
    targetVersion?: string;
    confirm: boolean;
  }): Promise<Result<InstanceUpgradeApplyResult>> {
    if (!input.confirm) {
      return err(
        domainError.validation("Instance upgrade requires explicit confirmation", {
          phase: "instance-upgrade-admission",
        }),
      );
    }

    if (!enabled(process.env.APPALOFT_INSTANCE_UPGRADE_APPLY_ENABLED)) {
      return err(
        domainError.validation("Host-side instance upgrade execution is disabled", {
          phase: "instance-upgrade-admission",
        }),
      );
    }

    const checkResult = await this.check({
      ...(input.targetVersion ? { targetVersion: input.targetVersion } : {}),
    });
    if (checkResult.isErr()) {
      return err(checkResult.error);
    }

    const targetVersion = checkResult.value.targetVersion;
    const scriptPathResult = await this.resolveInstallerScriptPath();
    if (scriptPathResult.isErr()) {
      return err(scriptPathResult.error);
    }

    const command = ["sh", scriptPathResult.value, "--version", targetVersion];
    const home = process.env.APPALOFT_INSTANCE_UPGRADE_HOME?.trim();
    if (home) {
      command.push("--home", home);
    }
    if (enabled(process.env.APPALOFT_INSTANCE_UPGRADE_SKIP_DOCKER_INSTALL)) {
      command.push("--skip-docker-install");
    }

    const startedAt = new Date().toISOString();
    const processHandle = Bun.spawn(command, {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      processHandle.exited,
      new Response(processHandle.stdout).text(),
      new Response(processHandle.stderr).text(),
    ]);
    const completedAt = new Date().toISOString();

    const result = {
      schemaVersion: "system.instance-upgrade.apply/v1",
      targetVersion,
      startedAt,
      completedAt,
      exitCode,
      command,
      stdoutTail: tailText(stdout),
      stderrTail: tailText(stderr),
    } satisfies InstanceUpgradeApplyResult;

    if (exitCode !== 0) {
      return err(
        domainError.infra("Instance upgrade failed", {
          phase: "instance-upgrade-execute",
          targetVersion,
          exitCode,
          stderr: tailText(stderr, 500),
        }),
      );
    }

    return ok(result);
  }

  private async resolveInstallerScriptPath(): Promise<Result<string>> {
    const localPath = process.env.APPALOFT_INSTANCE_UPGRADE_INSTALL_SCRIPT_PATH?.trim();
    if (localPath) {
      return ok(localPath);
    }

    const installerUrl =
      process.env.APPALOFT_INSTANCE_UPGRADE_INSTALLER_URL?.trim() ?? defaultInstallerUrl;

    try {
      const response = await fetch(installerUrl);
      if (!response.ok) {
        return err(
          domainError.infra("Instance upgrade installer could not be downloaded", {
            phase: "instance-upgrade-installer",
            status: response.status,
          }),
        );
      }

      const tmpRoot = process.env.TMPDIR?.trim() || "/tmp";
      const scriptPath = `${tmpRoot}/appaloft-upgrade-${process.pid}-${Date.now()}.sh`;
      await Bun.write(scriptPath, await response.text());
      return ok(scriptPath);
    } catch (error) {
      return err(
        domainError.infra("Instance upgrade installer could not be downloaded", {
          phase: "instance-upgrade-installer",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
