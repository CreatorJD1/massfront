"""Self-tests proving the junction verifier fails closed."""

import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
VERIFIER = Path(__file__).with_name("verify-hf-road-junctions.py")
REPORT = (
    ROOT / "modules" / "space_exploration" / "assets" / "source" / "blender"
    / "world-kits" / "mf-road-junctions-v1" / "mf-road-junctions-v1.provenance.json"
)


def run(report_path):
    return subprocess.run(
        [sys.executable, str(VERIFIER), "--report", str(report_path)],
        capture_output=True, text=True, check=False,
    )


def main():
    baseline = json.loads(REPORT.read_text(encoding="utf-8"))
    clean = run(REPORT)
    if clean.returncode != 0:
        raise SystemExit("FAIL clean fixture rejected: " + clean.stdout + clean.stderr)
    mutations = {
        "lifecycle-promotion": lambda value: value.update({"runtimeAccepted": True}),
        "geometry-intersection": lambda value: value["pieces"][0]["lods"][0]["intersectionAccounting"].update({"unexpectedIntersections": 1}),
        "socket-width": lambda value: value["pieces"][0]["sockets"][0].update({"widthM": 19.0}),
        "missing-evidence": lambda value: value["evidence"]["renders"].pop(),
        "stale-evidence-hash": lambda value: value["evidence"]["renders"][0].update({"sha256": "0" * 64}),
    }
    results = []
    with tempfile.TemporaryDirectory(prefix="mf-road-junction-fixtures-") as directory:
        for name, mutate in mutations.items():
            fixture = copy.deepcopy(baseline)
            mutate(fixture)
            path = Path(directory) / (name + ".json")
            path.write_text(json.dumps(fixture), encoding="utf-8")
            completed = run(path)
            if completed.returncode == 0:
                raise SystemExit("FAIL mutated fixture passed: " + name)
            results.append({"fixture": name, "exit": completed.returncode})
    print(json.dumps({"status": "PASS", "cleanExit": clean.returncode, "rejected": results}, separators=(",", ":")))


if __name__ == "__main__":
    main()
