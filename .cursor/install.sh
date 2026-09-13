#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for MASSFRONT.
# Prepares dependencies + source-derived generated state so `www/` can be served
# and built. Safe to run repeatedly; every step converges to the same result.
set -euo pipefail

cd "$(dirname "$0")/.."

# Build/test-only dependencies from the committed lockfile. The game itself ships
# no runtime dependencies (AGENTS.md), so this only feeds the build+QA tooling.
npm ci

# Large authored/runtime art (PNG/JPEG/WebP/KTX2/GLB/blend) lives in Git LFS.
# Configure the LFS filters in local git config WITHOUT installing git hooks
# (--skip-repo) so Cursor's managed hooks are left intact, then materialize the
# binary bodies that the packer verifies by hash.
git lfs install --local --skip-repo
git lfs pull

# Signed Galactic Exploration runtime content manifest. tools/pack-www.mjs
# refuses to stage the base pack without it and re-verifies its hash.
node modules/space_exploration/tools/build-runtime-content-manifest.mjs

# Syntax gate + single-file artifact. Parses the whole concatenated one-global
# scope and fails on duplicate top-level declarations — the codebase's most
# common failure mode. Run after every source change.
node tools/bundle.mjs

# Stage www/ for the dev server and Capacitor, verifying nothing 404s on device.
node tools/pack-www.mjs
