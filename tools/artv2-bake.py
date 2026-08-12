"""ART V2 TOOLKIT — bake stage (run inside Blender 5.2).

    node tools/artv2.mjs bake <asset|--all> [--json]      <- normal entry point
    blender -b --factory-startup --python tools/artv2-bake.py -- <asset|--all>

Thin CLI only: all logic lives in tools/artv2/mf2_bake.py so a new asset is a
manifest entry rather than a new script. Prints one ARTV2_RESULT <json> line per
asset for the Node layer / an AI agent to parse.
"""
import sys, os, json, traceback

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'artv2'))
import mf2_bake as mf2  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = [a for a in argv if not a.startswith('--')]
    force = '--force' in argv
    selector = args[0] if args else '--all'

    manifest = mf2.load_manifest()
    keys = list(manifest['assets']) if selector in ('--all', 'all', None) else [selector]

    unknown = [k for k in keys if k not in manifest['assets']]
    if unknown:
        mf2.emit_result(None, ok=False,
                        errors=['unknown asset(s): %s. known: %s' % (', '.join(unknown), ', '.join(manifest['assets']))])
        sys.exit(2)

    failures = 0
    for key in keys:
        try:
            result = mf2.bake_asset(manifest, key, force=force)
            if not result['withinBudget']:
                battle = next((l for l in result['lods'] if l['name'] == 'battle'), None)
                mf2.emit_result(result, ok=False, errors=[
                    'battle LOD %s tris exceeds the %s budget for class %s' %
                    (battle['tris'] if battle else '?', result['battleBudget'], manifest['assets'][key]['class'])])
                failures += 1
            else:
                mf2.emit_result(result)
        except Exception as exc:                              # surface, never hang
            traceback.print_exc()
            mf2.emit_result({'asset': key}, ok=False, errors=[str(exc)])
            failures += 1

    sys.exit(1 if failures else 0)


main()
