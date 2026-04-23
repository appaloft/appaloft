#!/usr/bin/env sh
set -eu

APPALOFT_VERSION="${APPALOFT_VERSION:-latest}"
APPALOFT_IMAGE="${APPALOFT_IMAGE:-ghcr.io/appaloft/appaloft}"
APPALOFT_HOME="${APPALOFT_HOME:-}"
APPALOFT_HTTP_HOST="${APPALOFT_HTTP_HOST:-0.0.0.0}"
APPALOFT_HTTP_PORT="${APPALOFT_HTTP_PORT:-3001}"
APPALOFT_WEB_ORIGIN="${APPALOFT_WEB_ORIGIN:-}"
APPALOFT_POSTGRES_IMAGE="${APPALOFT_POSTGRES_IMAGE:-postgres:16}"
APPALOFT_POSTGRES_PASSWORD="${APPALOFT_POSTGRES_PASSWORD:-}"
APPALOFT_COMPOSE_PROJECT_NAME="${APPALOFT_COMPOSE_PROJECT_NAME:-appaloft}"
APPALOFT_SKIP_DOCKER_INSTALL="${APPALOFT_SKIP_DOCKER_INSTALL:-0}"
APPALOFT_INSTALL_DRY_RUN="${APPALOFT_INSTALL_DRY_RUN:-0}"
APPALOFT_DOCKER_INSTALL_SCRIPT_URL="${APPALOFT_DOCKER_INSTALL_SCRIPT_URL:-https://get.docker.com}"

say() {
  printf '%s\n' "$*"
}

warn() {
  printf 'appaloft install: %s\n' "$*" >&2
}

fail() {
  warn "$*"
  exit 1
}

usage() {
  cat <<'USAGE'
Install Appaloft as a self-hosted Docker Compose stack.

Usage:
  curl -fsSL https://appaloft.com/install.sh | sudo sh
  curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --version 0.2.1

Options:
  --version <version>              Appaloft image tag. Defaults to latest.
  --image <image>                  Image repository or full image ref. Defaults to ghcr.io/appaloft/appaloft.
  --home <dir>                     Install directory. Defaults to /opt/appaloft on Linux.
  --host <host>                    Host bind address. Defaults to 0.0.0.0.
  --port <port>                    Host HTTP port. Defaults to 3001.
  --web-origin <url>               Public console origin. Defaults to http://localhost:<port>.
  --postgres-password <password>   PostgreSQL password. Existing installs reuse .env.
  --postgres-image <image>         PostgreSQL image. Defaults to postgres:16.
  --project-name <name>            Docker Compose project name. Defaults to appaloft.
  --skip-docker-install            Require an existing Docker Engine installation.
  --dry-run                        Print the selected Docker stack without installing.
  -h, --help                       Show this help.

Environment:
  APPALOFT_VERSION
  APPALOFT_IMAGE
  APPALOFT_HOME
  APPALOFT_HTTP_HOST
  APPALOFT_HTTP_PORT
  APPALOFT_WEB_ORIGIN
  APPALOFT_POSTGRES_IMAGE
  APPALOFT_POSTGRES_PASSWORD
  APPALOFT_COMPOSE_PROJECT_NAME
  APPALOFT_SKIP_DOCKER_INSTALL=1
  APPALOFT_INSTALL_DRY_RUN=1
USAGE
}

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
    --web-origin)
      shift
      [ "$#" -gt 0 ] || fail "--web-origin requires a value"
      APPALOFT_WEB_ORIGIN="$1"
      ;;
    --web-origin=*)
      APPALOFT_WEB_ORIGIN="${1#--web-origin=}"
      ;;
    --postgres-password)
      shift
      [ "$#" -gt 0 ] || fail "--postgres-password requires a value"
      APPALOFT_POSTGRES_PASSWORD="$1"
      ;;
    --postgres-password=*)
      APPALOFT_POSTGRES_PASSWORD="${1#--postgres-password=}"
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
    --skip-docker-install | --no-install-docker)
      APPALOFT_SKIP_DOCKER_INSTALL=1
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

  docker_command_succeeds compose version ||
    fail "Docker compose plugin is required; install docker-compose-plugin and rerun"

  say "Docker Engine and docker compose are ready"
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

write_compose_file() {
  destination="$1"

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
      APPALOFT_DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      APPALOFT_WEB_ORIGIN: ${APPALOFT_WEB_ORIGIN}
    ports:
      - "${APPALOFT_HTTP_HOST}:${APPALOFT_HTTP_PORT}:3001"
    depends_on:
      postgres:
        condition: service_healthy

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

volumes:
  postgres-data:
COMPOSE
}

write_env_file() {
  destination="$1"

  cat >"$destination" <<ENV
APPALOFT_IMAGE_REF=$appaloft_image_ref
APPALOFT_APP_VERSION=$appaloft_version
APPALOFT_HTTP_HOST=$APPALOFT_HTTP_HOST
APPALOFT_HTTP_PORT=$APPALOFT_HTTP_PORT
APPALOFT_WEB_ORIGIN=$appaloft_web_origin
APPALOFT_POSTGRES_IMAGE=$APPALOFT_POSTGRES_IMAGE
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

validate_port
appaloft_version="$(normalize_version "$APPALOFT_VERSION")"
appaloft_image_ref="$(image_ref "$appaloft_version")"
appaloft_home="$(choose_home)"
appaloft_web_origin="${APPALOFT_WEB_ORIGIN:-http://localhost:$APPALOFT_HTTP_PORT}"
compose_file="$appaloft_home/docker-compose.yml"
env_file="$appaloft_home/.env"

if [ "$APPALOFT_INSTALL_DRY_RUN" = "1" ]; then
  say "Appaloft Docker install dry run"
  say "version: $appaloft_version"
  say "image: $appaloft_image_ref"
  say "home: $appaloft_home"
  say "compose file: $compose_file"
  say "bind: $APPALOFT_HTTP_HOST:$APPALOFT_HTTP_PORT"
  say "web origin: $appaloft_web_origin"
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

existing_postgres_password="$(read_existing_env_value POSTGRES_PASSWORD "$env_file" || true)"
if [ -n "$APPALOFT_POSTGRES_PASSWORD" ]; then
  appaloft_postgres_password="$APPALOFT_POSTGRES_PASSWORD"
elif [ -n "$existing_postgres_password" ]; then
  appaloft_postgres_password="$existing_postgres_password"
else
  appaloft_postgres_password="$(generate_password)"
fi

tmp_compose="$tmpdir/docker-compose.yml"
tmp_env="$tmpdir/.env"
write_compose_file "$tmp_compose"
write_env_file "$tmp_env"

run_maybe_root mkdir -p "$appaloft_home"
install_file "$tmp_compose" "$compose_file" 0644
install_file "$tmp_env" "$env_file" 0600

say "Installing Appaloft Docker stack"
say "Home: $appaloft_home"
say "Image: $appaloft_image_ref"
say "HTTP: $appaloft_web_origin"

docker_compose pull
docker_compose up -d

say "Appaloft is starting at $appaloft_web_origin"
say "Logs: docker compose --env-file $env_file -p $APPALOFT_COMPOSE_PROJECT_NAME -f $compose_file logs -f"
