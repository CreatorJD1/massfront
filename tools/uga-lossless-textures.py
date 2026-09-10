"""Lossless UGA delivery derivative; geometry and decoded texture bytes are invariant."""
import argparse, copy, hashlib, io, json, pathlib, struct, subprocess
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true')
parser.add_argument('--verify-only', type=pathlib.Path)
args = parser.parse_args()
source = root/'modules/space_exploration/assets/models/uga-command-cutaway.glb'
if args.verify_only:
    def unpack(path):
        raw = path.read_bytes()
        assert struct.unpack_from('<3I', raw) == (0x46546c67, 2, len(raw))
        size, kind = struct.unpack_from('<2I', raw, 12)
        assert kind == 0x4e4f534a
        doc = json.loads(raw[20:20+size])
        assert len(doc['buffers']) == 1
        return raw, doc, raw[28+size:]
    a, ad, ab = unpack(source)
    b, bd, bb = unpack(args.verify_only.resolve())
    def view(doc, binary, index):
        item = doc['bufferViews'][index]
        start = item.get('byteOffset', 0)
        return binary[start:start+item['byteLength']]
    assert len(ad['images']) == len(bd['images'])
    assert len(ad['bufferViews']) == len(bd['bufferViews'])
    assert {k:v for k,v in ad['buffers'][0].items() if k != 'byteLength'} == {k:v for k,v in bd['buffers'][0].items() if k != 'byteLength'}, 'buffer location altered'
    for key in ('nodes','meshes','accessors','materials','scenes','scene','animations','skins','cameras'):
        assert ad.get(key) == bd.get(key), f'{key} altered'
    images = {im['bufferView'] for im in ad['images']}
    for index, original_view in enumerate(ad['bufferViews']):
        current_view = bd['bufferViews'][index]
        assert {k:v for k,v in original_view.items() if k not in ('byteOffset','byteLength')} == {k:v for k,v in current_view.items() if k not in ('byteOffset','byteLength')}
        if index not in images:
            assert view(ad, ab, index) == view(bd, bb, index), f'geometry buffer {index} altered'
    for index, original_image in enumerate(ad['images']):
        candidate_image = bd['images'][index]
        assert {k:v for k,v in original_image.items() if k != 'mimeType'} == {k:v for k,v in candidate_image.items() if k != 'mimeType'}
        original_png = view(ad,ab,original_image['bufferView'])
        candidate_bytes = view(bd,bb,candidate_image['bufferView'])
        with Image.open(io.BytesIO(original_png)) as x, Image.open(io.BytesIO(candidate_bytes)) as y:
            assert x.size == y.size and x.convert('RGBA').tobytes() == y.convert('RGBA').tobytes(), f'image {index} pixels differ'
            assert candidate_image.get('mimeType') == {'PNG':'image/png','WEBP':'image/webp'}[y.format], 'image format declaration mismatch'
            if y.format == 'WEBP':
                assert 'EXT_texture_webp' in bd.get('extensionsRequired', [])
                for tex in bd['textures']:
                    if tex.get('source') == index:
                        assert tex.get('extensions', {}).get('EXT_texture_webp', {}).get('source') == index
            if any(k in x.info for k in ('icc_profile','gamma','chromaticity','srgb')):
                assert original_png == candidate_bytes, f'image {index} color metadata altered'
    normalized = copy.deepcopy(bd)
    for tex in normalized['textures']:
        ext = tex.get('extensions', {})
        if 'EXT_texture_webp' in ext:
            assert ext['EXT_texture_webp']['source'] == tex['source']
            assert bd['images'][tex['source']]['mimeType'] == 'image/webp'
            del ext['EXT_texture_webp']
            if not ext: tex.pop('extensions', None)
    for key in ('extensionsUsed','extensionsRequired'):
        if key in normalized:
            normalized[key] = [x for x in normalized[key] if x != 'EXT_texture_webp']
            if not normalized[key] and key not in ad: normalized.pop(key)
    normalized['bufferViews'] = ad['bufferViews']
    normalized['buffers'] = ad['buffers']
    normalized['images'] = ad['images']
    assert normalized == ad, 'unapproved glTF metadata change'
    print(json.dumps(dict(pass_=True, sourceSha256=hashlib.sha256(a).hexdigest(), candidateSha256=hashlib.sha256(b).hexdigest(), imagesVerified=len(ad['images']), geometryUnchanged=True, pixelsIdentical=True, sceneSemanticsUnchanged=True)))
    raise SystemExit(0)
