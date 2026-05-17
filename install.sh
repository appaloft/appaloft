#!/usr/bin/env sh
set -eu

APPALOFT_VERSION="${APPALOFT_VERSION:-latest}"
APPALOFT_IMAGE="${APPALOFT_IMAGE:-ghcr.io/appaloft/appaloft}"
APPALOFT_HOME="${APPALOFT_HOME:-}"
APPALOFT_HTTP_HOST="${APPALOFT_HTTP_HOST:-0.0.0.0}"
APPALOFT_HTTP_PORT="${APPALOFT_HTTP_PORT:-3721}"
APPALOFT_WEB_ORIGIN="${APPALOFT_WEB_ORIGIN:-}"
APPALOFT_PUBLIC_HOST="${APPALOFT_PUBLIC_HOST:-}"
APPALOFT_CONSOLE_DOMAIN="${APPALOFT_CONSOLE_DOMAIN:-}"
APPALOFT_SELF_HOST_DATABASE="${APPALOFT_SELF_HOST_DATABASE:-postgres}"
APPALOFT_SELF_HOST_ORCHESTRATOR="${APPALOFT_SELF_HOST_ORCHESTRATOR:-compose}"
APPALOFT_SELF_HOST_PROXY="${APPALOFT_SELF_HOST_PROXY:-traefik}"
APPALOFT_EDGE_NETWORK_NAME="${APPALOFT_EDGE_NETWORK_NAME:-appaloft-edge}"
APPALOFT_TRAEFIK_IMAGE="${APPALOFT_TRAEFIK_IMAGE:-traefik:v3.6.2}"
APPALOFT_SELF_HOST_TRACE="${APPALOFT_SELF_HOST_TRACE:-none}"
APPALOFT_JAEGER_IMAGE="${APPALOFT_JAEGER_IMAGE:-jaegertracing/all-in-one:latest}"
APPALOFT_JAEGER_UI_HOST="${APPALOFT_JAEGER_UI_HOST:-127.0.0.1}"
APPALOFT_JAEGER_UI_PORT="${APPALOFT_JAEGER_UI_PORT:-16686}"
APPALOFT_OTEL_SERVICE_NAME="${APPALOFT_OTEL_SERVICE_NAME:-appaloft-self-host}"
APPALOFT_OTEL_EXPORTER_OTLP_ENDPOINT="${APPALOFT_OTEL_EXPORTER_OTLP_ENDPOINT:-}"
APPALOFT_TRACE_LINK_BASE_URL="${APPALOFT_TRACE_LINK_BASE_URL:-}"
APPALOFT_POSTGRES_IMAGE="${APPALOFT_POSTGRES_IMAGE:-postgres:16}"
APPALOFT_POSTGRES_PASSWORD="${APPALOFT_POSTGRES_PASSWORD:-}"
APPALOFT_BOOTSTRAP_DEPLOY_TOKEN="${APPALOFT_BOOTSTRAP_DEPLOY_TOKEN:-0}"
APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE="${APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE:-}"
APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE="${APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE:-/tmp/appaloft-bootstrap/first-admin.json}"
APPALOFT_BETTER_AUTH_SECRET="${APPALOFT_BETTER_AUTH_SECRET:-}"
APPALOFT_FIRST_ADMIN_EMAIL="${APPALOFT_FIRST_ADMIN_EMAIL:-}"
APPALOFT_FIRST_ADMIN_DISPLAY_NAME="${APPALOFT_FIRST_ADMIN_DISPLAY_NAME:-}"
APPALOFT_FIRST_ADMIN_PASSWORD="${APPALOFT_FIRST_ADMIN_PASSWORD:-}"
APPALOFT_COMPOSE_PROJECT_NAME="${APPALOFT_COMPOSE_PROJECT_NAME:-appaloft}"
APPALOFT_SWARM_STACK_NAME="${APPALOFT_SWARM_STACK_NAME:-appaloft}"
APPALOFT_SWARM_INIT="${APPALOFT_SWARM_INIT:-0}"
APPALOFT_SWARM_ADVERTISE_ADDR="${APPALOFT_SWARM_ADVERTISE_ADDR:-}"
APPALOFT_SKIP_DOCKER_INSTALL="${APPALOFT_SKIP_DOCKER_INSTALL:-0}"
APPALOFT_SKIP_IMAGE_PULL="${APPALOFT_SKIP_IMAGE_PULL:-0}"
APPALOFT_INSTALL_DRY_RUN="${APPALOFT_INSTALL_DRY_RUN:-0}"
APPALOFT_DOCKER_INSTALL_SCRIPT_URL="${APPALOFT_DOCKER_INSTALL_SCRIPT_URL:-https://get.docker.com}"
APPALOFT_FORCE_COLOR="${APPALOFT_FORCE_COLOR:-0}"
appaloft_color_reset=""
appaloft_color_bold=""
appaloft_color_dim=""
appaloft_color_green=""
appaloft_color_cyan=""
appaloft_color_yellow=""
appaloft_color_red=""

say() {
  printf '%s\n' "$*"
}

warn() {
  printf '%sappaloft install:%s %s\n' "$appaloft_color_yellow" "$appaloft_color_reset" "$*" >&2
}

step() {
  printf '\n%s==>%s %s%s%s\n' \
    "$appaloft_color_cyan" \
    "$appaloft_color_reset" \
    "$appaloft_color_bold" \
    "$*" \
    "$appaloft_color_reset"
}

fail() {
  printf '%sappaloft install failed:%s %s\n' "$appaloft_color_red" "$appaloft_color_reset" "$*" >&2
  exit 1
}

init_color() {
  case "$APPALOFT_FORCE_COLOR" in
    1 | true | TRUE | yes | YES | on | ON) ;;
    *)
      [ -z "${NO_COLOR:-}" ] || return 0
      [ -t 1 ] || return 0
      ;;
  esac

  appaloft_color_reset="$(printf '\033[0m')"
  appaloft_color_bold="$(printf '\033[1m')"
  appaloft_color_dim="$(printf '\033[2m')"
  appaloft_color_green="$(printf '\033[32m')"
  appaloft_color_cyan="$(printf '\033[36m')"
  appaloft_color_yellow="$(printf '\033[33m')"
  appaloft_color_red="$(printf '\033[31m')"
}

print_success_banner() {
  printf '\n%s' "$appaloft_color_green"
  cat <<'BANNER'

      _       PPPP   PPPP       _       L       OOOO   FFFFF  TTTTT
     / \      P   P  P   P     / \      L      O    O  F        T
    / _ \     PPPP   PPPP     / _ \     L      O    O  FFF      T
   / ___ \    P      P       / ___ \    L      O    O  F        T
  /_/   \_\   P      P      /_/   \_\   LLLLL   OOOO   F        T

                 Self-host console is ready.

BANNER
  printf '%s' "$appaloft_color_reset"
}

print_next_steps() {
  logs_command="$1"

  step "Next steps"
  printf '  %sOpen console:%s %s\n' "$appaloft_color_bold" "$appaloft_color_reset" "$appaloft_web_origin"
  printf '  %sWatch logs:%s    %s\n' "$appaloft_color_bold" "$appaloft_color_reset" "$logs_command"
  printf '  %sUpdate/repair:%s rerun the same install command; existing config and data are reused.\n' \
    "$appaloft_color_bold" \
    "$appaloft_color_reset"
  printf '  %sOAuth later:%s configure GitHub, Google, or OIDC client settings and rerun; local first-admin login keeps working until then.\n' \
    "$appaloft_color_bold" \
    "$appaloft_color_reset"
  printf '  %sGitHub Action token:%s create one later in the console, or rerun with --bootstrap-deploy-token to print a one-time APPALOFT_TOKEN handoff.\n' \
    "$appaloft_color_bold" \
    "$appaloft_color_reset"
  if [ -n "$APPALOFT_CONSOLE_DOMAIN" ]; then
    printf '  %sDNS:%s           keep %s pointed at this server.\n' \
      "$appaloft_color_bold" \
      "$appaloft_color_reset" \
      "$APPALOFT_CONSOLE_DOMAIN"
  fi
  if [ "$APPALOFT_SELF_HOST_TRACE" = "jaeger" ]; then
    printf '  %sTrace UI:%s      %s\n' "$appaloft_color_bold" "$appaloft_color_reset" "$appaloft_trace_link_base_url"
  fi
  printf '  %sGitHub Action:%s use this console URL when switching deployments to self-hosted server mode.\n' \
    "$appaloft_color_bold" \
    "$appaloft_color_reset"
}

