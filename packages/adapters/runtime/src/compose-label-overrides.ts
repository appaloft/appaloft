import { type RuntimeCommandLabel } from "./runtime-commands/types";
import type { DockerRunMountInput } from "./runtime-commands";
import type { DockerStorageVolumeRealization } from "./storage-runtime-mounts";

function yamlQuoted(value: string): string {
  return JSON.stringify(value);
}

function renderLabelLines(labels: readonly RuntimeCommandLabel[]): string[] {
  return labels.map((label) => {
    const key = yamlQuoted(label.name.value);
    const value = yamlQuoted(label.value.value.replaceAll("$", () => "$$"));
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
  sharedNetworkNames?: readonly string[];
  serviceTargets?: readonly {
    serviceName: string;
    labels: readonly RuntimeCommandLabel[];
    networkName?: string;
  }[];
  environmentKeys?: readonly string[];
  mounts?: readonly DockerRunMountInput[];
  volumeRealizations?: readonly DockerStorageVolumeRealization[];
  quote: (value: string) => string;
}): string {
  const labelLines = renderLabelLines(input.labels);
  const targetLabelLines = renderLabelLines(input.targetLabels ?? []);
  const serviceTargets = (input.serviceTargets ?? []).map((target) => ({
    ...target,
    labelLines: renderLabelLines(target.labels),
  }));
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
  const targetNetworkNames = [
    ...new Set(
      [
        ...(input.sharedNetworkNames ?? []),
        input.targetNetworkName,
        ...serviceTargets.map((target) => target.networkName),
      ].filter(
        (name): name is string => Boolean(name),
      ),
    ),
  ].sort();
  const sharedNetworkNames = [...new Set(input.sharedNetworkNames ?? [])].sort();
  const targetOnlyNetworkName =
    input.targetNetworkName && !sharedNetworkNames.includes(input.targetNetworkName)
      ? input.targetNetworkName
      : undefined;
  const topLevelNetworkLines = targetNetworkNames.length > 0
    ? [
        "networks:",
        ...targetNetworkNames.flatMap((networkName) => [
          `  ${yamlQuoted(networkName)}:`,
          "    external: true",
          `    name: ${yamlQuoted(networkName)}`,
        ]),
      ]
    : [];
  const requiresTargetService =
    targetLabelLines.length > 0 || environmentLines.length > 0 || Boolean(input.targetNetworkName);
  const serviceNetworkTargets = serviceTargets.flatMap((target) =>
    target.networkName && !sharedNetworkNames.includes(target.networkName)
      ? [{ serviceName: target.serviceName, networkName: target.networkName }]
      : [],
  );
  const rendersServiceNetworks =
    sharedNetworkNames.length > 0 ||
    Boolean(targetOnlyNetworkName) ||
    serviceNetworkTargets.length > 0;
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
    ...(sharedNetworkNames.length > 0
      ? ["# managed dependency networks are attached to every service"]
      : []),
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
    ...(targetLabelLines.length > 0
      ? [
          '    if [ "$service" = "$target_service" ]; then',
          ...targetLabelLines.map((line) => `      printf '%s\\n' ${input.quote(line)}`),
          "    fi",
        ]
      : []),
    ...serviceTargets
      .filter((target) => target.labelLines.length > 0)
      .flatMap((target) => [
        `    if [ "$service" = ${input.quote(target.serviceName)} ]; then`,
        ...target.labelLines.map((line) => `      printf '%s\\n' ${input.quote(line)}`),
        "    fi",
      ]),
    ...(environmentLines.length > 0
      ? [
          '    if [ "$service" = "$target_service" ]; then',
          ...environmentLines.map((line) => `      printf '%s\\n' ${input.quote(line)}`),
          "    fi",
        ]
      : []),
    ...mountLines.map((line) => `    printf '%s\\n' ${input.quote(line)}`),
    ...(rendersServiceNetworks
      ? [
          `    printf '%s\\n' ${input.quote("    networks:")}`,
          ...sharedNetworkNames.map(
            (networkName) =>
              `    printf '%s\\n' ${input.quote(`      - ${yamlQuoted(networkName)}`)}`,
          ),
          ...(targetOnlyNetworkName
            ? [
                '    if [ "$service" = "$target_service" ]; then',
                `      printf '%s\\n' ${input.quote(`      - ${yamlQuoted(targetOnlyNetworkName)}`)}`,
                "    fi",
              ]
            : []),
          ...serviceNetworkTargets.flatMap((target) => [
            `    if [ "$service" = ${input.quote(target.serviceName)} ]; then`,
            `      printf '%s\\n' ${input.quote(`      - ${yamlQuoted(target.networkName)}`)}`,
            "    fi",
          ]),
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
    ...footerLines,
  ].join("\n");
}