subprocess.run(['node', str(root/'tools/evidence-foundation/workspace-guard.mjs'), 'check-write'], cwd=root, check=True)
source = root/'modules/space_exploration/assets/models/uga-command-cutaway.glb'
outdir = root/'tmp/uga-lossless'
outdir.mkdir(parents=True, exist_ok=True)
original = source.read_bytes()
magic, version, length, json_length, json_type = struct.unpack_from('<5I', original)
assert (magic, version, length, json_type) == (0x46546c67, 2, len(original), 0x4e4f534a)
doc = json.loads(original[20:20+json_length])
bin_length, bin_type = struct.unpack_from('<2I', original, 20+json_length)
assert bin_type == 0x004e4942 and len(doc['buffers']) == 1
binary = original[28+json_length:28+json_length+bin_length]
before = copy.deepcopy(doc)
sha = lambda b: hashlib.sha256(b).hexdigest()
replacement, rows = {}, []
image_views = {im['bufferView'] for im in doc['images']}
assert all(a.get('bufferView') not in image_views for a in doc.get('accessors', []))
for index, image in enumerate(doc['images']):
    view = doc['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    png = binary[start:start+view['byteLength']]
    with Image.open(io.BytesIO(png)) as im:
        assert im.format == 'PNG' and im.mode in ('RGB', 'RGBA'), 'unreviewed source format'
        # Avoid silently changing browser color interpretation on metadata-bearing PNGs.
        rgba = im.convert('RGBA').tobytes()
        metadata = [k for k in ('icc_profile', 'gamma', 'chromaticity', 'srgb') if k in im.info]
        if metadata:
            rows.append(dict(index=index, name=image.get('name'), width=im.width, height=im.height,
                             originalBytes=len(png), candidateBytes=len(png), accepted=False,
                             decodedRgbaSha256=sha(rgba), pixelIdentical=True, keptPngReason=metadata))
            print(f"{index+1}/44 {image.get('name')}: keep original PNG color metadata {metadata}", flush=True)
            continue
        encoded = io.BytesIO()
        im.save(encoded, 'WEBP', lossless=True, exact=True, method=6)
        webp = encoded.getvalue()
        with Image.open(io.BytesIO(webp)) as decoded:
            assert decoded.size == im.size and decoded.convert('RGBA').tobytes() == rgba
        smaller = len(webp) < len(png)
        row = dict(index=index, name=image.get('name'), width=im.width, height=im.height,
                   originalBytes=len(png), candidateBytes=len(webp), accepted=smaller,
                   decodedRgbaSha256=sha(rgba), pixelIdentical=True)
    if smaller:
        assert image['bufferView'] not in replacement
        replacement[image['bufferView']] = webp
        image['mimeType'] = 'image/webp'
        for texture in doc['textures']:
            if texture.get('source') == index:
                texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': index}
    rows.append(row)
    print(f"{index+1}/44 {image.get('name')}: {len(png)} -> {len(webp)} {'accepted' if smaller else 'keep PNG'}", flush=True)

# Copy every non-image buffer view byte-for-byte. Do not pass scene data through
# a glTF exporter that decomposes/reconstructs the authored node transforms.
rebuilt = bytearray()
geometry_hashes = []
for index, view in enumerate(doc['bufferViews']):
    start = view.get('byteOffset', 0)
    raw = binary[start:start+view['byteLength']]
    payload = replacement.get(index, raw)
    rebuilt.extend(b'\0' * ((-len(rebuilt)) % 4))
    view['byteOffset'], view['byteLength'] = len(rebuilt), len(payload)
    rebuilt.extend(payload)
    if index not in image_views:
        assert bytes(rebuilt[view['byteOffset']:view['byteOffset']+view['byteLength']]) == raw
        geometry_hashes.append(sha(raw))
doc['buffers'][0]['byteLength'] = len(rebuilt)
if replacement:
    for key in ('extensionsUsed', 'extensionsRequired'):
        doc[key] = list(dict.fromkeys(doc.get(key, []) + ['EXT_texture_webp']))
for key in ('nodes', 'meshes', 'accessors', 'materials', 'scenes', 'scene', 'animations', 'skins', 'cameras'):
    assert doc.get(key) == before.get(key), f'authored {key} changed'
jbytes = json.dumps(doc, separators=(',', ':')).encode()
jbytes += b' ' * ((-len(jbytes)) % 4)
rebuilt.extend(b'\0' * ((-len(rebuilt)) % 4))
result = struct.pack('<5I', magic, version, 28+len(jbytes)+len(rebuilt), len(jbytes), json_type) + jbytes + struct.pack('<2I', len(rebuilt), bin_type) + rebuilt
candidate = outdir/'uga-authored-sections.glb'
candidate.write_bytes(result)
if args.apply:
    assert len(result) < len(original), 'candidate is not smaller'
    (root/'modules/space_exploration/assets/runtime/models/uga-authored-sections.glb').write_bytes(result)
report = dict(source=str(source.relative_to(root)), originalBytes=len(original), candidateBytes=len(result),
              sourceSha256=sha(original), candidateSha256=sha(result), applied=args.apply,
              acceptedTextures=len(replacement), textures=rows, geometryBufferHashes=geometry_hashes,
              geometryUnchanged=True, sceneSemanticsUnchanged=True)
(outdir/'texture-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ('textures','geometryBufferHashes')}, indent=2))
