#!/usr/bin/env bash
set -euo pipefail
exec pnpm exec tsx scripts/production/cli.ts "$@"
