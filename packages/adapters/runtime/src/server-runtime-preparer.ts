import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ExecutionContext,
  type ServerRuntimePrepareResult,
  type ServerRuntimePreparationStep,
  type ServerRuntimePreparer,
} from "@appaloft/application";
import { ok, type DeploymentTargetState, type Result } from "@appaloft/core";

import { runBufferedProcess, shellCommand } from "./buffered-process";

interface CommandRunnerResult {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}

type CommandRunner = (
  command: string,
  args: string[],
  timeoutMs: number,
) => Promise<CommandRunnerResult>;

interface PreparedSshArgs {
  args: string[];
  cleanup(): void;
}

const shellParameterExpansion = {
  ubuntuCodename: "${UBUNTU_CODENAME:-}",
  versionCodename: "${VERSION_CODENAME:-}",
} as const;

const remoteDockerPrepareCommand = String.raw`
set -eu
if command -v docker >/dev/null 2>&1 && docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
  printf 'APPALOFT_DOCKER_READY already-installed\n'
  exit 0
fi
if ! command -v apt-get >/dev/null 2>&1; then
  printf 'APPALOFT_DOCKER_UNSUPPORTED package-manager\n' >&2
  exit 42
fi
if [ "$(id -u)" -ne 0 ] && ! command -v sudo >/dev/null 2>&1; then
  printf 'APPALOFT_DOCKER_UNSUPPORTED privilege\n' >&2
  exit 43
fi
SUDO=''
if [ "$(id -u)" -ne 0 ]; then
  SUDO='sudo'
fi
. /etc/os-release
case "$ID" in
  ubuntu|debian) ;;
  *)
    printf 'APPALOFT_DOCKER_UNSUPPORTED distro:%s\n' "$ID" >&2
    exit 44
    ;;
esac
export DEBIAN_FRONTEND=noninteractive
apt_run() {
  attempt=1
  while true; do
    "$@" && return 0
    status="$?"
    if [ "$attempt" -ge 5 ]; then
      return "$status"
    fi
    printf 'APPALOFT_APT_RETRY attempt:%s status:%s command:%s\n' "$attempt" "$status" "$*" >&2
    $SUDO dpkg --configure -a || true
    sleep "$((attempt * 5))"
    attempt="$((attempt + 1))"
  done
}
printf 'APPALOFT_DOCKER_PREPARE docker-repository-reset\n'
$SUDO rm -f /etc/apt/sources.list.d/docker.list /etc/apt/sources.list.d/docker.list.save
printf 'APPALOFT_DOCKER_PREPARE apt-bootstrap\n'
apt_run $SUDO apt-get -o DPkg::Lock::Timeout=120 update
apt_run $SUDO dpkg --configure -a
apt_run $SUDO apt-get -o DPkg::Lock::Timeout=120 install -y ca-certificates curl gnupg
$SUDO install -m 0755 -d /etc/apt/keyrings
if [ ! -s /etc/apt/keyrings/docker.gpg ]; then
  $SUDO rm -f /etc/apt/keyrings/docker.gpg
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" | $SUDO gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
fi
$SUDO chmod a+r /etc/apt/keyrings/docker.gpg
ARCH="$(dpkg --print-architecture)"
CODENAME="${shellParameterExpansion.versionCodename}"
if [ -z "$CODENAME" ]; then
  CODENAME="$(. /etc/os-release && printf '%s' "${shellParameterExpansion.ubuntuCodename}")"
fi
if [ -z "$CODENAME" ]; then
  printf 'APPALOFT_DOCKER_UNSUPPORTED codename\n' >&2
  exit 45
fi
printf 'APPALOFT_DOCKER_PREPARE docker-repository %s %s %s\n' "$ID" "$CODENAME" "$ARCH"
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/%s %s stable\n' "$ARCH" "$ID" "$CODENAME" | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
apt_run $SUDO apt-get -o DPkg::Lock::Timeout=120 update
printf 'APPALOFT_DOCKER_PREPARE docker-packages\n'
apt_run $SUDO apt-get -o DPkg::Lock::Timeout=120 install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
if command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl enable --now docker || true
fi
docker version --format '{{.Server.Version}}'
printf '\nAPPALOFT_DOCKER_READY installed\n'
`;

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

