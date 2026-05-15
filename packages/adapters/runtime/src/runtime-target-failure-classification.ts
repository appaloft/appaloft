export type RuntimeTargetCapacityResource = "build-cache" | "cpu" | "disk" | "inode" | "memory";
export type RuntimeTargetCapacityFailurePhase =
  | "image-build"
  | "runtime-target-apply"
  | "runtime-target-observation";

export interface RuntimeTargetCapacityFailureClassification {
  code: "runtime_target_resource_exhausted";
  capacityResource: RuntimeTargetCapacityResource;
  signal: string;
  phase?: RuntimeTargetCapacityFailurePhase;
}

export interface RuntimeTargetCapacityFailureLog {
  message: string;
  phase?: string;
}

const capacityPatterns: Array<{
  capacityResource: RuntimeTargetCapacityResource;
  signal: string;
  pattern: RegExp;
}> = [
  {
    capacityResource: "disk",
    signal: "docker-image-store-exhausted",
    pattern:
      /\b(docker image store|image store|layerdb|failed to register layer|register layer|pull access denied|docker pull)\b[\s\S]*\b(no space left on device|enospc|disk quota exceeded|not enough space|store is full|image store full)\b/i,
  },
  {
    capacityResource: "build-cache",
    signal: "docker-build-cache-space",
    pattern:
      /\b(buildkit|buildx|docker build|failed to solve|layer|overlay2|build cache)\b[\s\S]*\b(no space left on device|enospc|disk quota exceeded|not enough space)\b/i,
  },
  {
    capacityResource: "inode",
    signal: "inode-exhausted",
    pattern: /\b(no inodes left|inode[s]?\s+(exhausted|full|unavailable)|free inodes?\s*[:=]\s*0)\b/i,
  },
  {
    capacityResource: "memory",
    signal: "memory-exhausted",
    pattern:
      /\b(out of memory|cannot allocate memory|unable to allocate memory|insufficient memory|memory cgroup out of memory|oom[- ]killed|no suitable node[\s\S]*insufficient memory)\b/i,
  },
  {
    capacityResource: "cpu",
    signal: "cpu-exhausted",
    pattern:
      /\b(insufficient cpu|not enough cpu|cpu quota exceeded|cpu limit exceeded|no suitable node[\s\S]*insufficient cpu)\b/i,
  },
  {
    capacityResource: "disk",
    signal: "disk-space-exhausted",
    pattern:
      /\b(no space left on device|enospc|disk quota exceeded|not enough space|filesystem is full|no space available)\b/i,
  },
];

export function classifyRuntimeTargetCapacityFailureFromText(
  message: string,
): RuntimeTargetCapacityFailureClassification | undefined {
  const match = capacityPatterns.find((candidate) => candidate.pattern.test(message));
  if (!match) {
    return undefined;
  }

  return {
    code: "runtime_target_resource_exhausted",
    capacityResource: match.capacityResource,
    signal: match.signal,
  };
}

export function classifyRuntimeTargetCapacityFailure(
  logs: readonly RuntimeTargetCapacityFailureLog[],
): RuntimeTargetCapacityFailureClassification | undefined {
  for (const log of logs) {
    const classification = classifyRuntimeTargetCapacityFailureFromText(log.message);
    if (classification) {
      const phase = capacityFailurePhaseForLogPhase(log.phase);
      return {
        ...classification,
        ...(phase ? { phase } : {}),
      };
    }
  }

  return undefined;
}

function capacityFailurePhaseForLogPhase(
  phase: string | undefined,
): RuntimeTargetCapacityFailurePhase | undefined {
  if (phase === "package") {
    return "image-build";
  }

  if (phase === "deploy") {
    return "runtime-target-apply";
  }

  if (phase === "verify") {
    return "runtime-target-observation";
  }

  return undefined;
}

export function runtimeTargetCapacityFailureMetadata(input: {
  classification: RuntimeTargetCapacityFailureClassification;
  serverId: string;
}): Record<string, string> {
  return {
    ...(input.classification.phase ? { phase: input.classification.phase } : {}),
    capacityResource: input.classification.capacityResource,
    capacitySignal: input.classification.signal,
    capacityInspectCommand: `appaloft server capacity inspect ${input.serverId}`,
    capacityPruneCommand: `appaloft server capacity prune ${input.serverId} --dry-run`,
  };
}

export function runtimeTargetCapacityAwareFailureFields(input: {
  logs: readonly RuntimeTargetCapacityFailureLog[];
  errorCode: string;
  metadata?: Record<string, string>;
  serverId: string;
}): {
  errorCode: string;
  metadata?: Record<string, string>;
} {
  const capacityFailure = classifyRuntimeTargetCapacityFailure(input.logs);
  const metadata =
    input.metadata || capacityFailure
      ? {
          ...(input.metadata ?? {}),
          ...(capacityFailure
            ? runtimeTargetCapacityFailureMetadata({
                classification: capacityFailure,
                serverId: input.serverId,
              })
            : {}),
        }
      : undefined;

  return {
    errorCode: capacityFailure ? capacityFailure.code : input.errorCode,
    ...(metadata ? { metadata } : {}),
  };
}
