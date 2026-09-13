import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const read=file=>readFileSync(resolve(root,file),'utf8');
const titleArt='assets/brand/massfront-title-command-conquer-overwhelm-v1.png';
const titleArtHash='e11a316658c34d30a9b4aced6f2bdfb7ae7a47f967f93389acb55d8db67fb279';
const html=read('index.html'),css=read('src/styles/ui.css'),launcher=read('src/launcher.js');
const main=read('src/main.js'),intro=read('src/intro.js'),boot=read('boot.js');
const manifest=JSON.parse(read('assets/data/manifest.json')).order;

const requiredIds=['updScr','updPanel','updTxt','updSub','updBtn','updCancel','updBarO','updBarF',
  'updFeed','updNotes','updRoll','mfLaunchPlay','mfLaunchOffline','mfLaunchNoteList',
  'mfLaunchHistoryList','mfLaunchPackAudio','mfLaunchPackGalactic'];
for(const id of requiredIds)assert.match(html,new RegExp('id=["\']'+id+'["\']'),'missing launcher/updater node #'+id);

const at=manifest.indexOf('src/launcher.js');
assert.ok(at>manifest.indexOf('src/updater.js'),'launcher must load after updater');
assert.ok(at>manifest.indexOf('src/intro.js'),'launcher must load after intro');
assert.ok(at<manifest.indexOf('src/main.js'),'launcher must load before main boot');
assert.match(boot,/\.\/src\/updater\.js/,'boot manifest missing updater');
assert.match(boot,/\.\/src\/intro\.js/,'boot manifest missing intro');
assert.match(boot,/\.\/src\/launcher\.js/,'boot manifest missing launcher');
assert.ok(boot.indexOf('./src/updater.js')<boot.indexOf('./src/launcher.js'),'boot launcher order is unsafe');
assert.ok(boot.indexOf('./src/intro.js')<boot.indexOf('./src/launcher.js'),'boot intro/launcher order is unsafe');
assert.ok(boot.indexOf('./src/launcher.js')<boot.indexOf('./src/main.js'),'boot launcher must precede main');

for(const contract of ['massfront:identity-state','massfront:update-state','mfIdentitySnapshot','mfUpdaterSnapshot',
  'mfUpdaterHistory','mfUpdaterAction'])assert.ok(launcher.includes(contract),'launcher missing explicit contract '+contract);
