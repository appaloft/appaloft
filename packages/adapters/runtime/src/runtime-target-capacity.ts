import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ExecutionContext,
  type RuntimeTargetCapacityInspection,
  type RuntimeTargetCapacityInspector,
  type RuntimeTargetCapacityPruneCandidate,
  type RuntimeTargetCapacityPruneResult,
  type RuntimeTargetCapacityPruner,
  type RuntimeTargetCapacityWarning,
} from "@appaloft/application";
import { domainError, err, ok, type DeploymentTargetState, type Result } from "@appaloft/core";
import { runBufferedProcess, shellCommand } from "./buffered-process";

const kib = 1024;
const defaultRemoteRuntimeRoot = "/var/lib/appaloft/runtime";

interface PreparedSshArgs {
  args: string[];
  cleanup(): void;
}

interface CapacityCommandResult {
  stdout: string;
  stderr: string;
  failed: boolean;
  timedOut: boolean;
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

function prepareSshArgs(server: DeploymentTargetState, remoteCommand: string): PreparedSshArgs {
  const credential = server.credential;
  let tempDir: string | undefined;
  let identityArgs: string[] = [];

  if (credential?.kind.value === "ssh-private-key" && credential.privateKey) {
    tempDir = mkdtempSync(join(tmpdir(), "appaloft-capacity-ssh-"));
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
      "ConnectTimeout=8",
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

export function renderRuntimeTargetCapacityScript(input: {
  runtimeRoot: string;
  stateRoot?: string;
  sourceWorkspaceRoot?: string;
  profile?: "full" | "attribution";
}): string {
  const runtimeRoot = input.runtimeRoot.replace(/\/+$/, "");
  const stateRoot = input.stateRoot ?? `${runtimeRoot}/state`;
  const sourceWorkspaceRoot = input.sourceWorkspaceRoot ?? `${runtimeRoot}/ssh-deployments`;
  const profile = input.profile ?? "full";

  return [
    "set +e",
    `APPALOFT_RUNTIME_ROOT=${shellQuote(runtimeRoot)}`,
    `APPALOFT_STATE_ROOT=${shellQuote(stateRoot)}`,
    `APPALOFT_SOURCE_WORKSPACE_ROOT=${shellQuote(sourceWorkspaceRoot)}`,
    `APPALOFT_CAPACITY_PROFILE=${shellQuote(profile)}`,
    "printf 'APPALOFT_CAPACITY_V1\\n'",
    "if command -v docker >/dev/null 2>&1; then",
    "  APPALOFT_DOCKER_AVAILABLE=1",
    "  docker ps -aq --filter label=appaloft.managed=true 2>/dev/null | while read -r container_id; do",
    "    [ -n \"$container_id\" ] || continue",
    `    docker inspect --size --format ${shellQuote(
      [
        "CAPACITY_APPALOFT_CONTAINER",
        "{{.Id}}",
        "{{.Name}}",
        "{{.State.Running}}",
        "{{.State.Status}}",
        "{{.SizeRw}}",
        '{{ index .Config.Labels "appaloft.deployment-id" }}',
        '{{ index .Config.Labels "appaloft.project-id" }}',
        '{{ index .Config.Labels "appaloft.environment-id" }}',
        '{{ index .Config.Labels "appaloft.resource-id" }}',
        '{{ index .Config.Labels "appaloft.server-id" }}',
        '{{ index .Config.Labels "appaloft.destination-id" }}',
        '{{ index .Config.Labels "appaloft.artifact-kind" }}',
      ].join("\\t"),
    )} "$container_id" 2>/dev/null`,
    "  done",
    "else",
    "  APPALOFT_DOCKER_AVAILABLE=0",
    "  printf 'CAPACITY_WARNING\\tdocker-unavailable\\tdocker command is unavailable\\n'",
    "fi",
    "if [ \"$APPALOFT_CAPACITY_PROFILE\" = \"attribution\" ]; then",
    "  if [ -d \"$APPALOFT_SOURCE_WORKSPACE_ROOT\" ]; then",
    "    find \"$APPALOFT_SOURCE_WORKSPACE_ROOT\" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | while IFS= read -r workspace; do",
    "      name=$(basename \"$workspace\")",
    "      active_marker=false",
    "      rollback_marker=false",
    "      [ -e \"$workspace/.appaloft-active\" ] && active_marker=true",
    "      [ -e \"$workspace/.appaloft-rollback-candidate\" ] && rollback_marker=true",
    "      printf 'CAPACITY_APPALOFT_WORKSPACE\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \"$name\" \"$workspace\" \"\" \"$active_marker\" \"$rollback_marker\"",
    "    done",
    "  fi",
    "  exit 0",
    "fi",
    "emit_disk() {",
    "  target_path=\"$1\"",
    "  df -P -k \"$target_path\" 2>/dev/null | awk -v p=\"$target_path\" 'NR==2 {gsub(/%/, \"\", $5); printf \"CAPACITY_DISK\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n\", p, $6, $2, $3, $4, $5}'",
    "}",
    "emit_inodes() {",
    "  target_path=\"$1\"",
    "  df -P -i \"$target_path\" 2>/dev/null | awk -v p=\"$target_path\" 'NR==2 {gsub(/%/, \"\", $5); printf \"CAPACITY_INODES\\t%s\\t%s\\t%s\\t%s\\t%s\\n\", p, $6, $3, $4, $5}'",
    "}",
    "emit_du() {",
    "  kind=\"$1\"",
    "  target_path=\"$2\"",
    "  if [ -e \"$target_path\" ]; then",
    "    du -sk \"$target_path\" 2>/dev/null | awk -v kind=\"$kind\" -v p=\"$target_path\" '{printf \"CAPACITY_DU\\t%s\\t%s\\t%s\\n\", kind, p, $1}'",
    "  else",
    "    printf 'CAPACITY_DU\\t%s\\t%s\\tmissing\\n' \"$kind\" \"$target_path\"",
    "  fi",
    "}",
    "for target_path in / /var/lib/docker \"$APPALOFT_RUNTIME_ROOT\" \"$APPALOFT_STATE_ROOT\" \"$APPALOFT_SOURCE_WORKSPACE_ROOT\"; do",
    "  emit_disk \"$target_path\"",
    "  emit_inodes \"$target_path\"",
    "done",
    "emit_du runtimeRoot \"$APPALOFT_RUNTIME_ROOT\"",
    "emit_du stateRoot \"$APPALOFT_STATE_ROOT\"",
    "emit_du sourceWorkspace \"$APPALOFT_SOURCE_WORKSPACE_ROOT\"",
    "if [ -d \"$APPALOFT_SOURCE_WORKSPACE_ROOT\" ]; then",
    "  find \"$APPALOFT_SOURCE_WORKSPACE_ROOT\" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | while IFS= read -r workspace; do",
    "    name=$(basename \"$workspace\")",
    "    size_bytes=$(du -sk \"$workspace\" 2>/dev/null | awk '{print $1 * 1024}')",
    "    active_marker=false",
    "    rollback_marker=false",
    "    [ -e \"$workspace/.appaloft-active\" ] && active_marker=true",
    "    [ -e \"$workspace/.appaloft-rollback-candidate\" ] && rollback_marker=true",
    "    printf 'CAPACITY_APPALOFT_WORKSPACE\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \"$name\" \"$workspace\" \"${size_bytes:-}\" \"$active_marker\" \"$rollback_marker\"",
    "  done",
    "fi",
    "if [ -r /proc/meminfo ]; then",
    "  awk '/MemTotal:/ {total=$2} /MemAvailable:/ {available=$2} END {if (total) printf \"CAPACITY_MEMORY\\t%s\\t%s\\n\", total, available}' /proc/meminfo",
    "fi",
    "cores=$(getconf _NPROCESSORS_ONLN 2>/dev/null)",
    "if [ -r /proc/loadavg ]; then",
    "  read load1 load5 load15 rest < /proc/loadavg",
    "  printf 'CAPACITY_CPU\\t%s\\t%s\\t%s\\t%s\\n' \"${cores:-}\" \"$load1\" \"$load5\" \"$load15\"",
    "else",
    "  printf 'CAPACITY_CPU\\t%s\\t\\t\\t\\n' \"${cores:-}\"",
    "fi",
    "if [ \"$APPALOFT_DOCKER_AVAILABLE\" = \"1\" ]; then",
    "  docker_system_df_output=$(docker system df 2>&1)",
    "  docker_status=$?",
    "  if [ \"$docker_status\" = \"0\" ]; then",
    "    printf '%s\\n' \"$docker_system_df_output\" | sed 's/^/CAPACITY_DOCKER_DF\\t/'",
    "  else",
    "    printf 'CAPACITY_WARNING\\tdocker-unavailable\\tdocker system df failed\\n'",
    "  fi",
    "fi",
  ].join("\n");
}

export function renderRuntimeTargetCapacityPruneScript(input: {
  runtimeRoot: string;
  stateRoot?: string;
  sourceWorkspaceRoot?: string;
  before: string;
  categories: string[];
  dryRun: boolean;
}): string {
  const runtimeRoot = input.runtimeRoot.replace(/\/+$/, "");
  const stateRoot = input.stateRoot ?? `${runtimeRoot}/state`;
  const sourceWorkspaceRoot = input.sourceWorkspaceRoot ?? `${runtimeRoot}/ssh-deployments`;
  const categories = input.categories.join(",");

  return [
    "set +e",
    `APPALOFT_RUNTIME_ROOT=${shellQuote(runtimeRoot)}`,
    `APPALOFT_STATE_ROOT=${shellQuote(stateRoot)}`,
    `APPALOFT_SOURCE_WORKSPACE_ROOT=${shellQuote(sourceWorkspaceRoot)}`,
    `APPALOFT_PRUNE_BEFORE=${shellQuote(input.before)}`,
    `APPALOFT_PRUNE_CATEGORIES=${shellQuote(categories)}`,
    `APPALOFT_PRUNE_DRY_RUN=${input.dryRun ? "1" : "0"}`,
    "printf 'APPALOFT_CAPACITY_PRUNE_V1\\n'",
    "has_category() {",
    "  case \",$APPALOFT_PRUNE_CATEGORIES,\" in",
    "    *\",$1,\"*) return 0 ;;",
    "    *) return 1 ;;",
    "  esac",
    "}",
    "older_than_cutoff() {",
    "  candidate_time=\"$1\"",
    "  [ -n \"$candidate_time\" ] || return 1",
    "  [ \"$candidate_time\" \\< \"$APPALOFT_PRUNE_BEFORE\" ]",
    "}",
    "emit_candidate() {",
    "  category=\"$1\"; id=\"$2\"; target=\"$3\"; updated_at=\"$4\"; size_bytes=\"$5\"; action=\"$6\"; reason=\"$7\"",
    "  printf 'PRUNE_CANDIDATE\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \"$category\" \"$id\" \"$target\" \"$updated_at\" \"$size_bytes\" \"$action\" \"$reason\"",
    "}",
    "if has_category stopped-containers; then",
    "  if command -v docker >/dev/null 2>&1; then",
    "    docker ps -a --filter label=appaloft.managed=true --format '{{.ID}}\\t{{.Names}}\\t{{.Status}}' 2>/dev/null | while IFS='	' read -r cid cname cstatus; do",
    "      [ -n \"$cid\" ] || continue",
    "      ccreated=$(docker inspect -f '{{.Created}}' \"$cid\" 2>/dev/null)",
    "      case \"$cstatus\" in",
    "        Up*) emit_candidate stopped-containers \"$cid\" \"$cname\" \"$ccreated\" \"0\" skipped active-runtime ;;",
    "        *)",
    "          if older_than_cutoff \"$ccreated\"; then",
    "            if [ \"$APPALOFT_PRUNE_DRY_RUN\" = \"1\" ]; then",
    "              emit_candidate stopped-containers \"$cid\" \"$cname\" \"$ccreated\" \"0\" matched \"\"",
    "            else",
    "              docker rm \"$cid\" >/dev/null 2>&1",
    "              if [ \"$?\" = \"0\" ]; then emit_candidate stopped-containers \"$cid\" \"$cname\" \"$ccreated\" \"0\" pruned \"\"; else emit_candidate stopped-containers \"$cid\" \"$cname\" \"$ccreated\" \"0\" skipped safety-evidence-missing; fi",
    "            fi",
    "          else",
    "            emit_candidate stopped-containers \"$cid\" \"$cname\" \"$ccreated\" \"0\" skipped cutoff-not-reached",
    "          fi",
    "          ;;",
    "      esac",
    "    done",
    "  else",
    "    printf 'CAPACITY_WARNING\\tdocker-unavailable\\tdocker command is unavailable\\n'",
    "  fi",
    "fi",
    "if has_category docker-build-cache; then",
    "  if command -v docker >/dev/null 2>&1; then",
    "    if [ \"$APPALOFT_PRUNE_DRY_RUN\" = \"1\" ]; then",
    "      emit_candidate docker-build-cache docker-build-cache docker-build-cache \"$APPALOFT_PRUNE_BEFORE\" \"0\" matched \"\"",
    "    else",
    "      docker builder prune --force --filter \"until=$APPALOFT_PRUNE_BEFORE\" >/dev/null 2>&1",
    "      if [ \"$?\" = \"0\" ]; then emit_candidate docker-build-cache docker-build-cache docker-build-cache \"$APPALOFT_PRUNE_BEFORE\" \"0\" pruned \"\"; else emit_candidate docker-build-cache docker-build-cache docker-build-cache \"$APPALOFT_PRUNE_BEFORE\" \"0\" skipped safety-evidence-missing; fi",
    "    fi",
    "  else",
    "    printf 'CAPACITY_WARNING\\tdocker-unavailable\\tdocker command is unavailable\\n'",
    "  fi",
    "fi",
    "if has_category unused-images; then",
    "  if command -v docker >/dev/null 2>&1; then",
    "    if [ \"$APPALOFT_PRUNE_DRY_RUN\" = \"1\" ]; then",
    "      emit_candidate unused-images docker-unused-images docker-unused-images \"$APPALOFT_PRUNE_BEFORE\" \"0\" matched \"\"",
    "    else",
    "      docker image prune --force --filter \"until=$APPALOFT_PRUNE_BEFORE\" >/dev/null 2>&1",
    "      if [ \"$?\" = \"0\" ]; then emit_candidate unused-images docker-unused-images docker-unused-images \"$APPALOFT_PRUNE_BEFORE\" \"0\" pruned \"\"; else emit_candidate unused-images docker-unused-images docker-unused-images \"$APPALOFT_PRUNE_BEFORE\" \"0\" skipped safety-evidence-missing; fi",
    "    fi",
    "  else",
    "    printf 'CAPACITY_WARNING\\tdocker-unavailable\\tdocker command is unavailable\\n'",
    "  fi",
    "fi",
    "if has_category preview-workspaces || has_category source-workspaces; then",
    "  if [ -d \"$APPALOFT_SOURCE_WORKSPACE_ROOT\" ]; then",
    "    find \"$APPALOFT_SOURCE_WORKSPACE_ROOT\" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | while IFS= read -r workspace; do",
    "      name=$(basename \"$workspace\")",
    "      case \"$workspace\" in",
    "        \"$APPALOFT_STATE_ROOT\"|\"$APPALOFT_STATE_ROOT\"/*|\"$APPALOFT_RUNTIME_ROOT/state\"|\"$APPALOFT_RUNTIME_ROOT/state\"/*)",
    "          emit_candidate source-workspaces \"$name\" \"$workspace\" \"\" \"0\" excluded state-root-excluded",
    "          continue",
    "          ;;",
    "      esac",
    "      category=source-workspaces",
    "      case \"$name\" in *preview*|prv_*|preview_*) category=preview-workspaces ;; esac",
    "      has_category \"$category\" || continue",
    "      updated_at=$(date -r \"$workspace\" -u +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null)",
    "      size_bytes=$(du -sk \"$workspace\" 2>/dev/null | awk '{print $1 * 1024}')",
    "      if older_than_cutoff \"$updated_at\"; then",
    "        if [ -e \"$workspace/.appaloft-active\" ]; then",
    "          emit_candidate \"$category\" \"$name\" \"$workspace\" \"$updated_at\" \"${size_bytes:-0}\" skipped active-runtime",
    "        elif [ -e \"$workspace/.appaloft-rollback-candidate\" ]; then",
    "          emit_candidate \"$category\" \"$name\" \"$workspace\" \"$updated_at\" \"${size_bytes:-0}\" skipped rollback-candidate",
    "        elif [ \"$APPALOFT_PRUNE_DRY_RUN\" = \"1\" ]; then",
    "          emit_candidate \"$category\" \"$name\" \"$workspace\" \"$updated_at\" \"${size_bytes:-0}\" matched \"\"",
    "        else",
    "          rm -rf \"$workspace\"",
    "          if [ \"$?\" = \"0\" ]; then emit_candidate \"$category\" \"$name\" \"$workspace\" \"$updated_at\" \"${size_bytes:-0}\" pruned \"\"; else emit_candidate \"$category\" \"$name\" \"$workspace\" \"$updated_at\" \"${size_bytes:-0}\" skipped safety-evidence-missing; fi",
    "        fi",
    "      else",
    "        emit_candidate \"$category\" \"$name\" \"$workspace\" \"$updated_at\" \"${size_bytes:-0}\" skipped cutoff-not-reached",
    "      fi",
    "    done",
    "  fi",
    "fi",
    "emit_candidate source-workspaces state-root \"$APPALOFT_STATE_ROOT\" \"\" \"0\" excluded state-root-excluded",
    "emit_candidate source-workspaces volumes docker-volumes \"\" \"0\" excluded volume-excluded",
  ].join("\n");
}

function parseNumber(input: string | undefined): number | null {
  if (!input) {
    return null;
  }

  const value = Number(input);
  return Number.isFinite(value) ? value : null;
}

function sanitizeDockerTemplateValue(input: string | undefined): string {
  const value = input?.trim() ?? "";
  return value === "<no value>" || value === "<nil>" ? "" : value;
}

export function parseDockerSizeToBytes(input: string | undefined): number {
  const trimmed = input?.trim() ?? "";
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*([kmgtp]?i?b)$/i.exec(trimmed);
  if (!match) {
    return 0;
  }

  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const multiplier =
    unit === "b"
      ? 1
      : unit === "kb" || unit === "kib"
        ? kib
        : unit === "mb" || unit === "mib"
          ? kib ** 2
          : unit === "gb" || unit === "gib"
            ? kib ** 3
            : unit === "tb" || unit === "tib"
              ? kib ** 4
              : unit === "pb" || unit === "pib"
                ? kib ** 5
                : 0;

  return Math.round(value * multiplier);
}

function parseReclaimableSize(input: string | undefined): number {
  return parseDockerSizeToBytes(input?.split(/\s+/)[0]);
}

function dockerTypeFromLine(line: string): string | null {
  if (line.startsWith("Local Volumes")) {
    return "Local Volumes";
  }
  if (line.startsWith("Build Cache")) {
    return "Build Cache";
  }

  return line.split(/\s+/)[0] ?? null;
}

function dockerColumnsFromLine(line: string): string[] {
  const withoutType = line.startsWith("Local Volumes")
    ? line.replace(/^Local Volumes\s+/, "")
    : line.startsWith("Build Cache")
      ? line.replace(/^Build Cache\s+/, "")
      : line.replace(/^[^\s]+\s+/, "");
  return withoutType.trim().split(/\s+/);
}

function warning(
  code: RuntimeTargetCapacityWarning["code"],
  message: string,
  input?: Omit<RuntimeTargetCapacityWarning, "code" | "message">,
): RuntimeTargetCapacityWarning {
  return {
    code,
    message,
    ...(input ?? {}),
  };
}

export function parseRuntimeTargetCapacityOutput(input: {
  stdout: string;
  stderr?: string;
  server: DeploymentTargetState;
  inspectedAt: string;
  timedOut?: boolean;
}): Result<RuntimeTargetCapacityInspection> {
  if (!input.stdout.includes("APPALOFT_CAPACITY_V1")) {
    return err(
      domainError.infra("Runtime target capacity diagnostic output was not recognized", {
        phase: "runtime-target-capacity",
        serverId: input.server.id.value,
      }),
    );
  }

  const disk = new Map<string, RuntimeTargetCapacityInspection["disk"][number]>();
  const inodes = new Map<string, RuntimeTargetCapacityInspection["inodes"][number]>();
  const pathUsage = new Map<string, RuntimeTargetCapacityInspection["appaloftRuntime"]["runtimeRoot"]>();
  const docker: RuntimeTargetCapacityInspection["docker"] = {
    imagesSize: 0,
    reclaimableImagesSize: 0,
    buildCacheSize: 0,
    reclaimableBuildCacheSize: 0,
    containersSize: 0,
    volumesSize: 0,
  };
  const appaloftContainers: RuntimeTargetCapacityInspection["appaloftContainers"] = [];
  const appaloftWorkspaces: RuntimeTargetCapacityInspection["appaloftWorkspaces"] = [];
  let reclaimableContainersSize = 0;
  const warnings: RuntimeTargetCapacityWarning[] = [];
  let memory: RuntimeTargetCapacityInspection["memory"] = {
    total: null,
    available: null,
    used: null,
    usePercent: null,
  };
  let cpu: RuntimeTargetCapacityInspection["cpu"] = {
    logicalCores: null,
    loadAverage1m: null,
    loadAverage5m: null,
    loadAverage15m: null,
  };

  for (const line of input.stdout.split(/\r?\n/)) {
    const parts = line.split("\t");
    const tag = parts[0];

    if (tag === "CAPACITY_DISK") {
      const [path, mount, sizeKb, usedKb, availableKb, usePercent] = parts.slice(1);
      const parsedUsePercent = parseNumber(usePercent) ?? 0;
      const entry = {
        path: path ?? "",
        mount: mount ?? "",
        size: (parseNumber(sizeKb) ?? 0) * kib,
        used: (parseNumber(usedKb) ?? 0) * kib,
        available: (parseNumber(availableKb) ?? 0) * kib,
        usePercent: parsedUsePercent,
      };
      disk.set(`${entry.path}:${entry.mount}`, entry);
      if (parsedUsePercent >= 100) {
        warnings.push(
          warning("full-disk", `Disk is full at ${entry.path}`, {
            path: entry.path,
            mount: entry.mount,
            resource: "disk",
          }),
        );
      } else if (parsedUsePercent >= 90) {
        warnings.push(
          warning("high-disk-usage", `Disk usage is high at ${entry.path}`, {
            path: entry.path,
            mount: entry.mount,
            resource: "disk",
          }),
        );
      }
      continue;
    }

    if (tag === "CAPACITY_INODES") {
      const [path, mount, used, free, usePercent] = parts.slice(1);
      const parsedUsePercent = parseNumber(usePercent) ?? 0;
      const entry = {
        path: path ?? "",
        mount: mount ?? "",
        used: parseNumber(used) ?? 0,
        free: parseNumber(free) ?? 0,
        usePercent: parsedUsePercent,
      };
      inodes.set(`${entry.path}:${entry.mount}`, entry);
      if (parsedUsePercent >= 90) {
        warnings.push(
          warning("high-inode-usage", `Inode usage is high at ${entry.path}`, {
            path: entry.path,
            mount: entry.mount,
            resource: "inode",
          }),
        );
      }
      continue;
    }

    if (tag === "CAPACITY_DU") {
      const [kind, path, sizeKb] = parts.slice(1);
      pathUsage.set(kind ?? "", {
        path: path ?? "",
        size: sizeKb === "missing" ? null : (parseNumber(sizeKb) ?? 0) * kib,
        detectable: sizeKb !== "missing",
      });
      continue;
    }

    if (tag === "CAPACITY_MEMORY") {
      const [totalKb, availableKb] = parts.slice(1);
      const total = (parseNumber(totalKb) ?? 0) * kib;
      const available = (parseNumber(availableKb) ?? 0) * kib;
      const used = Math.max(total - available, 0);
      memory = {
        total,
        available,
        used,
        usePercent: total > 0 ? Math.round((used / total) * 100) : null,
      };
      continue;
    }

    if (tag === "CAPACITY_CPU") {
      const [cores, load1, load5, load15] = parts.slice(1);
      cpu = {
        logicalCores: parseNumber(cores),
        loadAverage1m: parseNumber(load1),
        loadAverage5m: parseNumber(load5),
        loadAverage15m: parseNumber(load15),
      };
      continue;
    }

    if (tag === "CAPACITY_DOCKER_DF") {
      const dockerLine = parts.slice(1).join("\t");
      if (!dockerLine || dockerLine.startsWith("TYPE ")) {
        continue;
      }
      const dockerType = dockerTypeFromLine(dockerLine);
      const columns = dockerColumnsFromLine(dockerLine);
      const size = parseDockerSizeToBytes(columns[2]);
      const reclaimable = parseReclaimableSize(columns[3]);

      if (dockerType === "Images") {
        docker.imagesSize = size;
        docker.reclaimableImagesSize = reclaimable;
      } else if (dockerType === "Containers") {
        docker.containersSize = size;
        reclaimableContainersSize = reclaimable;
      } else if (dockerType === "Local Volumes") {
        docker.volumesSize = size;
      } else if (dockerType === "Build Cache") {
        docker.buildCacheSize = size;
        docker.reclaimableBuildCacheSize = reclaimable;
      }
      continue;
    }

    if (tag === "CAPACITY_APPALOFT_CONTAINER") {
      const [
        id,
        name,
        running,
        status,
        writableBytes,
        deploymentId,
        projectId,
        environmentId,
        resourceId,
        serverId,
        destinationId,
        artifactKind,
      ] = parts.slice(1);
      appaloftContainers.push({
        id: sanitizeDockerTemplateValue(id),
        name: sanitizeDockerTemplateValue(name).replace(/^\/+/, ""),
        running: running === "true",
        status: sanitizeDockerTemplateValue(status),
        writableBytes: parseNumber(sanitizeDockerTemplateValue(writableBytes)),
        ...(sanitizeDockerTemplateValue(deploymentId)
          ? { deploymentId: sanitizeDockerTemplateValue(deploymentId) }
          : {}),
        ...(sanitizeDockerTemplateValue(projectId)
          ? { projectId: sanitizeDockerTemplateValue(projectId) }
          : {}),
        ...(sanitizeDockerTemplateValue(environmentId)
          ? { environmentId: sanitizeDockerTemplateValue(environmentId) }
          : {}),
        ...(sanitizeDockerTemplateValue(resourceId)
          ? { resourceId: sanitizeDockerTemplateValue(resourceId) }
          : {}),
        ...(sanitizeDockerTemplateValue(serverId)
          ? { serverId: sanitizeDockerTemplateValue(serverId) }
          : {}),
        ...(sanitizeDockerTemplateValue(destinationId)
          ? { destinationId: sanitizeDockerTemplateValue(destinationId) }
          : {}),
        ...(sanitizeDockerTemplateValue(artifactKind)
          ? { artifactKind: sanitizeDockerTemplateValue(artifactKind) }
          : {}),
      });
      continue;
    }

    if (tag === "CAPACITY_APPALOFT_WORKSPACE") {
      const [deploymentId, path, sizeBytes, activeMarker, rollbackCandidateMarker] =
        parts.slice(1);
      const normalizedDeploymentId = sanitizeDockerTemplateValue(deploymentId);
      if (!normalizedDeploymentId) {
        continue;
      }

      appaloftWorkspaces.push({
        deploymentId: normalizedDeploymentId,
        path: path ?? "",
        bytes: sizeBytes === "" ? null : parseNumber(sizeBytes),
        activeMarker: activeMarker === "true",
        rollbackCandidateMarker: rollbackCandidateMarker === "true",
      });
      continue;
    }

    if (tag === "CAPACITY_WARNING") {
      const [code, message] = parts.slice(1);
      warnings.push(
        warning(
          code === "docker-unavailable" ? "docker-unavailable" : "partial-diagnostic",
          message ?? "Capacity diagnostic warning",
          code === "docker-unavailable" ? { resource: "docker" } : undefined,
        ),
      );
    }
  }

  if (input.timedOut) {
    warnings.push(
      warning("timeout", "Capacity diagnostic timed out before all checks completed", {
        resource: "appaloft-runtime",
      }),
    );
  }

  if (input.stderr?.trim()) {
    warnings.push(
      warning("partial-diagnostic", "Capacity diagnostic emitted non-fatal stderr output", {
        resource: "appaloft-runtime",
      }),
    );
  }

  const runtimeRoot = pathUsage.get("runtimeRoot") ?? {
    path: defaultRemoteRuntimeRoot,
    size: null,
    detectable: false,
  };
  const stateRoot = pathUsage.get("stateRoot") ?? {
    path: `${runtimeRoot.path}/state`,
    size: null,
    detectable: false,
  };
  const sourceWorkspace = pathUsage.get("sourceWorkspace") ?? {
    path: `${runtimeRoot.path}/ssh-deployments`,
    size: null,
    detectable: false,
  };
  const safeReclaimableEstimate = {
    stoppedContainersSize: reclaimableContainersSize,
    danglingImagesSize: docker.reclaimableImagesSize,
    oldBuildCacheSize: docker.reclaimableBuildCacheSize,
    oldPreviewWorkspaceCandidatesSize: 0,
    total:
      reclaimableContainersSize + docker.reclaimableImagesSize + docker.reclaimableBuildCacheSize,
  };

  return ok({
    schemaVersion: "servers.capacity.inspect/v1",
    server: {
      id: input.server.id.value,
      name: input.server.name.value,
      host: input.server.host.value,
      port: input.server.port.value,
      providerKey: input.server.providerKey.value,
      targetKind: input.server.targetKind.value,
    },
    inspectedAt: input.inspectedAt,
    disk: [...disk.values()],
    inodes: [...inodes.values()],
    docker,
    memory,
    cpu,
    appaloftRuntime: {
      runtimeRoot,
      stateRoot,
      sourceWorkspace,
    },
    appaloftContainers,
    appaloftWorkspaces,
    safeReclaimableEstimate,
    warnings,
    partial: warnings.some((item) =>
      ["docker-unavailable", "timeout", "partial-diagnostic"].includes(item.code),
    ),
  });
}

function isPruneAction(
  input: string,
): input is RuntimeTargetCapacityPruneCandidate["action"] {
  return ["matched", "pruned", "skipped", "excluded"].includes(input);
}

function isPruneSkippedReason(
  input: string,
): input is NonNullable<RuntimeTargetCapacityPruneCandidate["skippedReason"]> {
  return [
    "active-runtime",
    "rollback-candidate",
    "cutoff-not-reached",
    "ownership-unproven",
    "unsupported-category",
    "volume-excluded",
    "state-root-excluded",
    "remote-state-excluded",
    "safety-evidence-missing",
  ].includes(input);
}

function isPruneCategory(
  input: string,
): input is RuntimeTargetCapacityPruneCandidate["category"] {
  return [
    "stopped-containers",
    "preview-workspaces",
    "source-workspaces",
    "docker-build-cache",
    "unused-images",
  ].includes(input);
}

export function parseRuntimeTargetCapacityPruneOutput(input: {
  stdout: string;
  stderr?: string;
  server: DeploymentTargetState;
  before: string;
  categories: RuntimeTargetCapacityPruneCandidate["category"][];
  dryRun: boolean;
  prunedAt: string;
  timedOut?: boolean;
}): Result<RuntimeTargetCapacityPruneResult> {
  if (!input.stdout.includes("APPALOFT_CAPACITY_PRUNE_V1")) {
    return err(
      domainError.infra("Runtime target capacity prune output was not recognized", {
        phase: "runtime-target-capacity-prune",
        serverId: input.server.id.value,
      }),
    );
  }

  const candidates: RuntimeTargetCapacityPruneCandidate[] = [];
  const warnings: RuntimeTargetCapacityWarning[] = [];

  for (const line of input.stdout.split(/\r?\n/)) {
    const parts = line.split("\t");
    const tag = parts[0];

    if (tag === "PRUNE_CANDIDATE") {
      const [category, id, target, updatedAt, size, action, reason] = parts.slice(1);
      if (!category || !isPruneCategory(category) || !action || !isPruneAction(action)) {
        continue;
      }

      const skippedReason =
        reason && isPruneSkippedReason(reason) ? { skippedReason: reason } : {};
      candidates.push({
        id: id ?? "",
        category,
        target: target ?? "",
        updatedAt: updatedAt || null,
        size: parseNumber(size),
        action,
        ...skippedReason,
      });
      continue;
    }

    if (tag === "CAPACITY_WARNING") {
      const [code, message] = parts.slice(1);
      warnings.push(
        warning(
          code === "docker-unavailable" ? "docker-unavailable" : "partial-diagnostic",
          message ?? "Capacity prune warning",
          code === "docker-unavailable" ? { resource: "docker" } : undefined,
        ),
      );
    }
  }

  if (input.timedOut) {
    warnings.push(
      warning("timeout", "Capacity prune timed out before all checks completed", {
        resource: "appaloft-runtime",
      }),
    );
  }

  if (input.stderr?.trim()) {
    warnings.push(
      warning("partial-diagnostic", "Capacity prune emitted non-fatal stderr output", {
        resource: "appaloft-runtime",
      }),
    );
  }

  const prunedCandidates = candidates.filter((candidate) => candidate.action === "pruned");
  const reclaimedBytes = prunedCandidates.reduce((sum, candidate) => sum + (candidate.size ?? 0), 0);

  return ok({
    schemaVersion: "servers.capacity.prune/v1",
    server: {
      id: input.server.id.value,
      name: input.server.name.value,
      host: input.server.host.value,
      port: input.server.port.value,
      providerKey: input.server.providerKey.value,
      targetKind: input.server.targetKind.value,
    },
    before: input.before,
    categories: input.categories,
    dryRun: input.dryRun,
    prunedAt: input.prunedAt,
    summary: {
      inspectedCount: candidates.length,
      matchedCount: candidates.filter((candidate) => candidate.action === "matched").length,
      prunedCount: prunedCandidates.length,
      skippedCount: candidates.filter((candidate) => candidate.action === "skipped").length,
      excludedCount: candidates.filter((candidate) => candidate.action === "excluded").length,
      reclaimedBytes,
    },
    candidates,
    warnings,
  });
}

async function runLocalCapacityScript(script: string): Promise<CapacityCommandResult> {
  const result = await runBufferedProcess({
    command: shellCommand(script),
    timeoutMs: 15_000,
    timeoutMessage: "Capacity diagnostic timed out",
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    failed: result.failed,
    timedOut: result.timedOut,
  };
}

async function runSshCapacityScript(
  server: DeploymentTargetState,
  script: string,
): Promise<CapacityCommandResult> {
  const prepared = prepareSshArgs(server, script);
  try {
    const result = await runBufferedProcess({
      command: ["ssh", ...prepared.args],
      timeoutMs: 20_000,
      timeoutMessage: "Capacity diagnostic timed out",
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      failed: result.failed,
      timedOut: result.timedOut,
    };
  } finally {
    prepared.cleanup();
  }
}

export class RuntimeTargetCapacityInspectorAdapter implements RuntimeTargetCapacityInspector {
  constructor(
    private readonly localRuntimeRoot: string,
    private readonly remoteRuntimeRoot = defaultRemoteRuntimeRoot,
  ) {}

  async inspect(
    _context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
      profile?: "full" | "attribution";
    },
  ): Promise<Result<RuntimeTargetCapacityInspection>> {
    const providerKey = input.server.providerKey.value;
    if (providerKey !== "local-shell" && providerKey !== "generic-ssh") {
      return err(
        domainError.runtimeTargetUnsupported("Runtime target capacity diagnostics are unsupported", {
          phase: "runtime-target-capacity",
          serverId: input.server.id.value,
          providerKey,
          targetKind: input.server.targetKind.value,
          missingCapability: "runtime.capacity",
        }),
      );
    }

    const script = renderRuntimeTargetCapacityScript({
      runtimeRoot: providerKey === "generic-ssh" ? this.remoteRuntimeRoot : this.localRuntimeRoot,
      profile: input.profile ?? "full",
    });
    const result =
      providerKey === "generic-ssh"
        ? await runSshCapacityScript(input.server, script)
        : await runLocalCapacityScript(script);

    const parsed = parseRuntimeTargetCapacityOutput({
      stdout: result.stdout,
      stderr: result.failed ? result.stderr : "",
      server: input.server,
      inspectedAt: new Date().toISOString(),
      timedOut: result.timedOut,
    });

    if (parsed.isOk()) {
      return parsed;
    }

    return err(
      domainError.infra("Runtime target capacity diagnostic failed", {
        phase: "runtime-target-capacity",
        serverId: input.server.id.value,
        providerKey,
        stderr: result.stderr.slice(0, 240),
      }),
    );
  }
}

export class RuntimeTargetCapacityPrunerAdapter implements RuntimeTargetCapacityPruner {
  constructor(
    private readonly localRuntimeRoot: string,
    private readonly remoteRuntimeRoot = defaultRemoteRuntimeRoot,
  ) {}

  async prune(
    _context: ExecutionContext,
    input: Parameters<RuntimeTargetCapacityPruner["prune"]>[1],
  ): Promise<Result<RuntimeTargetCapacityPruneResult>> {
    const providerKey = input.server.providerKey.value;
    if (providerKey !== "local-shell" && providerKey !== "generic-ssh") {
      return err(
        domainError.runtimeTargetUnsupported("Runtime target capacity prune is unsupported", {
          phase: "runtime-target-capacity-prune",
          serverId: input.server.id.value,
          providerKey,
          targetKind: input.server.targetKind.value,
          missingCapability: "runtime.capacity",
        }),
      );
    }

    const script = renderRuntimeTargetCapacityPruneScript({
      runtimeRoot: providerKey === "generic-ssh" ? this.remoteRuntimeRoot : this.localRuntimeRoot,
      before: input.before,
      categories: input.categories,
      dryRun: input.dryRun,
    });
    const result =
      providerKey === "generic-ssh"
        ? await runSshCapacityScript(input.server, script)
        : await runLocalCapacityScript(script);

    const parsed = parseRuntimeTargetCapacityPruneOutput({
      stdout: result.stdout,
      stderr: result.failed ? result.stderr : "",
      server: input.server,
      before: input.before,
      categories: input.categories,
      dryRun: input.dryRun,
      prunedAt: new Date().toISOString(),
      timedOut: result.timedOut,
    });

    if (parsed.isOk()) {
      return parsed;
    }

    return err(
      domainError.infra("Runtime target capacity prune failed", {
        phase: "runtime-target-capacity-prune",
        serverId: input.server.id.value,
        providerKey,
        stderr: result.stderr.slice(0, 240),
      }),
    );
  }
}
