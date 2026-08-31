#!/usr/bin/env node
/* Static, fail-closed UI control-safety inventory. This intentionally does not
   claim rendered dimensions; it proves declarations and interaction contracts
   and leaves visual evidence UNKNOWN until the responsive capture lane runs. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectEvidenceIdentity } from './evidence-foundation/fingerprints.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..');
const PRIMARY = ['index.html', 'assets/ui.css', 'src/ui/input.js', 'src/ui/hud.js', 'src/ui/hudflow.js', 'src/ui/hotslots.js'];
const SUPPORT = ['src/styles/ui.css', 'src/game/meta.js', 'src/main.js', 'src/account.js', 'src/updater.js'];
const SHA = value => createHash('sha256').update(value).digest('hex');

function argValue(args, name, fallback = null) { const at = args.indexOf(name); return at >= 0 && args[at + 1] ? args[at + 1] : fallback; }
function lineOf(text, offset) { return text.slice(0, offset).split('\n').length; }
function attrs(text) {
  const out = {};
  for (const m of text.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}
function setLiteral(text, name) {
  const match = text.match(new RegExp(`const\\s+${name}=new Set\\(\\[([\\s\\S]*?)\\]\\)`));
  return new Set(match ? [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(item => item[1]) : []);
}
function objectKeys(text, name) {
  const match = text.match(new RegExp(`const\\s+${name}=\\{([\\s\\S]*?)\\};`));
  return new Set(match ? [...match[1].matchAll(/(?:^|[,\s])([A-Za-z_$][\w$]*)\s*:/g)].map(item => item[1]) : []);
}
async function readRequired(root, path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) throw new Error(`REQUIRED_INPUT_MISSING: ${path}`);
  return readFile(absolute, 'utf8');
}
async function walkJs(root, current = root, output = []) {
  if (!existsSync(current)) return output;
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) await walkJs(root, absolute, output);
    else if (entry.isFile() && entry.name.endsWith('.js')) output.push(absolute);
  }
  return output;
}

function htmlControls(html) {
  const controls = [];
  const add = (match, tag, attributeText, body) => {
    const a = attrs(attributeText);
    const label = String(a['aria-label'] || (body || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    controls.push({ id: a.id || '', tag, role: a.role || '', className: a.class || '', label, line: lineOf(html, match.index), source: 'index.html', dynamic: false });
  };
  for (const match of html.matchAll(/<(button|select|textarea)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) add(match, match[1].toLowerCase(), match[2], match[3]);
  for (const match of html.matchAll(/<input\b([^>]*)>/gi)) add(match, 'input', match[1], '');
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\brole\s*=\s*["']button["'][^>]*)>([\s\S]*?)<\/\1>/gi)) {
    if (!['button', 'input', 'select', 'textarea'].includes(match[1].toLowerCase())) add(match, match[1].toLowerCase(), match[2], match[3]);
  }
  return controls;
}

function classifyControl(control, destructive, disruptive) {
  const key = `${control.id} ${control.label} ${control.className}`.toLowerCase();
  const semanticDestructive = /\b(delete|reset|wipe|abandon|surrender|self.?destruct|revert|rollback|recycle|sell|load file|replace)\b/.test(key);
  /* Camera "jump", match-goal "Hold", and post-match "Continue" are benign
     navigation/readout labels; their ability/command counterparts are covered
     by explicit IDs/classes rather than ambiguous English words. */
  const semanticDisruptive = /\b(start battle|deploy|upgrade|ability|barrage|blast|lance|emp|patrol|a-move|stop|rally)\b/.test(key);
  if (destructive.has(control.id)) return { risk: 'destructive', reason: 'explicit-id' };
  if (disruptive.has(control.id) || /\b(abtn|hotSlot|hotUtility)\b/.test(control.className)) return { risk: 'disruptive', reason: 'explicit-id-or-class' };
  if (semanticDestructive) return { risk: 'UNKNOWN', reason: 'destructive semantics missing explicit classification' };
  if (semanticDisruptive) return { risk: 'UNKNOWN', reason: 'disruptive semantics missing explicit classification' };
  return { risk: 'benign', reason: 'default one-tap navigation/information' };
}