usage() {
  cat <<'USAGE'
Install Appaloft as a self-hosted Docker Compose or Docker Swarm stack.

Usage:
  curl -fsSL https://appaloft.com/install.sh | sudo sh
  curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --version 0.2.1

Options:
  --version <version>              Appaloft image tag. Defaults to latest.
  --image <image>                  Image repository or full image ref. Defaults to ghcr.io/appaloft/appaloft.
  --home <dir>                     Install directory. Defaults to /opt/appaloft on Linux.
  --host <host>                    Host bind address. Defaults to 0.0.0.0.
  --port <port>                    Host HTTP port for direct-IP access. Defaults to 3721.
  --public-host <host>             Hostname or IP used for fallback origin when --domain is absent.
  --web-origin <url>               Public console origin. Defaults to https://<domain> or http://<public-host>:<port>.
  --domain <domain>                Public console domain. Enables the managed Traefik console route.
  --database <postgres|pglite>      Persistence backend. Defaults to postgres.
  --orchestrator <compose|swarm>    Docker orchestrator. Defaults to compose.
  --proxy <traefik|none>            Managed self-host proxy. Defaults to traefik.
  --trace <none|jaeger>             Optional tracing stack. Defaults to none.
  --jaeger-image <image>            Jaeger all-in-one image when --trace jaeger is used.
  --jaeger-ui-host <host>           Jaeger UI bind host. Defaults to 127.0.0.1.
  --jaeger-ui-port <port>           Jaeger UI host port. Defaults to 16686.
  --postgres-password <password>   PostgreSQL password. Existing installs reuse .env.
  --auth-secret <secret>           Product auth session secret. Existing installs reuse .env.
  --bootstrap-deploy-token         Create an initial GitHub Action deploy token and print it once.
  --first-admin-email <email>       Create the first local admin during install.
  --first-admin-name <name>         Display name for the first local admin.
  --first-admin-password <password> Password for the first local admin. Generated if omitted.
  --postgres-image <image>         PostgreSQL image. Defaults to postgres:16.
  --project-name <name>            Docker Compose project name. Defaults to appaloft.
  --stack-name <name>              Docker Swarm stack name. Defaults to appaloft.
  --swarm-init                     Initialize a single-node Swarm manager when none is active.
  --swarm-advertise-addr <addr>    Optional address passed to docker swarm init.
  --skip-docker-install            Require an existing Docker Engine installation.
  --skip-image-pull                Skip Docker Compose image pull; use only when images already exist locally.
  --dry-run                        Print the selected Docker stack without installing.
  -h, --help                       Show this help.

Environment:
  APPALOFT_VERSION
  APPALOFT_IMAGE
  APPALOFT_HOME
  APPALOFT_HTTP_HOST
  APPALOFT_HTTP_PORT
  APPALOFT_WEB_ORIGIN
  APPALOFT_PUBLIC_HOST
  APPALOFT_CONSOLE_DOMAIN
  APPALOFT_SELF_HOST_DATABASE=postgres|pglite
  APPALOFT_SELF_HOST_ORCHESTRATOR=compose|swarm
  APPALOFT_SELF_HOST_PROXY=traefik|none
  APPALOFT_EDGE_NETWORK_NAME
  APPALOFT_TRAEFIK_IMAGE
  APPALOFT_SELF_HOST_TRACE=none|jaeger
  APPALOFT_JAEGER_IMAGE
  APPALOFT_JAEGER_UI_HOST
  APPALOFT_JAEGER_UI_PORT
  APPALOFT_OTEL_SERVICE_NAME
  APPALOFT_OTEL_EXPORTER_OTLP_ENDPOINT
  APPALOFT_TRACE_LINK_BASE_URL
  APPALOFT_POSTGRES_IMAGE
  APPALOFT_POSTGRES_PASSWORD
  APPALOFT_BETTER_AUTH_SECRET
  APPALOFT_BOOTSTRAP_DEPLOY_TOKEN=1
  APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE
  APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE
  APPALOFT_FIRST_ADMIN_EMAIL
  APPALOFT_FIRST_ADMIN_DISPLAY_NAME
  APPALOFT_FIRST_ADMIN_PASSWORD
  APPALOFT_COMPOSE_PROJECT_NAME
  APPALOFT_SWARM_STACK_NAME
  APPALOFT_SWARM_INIT=1
  APPALOFT_SWARM_ADVERTISE_ADDR
  APPALOFT_SKIP_DOCKER_INSTALL=1
  APPALOFT_SKIP_IMAGE_PULL=1
  APPALOFT_INSTALL_DRY_RUN=1
  APPALOFT_FORCE_COLOR=1
  NO_COLOR=1
USAGE
}

init_color

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      shift
      [ "$#" -gt 0 ] || fail "--version requires a value"
      APPALOFT_VERSION="$1"
      ;;
    --version=*)
      APPALOFT_VERSION="${1#--version=}"
      ;;
    --image)
      shift
      [ "$#" -gt 0 ] || fail "--image requires a value"
      APPALOFT_IMAGE="$1"
      ;;
    --image=*)
      APPALOFT_IMAGE="${1#--image=}"
      ;;
    --home | --install-dir)
      shift
      [ "$#" -gt 0 ] || fail "--home requires a value"
      APPALOFT_HOME="$1"
      ;;
    --home=* | --install-dir=*)
      APPALOFT_HOME="${1#*=}"
      ;;
    --host)
      shift
      [ "$#" -gt 0 ] || fail "--host requires a value"
      APPALOFT_HTTP_HOST="$1"
      ;;
    --host=*)
      APPALOFT_HTTP_HOST="${1#--host=}"
      ;;
    --port)
      shift
      [ "$#" -gt 0 ] || fail "--port requires a value"
      APPALOFT_HTTP_PORT="$1"
      ;;
    --port=*)
      APPALOFT_HTTP_PORT="${1#--port=}"
      ;;
    --public-host)
      shift
      [ "$#" -gt 0 ] || fail "--public-host requires a value"
      APPALOFT_PUBLIC_HOST="$1"
      ;;
    --public-host=*)
      APPALOFT_PUBLIC_HOST="${1#--public-host=}"
      ;;
    --web-origin)
      shift
      [ "$#" -gt 0 ] || fail "--web-origin requires a value"
      APPALOFT_WEB_ORIGIN="$1"
      ;;
    --web-origin=*)
      APPALOFT_WEB_ORIGIN="${1#--web-origin=}"
      ;;
    --domain)
      shift
      [ "$#" -gt 0 ] || fail "--domain requires a value"
      APPALOFT_CONSOLE_DOMAIN="$1"
      ;;
    --domain=*)
      APPALOFT_CONSOLE_DOMAIN="${1#--domain=}"
      ;;
    --database)
      shift
      [ "$#" -gt 0 ] || fail "--database requires a value"
      APPALOFT_SELF_HOST_DATABASE="$1"
      ;;
    --database=*)
      APPALOFT_SELF_HOST_DATABASE="${1#--database=}"
      ;;
    --orchestrator)
      shift
      [ "$#" -gt 0 ] || fail "--orchestrator requires a value"
      APPALOFT_SELF_HOST_ORCHESTRATOR="$1"
      ;;
    --orchestrator=*)
      APPALOFT_SELF_HOST_ORCHESTRATOR="${1#--orchestrator=}"
      ;;
    --proxy)
      shift
      [ "$#" -gt 0 ] || fail "--proxy requires a value"
      APPALOFT_SELF_HOST_PROXY="$1"
      ;;
    --proxy=*)
      APPALOFT_SELF_HOST_PROXY="${1#--proxy=}"
      ;;
    --trace)
      shift
      [ "$#" -gt 0 ] || fail "--trace requires a value"
      APPALOFT_SELF_HOST_TRACE="$1"
      ;;
    --trace=*)
      APPALOFT_SELF_HOST_TRACE="${1#--trace=}"
      ;;
    --jaeger-image)
      shift
      [ "$#" -gt 0 ] || fail "--jaeger-image requires a value"
      APPALOFT_JAEGER_IMAGE="$1"
      ;;
    --jaeger-image=*)
      APPALOFT_JAEGER_IMAGE="${1#--jaeger-image=}"
      ;;
    --jaeger-ui-host)
      shift
      [ "$#" -gt 0 ] || fail "--jaeger-ui-host requires a value"
      APPALOFT_JAEGER_UI_HOST="$1"
      ;;
    --jaeger-ui-host=*)
      APPALOFT_JAEGER_UI_HOST="${1#--jaeger-ui-host=}"
      ;;
    --jaeger-ui-port)
      shift
      [ "$#" -gt 0 ] || fail "--jaeger-ui-port requires a value"
      APPALOFT_JAEGER_UI_PORT="$1"
      ;;
    --jaeger-ui-port=*)
      APPALOFT_JAEGER_UI_PORT="${1#--jaeger-ui-port=}"
      ;;
    --postgres-password)
      shift
      [ "$#" -gt 0 ] || fail "--postgres-password requires a value"
      APPALOFT_POSTGRES_PASSWORD="$1"
      ;;
    --postgres-password=*)
      APPALOFT_POSTGRES_PASSWORD="${1#--postgres-password=}"
      ;;
    --auth-secret | --better-auth-secret)
      shift
      [ "$#" -gt 0 ] || fail "--auth-secret requires a value"
      APPALOFT_BETTER_AUTH_SECRET="$1"
      ;;
    --auth-secret=* | --better-auth-secret=*)
      APPALOFT_BETTER_AUTH_SECRET="${1#*=}"
      ;;
    --bootstrap-deploy-token)
      APPALOFT_BOOTSTRAP_DEPLOY_TOKEN=1
      if [ -z "$APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE" ]; then
        APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE="/tmp/appaloft-bootstrap/deploy-token.json"
      fi
      ;;
    --first-admin-email)
      shift
      [ "$#" -gt 0 ] || fail "--first-admin-email requires a value"
      APPALOFT_FIRST_ADMIN_EMAIL="$1"
      ;;
    --first-admin-email=*)
      APPALOFT_FIRST_ADMIN_EMAIL="${1#--first-admin-email=}"
      ;;
    --first-admin-name)
      shift
      [ "$#" -gt 0 ] || fail "--first-admin-name requires a value"
      APPALOFT_FIRST_ADMIN_DISPLAY_NAME="$1"
      ;;
    --first-admin-name=*)
      APPALOFT_FIRST_ADMIN_DISPLAY_NAME="${1#--first-admin-name=}"
      ;;
    --first-admin-password)
      shift
      [ "$#" -gt 0 ] || fail "--first-admin-password requires a value"
      APPALOFT_FIRST_ADMIN_PASSWORD="$1"
      ;;
    --first-admin-password=*)
      APPALOFT_FIRST_ADMIN_PASSWORD="${1#--first-admin-password=}"
      ;;
    --postgres-image)
      shift
      [ "$#" -gt 0 ] || fail "--postgres-image requires a value"
      APPALOFT_POSTGRES_IMAGE="$1"
      ;;
    --postgres-image=*)
      APPALOFT_POSTGRES_IMAGE="${1#--postgres-image=}"
      ;;
    --project-name)
      shift
      [ "$#" -gt 0 ] || fail "--project-name requires a value"
      APPALOFT_COMPOSE_PROJECT_NAME="$1"
      ;;
    --project-name=*)
      APPALOFT_COMPOSE_PROJECT_NAME="${1#--project-name=}"
      ;;
    --stack-name)
      shift
      [ "$#" -gt 0 ] || fail "--stack-name requires a value"
      APPALOFT_SWARM_STACK_NAME="$1"
      ;;
    --stack-name=*)
      APPALOFT_SWARM_STACK_NAME="${1#--stack-name=}"
      ;;
    --swarm-init)
      APPALOFT_SWARM_INIT=1
      ;;
    --swarm-advertise-addr)
      shift
      [ "$#" -gt 0 ] || fail "--swarm-advertise-addr requires a value"
      APPALOFT_SWARM_ADVERTISE_ADDR="$1"
      ;;
    --swarm-advertise-addr=*)
      APPALOFT_SWARM_ADVERTISE_ADDR="${1#--swarm-advertise-addr=}"
      ;;
    --skip-docker-install | --no-install-docker)
      APPALOFT_SKIP_DOCKER_INSTALL=1
      ;;
    --skip-image-pull)
      APPALOFT_SKIP_IMAGE_PULL=1
      ;;
    --dry-run)
      APPALOFT_INSTALL_DRY_RUN=1
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      fail "unknown option: $1"
      ;;
    *)
      if [ "$APPALOFT_VERSION" = "latest" ]; then
        APPALOFT_VERSION="$1"
      else
        fail "unexpected argument: $1"
      fi
      ;;
  esac
  shift
