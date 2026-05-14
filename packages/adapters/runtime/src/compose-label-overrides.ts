import { type RuntimeCommandLabel } from "./runtime-commands/types";

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

export function renderComposeOwnershipLabelOverrideScript(input: {
  composeFile: string;
  overrideFile: string;
  labels: readonly RuntimeCommandLabel[];
  quote: (value: string) => string;
}): string {
  const labelLines = renderLabelLines(input.labels);
  const staticLines = [
    "set -eu",
    `compose_file=${input.quote(input.composeFile)}`,
    `override_file=${input.quote(input.overrideFile)}`,
    'services="$(docker compose -f "$compose_file" config --services)"',
    'if [ -z "$services" ]; then',
    '  printf "%s\\n" "Docker compose config did not return any services" >&2',
    "  exit 2",
    "fi",
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
    "  done",
    '} > "$tmp_file"',
    'mv "$tmp_file" "$override_file"',
  ];

  return [
    ...staticLines,
    ...labelLines.map((line) => `    printf '%s\\n' ${input.quote(line)}`),
    ...footerLines,
  ].join("\n");
}
