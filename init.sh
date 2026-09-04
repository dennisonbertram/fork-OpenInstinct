#!/usr/bin/env bash
set -euo pipefail
umask 077

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$script_dir"

usage() {
  cat <<'EOF'
Usage: ./init.sh [--check] [--setup-only] [--skip-install]

Bootstrap the complete local OpenInstinct development stack.

  --check        Verify prerequisites only; do not touch files or services.
  --setup-only   Prepare dependencies and credentials, then stop.
  --skip-install Skip pnpm install --frozen-lockfile.
  --help         Show this help.

Fresh checkouts use the canonical Vercel project automatically. Override its
non-secret identifiers with OPENINSTINCT_VERCEL_PROJECT and
OPENINSTINCT_VERCEL_TEAM when working from a different authorized project.
EOF
}

check_only=false
setup_only=false
skip_install=false

for argument in "$@"; do
  case "$argument" in
    --check) check_only=true ;;
    --setup-only) setup_only=true ;;
    --skip-install) skip_install=true ;;
    --help|-h) usage; exit 0 ;;
    *)
      printf 'Unknown option: %s\n\n' "$argument" >&2
      usage >&2
      exit 2
      ;;
  esac
done

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing prerequisite: %s\n' "$command_name" >&2
    return 1
  fi
}

check_prerequisites() {
  local node_version node_major
  require_command node
  require_command pnpm
  require_command docker

  node_version="$(node --version)"
  node_major="${node_version#v}"
  node_major="${node_major%%.*}"
  if [[ "$node_major" != "24" ]]; then
    printf 'Node 24 is required; found %s.\n' "$node_version" >&2
    return 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    printf 'Docker Compose v2 is required (docker compose).\n' >&2
    return 1
  fi

  if ! docker info >/dev/null 2>&1; then
    printf 'Docker daemon is unavailable; start Docker, then try again.\n' >&2
    return 1
  fi
}

check_prerequisites

if [[ "$check_only" == true ]]; then
  printf 'Prerequisites are available.\n'
  exit 0
fi

if [[ "$skip_install" == false ]]; then
  pnpm install --frozen-lockfile
fi

env_created_from_template=false
if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  env_created_from_template=true
fi

chmod 600 .env.local

has_env_value() {
  local requested_name="$1"
  local line trimmed name value
  while IFS= read -r line || [[ -n "$line" ]]; do
    trimmed="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$trimmed" || "$trimmed" == \#* ]] && continue
    if [[ "$trimmed" =~ ^([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
      name="${BASH_REMATCH[1]}"
      [[ "$name" != "$requested_name" ]] && continue
      value="${BASH_REMATCH[2]}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      [[ -n "$value" ]] && return 0
    fi
  done < .env.local
  return 1
}

has_inference_credential() {
  has_env_value AI_GATEWAY_API_KEY || has_env_value VERCEL_OIDC_TOKEN
}

credentials_ready() {
  has_env_value KERNEL_API_KEY && has_inference_credential
}

if ! credentials_ready; then
  can_replace_env="$env_created_from_template"
  if [[ "$can_replace_env" == false ]] && cmp -s .env.local .env.example; then
    can_replace_env=true
  fi

  if [[ "$can_replace_env" == false ]]; then
    cat <<'EOF' >&2
.env.local is missing KERNEL_API_KEY or inference authentication and was preserved.
Add KERNEL_API_KEY plus either AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN, or move
the customized file aside and rerun ./init.sh to pull the canonical development
environment automatically.
EOF
    exit 1
  fi

  vercel_project="${OPENINSTINCT_VERCEL_PROJECT:-open-instinct}"
  vercel_team="${OPENINSTINCT_VERCEL_TEAM:-dennisons-projects}"
  env_backup="$(mktemp "${TMPDIR:-/tmp}/openinstinct-env.XXXXXX")"
  cp .env.local "$env_backup"
  printf 'Pulling the canonical development environment through Eve...\n'
  if ! pnpm exec eve link --non-interactive --project "$vercel_project" --team "$vercel_team"; then
    cp "$env_backup" .env.local
    rm -f "$env_backup"
    chmod 600 .env.local
    cat <<'EOF' >&2
Could not link the canonical Vercel development environment. The private
.env.local template remains available for manual setup.

Authenticate with `pnpm exec vercel login`, then rerun `./init.sh`. If you do
not have project access, set KERNEL_API_KEY plus either AI_GATEWAY_API_KEY or
VERCEL_OIDC_TOKEN in .env.local without committing or printing their values.
EOF
    exit 1
  fi
  rm -f "$env_backup"
  chmod 600 .env.local
fi

if ! credentials_ready; then
  cat <<'EOF' >&2
The linked development environment did not provide KERNEL_API_KEY and either
AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN. Ask a project owner to attach Kernel
and enable AI Gateway for the development environment, then rerun ./init.sh.
EOF
  exit 1
fi

printf 'Local environment is ready. Phone auth uses the development-only code 000000.\n'

if [[ "$setup_only" == true ]]; then
  exit 0
fi

agentation_is_healthy() {
  node -e '
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 500);
fetch("http://localhost:4747/pending", { signal: controller.signal })
  .then((response) => process.exit(response.ok ? 0 : 1))
  .catch(() => process.exit(1))
  .finally(() => clearTimeout(timeout));
' >/dev/null 2>&1
}

agentation_pid=""

stop_owned_agentation() {
  local status="$?"
  trap - EXIT INT TERM
  if [[ -n "$agentation_pid" ]] && kill -0 "$agentation_pid" >/dev/null 2>&1; then
    kill -TERM "$agentation_pid" >/dev/null 2>&1 || true
    wait "$agentation_pid" >/dev/null 2>&1 || true
  fi
  exit "$status"
}

trap stop_owned_agentation EXIT INT TERM

if agentation_is_healthy; then
  printf 'Agentation is already running at http://localhost:4747.\n'
else
  pnpm dev:agentation &
  agentation_pid="$!"

  agentation_ready=false
  for _ in {1..50}; do
    if agentation_is_healthy; then
      agentation_ready=true
      break
    fi
    if ! kill -0 "$agentation_pid" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done

  if [[ "$agentation_ready" == false ]]; then
    printf 'Agentation did not become healthy at http://localhost:4747.\n' >&2
    exit 1
  fi
  printf 'Agentation is ready at http://localhost:4747.\n'
fi

printf 'Starting OpenInstinct at http://localhost:3000. Press Ctrl-C to stop the owned stack.\n'
pnpm dev