done

truthy() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    1 | true | yes | on) return 0 ;;
    *) return 1 ;;
  esac
}

normalize_version() {
  case "$1" in
    v*) printf '%s\n' "${1#v}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

detect_os() {
  case "$(uname -s 2>/dev/null || true)" in
    Darwin) printf 'darwin\n' ;;
    Linux) printf 'linux\n' ;;
    *) fail "unsupported operating system: $(uname -s 2>/dev/null || echo unknown)" ;;
  esac
}

choose_home() {
  if [ -n "$APPALOFT_HOME" ]; then
    printf '%s\n' "$APPALOFT_HOME"
    return
  fi

  if [ "$(detect_os)" = "linux" ]; then
    printf '/opt/appaloft\n'
    return
  fi

  [ -n "${HOME:-}" ] || fail "HOME is not set; pass APPALOFT_HOME or --home"
  printf '%s/.appaloft\n' "$HOME"
}

image_ref() {
  version="$1"
  last_segment="${APPALOFT_IMAGE##*/}"

  case "$APPALOFT_IMAGE" in
    *@*)
      printf '%s\n' "$APPALOFT_IMAGE"
      ;;
    *)
      case "$last_segment" in
        *:*) printf '%s\n' "$APPALOFT_IMAGE" ;;
        *) printf '%s:%s\n' "$APPALOFT_IMAGE" "$version" ;;
      esac
      ;;
  esac
}

validate_port() {
  case "$APPALOFT_HTTP_PORT" in
    '' | *[!0-9]*) fail "--port must be a positive integer" ;;
  esac

  [ "$APPALOFT_HTTP_PORT" -gt 0 ] || fail "--port must be a positive integer"
}

validate_jaeger_ui_port() {
  case "$APPALOFT_JAEGER_UI_PORT" in
    '' | *[!0-9]*) fail "--jaeger-ui-port must be a positive integer" ;;
  esac

  [ "$APPALOFT_JAEGER_UI_PORT" -gt 0 ] || fail "--jaeger-ui-port must be a positive integer"
}

validate_database() {
  APPALOFT_SELF_HOST_DATABASE="$(printf '%s' "$APPALOFT_SELF_HOST_DATABASE" | tr '[:upper:]' '[:lower:]')"

  case "$APPALOFT_SELF_HOST_DATABASE" in
    postgres | pglite) return 0 ;;
    *) fail "--database must be postgres or pglite" ;;
  esac
}

validate_orchestrator() {
  APPALOFT_SELF_HOST_ORCHESTRATOR="$(printf '%s' "$APPALOFT_SELF_HOST_ORCHESTRATOR" | tr '[:upper:]' '[:lower:]')"

  case "$APPALOFT_SELF_HOST_ORCHESTRATOR" in
    compose | swarm) return 0 ;;
    *) fail "--orchestrator must be compose or swarm" ;;
  esac
}

validate_proxy() {
  APPALOFT_SELF_HOST_PROXY="$(printf '%s' "$APPALOFT_SELF_HOST_PROXY" | tr '[:upper:]' '[:lower:]')"

  case "$APPALOFT_SELF_HOST_PROXY" in
    traefik | none) return 0 ;;
    *) fail "--proxy must be traefik or none" ;;
  esac
}

validate_trace() {
  APPALOFT_SELF_HOST_TRACE="$(printf '%s' "$APPALOFT_SELF_HOST_TRACE" | tr '[:upper:]' '[:lower:]')"

  case "$APPALOFT_SELF_HOST_TRACE" in
    none | jaeger) return 0 ;;
    *) fail "--trace must be none or jaeger" ;;
  esac
}

sanitize_domain() {
  value="$1"
  case "$value" in
    http://*) value="${value#http://}" ;;
    https://*) value="${value#https://}" ;;
  esac
  value="${value%%/*}"
  printf '%s\n' "$value"
}

validate_domain() {
  if [ -z "$APPALOFT_CONSOLE_DOMAIN" ]; then
    return
  fi

  case "$APPALOFT_CONSOLE_DOMAIN" in
    *[!A-Za-z0-9.-]* | .* | *. | *..*)
      fail "--domain must be a hostname without scheme, path, port, spaces, or wildcards"
      ;;
  esac
}

detect_public_host() {
  if [ -n "$APPALOFT_PUBLIC_HOST" ]; then
    printf '%s\n' "$APPALOFT_PUBLIC_HOST"
    return
  fi

  if ! truthy "$APPALOFT_INSTALL_DRY_RUN" && command -v curl >/dev/null 2>&1; then
    detected="$(curl -fsS --max-time 2 https://api.ipify.org 2>/dev/null || true)"
    if [ -n "$detected" ]; then
      printf '%s\n' "$detected"
      return
    fi
  fi

  if command -v hostname >/dev/null 2>&1; then
    detected="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    if [ -n "$detected" ]; then
      printf '%s\n' "$detected"
      return
    fi
  fi

  printf 'localhost\n'
}

resolve_web_origin() {
  if [ -n "$APPALOFT_WEB_ORIGIN" ]; then
    printf '%s\n' "$APPALOFT_WEB_ORIGIN"
    return
  fi

  if [ -n "$APPALOFT_CONSOLE_DOMAIN" ]; then
    printf 'https://%s\n' "$APPALOFT_CONSOLE_DOMAIN"
    return
  fi

  printf 'http://%s:%s\n' "$(detect_public_host)" "$APPALOFT_HTTP_PORT"
}

resolve_otel_exporter_endpoint() {
  if [ -n "$APPALOFT_OTEL_EXPORTER_OTLP_ENDPOINT" ]; then
    printf '%s\n' "$APPALOFT_OTEL_EXPORTER_OTLP_ENDPOINT"
    return
  fi

  if [ "$APPALOFT_SELF_HOST_TRACE" = "jaeger" ]; then
    printf 'http://jaeger:4318\n'
  fi
}

