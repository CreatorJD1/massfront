# Exploration readiness auditor

This tool audits the isolated Galactic exploration module without modifying,
deleting, compressing, packaging, or publishing any runtime or authoring asset.

Run from the repository root:

```powershell
node modules/space_exploration/tools/readiness/readiness-selftest.mjs
node modules/space_exploration/tools/readiness/audit-exploration-readiness.mjs
```

The audit writes deterministic JSON and Markdown beneath
`modules/space_exploration/tmp/readiness/<audit-id>/` and updates
`tmp/readiness/latest.json`. The audit ID binds Git HEAD, a scoped dirty-tree
fingerprint, and SHA-256 hashes of every audited source/asset input. Generated
`tmp/**` evidence is excluded from that identity so writing a report cannot
invalidate itself.

Status meanings are strict:

- `PASS`: current source or source-matched evidence proves the requirement.
- `FAIL`: current source or intact source-matched evidence proves a
  contradiction.
- `UNKNOWN`: proof is missing, stale, unapproved, corrupt, or cannot be tied to
  the active source.

`FAIL` and `UNKNOWN` both produce `NOT_READY` and a nonzero process exit.
Older rejected reports are retained so provenance failures are inspectable.

The current audit covers:

- main-menu DOM behavior and the exact default-off feature-flag contract;
- host/request/result/content-manifest contracts and their live enforcement;
- account, campaign, Classic-mode, and exactly-once result isolation;
- all 11 UGA districts in domain, UI, construction, and authored GLB nodes;
- phone-room and construction evidence freshness, capture presence, and hashes;
- optional runtime allowlist integrity and entry-point reachability;
- referenced, unreferenced, runtime, and retained source/authoring assets;
- actual byte totals, GLB compression extensions, texture formats, and
  source-matched optimization approval.

The tool recognizes existing mobile and construction evidence schemas. Missing
safe-area/human approval, capture hashes, or exact source parity remains
`UNKNOWN`; it is never converted to a zero-defect pass.
