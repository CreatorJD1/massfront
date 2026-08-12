/* Tripo v3 driver for the 14 MASSFRONT world structures.

   WHY THIS EXISTS
   The game's city districts, relics and props are procedural boxes today.
   Art direction wants them as real Tripo PBR models: proper low-poly geometry
   with baked base-color/normal/roughness maps that read at command-view scale.
   This tool is the generation half of that pipeline. The other half — turning
   the downloaded GLB into an MF_BLENDER_GEO entry plus loose texture PNGs the
   engine can sample — is the sibling import tool; run them in order.

   WHAT IT DOES
     1. Reads TRIPO_API_KEY from the environment ONLY. The key never touches a
        file, the OTA payload, or this repo — it must not even appear in shell
        history beyond the export line.
     2. For each of the 14 slots: submits text_to_model on the P1-20260311
        model (or image_to_model when the slot carries a --ref image), asking
        for PBR + textures at the slot's face budget.
     3. Polls every task until success (GET /tasks/{id}, same key that created
        it — a different key gets "task not found").
     4. Downloads the PBR GLB and extracts its embedded base-color/normal/
        metallic-roughness/occlusion PNGs into design/tripo/<slot>/textures/.
        Tripo embeds the maps in the GLB, so this needs no extra credits.
     5. Optionally (--convert) re-bakes the model via /models/convert at a
        chosen texture_size, dumping loose PNGs — spend credits only when the
        default extraction is not enough.
     6. Keeps design/tripo/state.json, so a rerun resumes instead of burning
        credits on slots already generated.

   USAGE
     $env:TRIPO_API_KEY='tsk_...'   # PowerShell; export in bash
     node tools/tripo.mjs                    # submit all 14, poll, download, extract
     node tools/tripo.mjs --only rock        # a single slot
     node tools/tripo.mjs --dry-run          # print prompts + cost, call nothing
     node tools/tripo.mjs --convert --size 1024   # also run convert_model per slot

   COST — P1 text_to_model with PBR is ~40-50 credits a model; 14 slots is
   roughly $5-6 on the API wallet. The API wallet is SEPARATE from the paid web
   plan wallet; a zero-credit API key will fail with an insufficient-balance
   error even though the web dashboard shows credits.
*/
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://openapi.tripo3d.ai/v3';
const MODEL = 'P1-20260311';
const OUT = join(root, 'design/tripo');
const STATE = join(OUT, 'state.json');
const POLL_MS = 3000, POLL_MAX = 90;   // 4.5 min per task before we bail

const args = process.argv.slice(2);
const has = n => args.includes('--' + n);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const DRY = has('dry-run');
const CONVERT = has('convert');
const TEXSIZE = +opt('size', 1024);
const ONLY = opt('only', '');
const KEY = process.env.TRIPO_API_KEY;

/* ---- manifest --------------------------------------------------------------
   Every slot key is the FX.<slot> instance the engine creates in initModels()
   (src/engine/models.js) plus FX.cityC (models-civic.js), so a generated model
   can be dropped in by key. Prompts describe the SAME silhouette the current
   procedural/sprite art shows, so replacing a mesh does not redraw the map.
   face_limit stays modest: the import tool decimates to the engine budget
   anyway, and P1 is explicitly built to hold topology at low counts.
   height = approximate world-space height of the current model; the importer
   normalizes the downloaded mesh to it. */