resolve_trace_link_base_url() {
  if [ -n "$APPALOFT_TRACE_LINK_BASE_URL" ]; then
    printf '%s\n' "$APPALOFT_TRACE_LINK_BASE_URL"
    return
  fi

  if [ "$APPALOFT_SELF_HOST_TRACE" = "jaeger" ]; then
    printf 'http://%s:%s\n' "$APPALOFT_JAEGER_UI_HOST" "$APPALOFT_JAEGER_UI_PORT"
  fi
}

run_as_root() {
  if [ "$(id -u 2>/dev/null || echo 1)" = "0" ]; then
    "$@"
    return $?
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return $?
  fi

  fail "root privileges are required; rerun with sudo"
}

run_maybe_root() {
  if "$@" 2>/dev/null; then
    return
  fi

  run_as_root "$@"
}

download_to() {
  url="$1"
  destination="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$destination"
    return $?
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$destination" "$url"
    return $?
  fi

  fail "curl or wget is required"
}

root_docker() {
  run_as_root docker "$@"
}

docker_command_succeeds() {
  if docker "$@" >/dev/null 2>&1; then
    return 0
  fi

  if [ "$(id -u 2>/dev/null || echo 1)" = "0" ] || command -v sudo >/dev/null 2>&1; then
    root_docker "$@" >/dev/null 2>&1
    return $?
  fi

  return 1
}

start_docker_service() {
  if docker_command_succeeds info; then
    return
  fi

  if command -v systemctl >/dev/null 2>&1; then
    run_as_root systemctl enable docker >/dev/null 2>&1 || true
    run_as_root systemctl start docker >/dev/null 2>&1 || true
    return
  fi

  if command -v service >/dev/null 2>&1; then
    run_as_root service docker start >/dev/null 2>&1 || true
  fi
}

ensure_docker() {
  say "Checking Docker Engine"

  if command -v snap >/dev/null 2>&1 && snap list docker >/dev/null 2>&1; then
    fail "Docker installed through snap is not supported; remove it and install Docker Engine"
  fi

  if ! command -v docker >/dev/null 2>&1; then
    if truthy "$APPALOFT_SKIP_DOCKER_INSTALL"; then
      fail "Docker is required but is not installed"
    fi

    [ "$(detect_os)" = "linux" ] ||
      fail "automatic Docker installation is only supported on Linux; install Docker Desktop manually"

    docker_script="$tmpdir/get-docker.sh"
    say "Installing Docker Engine from $APPALOFT_DOCKER_INSTALL_SCRIPT_URL"
    warn "Docker bootstrap uses Docker's convenience script; preinstall Docker Engine manually for hardened production hosts"
    download_to "$APPALOFT_DOCKER_INSTALL_SCRIPT_URL" "$docker_script" ||
      fail "could not download Docker installer"
    run_as_root sh "$docker_script" || fail "Docker installation failed"
  else
    say "Docker CLI already installed"
  fi

  if [ "$(detect_os)" = "linux" ]; then
    start_docker_service
  fi

  command -v docker >/dev/null 2>&1 || fail "Docker command is still unavailable after install"

  docker_command_succeeds version ||
    fail "Docker is installed but the daemon is not reachable"

  if [ "$APPALOFT_SELF_HOST_ORCHESTRATOR" = "compose" ]; then
    docker_command_succeeds compose version ||
      fail "Docker compose plugin is required; install docker-compose-plugin and rerun"
  fi

  say "Docker Engine is ready"
  if [ "$APPALOFT_SELF_HOST_ORCHESTRATOR" = "compose" ]; then
    say "Docker compose is ready"
  fi
}

docker_stdout() {
  if docker "$@" 2>/dev/null; then
    return
  fi

  root_docker "$@"
}

ensure_swarm_manager() {
  local_state="$(docker_stdout info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || true)"
  control_available="$(docker_stdout info --format '{{.Swarm.ControlAvailable}}' 2>/dev/null || true)"

  if [ "$local_state" = "active" ] && [ "$control_available" = "true" ]; then
    say "Docker Swarm manager is ready"
    return
  fi

  if truthy "$APPALOFT_SWARM_INIT"; then
    say "Initializing Docker Swarm manager"
    if [ -n "$APPALOFT_SWARM_ADVERTISE_ADDR" ]; then
      root_docker swarm init --advertise-addr "$APPALOFT_SWARM_ADVERTISE_ADDR"
    else
      root_docker swarm init
    fi
    return
  fi

  fail "Docker Swarm manager is required; run docker swarm init first or pass --swarm-init"
}

generate_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
    return
  fi

  if [ -r /dev/urandom ] && command -v dd >/dev/null 2>&1 && command -v od >/dev/null 2>&1; then
    dd if=/dev/urandom bs=24 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n'
    printf '\n'
    return
  fi

  fail "openssl, dd, or od is required to generate a PostgreSQL password"
}

read_existing_env_value() {
  key="$1"
  file="$2"

  [ -r "$file" ] || return 0
  sed -n "s/^$key=//p" "$file" | head -n 1
}

docker_network_label() {
  network_name="$1"
  label_name="$2"

  docker_stdout network inspect --format "{{ index .Labels \"$label_name\" }}" "$network_name" 2>/dev/null
}

docker_container_label() {
  container_name="$1"
  label_name="$2"

  docker_stdout container inspect --format "{{ index .Config.Labels \"$label_name\" }}" "$container_name" 2>/dev/null
}

docker_container_state() {
  container_name="$1"
  state_field="$2"

  docker_stdout container inspect --format "{{ .State.$state_field }}" "$container_name" 2>/dev/null
}

detect_compose_edge_network_mode() {
  appaloft_edge_network_external=0

  if [ "$APPALOFT_SELF_HOST_PROXY" != "traefik" ] ||
    [ "$APPALOFT_SELF_HOST_ORCHESTRATOR" != "compose" ]; then
    return
  fi

  network_label="$(docker_network_label "$APPALOFT_EDGE_NETWORK_NAME" "com.docker.compose.network" || true)"
  if [ -z "$network_label" ]; then
    if docker_command_succeeds network inspect "$APPALOFT_EDGE_NETWORK_NAME"; then
      appaloft_edge_network_external=1
      say "Using existing Docker network $APPALOFT_EDGE_NETWORK_NAME as external"
    fi
    return
  fi

  project_label="$(docker_network_label "$APPALOFT_EDGE_NETWORK_NAME" "com.docker.compose.project" || true)"
  if [ "$network_label" != "appaloft-edge" ] || [ "$project_label" != "$APPALOFT_COMPOSE_PROJECT_NAME" ]; then
    appaloft_edge_network_external=1
    say "Using existing Docker network $APPALOFT_EDGE_NETWORK_NAME as external"
  fi
}

detect_compose_traefik_service_mode() {
  appaloft_traefik_service_external=0

  if [ "$APPALOFT_SELF_HOST_PROXY" != "traefik" ] ||
    [ "$APPALOFT_SELF_HOST_ORCHESTRATOR" != "compose" ]; then
    return
  fi

  if ! docker_command_succeeds container inspect appaloft-traefik; then
    return
  fi

  service_label="$(docker_container_label appaloft-traefik "com.docker.compose.service" || true)"
  project_label="$(docker_container_label appaloft-traefik "com.docker.compose.project" || true)"
  if [ "$service_label" = "traefik" ] && [ "$project_label" = "$APPALOFT_COMPOSE_PROJECT_NAME" ]; then
    return
  fi

  appaloft_traefik_service_external=1
  say "Using existing appaloft-traefik container as external proxy"
}

ensure_external_compose_traefik_proxy() {
  if [ "${appaloft_traefik_service_external:-0}" != "1" ]; then
    return
  fi

  traefik_running="$(docker_container_state appaloft-traefik "Running" || true)"
  if [ "$traefik_running" = "true" ]; then
    return
  fi

  say "Starting existing appaloft-traefik container"
  run_maybe_root docker start appaloft-traefik >/dev/null ||
    fail "existing appaloft-traefik container could not be started; inspect it with: docker logs appaloft-traefik"
}