assert.doesNotMatch(launcher,/getElementById\(['"]upd(?:Txt|Sub|Notes)['"]\).*textContent/,
  'launcher must not infer state from updater presentation text');
assert.match(launcher,/showFrontScreen\('startScreen'\)/,'PLAY must hand off to the existing main menu');
assert.doesNotMatch(launcher,/\.click\(\)|startBtn.*click/,'launcher must not auto-enter the War Room');
assert.match(launcher,/mfOpenExploration\('campaign_hub'\)/,
  'normal launch must enter the stable Galactic home');
assert.doesNotMatch(launcher,/mfOpenExploration\('system'\)/,
  'normal launch must not auto-depart into orbital travel');
assert.match(main,/mfOpenExploration\('campaign_hub',\{explicitRetry:true,launchButtonId:'startBtn'\}\)/,
  'the retained START button must return to Galactic home rather than auto-depart');
assert.match(main,/mfLauncherShouldDeferAttract\(\)/,'main must defer the WebGL attract scene behind launcher');
assert.match(intro,/mfLaunchPlay/,'intro focus must hand off to launcher CTA');
assert.doesNotMatch(launcher,/MF_LAUNCHER_CATALOG\.find\([^\n]+\)\|\|MF_LAUNCHER_CATALOG\[0\]/,
  'unknown releases must not inherit the newest known release notes');
assert.match(launcher,/\['offline-choice','remembered-offline','gate-dismissed'\]/,
  'only explicit offline identity choices may persist forced-offline mode');
assert.match(launcher,/source==='signed-out'[\s\S]{0,180}mfAuthGate/,
  'an expired cached session must reopen the sign-in/offline choice');
assert.match(launcher,/source==='session-unverified'[\s\S]{0,180}apVerifySession/,
  'a transient identity outage must retry verification on reconnect');
assert.match(launcher,/action\.id==='download'&&!online/,
  'remote update download must be disabled offline');
/* The retry control is gated on the player's own Offline Mode, not on
   navigator.onLine. An Android WebView reports that flag as false on a
   connected device, and pinning the launcher to it greyed out the only control
   that could reach the update service, leaving no way to recover. updCheck()
   is timeout-bounded and reports a real error, so letting a deliberate tap
   through is strictly safer than a dead button. Asserted as a contract rather
   than as adjacent source text, so an explanatory comment between the two
   statements cannot fail the check. */
assert.match(launcher,/remoteAction=panelAction!=='apply'&&panelAction!=='cancel'/,
  'local apply/cancel must stay updater-owned rather than gated as remote actions');
assert.match(launcher,/panelButton\.disabled=forcedOffline\|\|panelBusy/,
  'the updater retry control must be disabled only by Offline Mode and by a busy transfer');
assert.ok(!/panelButton\.disabled=!online/.test(launcher),
  'the retry control must never be disabled by a browser offline hint again');
/* A healthy transfer reports 0 bytes until its first chunk completes, and a
   full payload opens with a 24 MB file, so that window is 10-15 seconds long.
   fmtBytes renders 0 as an em-dash, which is correct for "unknown" and wrong
   here: it made an active download read "- / 91 MB" with speed "-", identical
   to a dead one, and players cancelled working transfers. While a transfer is
   live the readouts must show a real zero so the number is visibly a counter. */
assert.match(launcher,/function fmtBytesLive\(n\)\{[^}]*return n\?fmtBytes\(n\):'0 B';/,
  'a live transfer needs a zero-safe byte formatter distinct from the unknown-value em-dash');
assert.match(launcher,/var transferring=\['downloading','staging','applying'\]/,
  'the launcher must know when a transfer is active to choose the honest readout');
assert.match(launcher,/transferring\?fmtBytesLive\(p\.bytes\):fmtBytes\(p\.bytes\)/,
  'transferred bytes must render as 0 B during a transfer, not as an em-dash');
assert.match(launcher,/p\.speedBps\?fmtBytes\(p\.speedBps\)\+'\/s':\(transferring\?'0 B\/s':'—'\)/,
  'transfer speed must render as 0 B/s during a transfer, not as an em-dash');

const packs=JSON.parse(read('assets/packs/packs.json')).packs;
for(const id of ['voice','music'])assert.equal(packs[id].delivery,'base',id+' must be base content');
for(const entry of packs.voice.files)assert.ok(existsSync(resolve(root,'assets/audio/voice',entry.name)),
  'base voice file missing: '+entry.name);
for(const builder of ['tools/build-audio-pack.mjs','tools/build-voice-pack.mjs'])
  assert.match(read(builder),/delivery:\s*'base'/,'audio builder must retain base delivery');
assert.match(read('tools/pack-www.mjs'),/checkDual\('assets\/audio\/voice\/'/,
  'packaging must verify both voice codecs');
assert.match(launcher,/L\.packAudioReady=true;L\.packAudioIds=\[\]/,
  'base audio must not request duplicate IndexedDB downloads');
assert.match(launcher,/classList\.remove\('onlineOnly'\)/,
  'packaged Galactic content must stop looking internet-locked offline');
assert.match(launcher,/localAhead=s\.state==='stale'/,
  'local-ahead state must describe the installed build rather than the older server release');
assert.match(launcher,/localRecord=localAhead&&deviceRows\.find/,
  'local-ahead release copy must come from matching device history when available');
assert.match(launcher,/source=localAhead\?\(localRecord\|\|\{version:releaseVersion[\s\S]{0,240}LOCAL BUILD AHEAD/,
  'local-ahead state must use neutral copy rather than older server manifest notes');
assert.doesNotMatch(launcher,/massfront:update-state[^\n]+renderPacks\(\)/,
  'byte-progress events must not rescan optional pack storage directly');
assert.match(launcher,/if\(before!==next\.state\)schedulePackRender/,
  'optional packs should refresh only on updater state transitions');

for(const selector of ['#updScr','.mfLauncherHero','.mfLauncherFoot','.mfLauncherTimeline','prefers-reduced-motion'])
  assert.ok(css.includes(selector),'launcher CSS missing '+selector);
assert.match(css,/@media\(orientation:landscape\) and \(min-width:640px\)/,
  'narrow phone landscape must not restore cramped two-column pack cards');
for(const excluded of ['assets/factions/cinematic/','assets/source/','assets/packs/'])
  assert.ok(!html.includes(excluded),'launcher references pack-excluded asset '+excluded);
for(const asset of ['assets/icons/splash-2732.png','assets/icons/icon-512.png',
  'assets/textures/planets/war-table/aelos-basecolor-v1.png',titleArt])assert.ok(html.includes(asset),'launcher image missing '+asset);
const brandRefs=[...html.matchAll(/(?:src|href)=["'](assets\/brand\/[^"']+)["']/g)].map(match=>match[1]);
assert.deepEqual([...new Set(brandRefs)],[titleArt],
  'launcher may reference only the canonical owner-approved title art under assets/brand');
assert.equal(createHash('sha256').update(readFileSync(resolve(root,titleArt))).digest('hex'),titleArtHash,
  'canonical owner-approved title art hash changed');
const pack=read('tools/pack-www.mjs');
assert.match(pack,/const KEEP_BRAND = 'assets\/brand\/massfront-title-command-conquer-overwhelm-v1\.png';/,
  'pack must narrowly allow the canonical title art');
assert.match(pack,/if\(rel\.startsWith\('assets\/brand\/'\)&&rel!==KEEP_BRAND\) return false;/,
  'pack must continue excluding every other brand authoring asset');

console.log('PASS launcher gateway static contract');
