import { ExecuteSandboxCommand } from "@appaloft/application";
import { type Result } from "@appaloft/core";

export const OCCUPANCY_APPALOFT_CLI_VERSION = "1.10.10";
export const OCCUPANCY_APPALOFT_CLI_PATH = ".local/bin/appaloft";
export const OCCUPANCY_APPALOFT_CLI_TIMEOUT_MS = 120_000;

export const OCCUPANCY_APPALOFT_CLI_CHECKSUMS = {
  "linux-arm64-gnu": "b89a9d6de874321c323d156691a9d4ab683e55b3b8f2a1a886aad96bfab04a59",
  "linux-x64-gnu": "7e4baa3a36e008768ed4942af15c34444e42e3880c9d5a1707a14a167ced0028",
} as const;

export function occupancyAppaloftCliInstallScript(
  version: string = OCCUPANCY_APPALOFT_CLI_VERSION,
): string {
  const arm = OCCUPANCY_APPALOFT_CLI_CHECKSUMS["linux-arm64-gnu"];
  const x64 = OCCUPANCY_APPALOFT_CLI_CHECKSUMS["linux-x64-gnu"];
  return [
    "set -eu",
    "if command -v appaloft >/dev/null 2>&1; then exit 0; fi",
    `if [ -x /workspace/${OCCUPANCY_APPALOFT_CLI_PATH} ]; then exit 0; fi`,
    'arch="$(uname -m)"',
    'case "$arch" in',
    `  aarch64|arm64) target=linux-arm64-gnu; sum=${arm} ;;`,
    `  x86_64|amd64) target=linux-x64-gnu; sum=${x64} ;;`,
    '  *) echo "unsupported occupancy arch: $arch" >&2; exit 1 ;;',
    "esac",
    `version=${version}`,
    "tmp=$(mktemp -d)",
    "trap 'rm -rf \"$tmp\"' EXIT",
    'curl -fsSL "https://github.com/appaloft/appaloft/releases/download/v${version}/appaloft-v${version}-${target}.tar.gz" -o "$tmp/appaloft.tgz"',
    'echo "$sum  $tmp/appaloft.tgz" | sha256sum --check --strict',
    'mkdir -p "$tmp/out"',
    'tar -xzf "$tmp/appaloft.tgz" -C "$tmp/out"',
    'bin=$(find "$tmp/out" -type f -name appaloft | head -n 1)',
    'test -n "$bin"',
    "mkdir -p /workspace/.local/bin",
    `install -m 0755 "$bin" /workspace/${OCCUPANCY_APPALOFT_CLI_PATH}`,
    "if [ -w /usr/local/bin ]; then ln -sfn /workspace/.local/bin/appaloft /usr/local/bin/appaloft; fi",
  ].join("\n");
}

export async function offerOccupancyAppaloftCli(input: {
  readonly workspaceId: string;
  readonly executeCommand: (command: ExecuteSandboxCommand) => Promise<Result<unknown>>;
  readonly destinationExists?: (path: string) => Promise<boolean>;
}): Promise<{ readonly offered: boolean; readonly occupancyPath: string }> {
  if (input.destinationExists && (await input.destinationExists(OCCUPANCY_APPALOFT_CLI_PATH))) {
    return { offered: true, occupancyPath: OCCUPANCY_APPALOFT_CLI_PATH };
  }
  const command = ExecuteSandboxCommand.create({
    sandboxId: input.workspaceId,
    argv: ["sh", "-c", occupancyAppaloftCliInstallScript()],
    timeoutMs: OCCUPANCY_APPALOFT_CLI_TIMEOUT_MS,
  });
  if (command.isErr()) {
    return { offered: false, occupancyPath: OCCUPANCY_APPALOFT_CLI_PATH };
  }
  const executed = await input.executeCommand(command.value);
  return {
    offered: executed.isOk(),
    occupancyPath: OCCUPANCY_APPALOFT_CLI_PATH,
  };
}