write_compose_file() {
  destination="$1"

  if [ "$APPALOFT_SELF_HOST_DATABASE" = "pglite" ]; then
    cat >"$destination" <<'COMPOSE'
services:
  app:
    image: ${APPALOFT_IMAGE_REF}
    restart: unless-stopped
    environment:
      APPALOFT_APP_NAME: Appaloft
      APPALOFT_APP_VERSION: ${APPALOFT_APP_VERSION}
      APPALOFT_HTTP_HOST: 0.0.0.0
      APPALOFT_HTTP_PORT: 3001
      APPALOFT_WEB_STATIC_DIR: /app/web
      APPALOFT_DOCS_STATIC_DIR: /app/docs
      APPALOFT_DATABASE_DRIVER: pglite
      APPALOFT_AUTO_MIGRATE: "true"
      APPALOFT_DATA_DIR: /appaloft-data
      APPALOFT_PGLITE_DATA_DIR: /appaloft-data/pglite
      APPALOFT_WEB_ORIGIN: ${APPALOFT_WEB_ORIGIN}
      APPALOFT_BETTER_AUTH_SECRET: ${APPALOFT_BETTER_AUTH_SECRET}
      APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE: ${APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE}
      APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE: ${APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE}
      APPALOFT_FIRST_ADMIN_EMAIL: ${APPALOFT_FIRST_ADMIN_EMAIL}
      APPALOFT_FIRST_ADMIN_DISPLAY_NAME: ${APPALOFT_FIRST_ADMIN_DISPLAY_NAME}
      APPALOFT_FIRST_ADMIN_PASSWORD: ${APPALOFT_FIRST_ADMIN_PASSWORD}
      APPALOFT_OTEL_ENABLED: ${APPALOFT_OTEL_ENABLED}
      OTEL_SERVICE_NAME: ${APPALOFT_OTEL_SERVICE_NAME}
      OTEL_EXPORTER_OTLP_ENDPOINT: ${APPALOFT_OTEL_EXPORTER_OTLP_ENDPOINT}
      TRACE_LINK_BASE_URL: ${APPALOFT_TRACE_LINK_BASE_URL}
    ports:
      - "${APPALOFT_HTTP_HOST}:${APPALOFT_HTTP_PORT}:3001"
    volumes:
      - appaloft-data:/appaloft-data
COMPOSE
    write_app_trace_depends_on_compose_section "$destination"
    write_app_proxy_compose_section "$destination"
    cat >>"$destination" <<'COMPOSE'
    deploy:
COMPOSE
    write_app_proxy_deploy_labels_compose_section "$destination"
    cat >>"$destination" <<'COMPOSE'
      placement:
        constraints:
          - node.role == manager

COMPOSE
    write_trace_service_compose_section "$destination"
    write_proxy_service_compose_section "$destination"
    cat >>"$destination" <<'COMPOSE'
volumes:
  appaloft-data:
COMPOSE
    write_proxy_footer_compose_section "$destination"
    return
  fi

  cat >"$destination" <<'COMPOSE'
services:
  app:
    image: ${APPALOFT_IMAGE_REF}
    restart: unless-stopped
    environment:
      APPALOFT_APP_NAME: Appaloft
      APPALOFT_APP_VERSION: ${APPALOFT_APP_VERSION}
      APPALOFT_HTTP_HOST: 0.0.0.0
      APPALOFT_HTTP_PORT: 3001
      APPALOFT_WEB_STATIC_DIR: /app/web
      APPALOFT_DOCS_STATIC_DIR: /app/docs
      APPALOFT_AUTO_MIGRATE: "true"
      APPALOFT_DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      APPALOFT_WEB_ORIGIN: ${APPALOFT_WEB_ORIGIN}
      APPALOFT_BETTER_AUTH_SECRET: ${APPALOFT_BETTER_AUTH_SECRET}
      APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE: ${APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE}
      APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE: ${APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE}
      APPALOFT_FIRST_ADMIN_EMAIL: ${APPALOFT_FIRST_ADMIN_EMAIL}
      APPALOFT_FIRST_ADMIN_DISPLAY_NAME: ${APPALOFT_FIRST_ADMIN_DISPLAY_NAME}
      APPALOFT_FIRST_ADMIN_PASSWORD: ${APPALOFT_FIRST_ADMIN_PASSWORD}
      APPALOFT_OTEL_ENABLED: ${APPALOFT_OTEL_ENABLED}
      OTEL_SERVICE_NAME: ${APPALOFT_OTEL_SERVICE_NAME}
      OTEL_EXPORTER_OTLP_ENDPOINT: ${APPALOFT_OTEL_EXPORTER_OTLP_ENDPOINT}
      TRACE_LINK_BASE_URL: ${APPALOFT_TRACE_LINK_BASE_URL}
    ports:
      - "${APPALOFT_HTTP_HOST}:${APPALOFT_HTTP_PORT}:3001"
COMPOSE
  write_app_proxy_compose_section "$destination"
  cat >>"$destination" <<'COMPOSE'
    depends_on:
      postgres:
        condition: service_healthy
COMPOSE
  write_app_trace_depends_on_entry_compose_section "$destination"
  cat >>"$destination" <<'COMPOSE'
    deploy:
COMPOSE
  write_app_proxy_deploy_labels_compose_section "$destination"
  cat >>"$destination" <<'COMPOSE'
      placement:
        constraints:
          - node.role == manager

  postgres:
    image: ${APPALOFT_POSTGRES_IMAGE}
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      retries: 20
    deploy:
      placement:
        constraints:
          - node.role == manager

COMPOSE
  write_trace_service_compose_section "$destination"
  write_proxy_service_compose_section "$destination"
  cat >>"$destination" <<'COMPOSE'
volumes:
  postgres-data:
COMPOSE
  write_proxy_footer_compose_section "$destination"
}

write_app_trace_depends_on_compose_section() {
  destination="$1"

  if [ "$APPALOFT_SELF_HOST_TRACE" != "jaeger" ]; then
    return
  fi

  cat >>"$destination" <<'COMPOSE'
    depends_on:
      jaeger:
        condition: service_started
COMPOSE
}

write_app_trace_depends_on_entry_compose_section() {
  destination="$1"

  if [ "$APPALOFT_SELF_HOST_TRACE" != "jaeger" ]; then
    return
  fi

  cat >>"$destination" <<'COMPOSE'
      jaeger:
        condition: service_started
COMPOSE
}

write_app_proxy_compose_section() {
  destination="$1"

  if [ "$APPALOFT_SELF_HOST_PROXY" != "traefik" ]; then
    return
  fi

  if [ -n "$APPALOFT_CONSOLE_DOMAIN" ]; then
    cat >>"$destination" <<'COMPOSE'
    labels:
      traefik.enable: "true"
      traefik.docker.network: ${APPALOFT_EDGE_NETWORK_NAME}
      traefik.http.routers.appaloft-console.rule: Host(`${APPALOFT_CONSOLE_DOMAIN}`)
      traefik.http.routers.appaloft-console.entrypoints: websecure
      traefik.http.routers.appaloft-console.tls: "true"
      traefik.http.routers.appaloft-console.tls.certresolver: appaloft
      traefik.http.routers.appaloft-console.service: appaloft-console
      traefik.http.routers.appaloft-console-http.rule: Host(`${APPALOFT_CONSOLE_DOMAIN}`)
      traefik.http.routers.appaloft-console-http.entrypoints: web
      traefik.http.routers.appaloft-console-http.middlewares: appaloft-console-https
      traefik.http.routers.appaloft-console-http.service: appaloft-console
      traefik.http.middlewares.appaloft-console-https.redirectscheme.scheme: https
      traefik.http.services.appaloft-console.loadbalancer.server.port: "3001"
COMPOSE
  fi

  cat >>"$destination" <<'COMPOSE'
    networks:
      - default
      - appaloft-edge
COMPOSE
}

write_trace_service_compose_section() {
  destination="$1"

  if [ "$APPALOFT_SELF_HOST_TRACE" != "jaeger" ]; then
    return
  fi

  cat >>"$destination" <<'COMPOSE'

  jaeger:
    image: ${APPALOFT_JAEGER_IMAGE}
    restart: unless-stopped
    environment:
      COLLECTOR_OTLP_ENABLED: "true"
    ports:
      - "${APPALOFT_JAEGER_UI_HOST}:${APPALOFT_JAEGER_UI_PORT}:16686"
    deploy:
      placement:
        constraints:
          - node.role == manager
COMPOSE
}

write_app_proxy_deploy_labels_compose_section() {
  destination="$1"

  if [ "$APPALOFT_SELF_HOST_PROXY" != "traefik" ] || [ -z "$APPALOFT_CONSOLE_DOMAIN" ]; then
    return
  fi

  cat >>"$destination" <<'COMPOSE'
      labels:
        traefik.enable: "true"
        traefik.docker.network: ${APPALOFT_EDGE_NETWORK_NAME}
        traefik.http.routers.appaloft-console.rule: Host(`${APPALOFT_CONSOLE_DOMAIN}`)
        traefik.http.routers.appaloft-console.entrypoints: websecure
        traefik.http.routers.appaloft-console.tls: "true"
        traefik.http.routers.appaloft-console.tls.certresolver: appaloft
        traefik.http.routers.appaloft-console.service: appaloft-console
        traefik.http.routers.appaloft-console-http.rule: Host(`${APPALOFT_CONSOLE_DOMAIN}`)
        traefik.http.routers.appaloft-console-http.entrypoints: web
        traefik.http.routers.appaloft-console-http.middlewares: appaloft-console-https
        traefik.http.routers.appaloft-console-http.service: appaloft-console
        traefik.http.middlewares.appaloft-console-https.redirectscheme.scheme: https
        traefik.http.services.appaloft-console.loadbalancer.server.port: "3001"
COMPOSE
}

