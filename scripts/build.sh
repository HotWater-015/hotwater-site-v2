#!/usr/bin/env bash
# Local build only. Does not import Markdown or stage files from Projects/ctf.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/local.mjs build
