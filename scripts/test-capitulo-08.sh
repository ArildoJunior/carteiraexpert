#!/usr/bin/env bash
# Teste canonico do Capitulo 08 - 6 barreiras em ordem.
# Exit 0 somente se TODAS passarem.

set -euo pipefail

cd "$(dirname "$0")/.."

PASS() { echo "[OK]   $1"; }
FAIL() { echo "[FAIL] $1"; exit 1; }

step() {
    local n="$1"; shift
    local title="$1"; shift
    echo ""
    echo "================================================================"
    echo "  [$n/6] $title"
    echo "================================================================"
    if "$@"; then PASS "$title"; else FAIL "$title"; fi
}

step 1 "Biome (lint)"           pnpm exec biome check
step 2 "TypeScript (tsc)"       pnpm typecheck
step 3 "Drizzle migrate"        pnpm drizzle-kit migrate
step 4 "Vitest + Coverage 80%"  pnpm test:coverage
step 5 "Next build"             pnpm build
step 6 "Playwright E2E"         pnpm exec playwright test --reporter=line

echo ""
echo "================================================================"
echo "  CAPITULO 08 - 6/6 verde. Regra de ouro fechada."
echo "================================================================"