write_proxy_service_compose_section() {
  destination="$1"

  if [ "$APPALOFT_SELF_HOST_PROXY" != "traefik" ]; then
    return
  fi

  if [ "${appaloft_traefik_service_external:-0}" = "1" ]; then
    return
  fi

  cat >>"$destination" <<'COMPOSE'

  traefik:
    image: ${APPALOFT_TRAEFIK_IMAGE}
    container_name: appaloft-traefik
    restart: unless-stopped
    command:
COMPOSE

  if [ "$APPALOFT_SELF_HOST_ORCHESTRATOR" = "swarm" ]; then
    cat >>"$destination" <<'COMPOSE'
      - --providers.swarm=true
      - --providers.swarm.exposedbydefault=false
      - --providers.swarm.network=${APPALOFT_EDGE_NETWORK_NAME}
COMPOSE
  else
    cat >>"$destination" <<'COMPOSE'
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --providers.docker.network=${APPALOFT_EDGE_NETWORK_NAME}
COMPOSE
  fi

  cat >>"$destination" <<'COMPOSE'
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.appaloft.acme.httpchallenge=true
      - --certificatesresolvers.appaloft.acme.httpchallenge.entrypoint=web
      - --certificatesresolvers.appaloft.acme.storage=/letsencrypt/acme.json
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik-acme:/letsencrypt
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - appaloft-edge
COMPOSE
}

write_proxy_footer_compose_section() {
  destination="$1"

  if [ "$APPALOFT_SELF_HOST_PROXY" != "traefik" ]; then
    return
  fi

  if [ "${appaloft_traefik_service_external:-0}" != "1" ]; then
    cat >>"$destination" <<'COMPOSE'
  traefik-acme:

COMPOSE
  fi

  cat >>"$destination" <<'COMPOSE'
networks:
  appaloft-edge:
    name: ${APPALOFT_EDGE_NETWORK_NAME}
COMPOSE

  if [ "${appaloft_edge_network_external:-0}" = "1" ]; then
    cat >>"$destination" <<'COMPOSE'
    external: true
COMPOSE
  fi
}

write_env_file() {
  destination="$1"

  if [ "$APPALOFT_SELF_HOST_DATABASE" = "pglite" ]; then
    cat >"$destination" <<ENV
APPALOFT_IMAGE_REF=$appaloft_image_ref
APPALOFT_APP_VERSION=$appaloft_version
APPALOFT_HTTP_HOST=$APPALOFT_HTTP_HOST
APPALOFT_HTTP_PORT=$APPALOFT_HTTP_PORT
APPALOFT_WEB_ORIGIN=$appaloft_web_origin
APPALOFT_BETTER_AUTH_SECRET=$appaloft_better_auth_secret
APPALOFT_CONSOLE_DOMAIN=$APPALOFT_CONSOLE_DOMAIN
APPALOFT_SELF_HOST_DATABASE=pglite
APPALOFT_SELF_HOST_ORCHESTRATOR=$APPALOFT_SELF_HOST_ORCHESTRATOR
APPALOFT_SELF_HOST_PROXY=$APPALOFT_SELF_HOST_PROXY
APPALOFT_EDGE_NETWORK_NAME=$APPALOFT_EDGE_NETWORK_NAME
APPALOFT_TRAEFIK_IMAGE=$APPALOFT_TRAEFIK_IMAGE
APPALOFT_SELF_HOST_TRACE=$APPALOFT_SELF_HOST_TRACE
APPALOFT_JAEGER_IMAGE=$APPALOFT_JAEGER_IMAGE
APPALOFT_JAEGER_UI_HOST=$APPALOFT_JAEGER_UI_HOST
APPALOFT_JAEGER_UI_PORT=$APPALOFT_JAEGER_UI_PORT
APPALOFT_OTEL_ENABLED=$appaloft_otel_enabled
APPALOFT_OTEL_SERVICE_NAME=$APPALOFT_OTEL_SERVICE_NAME
APPALOFT_OTEL_EXPORTER_OTLP_ENDPOINT=$appaloft_otel_exporter_endpoint
APPALOFT_TRACE_LINK_BASE_URL=$appaloft_trace_link_base_url
APPALOFT_SWARM_STACK_NAME=$APPALOFT_SWARM_STACK_NAME
APPALOFT_BOOTSTRAP_DEPLOY_TOKEN=$APPALOFT_BOOTSTRAP_DEPLOY_TOKEN
APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE=$APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE
APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE=$APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE
APPALOFT_FIRST_ADMIN_EMAIL=$APPALOFT_FIRST_ADMIN_EMAIL
APPALOFT_FIRST_ADMIN_DISPLAY_NAME=$APPALOFT_FIRST_ADMIN_DISPLAY_NAME
APPALOFT_FIRST_ADMIN_PASSWORD=$APPALOFT_FIRST_ADMIN_PASSWORD
ENV
    return
  fi

  cat >"$destination" <<ENV
APPALOFT_IMAGE_REF=$appaloft_image_ref
APPALOFT_APP_VERSION=$appaloft_version
APPALOFT_HTTP_HOST=$APPALOFT_HTTP_HOST
APPALOFT_HTTP_PORT=$APPALOFT_HTTP_PORT
APPALOFT_WEB_ORIGIN=$appaloft_web_origin
APPALOFT_BETTER_AUTH_SECRET=$appaloft_better_auth_secret
APPALOFT_CONSOLE_DOMAIN=$APPALOFT_CONSOLE_DOMAIN
APPALOFT_SELF_HOST_DATABASE=postgres
APPALOFT_SELF_HOST_ORCHESTRATOR=$APPALOFT_SELF_HOST_ORCHESTRATOR
APPALOFT_SELF_HOST_PROXY=$APPALOFT_SELF_HOST_PROXY
APPALOFT_EDGE_NETWORK_NAME=$APPALOFT_EDGE_NETWORK_NAME
APPALOFT_TRAEFIK_IMAGE=$APPALOFT_TRAEFIK_IMAGE
APPALOFT_SELF_HOST_TRACE=$APPALOFT_SELF_HOST_TRACE
APPALOFT_JAEGER_IMAGE=$APPALOFT_JAEGER_IMAGE
APPALOFT_JAEGER_UI_HOST=$APPALOFT_JAEGER_UI_HOST
APPALOFT_JAEGER_UI_PORT=$APPALOFT_JAEGER_UI_PORT
APPALOFT_OTEL_ENABLED=$appaloft_otel_enabled
APPALOFT_OTEL_SERVICE_NAME=$APPALOFT_OTEL_SERVICE_NAME
APPALOFT_OTEL_EXPORTER_OTLP_ENDPOINT=$appaloft_otel_exporter_endpoint
APPALOFT_TRACE_LINK_BASE_URL=$appaloft_trace_link_base_url
APPALOFT_SWARM_STACK_NAME=$APPALOFT_SWARM_STACK_NAME
APPALOFT_POSTGRES_IMAGE=$APPALOFT_POSTGRES_IMAGE
APPALOFT_BOOTSTRAP_DEPLOY_TOKEN=$APPALOFT_BOOTSTRAP_DEPLOY_TOKEN
APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE=$APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE
APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE=$APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE
APPALOFT_FIRST_ADMIN_EMAIL=$APPALOFT_FIRST_ADMIN_EMAIL
APPALOFT_FIRST_ADMIN_DISPLAY_NAME=$APPALOFT_FIRST_ADMIN_DISPLAY_NAME
APPALOFT_FIRST_ADMIN_PASSWORD=$APPALOFT_FIRST_ADMIN_PASSWORD
POSTGRES_DB=appaloft
POSTGRES_USER=appaloft
POSTGRES_PASSWORD=$appaloft_postgres_password
ENV
}

install_file() {
  source="$1"
  destination="$2"
  mode="$3"

  run_maybe_root mkdir -p "$(dirname "$destination")"
  run_maybe_root cp "$source" "$destination"
  run_maybe_root chmod "$mode" "$destination"
}

docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose --env-file "$env_file" -p "$APPALOFT_COMPOSE_PROJECT_NAME" -f "$compose_file" "$@"
    return $?
  fi

  root_docker compose --env-file "$env_file" -p "$APPALOFT_COMPOSE_PROJECT_NAME" -f "$compose_file" "$@"
}

docker_compose_up_with_recovery() {
  compose_up_output="$(mktemp "${TMPDIR:-/tmp}/appaloft-compose-up.XXXXXX")"
  if docker_compose up -d >"$compose_up_output" 2>&1; then
    cat "$compose_up_output"
    rm -f "$compose_up_output"
    return 0
  fi

  cat "$compose_up_output" >&2
  if grep -E "failed to set up container networking: network .* not found|network .* not found" "$compose_up_output" >/dev/null 2>&1; then
    warn "Docker Compose found containers attached to a missing Docker network; recreating project containers while preserving volumes."
    rm -f "$compose_up_output"
    docker_compose down --remove-orphans ||
      fail "Docker Compose failed to remove stale containers after a missing Docker network; check Docker errors above and rerun the same install command"
    docker_compose up -d
    return $?
  fi

  rm -f "$compose_up_output"
  return 1
}

