#!/usr/bin/env bash
set -euo pipefail
umask 077

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$script_dir"

usage() {
  cat <<'EOF'
Usage: ./init.sh [--profile connected|fixture] [--status|--stop] [--check] [--setup-only] [--skip-install]

Bootstrap the complete local OpenInstinct development stack.

  --check        Verify prerequisites only; do not touch files or services.
  --setup-only   Prepare dependencies and credentials, then stop.
  --skip-install Skip pnpm install --frozen-lockfile.
  --profile      Start the connected default or an isolated synthetic fixture.
  --status       Read the current worktree's local-run record; do not mutate it.
  --stop         Stop the exact owned local run for this worktree.
  --help         Show this help.

Fresh checkouts use the canonical Vercel project automatically. Override its
non-secret identifiers with OPENINSTINCT_VERCEL_PROJECT and
OPENINSTINCT_VERCEL_TEAM when working from a different authorized project.
EOF
}

check_only=false
setup_only=false
skip_install=false
profile="connected"
control="start"

while [[ "$#" -gt 0 ]]; do
  argument="$1"
  case "$argument" in
    --check) check_only=true ;;
    --setup-only) setup_only=true ;;
    --skip-install) skip_install=true ;;
    --profile)
      shift
      if [[ "${1:-}" != "connected" && "${1:-}" != "fixture" ]]; then
        printf '%s\n' '--profile requires connected or fixture.' >&2
        usage >&2
        exit 2
      fi
      profile="$1"
      ;;
    --status) control="status" ;;
    --stop) control="stop" ;;
    --help|-h) usage; exit 0 ;;
    *)
      printf 'Unknown option: %s\n\n' "$argument" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [[ "$control" != "start" && ( "$check_only" == true || "$setup_only" == true || "$skip_install" == true || "$profile" != "connected" ) ]]; then
  printf '%s\n' 'Lifecycle controls cannot be combined with setup, check, install, or profile flags.' >&2
  usage >&2
  exit 2
fi

if [[ "$profile" == "fixture" && ( "$check_only" == true || "$setup_only" == true ) ]]; then
  printf '%s\n' 'Fixture startup cannot be combined with --check or --setup-only.' >&2
  usage >&2
  exit 2
fi

if [[ "$control" == "status" || "$control" == "stop" ]]; then
  exec node scripts/dev.ts "--$control"
fi

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
if [[ "$profile" == "connected" && ! -f .env.local ]]; then
  cp .env.example .env.local
  env_created_from_template=true
fi

if [[ "$profile" == "connected" ]]; then
  chmod 600 .env.local
fi

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

if [[ "$profile" == "connected" ]] && ! credentials_ready; then
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

  vercel_project="${OPENINSTINCT_VERCEL_PROJECT:-}"
  vercel_team="${OPENINSTINCT_VERCEL_TEAM:-}"
  target_arguments=(--inventory config/production-targets.json)
  if [[ -n "$vercel_project" || -n "$vercel_team" ]]; then
    target_arguments+=(--project "$vercel_project" --team "$vercel_team")
  fi
  if ! verified_target="$(node scripts/local/verify-vercel-target.ts "${target_arguments[@]}")"; then
    cat <<'EOF' >&2
Could not verify the existing Vercel target. The private .env.local template
was preserved and Eve did not link or create a project. Confirm Vercel access
and the configured inventory, then rerun ./init.sh.
EOF
    exit 1
  fi
  IFS=$'\t' read -r vercel_project vercel_team <<< "$verified_target"
  if [[ -z "$vercel_project" || -z "$vercel_team" ]]; then
    printf '%s\n' 'Could not verify the existing Vercel target; Eve did not link.' >&2
    exit 1
  fi
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

if [[ "$profile" == "connected" ]] && ! credentials_ready; then
  cat <<'EOF' >&2
The linked development environment did not provide KERNEL_API_KEY and either
AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN. Ask a project owner to attach Kernel
and enable AI Gateway for the development environment, then rerun ./init.sh.
EOF
  exit 1
fi

if [[ "$profile" == "connected" ]]; then
  printf 'Local environment is ready. Phone auth uses the development-only code 000000.\n'
else
  printf 'Starting an isolated fixture run. It does not load repository credentials or permit external network access from fixture services.\n'
fi

if [[ "$setup_only" == true ]]; then
  exit 0
fi

printf 'Starting the complete %s stack. Press Ctrl-C to stop only resources owned by this run.\n' "$profile"
if [[ "$profile" == "fixture" ]]; then
  exec node scripts/dev.ts --profile fixture
fi
exec env DEV_PROFILE=connected pnpm dev
