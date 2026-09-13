# MASSFRONT architecture atlas

This is the canonical copy of the architecture-atlas authoring tool first
created in the dated `2026-08-19` transfer workspace. It is tooling only: no
runtime manifest, package, or release channel loads these files.

From the repository root, refresh the source-bound fragment with:

```powershell
node tools/massfront-atlas/generate.mjs
```

The generator resolves the repository relative to its own location and writes
`massfront-systems-atlas-export.fragment.html` by default. An explicit source
root and output file may still be supplied as its first and second arguments.

`massfront-systems-atlas.html` and `preview.html` are the preserved standalone
exports from the original authoring pass. The fragment is the regenerable
source-bound evidence; a standalone wrapper should be re-exported after a
refresh when a new visual artifact is required.