docker_stack_deploy() {
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a

  if docker stack deploy -c "$compose_file" "$APPALOFT_SWARM_STACK_NAME"; then
    return
  fi

  run_as_root env \
    APPALOFT_IMAGE_REF="$appaloft_image_ref" \
    APPALOFT_APP_VERSION="$appaloft_version" \
    APPALOFT_HTTP_HOST="$APPALOFT_HTTP_HOST" \
    APPALOFT_HTTP_PORT="$APPALOFT_HTTP_PORT" \
    APPALOFT_WEB_ORIGIN="$appaloft_web_origin" \
    APPALOFT_CONSOLE_DOMAIN="$APPALOFT_CONSOLE_DOMAIN" \
    APPALOFT_SELF_HOST_DATABASE="$APPALOFT_SELF_HOST_DATABASE" \
    APPALOFT_SELF_HOST_PROXY="$APPALOFT_SELF_HOST_PROXY" \
    APPALOFT_EDGE_NETWORK_NAME="$APPALOFT_EDGE_NETWORK_NAME" \
    APPALOFT_TRAEFIK_IMAGE="$APPALOFT_TRAEFIK_IMAGE" \
    APPALOFT_SELF_HOST_TRACE="$APPALOFT_SELF_HOST_TRACE" \
    APPALOFT_JAEGER_IMAGE="$APPALOFT_JAEGER_IMAGE" \
    APPALOFT_JAEGER_UI_HOST="$APPALOFT_JAEGER_UI_HOST" \
    APPALOFT_JAEGER_UI_PORT="$APPALOFT_JAEGER_UI_PORT" \
    APPALOFT_OTEL_ENABLED="$appaloft_otel_enabled" \
    APPALOFT_OTEL_SERVICE_NAME="$APPALOFT_OTEL_SERVICE_NAME" \
    APPALOFT_OTEL_EXPORTER_OTLP_ENDPOINT="$appaloft_otel_exporter_endpoint" \
    APPALOFT_TRACE_LINK_BASE_URL="$appaloft_trace_link_base_url" \
    APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE="$APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE" \
    APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE="$APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE" \
    APPALOFT_FIRST_ADMIN_EMAIL="$APPALOFT_FIRST_ADMIN_EMAIL" \
    APPALOFT_FIRST_ADMIN_DISPLAY_NAME="$APPALOFT_FIRST_ADMIN_DISPLAY_NAME" \
    APPALOFT_FIRST_ADMIN_PASSWORD="$APPALOFT_FIRST_ADMIN_PASSWORD" \
    APPALOFT_POSTGRES_IMAGE="$APPALOFT_POSTGRES_IMAGE" \
    POSTGRES_DB="appaloft" \
    POSTGRES_USER="appaloft" \
    POSTGRES_PASSWORD="${appaloft_postgres_password:-}" \
    docker stack deploy -c "$compose_file" "$APPALOFT_SWARM_STACK_NAME"
}

docker_service_value() {
  docker_stdout service "$@"
}

docker_object_value() {
  object_name="$1"
  template="$2"

  docker_stdout inspect --format "$template" "$object_name" 2>/dev/null
}

compose_app_container_id() {
  docker_compose ps -q app 2>/dev/null | head -n 1
}

print_compose_app_diagnostics() {
  container_id="$(compose_app_container_id || true)"
  if [ -n "$container_id" ]; then
    status="$(docker_object_value "$container_id" "{{.State.Status}}" || true)"
    exit_code="$(docker_object_value "$container_id" "{{.State.ExitCode}}" || true)"
    health_status="$(docker_object_value "$container_id" "{{if .State.Health}}{{.State.Health.Status}}{{end}}" || true)"
    warn "app container: id=$container_id status=${status:-unknown} exit=${exit_code:-unknown} health=${health_status:-none}"
  fi

  docker_compose logs --tail=80 app >&2 || true
}

wait_for_compose_app_health() {
  say "Waiting for Appaloft console health"
  attempts=0
  max_attempts=60

  while [ "$attempts" -lt "$max_attempts" ]; do
    attempts=$((attempts + 1))
    container_id="$(compose_app_container_id || true)"

    if [ -n "$container_id" ]; then
      status="$(docker_object_value "$container_id" "{{.State.Status}}" || true)"
      health_status="$(docker_object_value "$container_id" "{{if .State.Health}}{{.State.Health.Status}}{{end}}" || true)"

      if [ "$health_status" = "healthy" ]; then
        say "Appaloft console health is ready"
        return
      fi

      if [ "$health_status" = "unhealthy" ]; then
        print_compose_app_diagnostics
        fail "Appaloft console became unhealthy; check the app container diagnostics above"
      fi

      if [ -z "$health_status" ] && [ "$status" = "running" ] &&
        command -v curl >/dev/null 2>&1 &&
        curl -fsS --max-time 2 "http://127.0.0.1:$APPALOFT_HTTP_PORT/api/health" >/dev/null 2>&1; then
        say "Appaloft console health is ready"
        return
      fi
    fi

    sleep 2
  done

  print_compose_app_diagnostics
  fail "Appaloft console did not become healthy within 120 seconds; check the app container diagnostics above"
}

print_swarm_app_diagnostics() {
  service_name="${APPALOFT_SWARM_STACK_NAME}_app"
  warn "app service tasks:"
  docker_service_value ps "$service_name" --no-trunc >&2 || true
  docker_service_value logs --tail=80 "$service_name" >&2 || true
}

wait_for_swarm_app_health() {
  service_name="${APPALOFT_SWARM_STACK_NAME}_app"
  say "Waiting for Appaloft console health"
  attempts=0
  max_attempts=60

  while [ "$attempts" -lt "$max_attempts" ]; do
    attempts=$((attempts + 1))
    replicas="$(docker_service_value ls --filter "name=$service_name" --format "{{.Replicas}}" 2>/dev/null | head -n 1 || true)"

    case "$replicas" in
      */*)
        ready="${replicas%%/*}"
        desired="${replicas#*/}"
        if [ "$desired" != "0" ] && [ "$ready" = "$desired" ] &&
          command -v curl >/dev/null 2>&1 &&
          curl -fsS --max-time 2 "http://127.0.0.1:$APPALOFT_HTTP_PORT/api/health" >/dev/null 2>&1; then
          say "Appaloft console health is ready"
          return
        fi
        ;;
    esac

    sleep 2
  done

  print_swarm_app_diagnostics
  fail "Appaloft console did not become healthy within 120 seconds; check the app service diagnostics above"
}

swarm_app_container_id() {
  docker_stdout ps --filter "name=${APPALOFT_SWARM_STACK_NAME}_app" --filter "status=running" -q 2>/dev/null |
    head -n 1
}

read_bootstrap_deploy_token_output() {
  [ "$APPALOFT_BOOTSTRAP_DEPLOY_TOKEN" = "1" ] || return 0

  bootstrap_reader='file="$APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE"; if [ -r "$file" ]; then cat "$file"; rm -f "$file"; fi'

  if [ "$APPALOFT_SELF_HOST_ORCHESTRATOR" = "swarm" ]; then
    container_id="$(swarm_app_container_id || true)"
    [ -n "$container_id" ] ||
      fail "could not find the running Appaloft app task to read bootstrap output"
    bootstrap_output="$(docker_stdout exec "$container_id" sh -c "$bootstrap_reader" 2>/dev/null || true)"
  else
    bootstrap_output="$(docker_compose exec -T app sh -c "$bootstrap_reader" 2>/dev/null || true)"
  fi

  [ -n "$bootstrap_output" ] ||
    fail "could not read deploy token bootstrap output from the Appaloft app container"

  appaloft_bootstrap_deploy_token_output="$bootstrap_output"
}

read_bootstrap_first_admin_output() {
  bootstrap_reader='file="$APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE"; if [ -r "$file" ]; then cat "$file"; rm -f "$file"; fi'

  if [ "$APPALOFT_SELF_HOST_ORCHESTRATOR" = "swarm" ]; then
    container_id="$(swarm_app_container_id || true)"
    [ -n "$container_id" ] ||
      fail "could not find the running Appaloft app task to read first-admin bootstrap output"
    bootstrap_output="$(docker_stdout exec "$container_id" sh -c "$bootstrap_reader" 2>/dev/null || true)"
  else
    bootstrap_output="$(docker_compose exec -T app sh -c "$bootstrap_reader" 2>/dev/null || true)"
  fi

  [ -n "$bootstrap_output" ] ||
    fail "could not read first-admin bootstrap output from the Appaloft app container"

  appaloft_bootstrap_first_admin_output="$bootstrap_output"
}

