"""Adversarial checks: the proof must reject changed geometry, nodes and pixels."""
import copy, io, json, pathlib, struct, subprocess, sys
from PIL import Image
root = pathlib.Path(__file__).resolve().parent.parent
subprocess.run(['node','tools/evidence-foundation/workspace-guard.mjs','check-write'],cwd=root,check=True)
path = root/'modules/space_exploration/assets/runtime/models/uga-authored-sections.glb'
raw = path.read_bytes()
n = struct.unpack_from('<I',raw,12)[0]
doc = json.loads(raw[20:20+n])
binary = raw[28+n:]
target = root/'tmp/uga-lossless/rejected-proof.glb'
def reject(label, j, b):
    data = json.dumps(j,separators=(',',':')).encode()
    data += b' '*(-len(data)%4)
    b += b'\0'*(-len(b)%4)
    target.write_bytes(struct.pack('<5I',0x46546c67,2,28+len(data)+len(b),len(data),0x4e4f534a)+data+struct.pack('<2I',len(b),0x004e4942)+b)
    result = subprocess.run([sys.executable,str(root/'tools/uga-lossless-textures.py'),'--verify-only',str(target)],capture_output=True,text=True,cwd=root)
    assert result.returncode != 0, f'{label} accepted'
    print('PASS rejected '+label)
try:
    changed = copy.deepcopy(doc)
    changed['nodes'][0]['name'] += '_TAMPERED'
    reject('scene metadata tamper',changed,binary)
    images = {im['bufferView'] for im in doc['images']}
    geometry = next(v for i,v in enumerate(doc['bufferViews']) if i not in images and v['byteLength'])
    changed_binary = bytearray(binary)
    changed_binary[geometry.get('byteOffset',0)] ^= 1
    reject('geometry byte tamper',doc,bytes(changed_binary))
    changed = copy.deepcopy(doc)
    im = changed['images'][0]
    view = changed['bufferViews'][im['bufferView']]
    off = view.get('byteOffset',0)
    with Image.open(io.BytesIO(binary[off:off+view['byteLength']])) as image:
        image = image.convert('RGBA')
        p = image.getpixel((0,0)); image.putpixel((0,0),(p[0]^1,*p[1:]))
        encoded = io.BytesIO(); image.save(encoded,'WEBP',lossless=True,exact=True)
    payload = encoded.getvalue()
    view['byteOffset'] = len(binary); view['byteLength'] = len(payload)
    changed['buffers'][0]['byteLength'] = len(binary)+len(payload)
    reject('single decoded pixel tamper',changed,binary+payload)
finally:
    target.unlink(missing_ok=True)
