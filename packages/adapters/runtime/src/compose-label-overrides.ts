import { type RuntimeCommandLabel } from "./runtime-commands/types";
import type { DockerRunMountInput } from "./runtime-commands";
import type { DockerStorageVolumeRealization } from "./storage-runtime-mounts";

function yamlQuoted(value: string): string {
  return JSON.stringify(value);
}

function renderLabelLines(labels: readonly RuntimeCommandLabel[]): string[] {
  return labels.map((label) => {
    const key = yamlQuoted(label.name.value);
    const value = yamlQuoted(label.value.value);
    return `      ${key}: ${value}`;
  });
}

function renderMountLines(mounts: readonly DockerRunMountInput[]): string[] {
  if (mounts.length === 0) {
    return [];
  }

  return [
    "    volumes:",
    ...mounts.flatMap((mount) => [
      `      - type: ${mount.type}`,
      `        source: ${yamlQuoted(mount.source)}`,
      `        target: ${yamlQuoted(mount.target)}`,
      ...(mount.readOnly ? ["        read_only: true"] : []),
    ]),
  ];
}

function renderTopLevelVolumeLines(input: {
  mounts: readonly DockerRunMountInput[];
  volumeRealizations: readonly DockerStorageVolumeRealization[];
}): string[] {
  const volumeNames = [
    ...new Set(input.mounts.filter((mount) => mount.type === "volume").map((mount) => mount.source)),
  ];
  if (volumeNames.length === 0) {
    return [];
  }

  const labelsByVolumeName = new Map(
    input.volumeRealizations.map((realization) => [realization.volumeName, realization.labels]),
  );

  return [
    "volumes:",
    ...volumeNames.flatMap((volumeName) => {
      const labels = labelsByVolumeName.get(volumeName);
      return [
        `  ${yamlQuoted(volumeName)}:`,
        `    name: ${yamlQuoted(volumeName)}`,
        ...(labels
          ? [
              "    labels:",
              ...Object.entries(labels)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, value]) => `      ${yamlQuoted(key)}: ${yamlQuoted(value)}`),
            ]
          : []),
      ];
    }),
  ];
}

export function renderComposeOwnershipLabelOverrideScript(input: {
  composeFile: string;
  overrideFile: string;
  labels: readonly RuntimeCommandLabel[];
  targetServiceName?: string;
  targetLabels?: readonly RuntimeCommandLabel[];
  targetNetworkName?: string;
  environmentKeys?: readonly string[];
  mounts?: readonly DockerRunMountInput[];
  volumeRealizations?: readonly DockerStorageVolumeRealization[];
  quote: (value: string) => string;
}): string {
  const labelLines = renderLabelLines(input.labels);
  const targetLabelLines = renderLabelLines(input.targetLabels ?? []);
  const environmentLines = [...new Set(input.environmentKeys ?? [])]
    .sort()
    .flatMap((key, index) => [
      ...(index === 0 ? ["    environment:"] : []),
      `      ${yamlQuoted(key)}: ${yamlQuoted(`\${${key}}`)}`,
    ]);
  const mountLines = renderMountLines(input.mounts ?? []);
  const topLevelVolumeLines = renderTopLevelVolumeLines({
    mounts: input.mounts ?? [],
    volumeRealizations: input.volumeRealizations ?? [],
  });
  const topLevelNetworkLines = input.targetNetworkName
    ? [
        "networks:",
        `  ${yamlQuoted(input.targetNetworkName)}:`,
        "    external: true",
        `    name: ${yamlQuoted(input.targetNetworkName)}`,
      ]
    : [];
  const requiresTargetService =
    targetLabelLines.length > 0 || environmentLines.length > 0 || Boolean(input.targetNetworkName);
  const staticLines = [
    "set -eu",
    `compose_file=${input.quote(input.composeFile)}`,
    `override_file=${input.quote(input.overrideFile)}`,
    "appaloft_docker_compose_cmd=''",
    'if docker compose -f "$compose_file" config --services >/dev/null 2>&1; then',
    "  appaloft_docker_compose_cmd='docker compose'",
    'elif command -v docker-compose >/dev/null 2>&1 && docker-compose -f "$compose_file" config --services >/dev/null 2>&1; then',
    "  appaloft_docker_compose_cmd='docker-compose'",
    "else",
    "  appaloft_docker_compose_cmd='docker compose'",
    "fi",
    'services="$($appaloft_docker_compose_cmd -f "$compose_file" config --services)"',
    'if [ -z "$services" ]; then',
    '  printf "%s\\n" "Docker compose config did not return any services" >&2',
    "  exit 2",
    "fi",
    ...(requiresTargetService
      ? [
          ...(input.targetServiceName
            ? [`target_service=${input.quote(input.targetServiceName)}`]
            : [
                'target_service="$(printf "%s\\n" "$services" | sed -n \'1p\')"',
                'service_count="$(printf "%s\\n" "$services" | sed \'/^$/d\' | wc -l | tr -d \' \')"',
                'if [ "$service_count" != "1" ]; then',
                '  printf "%s\\n" "Compose routing requires targetServiceName when the project has multiple services" >&2',
                "  exit 2",
                "fi",
              ]),
        ]
      : []),
    "tmp_file=\"${override_file}.tmp\"",
    "{",
    "  printf '%s\\n' 'services:'",
    '  printf "%s\\n" "$services" | while IFS= read -r service; do',
    '    [ -n "$service" ] || continue',
    '    case "$service" in',
    '      *[!A-Za-z0-9_.-]*)',
    '        printf "%s\\n" "Unsupported compose service name for Appaloft labels: $service" >&2',
    "        exit 2",
    "        ;;",
    "    esac",
    '    printf \'  "%s":\\n\' "$service"',
    "    printf '%s\\n' '    labels:'",
  ];
  const footerLines = [
    ...(requiresTargetService
      ? [
          '    if [ "$service" = "$target_service" ]; then',
          ...targetLabelLines.map((line) => `      printf '%s\\n' ${input.quote(line)}`),
          ...environmentLines.map((line) => `      printf '%s\\n' ${input.quote(line)}`),
          ...(input.targetNetworkName
            ? [
                `      printf '%s\\n' ${input.quote("    networks:")}`,
                `      printf '%s\\n' ${input.quote(`      - ${yamlQuoted(input.targetNetworkName)}`)}`,
              ]
            : []),
          "    fi",
        ]
      : []),
    "  done",
    ...topLevelVolumeLines.map((line) => `  printf '%s\\n' ${input.quote(line)}`),
    ...topLevelNetworkLines.map((line) => `  printf '%s\\n' ${input.quote(line)}`),
    '} > "$tmp_file"',
    'mv "$tmp_file" "$override_file"',
  ];

  return [
    ...staticLines,
    ...labelLines.map((line) => `    printf '%s\\n' ${input.quote(line)}`),
    ...mountLines.map((line) => `    printf '%s\\n' ${input.quote(line)}`),
    ...footerLines,
  ].join("\n");
}