print_first_use_handoff() {
  step "First-use handoff"

  if [ -n "${appaloft_bootstrap_first_admin_output:-}" ]; then
    printf '%s\n' "$appaloft_bootstrap_first_admin_output"
  fi

  case "${appaloft_bootstrap_first_admin_output:-}" in
    *'"generatedPassword"'*)
      say "Use the generated first-admin password above for the first console login. It is shown only during bootstrap."
      ;;
    *'"bootstrapRequired":true'* | *'"bootstrapRequired": true'*)
      say "Set APPALOFT_FIRST_ADMIN_EMAIL and rerun the installer to create a local first admin."
      ;;
    *)
      say "First-admin bootstrap status is shown above. Supplied passwords are never printed."
      ;;
  esac

  if [ -n "${appaloft_bootstrap_deploy_token_output:-}" ]; then
    printf '%s\n' "$appaloft_bootstrap_deploy_token_output"
    say "Store the token value in GitHub Secrets as APPALOFT_TOKEN. It is shown only during bootstrap."
  else
    say "No GitHub Action deploy token was created during install. Create one later in the console or rerun with --bootstrap-deploy-token."
  fi
}

validate_port
validate_database
validate_orchestrator
validate_proxy
validate_trace
if [ "$APPALOFT_SELF_HOST_TRACE" = "jaeger" ]; then
  validate_jaeger_ui_port
fi
case "$APPALOFT_BOOTSTRAP_DEPLOY_TOKEN" in
  1 | true | TRUE | yes | YES | on | ON)
    APPALOFT_BOOTSTRAP_DEPLOY_TOKEN=1
    if [ -z "$APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE" ]; then
      APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE="/tmp/appaloft-bootstrap/deploy-token.json"
    fi
    ;;
  "" | 0 | false | FALSE | no | NO | off | OFF)
    APPALOFT_BOOTSTRAP_DEPLOY_TOKEN=0
    APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE=""
    ;;
  *)
    fail "APPALOFT_BOOTSTRAP_DEPLOY_TOKEN must be 1 or 0"
    ;;
esac
raw_appaloft_console_domain="$APPALOFT_CONSOLE_DOMAIN"
APPALOFT_CONSOLE_DOMAIN="$(sanitize_domain "$APPALOFT_CONSOLE_DOMAIN")"
if [ -n "$raw_appaloft_console_domain" ] && [ -z "$APPALOFT_CONSOLE_DOMAIN" ]; then
  fail "--domain must be a hostname without scheme, path, port, spaces, or wildcards"
fi
validate_domain
appaloft_version="$(normalize_version "$APPALOFT_VERSION")"
appaloft_image_ref="$(image_ref "$appaloft_version")"
appaloft_home="$(choose_home)"
appaloft_web_origin="$(resolve_web_origin)"
appaloft_otel_exporter_endpoint="$(resolve_otel_exporter_endpoint)"
appaloft_trace_link_base_url="$(resolve_trace_link_base_url)"
if [ "$APPALOFT_SELF_HOST_TRACE" = "jaeger" ]; then
  appaloft_otel_enabled=true
else
  appaloft_otel_enabled=false
fi
compose_file="$appaloft_home/docker-compose.yml"
env_file="$appaloft_home/.env"

if [ "$APPALOFT_INSTALL_DRY_RUN" = "1" ]; then
  say "Appaloft Docker install dry run"
  say "version: $appaloft_version"
  say "image: $appaloft_image_ref"
  say "home: $appaloft_home"
  say "compose file: $compose_file"
  say "orchestrator: $APPALOFT_SELF_HOST_ORCHESTRATOR"
  if [ "$APPALOFT_SELF_HOST_ORCHESTRATOR" = "compose" ]; then
    say "compose project: $APPALOFT_COMPOSE_PROJECT_NAME"
  else
    say "swarm stack: $APPALOFT_SWARM_STACK_NAME"
    if truthy "$APPALOFT_SWARM_INIT"; then
      say "swarm init: yes"
    else
      say "swarm init: no"
    fi
  fi
  say "bind: $APPALOFT_HTTP_HOST:$APPALOFT_HTTP_PORT"
  say "web origin: $appaloft_web_origin"
  if [ -n "$APPALOFT_CONSOLE_DOMAIN" ]; then
    say "console domain: $APPALOFT_CONSOLE_DOMAIN"
  fi
  say "proxy: $APPALOFT_SELF_HOST_PROXY"
  say "trace: $APPALOFT_SELF_HOST_TRACE"
  if [ "$APPALOFT_SELF_HOST_TRACE" = "jaeger" ]; then
    say "jaeger image: $APPALOFT_JAEGER_IMAGE"
    say "jaeger ui: $appaloft_trace_link_base_url"
    say "otlp endpoint: $appaloft_otel_exporter_endpoint"
  fi
  say "database: $APPALOFT_SELF_HOST_DATABASE"
  if truthy "$APPALOFT_SKIP_DOCKER_INSTALL"; then
    say "install docker: no"
  else
    say "install docker: yes"
  fi
  exit 0
fi

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/appaloft-install.XXXXXX")"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT INT TERM

ensure_docker

if [ "$APPALOFT_SELF_HOST_ORCHESTRATOR" = "swarm" ]; then
  ensure_swarm_manager
fi

detect_compose_edge_network_mode
detect_compose_traefik_service_mode

if [ "$APPALOFT_SELF_HOST_DATABASE" = "postgres" ]; then
  existing_postgres_password="$(read_existing_env_value POSTGRES_PASSWORD "$env_file" || true)"
  if [ -n "$APPALOFT_POSTGRES_PASSWORD" ]; then
    appaloft_postgres_password="$APPALOFT_POSTGRES_PASSWORD"
  elif [ -n "$existing_postgres_password" ]; then
    appaloft_postgres_password="$existing_postgres_password"
  else
    appaloft_postgres_password="$(generate_password)"
  fi
fi

existing_better_auth_secret="$(read_existing_env_value APPALOFT_BETTER_AUTH_SECRET "$env_file" || true)"
if [ -n "$APPALOFT_BETTER_AUTH_SECRET" ]; then
  appaloft_better_auth_secret="$APPALOFT_BETTER_AUTH_SECRET"
elif [ -n "$existing_better_auth_secret" ]; then
  appaloft_better_auth_secret="$existing_better_auth_secret"
else
  appaloft_better_auth_secret="$(generate_password)"
fi

tmp_compose="$tmpdir/docker-compose.yml"
tmp_env="$tmpdir/.env"
write_compose_file "$tmp_compose"
write_env_file "$tmp_env"

run_maybe_root mkdir -p "$appaloft_home"
step "Installing Appaloft Docker stack"
say "Home: $appaloft_home"
say "Image: $appaloft_image_ref"
say "HTTP: $appaloft_web_origin"
if [ -n "$APPALOFT_CONSOLE_DOMAIN" ]; then
  say "Console domain: $APPALOFT_CONSOLE_DOMAIN"
fi
say "Database: $APPALOFT_SELF_HOST_DATABASE"
say "Orchestrator: $APPALOFT_SELF_HOST_ORCHESTRATOR"
say "Proxy: $APPALOFT_SELF_HOST_PROXY"
say "Trace: $APPALOFT_SELF_HOST_TRACE"
if [ "$APPALOFT_SELF_HOST_TRACE" = "jaeger" ]; then
  say "Jaeger UI: $appaloft_trace_link_base_url"
fi
if [ "${appaloft_traefik_service_external:-0}" = "1" ]; then
  say "Traefik: existing appaloft-traefik container"
fi

step "Writing Appaloft configuration"
install_file "$tmp_compose" "$compose_file" 0644
install_file "$tmp_env" "$env_file" 0600
say "Compose file: $compose_file"
say "Environment file: $env_file"

if [ "$APPALOFT_SELF_HOST_ORCHESTRATOR" = "swarm" ]; then
  step "Deploying Docker Swarm stack"
  docker_stack_deploy || fail "Docker Swarm failed to deploy the Appaloft stack; check Docker stack errors above and rerun the same install command"
  wait_for_swarm_app_health
  read_bootstrap_deploy_token_output
  read_bootstrap_first_admin_output
  appaloft_logs_command="docker service logs -f ${APPALOFT_SWARM_STACK_NAME}_app"
else
  ensure_external_compose_traefik_proxy

  if [ "$APPALOFT_SKIP_IMAGE_PULL" = "1" ]; then
    step "Skipping Appaloft Docker image pull"
  else
    step "Pulling Appaloft Docker images"
    docker_compose pull ||
      fail "Docker Compose failed to pull Appaloft images; check registry access and network connectivity, then rerun the same install command"
  fi

  step "Starting Appaloft containers"
  docker_compose_up_with_recovery ||
    fail "Docker Compose failed to start Appaloft; check Docker errors above and rerun the same install command"
  wait_for_compose_app_health
  read_bootstrap_deploy_token_output
  read_bootstrap_first_admin_output
  appaloft_logs_command="docker compose --env-file $env_file -p $APPALOFT_COMPOSE_PROJECT_NAME -f $compose_file logs -f"
fi

step "Appaloft install completed"
print_success_banner
print_first_use_handoff
print_next_steps "$appaloft_logs_command"
