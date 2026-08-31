"""Print embedded PNG image names, dimensions, and byte sizes from a GLB."""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("glb", type=Path)
    args = parser.parse_args()
    data = args.glb.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or total != len(data):
        raise SystemExit("not a valid GLB 2.0 file")
    offset = 12
    chunks: dict[bytes, bytes] = {}
    while offset < len(data):
        length, kind = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunks[kind] = data[offset:offset + length]
        offset += length
    document = json.loads(chunks[b"JSON"].decode("utf-8"))
    binary = chunks[b"BIN\x00"]
    for index, image in enumerate(document.get("images", [])):
        view = document["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        payload = binary[start:start + view["byteLength"]]
        width = height = None
        if payload.startswith(b"\x89PNG\r\n\x1a\n"):
            width, height = struct.unpack_from(">II", payload, 16)
        print(json.dumps({
            "index": index,
            "name": image.get("name"),
            "mime": image.get("mimeType"),
            "width": width,
            "height": height,
            "bytes": len(payload),
        }))


if __name__ == "__main__":
    main()
