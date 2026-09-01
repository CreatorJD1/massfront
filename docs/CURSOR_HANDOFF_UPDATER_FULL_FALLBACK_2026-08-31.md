# Cursor Handoff — Updater manifest fallback fix

> **Superseded/corrected 2026-08-31.** The live and local repaired v1.33.52
> manifests contain 110-entry `files` and `full` arrays. The original diagnosis
> below was stale. The compatibility fallback remains useful for genuinely
> legacy/interrupted manifests, but it was not the final cause of the .52 hash
> failure. Use [`RELEASE_STATUS.md`](RELEASE_STATUS.md) for current truth.

Date: 2026-08-31  
Request: Restore patching after Cursor update manifest format drift.

## What was broken
Current published manifests in this checkout (`update.json`, `releases/MASSFRONT-update.json`, `releases/update-v1.33.52.json`) expose `full:[...]` payloads but omit a top-level `files:[...]`.

The updater previously validated:
1. `m.version` valid
2. `m.files` exists and is non-empty

That made the update check fail as “bad manifest” and blocked patch/apply flow.

## Fix applied
- File changed: `src/updater.js`
- Updated `updNormalizeManifest()` to inherit file list from:
  - `files` (when present),
  - else `core` (legacy),
  - else `full` (legacy manifests),
  - else empty list.

This keeps normal patch flow unchanged for modern manifests while restoring backward compatibility with `full`-only payloads.

## Follow-up for Cursor
- Keep this updater compatibility fallback as-is.
- If possible, republish a next version manifest so `files` is explicitly present again (for forward compatibility with future release tooling checks).

## Follow-up run: updater re-execution (2026-08-31)

### What I ran now
- `node tools/test-stage8-updater-interruption.mjs`
- `node tools/test-update-binary-art.mjs 1.33.52`
- `node tools/bundle-update.mjs 1.33.52`
- `node tools/test-updater-status.mjs http://127.0.0.1:8901/` (with local `python -m http.server 8901 --directory .`)
- `.\tools\publish-hf-release.ps1 -Version 1.33.52 -Notes "1.33.52 updater retry pass" -Resume -DryRun`

### Results
- Updater interruption regression: **PASS**
- Update binary payload test: **PASS** (110 artifacts, per-file payload format, ~88.96 MB staged)
- Local updater status regression: **PASS**
  - The local UI now reports expected update states, and update button behavior remains healthy.
- Local `bundle-update` for 1.33.52 re-generated cleanly.
- Publish script resume-precheck passes in dry-run mode.

### Actionable next step for live redo
- To perform the actual remote redo (HF mirror activation), run with real credentials:
  - `.\tools\publish-hf-release.ps1 -Version 1.33.52 -Notes "..." -Resume`
- If you want a clean new build lane instead of resume, bump the version and run the publish flow without `-Resume` (that will also run APK packaging + HF uploads).