const NEG = 'text, watermark, lettering, people, animals, weapons, vehicles, grass, flowers, base, pedestal, plinth, disc, ground, blurred, deformed, melted, extra limbs, multiple objects';
const WRLD = [
  { slot:'cityT', height:80, face:3200,
    prompt:'A ruined concrete high-rise apartment tower, boxy, eight storeys, each storey banded, rows of blown-out dark window openings, the crown sheared off at an angle with a collapsed lean, weather-worn grey concrete, PBR textures, low-poly mobile RTS game asset, stands on flat ground' },
  { slot:'cityD', height:48, face:3000,
    prompt:'A ruined civic building: a large concrete dome sitting on a square podium, a caved-in section torn from one side, a short colonnade of pillars along the front, weathered grey concrete, PBR textures, low-poly mobile RTS game asset, stands on flat ground' },
  { slot:'cityH', height:64, face:3400,
    prompt:'A gutted industrial foundry hall: a long shed with a saw-tooth clerestory roof, roller doors along the front, one collapsed bay, a tall square chimney stack beside it, weathered concrete and rusted steel, PBR textures, low-poly mobile RTS game asset, stands on flat ground' },
  { slot:'cityK', height:30, face:2600,
    prompt:'A fuel tank farm: a low concrete containment bund surrounding three large cylindrical storage tanks with domed roofs, metal pipes linking them, rust and weathering, PBR textures, low-poly mobile RTS game asset, stands on flat ground' },
  { slot:'cityC', height:44, face:3400,
    prompt:'An intact civic government block: a wide two-tier concrete plinth, a broad stepped podium, four slender corner pylons rising higher than the tower mass, a recessed entrance doorway under a flat canopy, weathered grey concrete, PBR textures, low-poly mobile RTS game asset, stands on flat ground' },
  { slot:'relicT', height:80, face:3000,
    prompt:'A ruined arcology spire: a tall tapering tower, top sheared off at an angle, rows of broken window openings, weathered grey concrete with steel edge trim, abandoned for decades, PBR textures, low-poly mobile RTS game asset, stands on flat ground' },
  { slot:'relicD', height:42, face:2800,
    prompt:'A collapsed civic hall: a broken half-dome over a low circular base wall, a caved-in hole in the roof, ruined columns around the rim, weathered grey concrete, PBR textures, low-poly mobile RTS game asset, stands on flat ground' },
  { slot:'relicI', height:72, face:3400,
    prompt:'A gutted industrial factory: a long shed with a five-section saw-tooth roof, shattered glazing between the roof teeth, a hole punched through the middle, roller doors, a tall square stack, weathered concrete and rusted steel, PBR textures, low-poly mobile RTS game asset, stands on flat ground' },
  { slot:'relicK', height:36, face:2600,
    prompt:'A ruined fuel tank farm: a low concrete bund around three tilted steel storage drums of different sizes, one ruptured, pipes between them, rust streaks, weathered, PBR textures, low-poly mobile RTS game asset, stands on flat ground' },
  { slot:'rock', height:22, face:1800,
    prompt:'A weathered grey boulder cluster, three rounded lumps of fractured stone, cracks and chips, muted grey colour, PBR textures, low-poly mobile RTS game asset, sits on flat ground' },
  { slot:'tree', height:26, face:2000,
    prompt:'A rugged dead tree: a thick gnarled trunk, rough bark, a few sparse spreading branches, small dull grey-green foliage clumps, muted palette, PBR textures, low-poly mobile RTS game asset, stands on flat ground' },
  { slot:'crystal', height:24, face:2200,
    prompt:'A cluster of tall translucent hexagonal crystal prisms sharing one root, leaning apart, flat faceted sides, pointed terminations, near-white icy crystal with a faint cool tint, slight emissive glow at the base, PBR textures, low-poly mobile RTS game asset, stands on flat ground' },
  { slot:'dep', height:22, face:2600,
    prompt:'A wide flat ore pan of rock with six faceted crystal prisms growing from its centre in a radial crown, translucent pale crystal, grey stone rim, PBR textures, low-poly mobile RTS game asset, stands on flat ground' },
  { slot:'geyser', height:12, face:1800,
    prompt:'A geothermal vent: a low layered mound of dark rock with a wide steaming black hole in the top, a thin rim of tumbled stone, faint blue-glow inside the vent, PBR textures, low-poly mobile RTS game asset, stands on flat ground' },
];

/* ---- HTTP ------------------------------------------------------------------ */
async function api(path, init = {}) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  let body;
  try { body = await r.json(); } catch { throw new Error('HTTP ' + r.status + ' ' + path); }
  if (!r.ok || (body.code != null && body.code !== 0)) {
    throw new Error(path + ' -> ' + r.status + ' ' + (body.message || body.error || JSON.stringify(body)));
  }
  return body.data || body;
}

/* Multipart upload without dependencies: build the body by hand. Node has no
   FormData-to-fetch portability guarantee across versions, and this repo has no
   deps. Only used for slots that carry a --ref reference image. */
async function upload(pathToFile) {
  const b = readFileSync(pathToFile);
  const ext = (pathToFile.split('.').pop() || '').toLowerCase();
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) throw new Error('ref must be png/jpg/jpeg/webp: ' + pathToFile);
  const boundary = '----mf' + Math.random().toString(16).slice(2);
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${pathToFile.split(/[\\/]/).pop()}"\r\nContent-Type: image/${ext === 'jpg' ? 'jpeg' : ext}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const buf = Buffer.concat([Buffer.from(head), b, Buffer.from(tail)]);
  const r = await fetch(BASE + '/files', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'multipart/form-data; boundary=' + boundary },
    body: buf,
  });
  const body = await r.json();
  if (!r.ok || (body.code != null && body.code !== 0)) throw new Error('upload -> ' + r.status + ' ' + (body.message || JSON.stringify(body)));
  return body.data.file_token;
}

async function submit(slot) {
  if (slot.ref) {
    /* v3 image_to_model: the reference goes in a top-level `input` as a
       file_token (uploaded first). There is no nested `file` object and no
       `type` field on the v3 API — the endpoint path carries the task kind. */
    const token = await upload(join(root, slot.ref));
    const data = await api('/generation/image-to-model', { method: 'POST', body: JSON.stringify({
      input: token, model: MODEL, face_limit: slot.face, texture: true, pbr: true,
    }) });
    return data.task_id;
  }
  const data = await api('/generation/text-to-model', { method: 'POST', body: JSON.stringify({
    prompt: slot.prompt, model: MODEL, face_limit: slot.face,
    texture: true, pbr: true, negative_prompt: NEG,
  }) });
  return data.task_id;
}

