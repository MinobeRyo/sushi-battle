#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo 'Usage: bash deploy.sh <staging-directory>' >&2
  exit 2
fi

exec node "$(dirname "$0")/deploy.cjs" "$1"