function trimOutput(stdout: string | undefined, stderr: string | undefined): string {
  const output = `${String(stdout ?? "")}\n${String(stderr ?? "")}`.trim();
  if (output.length === 0) return "";
  if (output.length <= 4_000) return output;
  return `${output.slice(0, 1_600)}\n...APPALOFT_OUTPUT_TRUNCATED...\n${output.slice(-2_000)}`;
}

function prepareSshArgs(server: DeploymentTargetState, remoteCommand: string): PreparedSshArgs {
  const credential = server.credential;
  let tempDir: string | undefined;
  let identityArgs: string[] = [];

  if (credential?.kind.value === "ssh-private-key" && credential.privateKey) {
    tempDir = mkdtempSync(join(tmpdir(), "appaloft-ssh-"));
    const identityFile = join(tempDir, "id_deployment_target");
    writeFileSync(
      identityFile,
      credential.privateKey.value.endsWith("\n")
        ? credential.privateKey.value
        : `${credential.privateKey.value}\n`,
      { mode: 0o600 },
    );
    chmodSync(identityFile, 0o600);
    identityArgs = ["-i", identityFile, "-o", "IdentitiesOnly=yes"];
  }

  return {
    args: [
      "-p",
      String(server.port.value),
      ...identityArgs,
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "StrictHostKeyChecking=accept-new",
      hostWithUsername(server.host.value, credential?.username?.value),
      remoteCommand,
    ],
    cleanup(): void {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  };
}

async function defaultCommandRunner(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<CommandRunnerResult> {
  const result = await runBufferedProcess({
    command:
      command === "sh" && args[0] === "-lc" && args[1]
        ? shellCommand(args[1])
        : [command, ...args],
    timeoutMs,
    env: process.env,
  });
  return {
    status: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(result.error ? { error: result.error } : {}),
  };
}

function dockerStepFromResult(input: {
  server: DeploymentTargetState;
  result: CommandRunnerResult;
  durationMs: number;
}): ServerRuntimePreparationStep {
  const output = trimOutput(input.result.stdout, input.result.stderr);
  if (input.result.status === 0) {
    return {
      phase: "docker",
      status: "succeeded",
      message: output.includes("already-installed")
        ? "Docker is already available"
        : "Docker is installed and available",
      durationMs: input.durationMs,
      metadata: {
        providerKey: input.server.providerKey.value,
        ...(output ? { output } : {}),
      },
    };
  }

  return {
    phase: "docker",
    status: "failed",
    message:
      input.result.error instanceof Error
        ? `Docker preparation failed: ${input.result.error.message}`
        : output || "Docker preparation failed",
    durationMs: input.durationMs,
    metadata: {
      providerKey: input.server.providerKey.value,
      ...(String(input.result.status ?? "").trim()
        ? { exitCode: String(input.result.status) }
        : {}),
      ...(output ? { output } : {}),
    },
  };
}

export class RuntimeServerRuntimePreparer implements ServerRuntimePreparer {
  constructor(private readonly commandRunner: CommandRunner = defaultCommandRunner) {}

  async prepare(
    _context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
      mode: "prepare" | "repair" | "upgrade";
    },
  ): Promise<Result<ServerRuntimePrepareResult>> {
    const { server } = input;

    if (server.providerKey.value === "local-shell") {
      const startedAt = Date.now();
      const result = await this.commandRunner(
        "sh",
        ["-lc", "docker version --format '{{.Server.Version}}'"],
        30_000,
      );
      return ok({
        serverId: server.id.value,
        steps: [
          dockerStepFromResult({
            server,
            result,
            durationMs: Date.now() - startedAt,
          }),
        ],
      });
    }

    if (server.providerKey.value !== "generic-ssh") {
      return ok({
        serverId: server.id.value,
        steps: [
          {
            phase: "docker",
            status: "failed",
            message: `No runtime preparer is registered for ${server.providerKey.value}`,
            durationMs: 0,
            metadata: {
              providerKey: server.providerKey.value,
            },
          },
        ],
      });
    }

    const prepared = prepareSshArgs(server, remoteDockerPrepareCommand);
    const startedAt = Date.now();
    try {
      const result = await this.commandRunner("ssh", prepared.args, 900_000);
      return ok({
        serverId: server.id.value,
        steps: [
          dockerStepFromResult({
            server,
            result,
            durationMs: Date.now() - startedAt,
          }),
        ],
      });
    } finally {
      prepared.cleanup();
    }
  }
}