async function poll(taskId, label) {
  for (let k = 0; k < POLL_MAX; k++) {
    const d = await api('/tasks/' + taskId);
    const st = d.status;
    if (st === 'success') return d;
    if (st === 'failed') throw new Error(label + ' failed: ' + (d.error_message || 'no message'));
    if (['banned', 'expired', 'cancelled', 'unknown'].includes(st)) throw new Error(label + ' ' + st);
    process.stdout.write(`\r  ${label} ${st} ${d.progress ?? ''}%   `);
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  throw new Error(label + ' timed out after ' + (POLL_MS * POLL_MAX / 1000) + 's');
}

/* ---- GLB embedded-texture extraction --------------------------------------- */
/* Tripo PBR GLBs carry base_color / normal / metallic_roughness / occlusion as
   separate images referenced by JSON bufferViews. Pull them out as loose PNGs —
   the exact "loose maps" the engine's texture path will consume. */
function extractGLB(buf, dir) {
  if (buf.readUInt32LE(0) !== 0x46546C67) throw new Error('not a GLB');
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4E4F534A) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004E4942) bin = chunk;
    off += 8 + len + (len % 4 ? 4 - len % 4 : 0);
  }
  if (!json || !bin) throw new Error('malformed GLB');
  mkdirSync(dir, { recursive: true });
  const out = [];
  for (const img of json.images || []) {
    if (img.bufferView == null) continue;   // data-URI images are not our case
    const bv = json.bufferViews[img.bufferView];
    const start = bv.byteOffset || 0;
    const bytes = Buffer.from(bin.subarray(start, start + bv.byteLength));
    const name = img.name || img.mimeType.replace('/', '_');
    const ext = img.mimeType === 'image/png' ? 'png' : 'jpg';
    const f = join(dir, (name.endsWith('.' + ext) ? name : name + '.' + ext));
    writeFileSync(f, bytes);
    out.push(f);
  }
  return out;
}

async function download(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('download ' + r.status + ' ' + url);
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

/* ---- state ------------------------------------------------------------------ */
function loadState() {
  try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return {}; }
}
function saveState(st) { mkdirSync(OUT, { recursive: true }); writeFileSync(STATE, JSON.stringify(st, null, 1)); }

/* ---- main ------------------------------------------------------------------- */
if (!KEY) { console.error('TRIPO_API_KEY is not set (env var only, never a file)'); process.exit(1); }
const slots = ONLY ? WRLD.filter(s => s.slot === ONLY) : WRLD;
if (!slots.length) { console.error('unknown slot: ' + ONLY); process.exit(1); }

if (DRY) {
  const total = slots.reduce((n, s) => n + (s.ref ? 55 : 45), 0);
  for (const s of slots) {
    console.log(`\n== ${s.slot} (${s.ref ? 'image' : 'text'} -> model, ~${s.ref ? 55 : 45} cr) ==`);
    console.log('  ' + s.prompt);
  }
  console.log(`\n~${total} credits (~$${(total * 0.01).toFixed(2)} at $0.01/cr) for ${slots.length} slot(s).`);
  process.exit(0);
}

const st = loadState();
for (const s of slots) {
  const rec = st[s.slot] || (st[s.slot] = {});
  const slotDir = join(OUT, s.slot), raw = join(slotDir, 'model.glb');
  if (rec.done && existsSync(raw)) { console.log(`skip ${s.slot} (done)`); continue; }
  console.log(`\n== ${s.slot}`);
  mkdirSync(slotDir, { recursive: true });

  if (!rec.taskId) {
    rec.taskId = await submit(s);
    saveState(st);
    console.log('  submitted ' + rec.taskId);
  }
  console.log('  waiting...');
  const gen = await poll(rec.taskId, s.slot);
  rec.credits = gen.credits_consumed;
  const url = gen.output?.pbr_model || gen.output?.model_url;
  if (!url) throw new Error(s.slot + ': no model_url in output');
  await download(url, raw);
  console.log('\r  model.glb ' + (gen.credits_consumed || '?') + ' cr');

  const maps = extractGLB(readFileSync(raw), join(slotDir, 'textures'));
  rec.done = true;
  saveState(st);
  console.log('  textures: ' + (maps.length ? maps.map(m => m.split(/[\\/]/).pop()).join(', ') : 'NONE'));

  if (CONVERT) {
    const cdata = await api('/models/convert', { method: 'POST', body: JSON.stringify({
      input: rec.taskId, format: 'GLTF', texture_size: TEXSIZE, texture_format: 'PNG',
      bake: true, pack_uv: true, pivot_to_center_bottom: true, flatten_bottom: true,
    }) });
    console.log('  convert ' + cdata.task_id + '...');
    const conv = await poll(cdata.task_id, s.slot + '/convert');
    const curl = conv.output?.model_url;
    if (curl) {
      const cf = join(slotDir, 'converted.glb');
      await download(curl, cf);
      const cmaps = extractGLB(readFileSync(cf), join(slotDir, 'textures'));
      console.log('\r  converted.glb @ ' + TEXSIZE + 'px, maps: ' + (cmaps.length || 'none'));
    }
  }
}
console.log('\nstate -> ' + STATE);
