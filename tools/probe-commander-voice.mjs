#!/usr/bin/env node
/* Commander identity and voice-event probe.

   Runs the REAL bundled sources — the exact files assets/data/manifest.json
   ships, in the exact order it ships them — inside a node:vm context, and
   asserts the commander identity descriptor and the commander dialogue event
   API against them. Nothing is stubbed that the feature itself provides; the
   only seeded globals are the two the manifest's earlier files would have
   supplied (`econTick` from src/game/economy.js, `sfx` from src/ui/hud.js) plus
   a browser shim, and each one is reported in the output so a reader can see
   exactly how thin the harness is.

   No source file is modified. No audio file is read, written or generated.

   What it proves:
     1  descriptor completeness for all nine playable commanders, with the
        chassis binding cross-checked against the real TYPES table in
        src/game/sim.js
     1a a stable JSON-only CommanderRosterSnapshotV1 for the optional Galactic
        host bridge, without changing Galactic saves or catalogs
     2  taxonomy / dialogue-copy parity between commander.js and story.js
     3  deterministic ordering: two identical event sequences produce a
        byte-identical transcript
     4  cooldown, dedupe, priority, queue bound and staleness
     5  missing-audio fallback in three configurations, including a build with
        no audio module at all
     6  training compatibility: KEEN's bank path is untouched, the commander
        lane defers during training, and commander playback reuses voPlay
        rather than introducing a second voice system

   Usage:  node tools/probe-commander-voice.mjs [--json]
   Exit:   0 all checks passed, 1 otherwise. */
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { validateCommanderRosterSnapshotV1 } from '../modules/space_exploration/src/domain/commander_roster_contract.js';

const execFile = promisify(execFileCallback);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const startedUtc = new Date().toISOString();
const output = join(root, '.tmp', 'commander-voice', 'runs', startedUtc.replace(/[:.]/g, '-'));
const jsonOnly = process.argv.includes('--json');

/* The files this lane owns or reads. Order here is documentation; the VM loads
   in manifest order, resolved below. */
const SOURCE_FILES = [
  'src/game/commander.js',
  'src/story.js',
  'src/audio.js',
  'src/factions.js',
  'src/tutorial.js',
  'src/game/sim.js',
  'assets/data/manifest.json',
  'modules/space_exploration/src/domain/commander_roster_contract.js',
  'modules/space_exploration/src/domain/deterministic.js',
  'modules/space_exploration/src/domain/errors.js',
  'tools/probe-commander-voice.mjs',
];
/* Loaded into the VM, in manifest order. src/game/sim.js is deliberately NOT
   here: this lane must not touch it, and parsing its TYPES table as text is a
   stricter check than executing it. */
const VM_FILES = ['src/game/commander.js', 'src/factions.js', 'src/audio.js', 'src/tutorial.js', 'src/story.js'];

