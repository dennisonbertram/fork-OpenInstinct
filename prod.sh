#!/usr/bin/env bash
set -euo pipefail
export pnpm_config_verify_deps_before_run=false
exec pnpm exec tsx scripts/production/cli.ts "$@"
