#!/usr/bin/env bash
set -euo pipefail

trim_quotes() {
  local value="$1"
  value="${value%%#*}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

read_yaml_path_value() {
  local file="$1"
  local path="$2"
  awk -v path="$path" '
    BEGIN {
      path_length = split(path, path_parts, ".")
      depth = 0
    }
    function trim(value) {
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      sub(/^"/, "", value)
      sub(/"$/, "", value)
      sub(/^\047/, "", value)
      sub(/\047$/, "", value)
      return value
    }
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      line = $0
      sub(/[[:space:]]+#.*$/, "", line)
      indent = match(line, /[^[:space:]]/) - 1
      content = line
      sub(/^[[:space:]]+/, "", content)
      separator = index(content, ":")
      if (separator == 0) next

      key = substr(content, 1, separator - 1)
      value = trim(substr(content, separator + 1))

      while (depth > 0 && indent <= indent_stack[depth]) {
        depth--
      }

      if (key == path_parts[depth + 1]) {
        depth++
        indent_stack[depth] = indent
        if (depth == path_length) {
          print value
          exit
        }
      }
    }
  ' "$file"
}

read_json_path_value() {
  local file="$1"
  local path="$2"
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const path = process.argv[2].split(".");
    let value = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const part of path) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        value = undefined;
        break;
      }
      value = value[part];
    }
    if (["string", "number", "boolean"].includes(typeof value)) {
      process.stdout.write(String(value));
    }
  ' "$file" "$path"
}

read_config_path_value() {
  local file="$1"
  local path="$2"
  if [ ! -f "$file" ]; then
    return 0
  fi

  normalized_file="$(printf '%s' "$file" | tr '[:upper:]' '[:lower:]')"
  case "$normalized_file" in
    *.json)
      read_json_path_value "$file" "$path"
      ;;
    *)
      trim_quotes "$(read_yaml_path_value "$file" "$path")"
      ;;
  esac
}

pull_request_number_from_context() {
  if [ -n "${INPUT_PULL_REQUEST_NUMBER:-}" ]; then
    case "$INPUT_PULL_REQUEST_NUMBER" in
      ''|*[!0-9]*)
        ;;
      *)
        printf '%s' "$INPUT_PULL_REQUEST_NUMBER"
        return 0
        ;;
    esac
  fi

  normalized_preview_id="$(printf '%s' "${INPUT_PREVIEW_ID:-}" | tr '[:upper:]' '[:lower:]')"
  normalized_preview_id="${normalized_preview_id#preview-}"
  normalized_preview_id="${normalized_preview_id#cloud-pr-}"
  normalized_preview_id="${normalized_preview_id#pr-}"
  case "$normalized_preview_id" in
    ''|*[!0-9]*)
      ;;
    *)
      printf '%s' "$normalized_preview_id"
      return 0
      ;;
  esac

  case "${GITHUB_REF:-}" in
    refs/pull/*/merge|refs/pull/*/head)
      local without_prefix="${GITHUB_REF#refs/pull/}"
      printf '%s' "${without_prefix%%/*}"
      return 0
      ;;
  esac

  printf ''
}

render_template() {
  local template="$1"
  local preview_id="$2"
  local pr_number="$3"
  local rendered="$template"
  rendered="${rendered//\{preview_id\}/$preview_id}"
  rendered="${rendered//\{pr_number\}/$pr_number}"
  printf '%s' "$rendered"
}

config_path="${INPUT_CONFIG:-}"
if [ -z "$config_path" ] && [ -f "appaloft.yml" ]; then
  config_path="appaloft.yml"
fi

preview_id="${INPUT_PREVIEW_ID:-}"
domain_template="${INPUT_PREVIEW_DOMAIN_TEMPLATE:-}"
tls_mode="${INPUT_PREVIEW_TLS_MODE:-}"
has_preview_route_input=false

if [ -n "$domain_template" ] || [ -n "$tls_mode" ]; then
  has_preview_route_input=true
fi

if [ -n "$config_path" ] && [ -f "$config_path" ]; then
  config_domain_template="$(read_config_path_value "$config_path" "preview.pullRequest.domainTemplate")"
  config_tls_mode="$(read_config_path_value "$config_path" "preview.pullRequest.tlsMode")"
  if [ -n "$config_domain_template" ] || [ -n "$config_tls_mode" ]; then
    has_preview_route_input=true
  fi
  domain_template="${domain_template:-$config_domain_template}"
  tls_mode="${tls_mode:-$config_tls_mode}"
fi

if $has_preview_route_input; then
  tls_mode="${tls_mode:-auto}"
  case "$tls_mode" in
    auto|disabled)
      ;;
    *)
      echo "::error::preview.pullRequest.tlsMode must be 'auto' or 'disabled'." >&2
      exit 1
      ;;
  esac
else
  tls_mode=""
fi

if [ -n "$domain_template" ]; then
  if [ -z "$preview_id" ]; then
    echo "::error::preview-id is required to render preview.pullRequest.domainTemplate." >&2
    exit 1
  fi
  pr_number="$(pull_request_number_from_context)"
  domain_template="$(render_template "$domain_template" "$preview_id" "$pr_number")"
  if [[ "$domain_template" == *"{"* || "$domain_template" == *"}"* ]]; then
    echo "::error::preview.pullRequest.domainTemplate contains unsupported template variables." >&2
    exit 1
  fi
fi

if [ -n "$domain_template" ]; then
  if [ "$tls_mode" = "disabled" ]; then
    preview_url="http://${domain_template}"
  else
    preview_url="https://${domain_template}"
  fi
else
  preview_url=""
fi

{
  echo "preview-domain-template=$domain_template"
  echo "preview-tls-mode=$tls_mode"
  echo "preview-url=$preview_url"
} >> "${GITHUB_OUTPUT:-/dev/null}"

if [ -n "${APPALOFT_DEPLOY_ACTION_RESOLVE_PREVIEW_OUTPUT:-}" ]; then
  {
    echo "preview-domain-template=$domain_template"
    echo "preview-tls-mode=$tls_mode"
    echo "preview-url=$preview_url"
  } > "$APPALOFT_DEPLOY_ACTION_RESOLVE_PREVIEW_OUTPUT"
fi