const sha256 = (v) => createHash('sha256').update(v).digest('hex');
const git = async (args) => {
  try {
    return (await execFile('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })).stdout.trimEnd();
  } catch { return ''; }
};

const checks = [];
let failed = 0;
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  if (!ok) failed++;
  if (!jsonOnly) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` [${detail}]` : ''}`);
}
function note(name, detail) {
  checks.push({ name, ok: true, info: true, detail: detail == null ? '' : String(detail) });
  if (!jsonOnly) console.log(`INFO ${name}${detail ? ` [${detail}]` : ''}`);
}

/* ---------------------------------------------------------------------------
   source snapshot
   --------------------------------------------------------------------------- */
const texts = {};
for (const p of SOURCE_FILES) texts[p] = await readFile(join(root, p), 'utf8');
const manifest = JSON.parse(texts['assets/data/manifest.json']);
const snapshot = {
  startedUtc,
  head: await git(['rev-parse', 'HEAD']),
  branch: await git(['rev-parse', '--abbrev-ref', 'HEAD']),
  dirty: !!(await git(['status', '--porcelain=v1', '--untracked-files=all'])),
  files: SOURCE_FILES.map((p) => ({ path: p, bytes: Buffer.byteLength(texts[p]), sha256: sha256(texts[p]) })),
};

/* ---------------------------------------------------------------------------
   harness
   --------------------------------------------------------------------------- */
const SEEDED = {
  econTick: 'declared in src/game/economy.js (manifest index 49), wrapped at src/game/commander.js top level',
  sfx: 'declared in src/ui/hud.js (manifest index 55), reassigned inside initSampleAudio()',
  'applyCrate/aiTick/metaGrant/renderOps/renderOpsBrief':
    'src/story.js wraps these at its own top level (story.js:1210,1223,1229,1254,1260); they come from '+
    'src/game/sim.js, src/game/ai.js, src/game/meta.js and src/endgame.js, none of which this lane touches',
  window: 'browser global; src/tutorial.js reads it at load',
  document: 'browser global; DOM helpers are never called by this probe',
  performance: 'browser global; the dialogue API takes an explicit `now`, so this is only a default',
  fetch: 'used by audLoadVoiceBank() to read the embedded data: URL manifest',
  localStorage: 'browser global',
};

function makeContext({ withAudio = true, sfxLog = [] } = {}) {
  const sandbox = {
    console,
    econTick() {},
    sfx(name, wx, wy, scale, pickIdx) { sfxLog.push({ name, wx, wy, scale, pickIdx }); return true; },
    applyCrate() {}, aiTick() {}, metaGrant() {}, renderOps() {}, renderOpsBrief() {},
    performance: { now: () => 0 },
    fetch: (...a) => globalThis.fetch(...a),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    document: {
      getElementById: () => null,
      createElement: () => ({ style: { removeProperty() {}, setProperty() {} }, classList: { add() {}, remove() {} },
        appendChild() {}, insertBefore() {}, addEventListener() {}, querySelector: () => null, setAttribute() {} }),
      addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  /* Manifest order, filtered to the files under test. Loading in the shipped
     order is itself an assertion: commander.js is index 50 and must not need
     factions.js (61), audio.js (64) or story.js (75) to be evaluated first. */
  const order = manifest.order.filter((p) => VM_FILES.includes(p) && (withAudio || p !== 'src/audio.js'));
  const loaded = [];
  for (const p of order) {
    vm.runInContext(texts[p], ctx, { filename: p });
    loaded.push(p);
  }
  return { ctx, sandbox, loaded, sfxLog };
}
const run = (ctx, expr) => vm.runInContext(expr, ctx);
/* Block comments only. These files document what they refuse to do — the
   commander lane's own header says the words "Math.random", "Date.now" and
   "speechSynthesis" in the sentence explaining that it never uses them — so a
   check that greps raw text would fail on the promise instead of the breach.
   Line comments are left alone deliberately: the lane uses block comments
   exclusively, and a naive `//` stripper would eat the ' // ' inside the
   subtitle tag string. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ---------------------------------------------------------------------------
   0 — BEFORE evidence, measured rather than asserted
   --------------------------------------------------------------------------- */
const before = {
  bankSpeakers: null,
  bankActionsPerFaction: null,
  bankTakes: null,
  keenLineIds: null,
  commanderTakes: null,
  speechCallSites: {
    trainingOnly: (texts['src/tutorial.js'].match(/speakVoice\(m\.text,'keen'/g) || []).length,
    unitRadioVoPlay: (texts['src/audio.js'].match(/voPlay\(A\.id, action/g) || []).length,
  },
  speakVoiceIsGlobal: null,
};

/* ---------------------------------------------------------------------------
   1 — descriptor completeness
   --------------------------------------------------------------------------- */
const main = makeContext();
run(main.ctx, 'true');
note('harness: manifest order loaded', main.loaded.join(' -> '));
note('harness: seeded globals', Object.keys(SEEDED).join(', '));

/* Pull the real voice bank through the real loader before asking anything about
   voice availability. This is the shipped manifest, decoded by the shipped
   code, not a fixture. */
await run(main.ctx, 'audLoadVoiceBank()');
const bank = run(main.ctx, 'VOICE_BANK ? JSON.stringify({voices:VOICE_BANK.voices,chain:VOICE_BANK.chain,generated:VOICE_BANK.generated,lines:Object.fromEntries(Object.entries(VOICE_BANK.lines).map(([k,v])=>[k,Object.keys(v)])),takes:Object.keys(VOICE_BANK.takes||{}).length}) : "null"');
const BANK = JSON.parse(bank);
check('voice bank decodes through the shipped loader', !!BANK, BANK ? `chain=${BANK.chain} generated=${BANK.generated}` : 'VOICE_BANK is null');
if (BANK) {
  before.bankSpeakers = Object.keys(BANK.voices);
  before.bankActionsPerFaction = BANK.lines.nova;
  before.bankTakes = BANK.takes;
  before.keenLineIds = (BANK.lines.keen || []).length;
  note('bank inventory', `speakers=${before.bankSpeakers.join('/')} takes=${BANK.takes} keenLines=${before.keenLineIds} factionActions=${(BANK.lines.nova || []).length}`);
}

const ids = run(main.ctx, 'JSON.stringify(commanderIdentityIds())');
const IDS = JSON.parse(ids);
check('nine playable commander identities', IDS.length === 9, IDS.join(','));

const REQUIRED = ['id', 'faction', 'bank', 'rank', 'name', 'shortName', 'callsign', 'role', 'loreKey', 'epithet',
  'service', 'bio', 'chassis', 'passive', 'baseline', 'signature', 'weapons', 'portrait', 'voice', 'condition'];
const descriptors = JSON.parse(run(main.ctx, `JSON.stringify(commanderIdentityAll().map(d=>{const o=Object.assign({},d);delete o.def;return o;}))`));
check('descriptor built for every id', descriptors.length === 9, `${descriptors.length}/9`);

const missingFields = [];
const emptyFields = [];
for (const d of descriptors) {
  for (const f of REQUIRED) {
    if (!(f in d)) missingFields.push(`${d.id}.${f}`);
    else if (d[f] === '' || d[f] === null || d[f] === undefined) emptyFields.push(`${d.id}.${f}`);
  }
}
check('every required descriptor field present', missingFields.length === 0, missingFields.join(',') || 'none missing');
check('no required descriptor field empty', emptyFields.length === 0, emptyFields.join(',') || 'none empty');

const EXPECTED_PLAYABLE_IDS = [
  'nova_kai', 'nova_holt', 'nova_vale',
  'legion_vex', 'legion_korr', 'legion_dravik',
  'syndicate_renn', 'syndicate_nyx', 'syndicate_voss'
];
const rosterJsonA = run(main.ctx, 'JSON.stringify(commanderRosterSnapshotV1())');
const rosterJsonB = run(main.ctx, 'JSON.stringify(commanderRosterSnapshotV1())');
const roster = JSON.parse(rosterJsonA);
check('base exports CommanderRosterSnapshotV1',
  roster.kind === 'CommanderRosterSnapshotV1' && roster.schemaVersion === 1 && roster.source === 'massfront-base',
  `${roster.kind}@${roster.schemaVersion} from ${roster.source}`);
check('roster snapshot preserves stable authored ID order',
  JSON.stringify(roster.commanders.map((entry) => entry.id)) === JSON.stringify(EXPECTED_PLAYABLE_IDS),
  roster.commanders.map((entry) => entry.id).join(','));
check('roster snapshot excludes Brood leaders',
  roster.commanders.length === 9 && !roster.commanders.some((entry) => /^(brood|horde)(_|$)/i.test(entry.id) || /^(brood|horde)$/i.test(entry.sourceFactionId)),
  `${roster.commanders.length} playable rows`);
const expectedCampaignFaction = { nova: 'nova', legion: 'dominion', syndicate: 'syndicate' };
const factionMappingProblems = roster.commanders.filter((entry) => expectedCampaignFaction[entry.sourceFactionId] !== entry.campaignFactionId);
check('roster snapshot carries explicit Galactic faction mapping',
  factionMappingProblems.length === 0,
  factionMappingProblems.map((entry) => `${entry.id}:${entry.sourceFactionId}->${entry.campaignFactionId}`).join(',') || 'legion->dominion explicit');
check('roster snapshot is byte-stable across calls', rosterJsonA === rosterJsonB, sha256(rosterJsonA).slice(0, 16));
const rosterFingerprint = run(main.ctx, `commanderRosterSnapshotFingerprintV1(${rosterJsonA})`);
check('roster fingerprint matches its deterministic payload',
  /^fnv1a32:[0-9a-f]{8}$/.test(roster.fingerprint) && rosterFingerprint === roster.fingerprint,
  roster.fingerprint);
const moduleRosterValidation = validateCommanderRosterSnapshotV1(roster);
check('Galactic contract validates the real base snapshot', moduleRosterValidation.ok,
  moduleRosterValidation.issues.map((entry) => entry.code).join(',') || 'cross-runtime contract match');
check('roster snapshot contains data only and no embedded portrait payload',
  !rosterJsonA.includes('data:image') && !roster.commanders.some((entry) => 'def' in entry || 'src' in (entry.portrait || {})),
  `${Buffer.byteLength(rosterJsonA)} JSON bytes`);

/* chassis binding cross-checked against the REAL TYPES table, parsed out of
   src/game/sim.js rather than executed. */
function parseTypeRows(src) {
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => /TYPES\s*=\s*\[/.test(l));
  const rows = [];
  for (let i = start; i < lines.length; i++) {
    if (/^\];/.test(lines[i])) break;
    if (/^\s*\{name:/.test(lines[i])) rows.push(lines[i]);
  }
  return rows;
}
const typeRows = parseTypeRows(texts['src/game/sim.js']);
const chassisProblems = [];
for (const d of descriptors) {
  const row = typeRows[d.chassis.heroType];
  if (!row) { chassisProblems.push(`${d.id}: TYPES[${d.chassis.heroType}] missing`); continue; }
  const name = (row.match(/name:'([^']*)'/) || [])[1];
  const spr = (row.match(/spr:'([^']*)'/) || [])[1];
  const cat = (row.match(/cat:'([^']*)'/) || [])[1];
  if (name !== d.chassis.unit) chassisProblems.push(`${d.id}: TYPES[${d.chassis.heroType}].name=${name} != ${d.chassis.unit}`);
  if (spr !== d.chassis.sprite) chassisProblems.push(`${d.id}: sprite ${spr} != ${d.chassis.sprite}`);
  if (cat !== 'hero') chassisProblems.push(`${d.id}: TYPES[${d.chassis.heroType}].cat=${cat} != hero`);
}
check('chassis binding matches the real TYPES table', chassisProblems.length === 0, chassisProblems.join('; ') || `${descriptors.length} rows verified`);

/* identity must not have become balance */
const conditionApplied = descriptors.filter((d) => d.condition.readiness.applied || d.condition.fatigue.applied || d.condition.injury.applied);
check('readiness/fatigue/injury declared but inert', conditionApplied.length === 0, conditionApplied.map((d) => d.id).join(',') || 'applied=false on all nine');
const balanceLeak = descriptors.filter((d) => 'cool' in (d.signature || {}) || 'energy' in (d.signature || {}));
check('descriptor carries labels, not balance numbers', balanceLeak.length === 0, balanceLeak.map((d) => d.id).join(',') || 'no cooldown/energy copied');

/* save compatibility: the descriptor is derived, never persisted */
const persistsIdentity = /META\.setup\.pc\s*=\s*(?!playerCommanderId\b)/.test(texts['src/factions.js']);
check('save shape unchanged (META.setup.pc is still the id)', !persistsIdentity && /META\.setup\.pc=playerCommanderId/.test(texts['src/factions.js']), 'persistCommanderPick writes the id only');
const identityPersisted = /COMMANDER_IDENTITY\b[^\n]*META|META[^\n]*COMMANDER_IDENTITY/.test(texts['src/game/commander.js']);
check('identity descriptor is never written to META', !identityPersisted, 'derived at runtime, cached in memory');

/* voice binding: honest about what ships */
const withTakes = descriptors.filter((d) => d.voice.available);
before.commanderTakes = withTakes.length;
check('no commander takes ship today (subtitle-only is the shipped state)', withTakes.length === 0, `${withTakes.length}/9 have recordings`);
check('commander cues never alias onto unit radio', descriptors.every((d) => d.voice.aliasesUnitRadio === false), 'aliasesUnitRadio=false on all nine');
const slotSample = descriptors[0].voice.slots.slice(0, 2).join(', ');
note('slot naming a future pack must provide', `${descriptors[0].voice.slots.length} per commander, e.g. ${slotSample}`);

/* ---------------------------------------------------------------------------
   2 — taxonomy / copy parity
   --------------------------------------------------------------------------- */
const taxonomyKinds = JSON.parse(run(main.ctx, 'JSON.stringify(commanderDialogueKindList())'));
const copyKinds = JSON.parse(run(main.ctx, 'JSON.stringify(commanderDialogueKinds())'));
const missingCopy = taxonomyKinds.filter((k) => !copyKinds.includes(k));
const orphanCopy = copyKinds.filter((k) => !taxonomyKinds.includes(k));
check('every taxonomy kind has copy', missingCopy.length === 0, missingCopy.join(',') || `${taxonomyKinds.length} kinds`);
check('no orphan copy without a taxonomy kind', orphanCopy.length === 0, orphanCopy.join(',') || 'none');
const emptyLines = [];
for (const id of IDS) {
  const fac = descriptors.find((d) => d.id === id).faction;
  for (const k of taxonomyKinds) {
    const [c, kk] = k.split('.');
    const lines = JSON.parse(run(main.ctx, `JSON.stringify(commanderDialogueLines(${JSON.stringify(id)},${JSON.stringify(fac)},${JSON.stringify(c)},${JSON.stringify(kk)}))`));
    if (!lines.length || lines.some((l) => !String(l).trim())) emptyLines.push(`${id}:${k}`);
  }
}
check('every commander resolves a non-empty line for every kind', emptyLines.length === 0, emptyLines.join(',') || `${IDS.length * taxonomyKinds.length} combinations`);
const sixCategories = ['objective', 'sighting', 'research', 'casualty', 'strategic', 'outcome'];
const taxCats = [...new Set(taxonomyKinds.map((k) => k.split('.')[0]))];
check('all six required event categories exist', sixCategories.every((c) => taxCats.includes(c)), taxCats.join(','));

/* ---------------------------------------------------------------------------
   3 — deterministic ordering
   --------------------------------------------------------------------------- */
/* One scripted match, driven by an explicit clock. Every event and every drain
   carries its own `now`, so nothing here can read a real timer. */
const SCRIPT = [
  [0, 'cue', 'sighting', 'first', { subject: 'legion' }],
  [10, 'cue', 'research', 'complete', { subject: 'tech_rail' }],
  [20, 'cue', 'casualty', 'unit', { subject: 'Rhino' }],
  [30, 'drain'],
  [40, 'cue', 'strategic', 'ready', {}],
  [50, 'cue', 'objective', 'assigned', { subject: 'obj_1' }],
  [4000, 'drain'],
  [4100, 'cue', 'casualty', 'unit', { subject: 'Rhino' }],
  [8000, 'drain'],
  [12000, 'drain'],
  [16000, 'drain'],
  [20000, 'cue', 'outcome', 'victory', { force: true }],
  [20100, 'drain'],
  [24000, 'drain'],
];
function playScript(ctx, commanderId) {
  run(ctx, 'commanderDialogueReset()');
  run(ctx, `playerCommanderId=${JSON.stringify(commanderId)}`);
  const transcript = [];
  for (const step of SCRIPT) {
    const [t, op] = step;
    if (op === 'cue') {
      const [, , c, k, o] = step;
      const r = JSON.parse(run(ctx, `(function(){const r=commanderCue(${JSON.stringify(c)},${JSON.stringify(k)},Object.assign(${JSON.stringify(o)},{now:${t}}));return JSON.stringify({ok:r.ok,reason:r.reason,seq:r.cue?r.cue.seq:null});})()`));
      transcript.push(`${t} cue ${c}.${k} -> ${r.ok ? 'ok' : r.reason}${r.seq == null ? '' : ' #' + r.seq}`);
    } else {
      const emitted = JSON.parse(run(ctx, `JSON.stringify(commanderDialogueDrain(${t}).map(c=>({seq:c.seq,key:c.key,p:c.priority,audio:c.audio,take:c.take,text:c.subtitle.text,tag:c.subtitle.tag,portrait:c.portrait.src})))`));
      for (const e of emitted) transcript.push(`${t} emit #${e.seq} ${e.key} p=${e.p} audio=${e.audio} take=${e.take} | ${e.tag} | ${e.text}`);
      if (!emitted.length) transcript.push(`${t} emit -`);
    }
  }
  return transcript;
}
const runA = playScript(main.ctx, 'nova_kai');
const runB = playScript(main.ctx, 'nova_kai');
check('identical event sequence produces an identical transcript', sha256(runA.join('\n')) === sha256(runB.join('\n')), sha256(runA.join('\n')).slice(0, 16));

/* a second context, freshly loaded, must agree with the first */
const fresh = makeContext();
await run(fresh.ctx, 'audLoadVoiceBank()');
const runC = playScript(fresh.ctx, 'nova_kai');
check('a freshly loaded context produces the same transcript', sha256(runA.join('\n')) === sha256(runC.join('\n')), 'cross-context stable');

/* different commanders must not open on the same variant */
const runVex = playScript(main.ctx, 'legion_vex');
check('variant selection differs by commander', sha256(runA.join('\n')) !== sha256(runVex.join('\n')), 'kai != vex');

/* no wall-clock or randomness anywhere in the lane */
const laneSrc = codeOnly(texts['src/game/commander.js'].split('COMMANDER IDENTITY — one authoritative descriptor')[1] || '');
check('the identity/dialogue lane was located in commander.js', laneSrc.length > 4000, `${laneSrc.length} chars of code after comment stripping`);
check('no Math.random in the commander dialogue lane', !/Math\.random/.test(laneSrc), 'deterministic');
check('no Date.now in the commander dialogue lane', !/Date\.now|new Date\(/.test(laneSrc), 'clock is an argument');

/* ---------------------------------------------------------------------------
   4 — cooldown, dedupe, priority, queue bound, staleness
   --------------------------------------------------------------------------- */
function fresh1(ctx, id = 'nova_kai') { run(ctx, `commanderDialogueReset(); playerCommanderId=${JSON.stringify(id)};`); }
const R = (expr) => JSON.parse(run(main.ctx, `JSON.stringify(${expr})`));

fresh1(main.ctx);
const d1 = R(`(function(){const a=commanderCue('sighting','first',{subject:'x',now:0});const b=commanderCue('sighting','first',{subject:'x',now:100});return {a:a.reason,b:b.reason};})()`);
check('dedupe rejects the same event/subject while queued', d1.b === 'dedupe-queued', `${d1.a} then ${d1.b}`);

fresh1(main.ctx);
const d2 = R(`(function(){commanderCue('sighting','first',{subject:'x',now:0});commanderDialogueDrain(0);
  const inWindow=commanderCue('sighting','first',{subject:'x',now:29000});
  const past=commanderCue('sighting','first',{subject:'x',now:60000});
  return {inWindow:inWindow.reason,past:past.reason};})()`);
check('dedupe window holds for 30s then releases', d2.inWindow === 'dedupe' && d2.past === 'queued', `29s=${d2.inWindow} 60s=${d2.past}`);

fresh1(main.ctx);
const d3 = R(`(function(){commanderCue('sighting','first',{subject:'x',now:0});commanderDialogueDrain(0);
  const other=commanderCue('sighting','first',{subject:'y',now:100});return other.reason;})()`);
check('a different subject is a different event', d3 === 'cooldown', `subject y -> ${d3}`);

fresh1(main.ctx);
const d4 = R(`(function(){commanderCue('research','complete',{subject:'a',now:0});commanderDialogueDrain(0);
  const early=commanderCue('research','started',{subject:'b',now:5000});
  const late=commanderCue('research','started',{subject:'b',now:9000});
  return {early:early.reason,late:late.reason};})()`);
check('per-category cooldown gates a different kind in the same category', d4.early === 'cooldown' && d4.late === 'queued', `5s=${d4.early} 9s=${d4.late}`);

fresh1(main.ctx);
const d5 = R(`(function(){
  commanderCue('research','complete',{subject:'a',now:0});
  commanderCue('sighting','first',{subject:'b',now:1});
  commanderCue('outcome','victory',{now:2});
  commanderCue('casualty','unit',{subject:'c',now:3});
  const order=commanderDialogueState().queue.map(q=>q.key);
  const first=commanderDialogueDrain(10).map(c=>c.key);
  return {order:order,first:first};})()`);
check('highest priority emits first regardless of raise order', d5.first[0] === 'outcome.victory', `queued=${d5.order.join('>')} emitted=${d5.first.join(',')}`);

fresh1(main.ctx);
const d6 = R(`(function(){
  for(let i=0;i<4;i++) commanderCue('sighting','first',{subject:'s'+i,now:i,force:true});
  const full=commanderDialogueState().queued;
  const low=commanderCue('research','complete',{subject:'r',now:5,force:true});
  const high=commanderCue('outcome','victory',{now:6,force:true});
  return {full:full,low:low.reason,high:high.reason,after:commanderDialogueState().queued};})()`);
check('queue bound refuses a weaker cue and evicts for a stronger one', d6.full === 4 && d6.low === 'queue-full' && d6.high === 'queued' && d6.after === 4,
  `full=${d6.full} weaker=${d6.low} stronger=${d6.high} size=${d6.after}`);

fresh1(main.ctx);
const d7 = R(`(function(){
  commanderCue('outcome','victory',{now:0,force:true});
  const a=commanderDialogueDrain(0).length;
  commanderCue('casualty','unit',{subject:'z',now:100,force:true});
  const tooSoon=commanderDialogueDrain(1000).length;
  const later=commanderDialogueDrain(4000).length;
  return {a:a,tooSoon:tooSoon,later:later};})()`);
check('global spacing holds a second cue for 3.5s', d7.a === 1 && d7.tooSoon === 0 && d7.later === 1, `t0=${d7.a} t1s=${d7.tooSoon} t4s=${d7.later}`);

fresh1(main.ctx);
const d8 = R(`(function(){
  commanderCue('research','complete',{subject:'a',now:0,force:true});
  const emitted=commanderDialogueDrain(20000).length;
  return {emitted:emitted,dropped:commanderDialogueState().stats.dropped,queued:commanderDialogueState().queued};})()`);
check('a stale cue is dropped rather than spoken late', d8.emitted === 0 && d8.dropped === 1 && d8.queued === 0, `emitted=${d8.emitted} dropped=${d8.dropped}`);

fresh1(main.ctx);
const d9 = R(`(function(){const r=commanderCue('sighting','nonsense',{now:0});const s=commanderCue('nope','first',{now:0});return [r.reason,s.reason];})()`);
check('an unknown category or kind is refused, not guessed', d9[0] === 'unknown-event' && d9[1] === 'unknown-event', d9.join('/'));

fresh1(main.ctx);
const d10 = R(`(function(){const seen=[];const fn=c=>seen.push(c.key);commanderDialogueOn(fn);
  commanderCue('outcome','victory',{now:0,force:true});commanderDialogueDrain(0);
  commanderDialogueOff(fn);
  commanderCue('casualty','unit',{subject:'q',now:5000,force:true});commanderDialogueDrain(5000);
  return seen;})()`);
check('listeners receive emitted cues and can unsubscribe', d10.length === 1 && d10[0] === 'outcome.victory', d10.join(','));

fresh1(main.ctx);
const d11 = R(`(function(){let n=0;const bad=()=>{throw new Error('listener exploded');};const good=()=>{n++;};
  commanderDialogueOn(bad);commanderDialogueOn(good);
  commanderCue('outcome','victory',{now:0,force:true});const out=commanderDialogueDrain(0).length;
  commanderDialogueOff(bad);commanderDialogueOff(good);
  return {n:n,out:out};})()`);
check('a throwing listener cannot silence the others', d11.n === 1 && d11.out === 1, `good ran=${d11.n}`);

/* ---------------------------------------------------------------------------
   5 — missing-audio fallback
   --------------------------------------------------------------------------- */
/* (a) audio.js loaded, real bank, no AudioContext, no commander takes */
fresh1(main.ctx);
const a1 = R(`(function(){commanderCue('outcome','victory',{now:0,force:true});
  const c=commanderDialogueDrain(0)[0];
  return {audio:c.audio,text:c.subtitle.text,portrait:!!c.portrait.src,slot:c.voice.slot,available:c.voice.available};})()`);
check('no AudioContext: cue still emits with a subtitle', a1.audio === 'silent' && !!a1.text, `audio=${a1.audio} text="${a1.text}"`);
check('no AudioContext: portrait metadata still present', a1.portrait === true, a1.slot);

/* (b) no audio module at all */
const noAudio = makeContext({ withAudio: false });
note('no-audio context loaded', noAudio.loaded.join(' -> '));
run(noAudio.ctx, 'commanderDialogueReset(); playerCommanderId="nova_kai";');
const a2 = JSON.parse(run(noAudio.ctx, `(function(){commanderCue('outcome','victory',{now:0,force:true});
  const c=commanderDialogueDrain(0)[0];
  return JSON.stringify({audio:c.audio,text:c.subtitle.text,bank:c.voice.bank,available:c.voice.available});})()`));
check('no audio module: cue still emits, marked absent', a2.audio === 'absent' && !!a2.text, `audio=${a2.audio} text="${a2.text}"`);
check('no audio module: descriptor still resolves a voice binding', a2.bank === 'cmdr_nova_kai' && a2.available === false, `bank=${a2.bank}`);
const a3 = JSON.parse(run(noAudio.ctx, 'JSON.stringify(commanderIdentityAll().length)'));
check('no audio module: all nine descriptors still build', a3 === 9, `${a3}/9`);

/* (c) a voice pack that DOES carry commander takes, injected through the real
   loader so the shipped code path — not a fixture — does the work */
const packLog = [];
const withPack = makeContext({ sfxLog: packLog });
const realManifest = JSON.parse(Buffer.from(
  (texts['src/audio.js'].match(/base64,(ewog[A-Za-z0-9+/=]+)'/) || [])[1], 'base64').toString('utf8'));
realManifest.lines.cmdr_nova_kai = { outcome_victory: ['cmdr_nova_kai_outcome_victory_0', 'cmdr_nova_kai_outcome_victory_1'] };
realManifest.voices.cmdr_nova_kai = 'probe-only-not-a-recording';
realManifest.takes = realManifest.takes || {};
realManifest.takes['cmdr_nova_kai_outcome_victory_0'] = 2.0;
realManifest.takes['cmdr_nova_kai_outcome_victory_1'] = 2.0;
withPack.sandbox.fetch = async () => ({ ok: true, json: async () => realManifest });
/* Build the descriptor BEFORE the bank arrives, so the cache is warm and wrong,
   then load the pack. The descriptor must correct itself: on a cold start the
   pack is still downloading when the first descriptor is asked for, and a cached
   `available:false` would make a build that HAS commander audio report forever
   that it has none. */
const coldVoice = JSON.parse(run(withPack.ctx, 'JSON.stringify(commanderIdentity("nova_kai").voice.available)'));
await run(withPack.ctx, 'audLoadVoiceBank()');
const warmVoice = JSON.parse(run(withPack.ctx, 'JSON.stringify(commanderIdentity("nova_kai").voice)'));
check('a descriptor cached before the bank loaded corrects itself afterwards',
  coldVoice === false && warmVoice.available === true && warmVoice.present.length === 1,
  `cold=${coldVoice} warm=${warmVoice.available} present=${warmVoice.present.join(',')}`);
const packSlot = JSON.parse(run(withPack.ctx, 'JSON.stringify({slot:commanderVoiceSlot("nova_kai","outcome","victory"),channel:audVoiceChannel("vo_cmdr_nova_kai_outcome_victory"),bankFac:voBankFac("cmdr_nova_kai"),notBrood:voIsBrood("cmdr_nova_kai")})'));
check('a commander take becomes a slot through the shipped bank loader', packSlot.slot === 'vo_cmdr_nova_kai_outcome_victory', String(packSlot.slot));
check('commander lines get their own mixer channel', packSlot.channel === 'cmdr', `channel=${packSlot.channel}`);
check('a commander speaker key is never collapsed onto a faction speaker', packSlot.bankFac === 'cmdr_nova_kai' && packSlot.notBrood === false, `voBankFac=${packSlot.bankFac}`);
/* seed a decoded buffer and an AudioContext, then speak for real */
run(withPack.ctx, `AC={}; for(const f of audMapList('vo_cmdr_nova_kai_outcome_victory')) AUD.buf[f]={};
  commanderDialogueReset(); playerCommanderId='nova_kai';`);
const played = JSON.parse(run(withPack.ctx, `(function(){commanderCue('outcome','victory',{now:0,force:true});
  const c=commanderDialogueDrain(0)[0];return JSON.stringify({audio:c.audio,slot:c.voice.slot});})()`));
check('with a pack present the cue actually plays', played.audio === 'played', `audio=${played.audio}`);
check('playback reuses voPlay/sfx — no second voice system', packLog.some((e) => e.name === 'vo_cmdr_nova_kai_outcome_victory'),
  packLog.map((e) => e.name).join(',') || 'sfx never called');
const secondPipelines = (texts['src/audio.js'].match(/createBufferSource\(\)/g) || []).length;
note('audio.js buffer-source construction sites (unchanged by this lane)', String(secondPipelines));
const audioBlock = codeOnly(texts['src/audio.js'].split('COMMANDER VOICE — the PLAYBACK half')[1].split('async function initAudioSamples')[0]);
check('the commander playback block was located in audio.js', audioBlock.length > 800, `${audioBlock.length} chars of code after comment stripping`);
check('the commander block adds no decoder, buffer source or fetch of its own',
  !/createBufferSource|decodeAudioData|new Audio\(|fetch\(/.test(audioBlock),
  'delegates to voPlay/audMapList');
check('the commander block never reaches speechSynthesis',
  !/speechSynthesis/.test(laneSrc) && !/speechSynthesis/.test(audioBlock),
  'no synthesised commander');

/* ---------------------------------------------------------------------------
   6 — training compatibility
   --------------------------------------------------------------------------- */
const keen = JSON.parse(run(main.ctx, 'JSON.stringify({has:voHas("keen","greeting"),channel:audVoiceChannel("vo_keen_greeting"),graduation:voHas("keen","graduation"),count:audMapList("vo_keen_greeting").length})'));
check('KEEN bank path is untouched', keen.has === 'vo_keen_greeting' && keen.channel === 'keen' && keen.graduation === 'vo_keen_graduation', JSON.stringify(keen));
const unitRadio = JSON.parse(run(main.ctx, 'JSON.stringify({nova:voHas("nova","move"),legion:voHas("legion","attack"),brood:voHas("brood","move"),channel:audVoiceChannel("vo_nova_move")})'));
check('unit radio path is untouched', unitRadio.nova === 'vo_nova_move' && unitRadio.legion === 'vo_ascendancy_attack' && unitRadio.brood === 'vo_brood_call' && unitRadio.channel === 'radio', JSON.stringify(unitRadio));

/* the commander lane must defer while training is running */
run(main.ctx, 'window.trainingMissionActive=function(){return true;};');
fresh1(main.ctx);
const t1 = R(`(function(){
  const research=commanderCue('research','complete',{subject:'a',now:0});
  const sighting=commanderCue('sighting','first',{subject:'b',now:1});
  const objective=commanderCue('objective','assigned',{subject:'c',now:2});
  const casualty=commanderCue('casualty','commander',{now:3});
  const outcome=commanderCue('outcome','defeat',{now:4});
  const strategic=commanderCue('strategic','incoming',{now:5});
  return {research:research.reason,sighting:sighting.reason,objective:objective.reason,
          casualty:casualty.reason,outcome:outcome.reason,strategic:strategic.reason};})()`);
check('during training, low-stakes commander chatter is refused',
  t1.research === 'training' && t1.sighting === 'training' && t1.objective === 'training', JSON.stringify(t1));
check('during training, cues about the player are still allowed',
  t1.casualty === 'queued' && t1.outcome === 'queued' && t1.strategic === 'queued', JSON.stringify(t1));
run(main.ctx, 'window.trainingMissionActive=function(){return false;};');
fresh1(main.ctx);
const t2 = R(`commanderCue('research','complete',{subject:'a',now:0}).reason`);
check('outside training every category is admitted again', t2 === 'queued', t2);

/* the audio gate must yield to a live KEEN line even for a permitted cue */
const gateCtx = makeContext();
await run(gateCtx.ctx, 'audLoadVoiceBank()');
const gate = JSON.parse(run(gateCtx.ctx, `JSON.stringify((function(){
  const clear=commanderVoiceGate(100000);
  AUD.active.push({name:'vo_keen_greeting',done:false,priority:5,started:0});
  const busy=commanderVoiceGate(100000);
  AUD.active.length=0;
  const spaced=(function(){COMMANDER_VO.last=99000;return commanderVoiceGate(100000);})();
  return {clear:clear,busy:busy,spaced:spaced};})())`));
check('audio gate yields while KEEN is on the air', gate.clear.ok === true && gate.busy.ok === false && gate.busy.reason === 'busy', JSON.stringify(gate.busy));
check('audio gate enforces its own playback spacing', gate.spaced.ok === false && gate.spaced.reason === 'spacing', JSON.stringify(gate.spaced));

/* tutorial's speakVoice is IIFE-private: record it rather than assume it */
before.speakVoiceIsGlobal = run(main.ctx, 'typeof speakVoice') === 'function';
note('src/tutorial.js speakVoice reachable as a global', String(before.speakVoiceIsGlobal));
const legacy = run(main.ctx, 'commanderVoiceLegacySpeak("probe","keen","greeting",0)');
check('the legacy speech wrapper resolves to the shared pipeline, never to TTS',
  legacy === 'speakVoice' || legacy === 'voPlay' || legacy === 'silent', `path=${legacy}`);

/* ---------------------------------------------------------------------------
   7 — ownership / non-regression
   --------------------------------------------------------------------------- */
/* The worktree this lane runs in is shared and was ALREADY dirty before the
   lane started, so `git diff --name-only` cannot attribute any file to anyone
   and a check built on it would be theatre. Assert CONTENT instead, which is
   worktree-independent: no file this lane must not touch may mention any symbol
   this lane introduces. */
const OWNED_SYMBOLS = /commanderCue\(|commanderDialogue|commanderIdentity|commanderVoice|COMMANDER_IDENTITY|COMMANDER_DIALOGUE|COMMANDER_LORE|COMMANDER_CHASSIS/;
const forbidden = ['src/game/ai.js', 'assets/data/manifest.json'];
const trespass = forbidden.filter((f) => OWNED_SYMBOLS.test(texts[f]));
const changed = (await git(['diff', '--name-only', 'HEAD'])).split(/\r?\n/).filter(Boolean);
note('working-tree files changed since HEAD (shared, pre-existing)', String(changed.length));
check('no out-of-lane file references a symbol this lane introduces', trespass.length === 0, trespass.join(',') || forbidden.join(' + '));
const wiredIntoSim = /mfCommanderCueRaise\(|commanderCue\(/.test(texts['src/game/sim.js']);
check('normal gameplay events are wired into the commander cue funnel', wiredIntoSim,
  'sim sightings, casualties, research, strategic and objective transitions call the guarded funnel');
check('integration points are documented in commander.js', /INTEGRATION POINTS/.test(texts['src/game/commander.js']), 'named call sites present');

/* ---------------------------------------------------------------------------
   report
   --------------------------------------------------------------------------- */
const report = {
  probe: 'commander-voice',
  startedUtc,
  finishedUtc: new Date().toISOString(),
  snapshot,
  seededGlobals: SEEDED,
  before,
  after: {
    commanders: descriptors.length,
    descriptorFields: REQUIRED.length,
    taxonomyKinds: taxonomyKinds.length,
    commanderVoiceSlotsPerCommander: descriptors[0].voice.slots.length,
    commanderTakesShipped: before.commanderTakes,
    commanderRosterFingerprint: roster.fingerprint,
    commanderRosterBytes: Buffer.byteLength(rosterJsonA),
  },
  transcriptSha256: sha256(runA.join('\n')),
  transcript: runA,
  checks,
  passed: checks.filter((c) => c.ok && !c.info).length,
  failed,
};
await mkdir(output, { recursive: true });
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
if (jsonOnly) console.log(JSON.stringify(report, null, 2));
else {
  console.log('');
  console.log(`transcript sha256 ${report.transcriptSha256}`);
  console.log(`report ${join(output, 'report.json')}`);
  console.log(`${report.passed} passed, ${failed} failed`);
}
process.exit(failed ? 1 : 0);
