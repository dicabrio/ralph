#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
agent="$(basename "$script_dir")"

"${script_dir}/../start.sh" "$agent" "$@"