function requirement(id, passed, evidence, severity = 'blocker') { return { id, status: passed ? 'PASS' : 'UNKNOWN', severity, evidence }; }

async function audit(root, { fixtureMode = false, out = null } = {}) {
  const files = {};
  for (const path of [...PRIMARY, ...SUPPORT]) files[path] = await readRequired(root, path);
  const packagedRoot = join(root, 'www');
  const identity = fixtureMode
    ? { fixture: true, gitHead: null, gitDirty: null, dirtyFingerprint: null, runtimeFingerprint: null, packageFingerprint: null }
    : await collectEvidenceIdentity({ root, packageRoot: packagedRoot });
  const parity = [];
  for (const path of [...PRIMARY, ...SUPPORT]) {
    const packaged = await readRequired(packagedRoot, path);
    parity.push({ path, sourceSha256: SHA(files[path]), packagedSha256: SHA(packaged), match: SHA(files[path]) === SHA(packaged) });
  }
  const input = files['src/ui/input.js'], hud = files['src/ui/hud.js'], html = files['index.html'];
  const css = files['assets/ui.css'], fullCss = files['src/styles/ui.css'];
  const main = files['src/main.js'], account = files['src/account.js'], updater = files['src/updater.js'];
  const destructive = setLiteral(input, 'MF_UI_DESTRUCTIVE_IDS');
  const disruptive = setLiteral(input, 'MF_UI_DISRUPTIVE_IDS');
  const existingConfirm = setLiteral(input, 'MF_UI_EXISTING_CONFIRM');
  const confirmCopy = objectKeys(input, 'MF_UI_CONFIRM_COPY');
  const controls = htmlControls(html).map(control => ({ ...control, ...classifyControl(control, destructive, disruptive) }));
  let interactionProbe=null;
  const probePath=join(out||join(root,'tmp/ui-control-safety'),'interaction-probe.json');
  if(existsSync(probePath)){
    try{interactionProbe=JSON.parse(await readFile(probePath,'utf8'));}catch{}
  }
  const interactionProbeCurrent=!!(interactionProbe&&interactionProbe.status==='PASS'
    &&interactionProbe.hudSha256===SHA(hud)&&interactionProbe.summary&&interactionProbe.summary.failed===0);
  const probeCase=id=>!!(interactionProbeCurrent&&interactionProbe.checks&&interactionProbe.checks.some(item=>item.id===id&&item.status==='PASS'));
  let touchProbe=null;
  const touchProbePath=join(out||join(root,'tmp/ui-control-safety'),'computed-touch-probe.json');
  if(!fixtureMode&&existsSync(touchProbePath)){
    try{touchProbe=JSON.parse(await readFile(touchProbePath,'utf8'));}catch{}
  }
  const touchProbeCurrent=!!(touchProbe&&touchProbe.status==='PASS'&&touchProbe.identity
    &&touchProbe.identity.hudSha256===SHA(hud)
    &&touchProbe.identity.uiCssSha256===SHA(css)
    &&touchProbe.identity.stylesCssSha256===SHA(fullCss)
    &&touchProbe.identity.packageParity===true
    &&touchProbe.summary&&touchProbe.summary.failed===0
    &&touchProbe.runtime&&touchProbe.runtime.coarsePointer===true
    &&Array.isArray(touchProbe.pageErrors)&&touchProbe.pageErrors.length===0);
  const touchRows=touchProbeCurrent&&touchProbe.runtime&&Array.isArray(touchProbe.runtime.controls)?touchProbe.runtime.controls:[];
  const measuredTouch=(...families)=>families.every(family=>touchRows.some(item=>item.family===family&&item.status==='PASS'&&item.visible&&item.width>=44&&item.height>=44));
  const touchText=(...families)=>measuredTouch(...families)
    ? 'measured packaged 412x915: '+families.map(family=>{const item=touchRows.find(row=>row.family===family);return `${family} ${item.width}x${item.height}`;}).join(', ')
    : 'UNKNOWN: 44px declaration exists; current computed rendered size not measured';
  const dynamic = [];
  const addDynamic = (family, present, risk, protection, touch, keyboard, source, detail) => {
    if (present) dynamic.push({ family, risk, protection, touchTarget: touch, keyboard, source, detail, dynamic: true });
  };
  addDynamic('production/build cards (.bcard)', /className='bcard/.test(hud), 'disruptive', /finishProd[\s\S]*pointerup/.test(hud) && /mfBindTap\(d,chooseStructure\)/.test(hud) ? 'release-after-drag-threshold' : 'UNKNOWN', touchText('build-card','production-card'), /className='bcard[\s\S]{0,1400}tabindex/.test(hud) ? 'focusable; executable fixture required' : 'UNKNOWN: role button lacks tabindex/key activation', 'src/ui/hud.js', 'unit spending and structure placement');
  const qCancelOnDown=/className='qPlate[\s\S]{0,1400}addEventListener\('pointerdown'[\s\S]{0,280}cancelQueuedUnit/.test(hud);
  const qSecondTap=/className='qPlate[\s\S]{0,2800}TAP AGAIN/.test(hud)&&/mfHudBindQueueCancel\(plate,requestCancel\)/.test(hud);
  const qGlobalGuard=/mfHudQueueClickGuard/.test(hud)&&/document\.addEventListener\('click'[\s\S]{0,900}stopImmediatePropagation/.test(hud);
  addDynamic('production queue cancel (.qPlate)', /className='qPlate/.test(hud), 'disruptive', qCancelOnDown ? 'UNSAFE: commits cancellation on pointerdown' : qSecondTap&&qGlobalGuard ? 'second-tap confirmation; document-level retarget guard; release-after-drag-threshold' : 'UNKNOWN', touchText('production-queue-cancel'), 'native button; executable fixture required', 'src/ui/hud.js', 'cancels/refunds queued production');
  addDynamic('hot ability slots (.hotSlot/.hotUtility)', /className='hotSlot/.test(files['src/ui/hotslots.js']), 'disruptive', /\.hotSlot,.hotUtility/.test(input) ? 'global release guard' : 'UNKNOWN', touchText('hot-ability'), 'native button', 'src/ui/hotslots.js', 'mirrors authoritative ability owner');
  addDynamic('weather chip (#hazChip)', /id='hazChip'/.test(hud), 'benign', 'one-tap information', touchText('weather-chip'), /hazChip[\s\S]{0,300}tabindex/.test(hud) ? 'focusable; executable fixture required' : 'UNKNOWN: role button lacks tabindex/key activation', 'src/ui/hud.js', 'map-weather details');
  addDynamic('wildcard banner (#wcBanner)', /id='wcBanner'/.test(hud), 'benign', 'one-tap information', touchText('wildcard-banner'), /wcBanner[\s\S]{0,300}(?:role|tabindex)/.test(hud) ? 'focusable; executable fixture required' : 'UNKNOWN: clickable div lacks role/tabindex/key activation', 'src/ui/hud.js', 'active-modifier details');

  for (const control of controls) {
    if (control.risk === 'destructive') {
      control.protection = existingConfirm.has(control.id) ? 'declared existing confirmation' : confirmCopy.has(control.id) ? 'capture-phase confirmation' : 'UNKNOWN';
    } else if (control.risk === 'disruptive') control.protection = 'global release-after-drag-threshold';
    else control.protection = control.risk === 'benign' ? 'one-tap' : 'UNKNOWN';
    control.touchTarget = 'global coarse-pointer 44px declaration';
    control.keyboard = ['button', 'input', 'select', 'textarea'].includes(control.tag) ? 'native' : (control.role === 'button' && /tabindex\s*=/.test(html.slice(Math.max(0, html.indexOf(`id="${control.id}"`) - 100), html.indexOf(`id="${control.id}"`) + 250)) ? 'role+tabindex; handler audited separately' : 'UNKNOWN');
  }

  const handlerCorpus = [main, account, updater, input].join('\n');
  const confirmationEvidence = {
    bp_sell: /bp_sell[\s\S]{0,1800}recycleConfirmAt/.test(main),
    profReset: /profReset[\s\S]{0,500}resetArm/.test(main) || /resetArm[\s\S]{0,500}profReset/.test(main),
    profDel: /profDel[\s\S]{0,500}delArm/.test(main) || /delArm[\s\S]{0,500}profDel/.test(main),
    quitBtn: /quitBtn[\s\S]{0,300}accConfirm/.test(main),
    saveFilePut: /saveFilePut[\s\S]{0,1800}accConfirm/.test(account),
    updRoll: confirmCopy.has('updRoll') && /updRoll/.test(updater)
  };
  const req = [
    requirement('package-parity', parity.every(item => item.match), parity.filter(item => !item.match)),
    requirement('explicit-risk-inventory', destructive.size > 0 && disruptive.size > 0 && !controls.some(item => item.risk === 'UNKNOWN'), { destructive: [...destructive], disruptive: [...disruptive], unknown: controls.filter(item => item.risk === 'UNKNOWN').map(item => item.id || item.label) }),
    requirement('destructive-confirmations', [...destructive].every(id => confirmationEvidence[id] === true), confirmationEvidence),
    requirement('touch-target-declarations', /@media\s*\(pointer:coarse\)[\s\S]*min-width:44px[\s\S]*min-height:44px/.test(css), 'assets/ui.css coarse-pointer global minimum'),
    requirement('computed-touch-targets', fixtureMode||touchProbeCurrent, fixtureMode?'not applicable to static fixture mode':touchProbeCurrent?{path:touchProbePath,summary:touchProbe.summary,viewport:touchProbe.runtime.viewport,screenshot:touchProbe.screenshot}:{path:touchProbePath,status:'UNKNOWN or stale'}),
    requirement('retap-suppression', /mfUiLastTarget&&now-mfUiLastAt<\d+&&\(el!==mfUiLastTarget\|\|risk==='destructive'\)/.test(input) && /stopImmediatePropagation/.test(input), 'cross-control bounce window at window capture, including destructive same-control retaps'),
    requirement('drag-threshold', /Math\.hypot\([^)]*\)>10/.test(input) && /g\.moved/.test(input), '10px movement rejection before replay'),
    requirement('panel-dismiss-tap-through', /mfUiMarkPanelDismiss/.test(hud) && /now-mfUiPanelDismissedAt<220/.test(input) && /up!==down/.test(input), 'closeMenus mark + 220ms guard + down/up target mismatch'),
    requirement('android-back', /addListener\('backButton'/.test(main) && /handleNativeBack/.test(main) && /activeElement[\s\S]{0,120}blur/.test(main), 'Capacitor back handler closes layers and blurs active editor'),
    requirement('focus-visibility', /button:focus-visible/.test(fullCss) && /\[role="button"\]:focus-visible/.test(fullCss), 'src/styles/ui.css global focus-visible'),
    requirement('safe-area', /viewport-fit=cover/.test(html) && /safe-area-inset-(?:top|bottom)/.test(fullCss), 'viewport contract + CSS safe-area variables'),
    requirement('queue-cancel-safety', !dynamic.some(item => item.family.includes('queue cancel') && (item.protection.startsWith('UNSAFE')||item.protection==='UNKNOWN'))
      &&(!dynamic.some(item=>item.family.includes('queue cancel'))||(probeCase('queue-drag-does-not-arm-or-cancel')&&probeCase('queue-second-tap-cancels-exactly-one')&&probeCase('queue-retargeted-synthetic-click-is-suppressed'))),
      {static:dynamic.find(item => item.family.includes('queue cancel')),interactionProbe:interactionProbeCurrent?interactionProbe.summary:'UNKNOWN or stale'}),
    requirement('executable-interaction-fixtures', !dynamic.length||interactionProbeCurrent, interactionProbeCurrent?{path:probePath,hudSha256:interactionProbe.hudSha256,summary:interactionProbe.summary}:!dynamic.length?'not applicable: fixture has no dynamic families':{path:probePath,status:'UNKNOWN or stale'}),
    requirement('dynamic-keyboard-semantics', !dynamic.length||(interactionProbeCurrent&&['production','build','weather','wildcard'].every(name=>probeCase(name+'-enter-once')&&probeCase(name+'-space-once'))), interactionProbeCurrent?interactionProbe.checks.filter(item=>/-enter-once|-space-once/.test(item.id)):!dynamic.length?'not applicable: fixture has no dynamic families':'UNKNOWN or stale'),
    requirement('dynamic-touch-semantics', !dynamic.some(item => item.touchTarget.startsWith('UNKNOWN')), dynamic.filter(item => item.touchTarget.startsWith('UNKNOWN')))
  ];
  const blockers = req.filter(item => item.status !== 'PASS');
  return {
    schema: 'massfront-ui-control-safety-v1', generatedAt: new Date().toISOString(),
    sourceRoot: root,
    identity,
    fingerprints: Object.fromEntries([...PRIMARY, ...SUPPORT].map(path => [path, SHA(files[path])])),
    packagedParity: parity,
    summary: { staticControls: controls.length, dynamicFamilies: dynamic.length, benign: controls.filter(x => x.risk === 'benign').length, disruptive: controls.filter(x => x.risk === 'disruptive').length, destructive: controls.filter(x => x.risk === 'destructive').length, unknown: controls.filter(x => x.risk === 'UNKNOWN').length, blockers: blockers.length },
    inventory: { controls, dynamicFamilies: dynamic }, requirements: req, blockers,
    runtimeEvidence: { interactionProbe: interactionProbeCurrent?interactionProbe:null, computedTouchProbe: touchProbeCurrent?touchProbe:null },
    evidenceLimitations: [touchProbeCurrent?'Computed touch evidence covers the five audited dynamic families at 412x915; it is not the full responsive matrix.':'Computed rendered dimensions remain UNKNOWN; CSS declarations are not runtime measurements.', 'No Android hardware Back event was executed.', 'No focus traversal was executed.', 'No responsive capture matrix was launched. These remain runtime UNKNOWN until current source-matched evidence exists.']
  };
}

function markdown(report) {
  const rows = report.inventory.controls.map(c => `| ${c.id || '(no id)'} | ${c.label.replace(/\|/g, '\\|').slice(0, 80)} | ${c.risk} | ${c.protection} | ${c.source}:${c.line} |`);
  const dyn = report.inventory.dynamicFamilies.map(c => `| ${c.family} | ${c.risk} | ${c.protection} | ${c.touchTarget} | ${c.keyboard} |`);
  return `# MASSFRONT UI control-safety audit\n\nGenerated: ${report.generatedAt}\n\nStatus: **${report.blockers.length ? 'UNKNOWN / UNSAFE' : 'PASS'}**\n\nStatic controls: ${report.summary.staticControls}; dynamic families: ${report.summary.dynamicFamilies}; blockers: ${report.summary.blockers}.\n\n## Requirements\n\n${report.requirements.map(r => `- **${r.status}** \`${r.id}\` — ${typeof r.evidence === 'string' ? r.evidence : JSON.stringify(r.evidence)}`).join('\n')}\n\n## Static control inventory\n\n| ID | Label | Class | Protection | Evidence |\n|---|---|---|---|---|\n${rows.join('\n')}\n\n## Dynamic families\n\n| Family | Class | Protection | Touch target | Keyboard |\n|---|---|---|---|---|\n${dyn.join('\n')}\n\n## Evidence limitations\n\n${report.evidenceLimitations.map(x => `- ${x}`).join('\n')}\n`;
}

export async function runAudit({ root = DEFAULT_ROOT, out = join(root, 'tmp/ui-control-safety'), fixtureMode = false } = {}) {
  const report = await audit(resolve(root), { fixtureMode, out });
  await mkdir(out, { recursive: true });
  const jsonPath = join(out, 'control-inventory.json');
  const markdownPath = join(out, 'control-inventory.md');
  await writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n');
  await writeFile(markdownPath, markdown(report));
  return { report, jsonPath, markdownPath };
}

async function main() {
  const args = process.argv.slice(2);
  const root = resolve(argValue(args, '--root', DEFAULT_ROOT));
  const out = resolve(argValue(args, '--out', join(root, 'tmp/ui-control-safety')));
  const result = await runAudit({ root, out, fixtureMode: args.includes('--fixture-mode') });
  console.log(JSON.stringify({ status: result.report.blockers.length ? 'UNKNOWN_OR_UNSAFE' : 'PASS', summary: result.report.summary, json: result.jsonPath, markdown: result.markdownPath, blockers: result.report.blockers.map(x => x.id) }, null, 2));
  if (result.report.blockers.length) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`UI_CONTROL_SAFETY_AUDIT_FAILED: ${error.stack || error.message}`); process.exit(1); });
