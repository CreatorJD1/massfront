import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const moduleSource = await readFile(new URL('../../src/space_module.js', import.meta.url), 'utf8');
const experienceSource = await readFile(new URL('../../src/space_experience.js', import.meta.url), 'utf8');
const commandSource = await readFile(new URL('../../src/ui/uga_command.js', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../../src/ui/space_module.css', import.meta.url), 'utf8');

assert.match(indexSource, /<button id="renderReturnMassfront" data-render-return type="button" aria-label="Return to the MASSFRONT Classic War Room">RETURN TO MASSFRONT<\/button>/,
  'fatal veil must provide an explicit accessible return to MASSFRONT');
assert.match(indexSource, /<button id="renderRetryGpu" data-render-retry type="button" aria-label="Retry GPU initialization" hidden>RETRY GPU INITIALIZATION<\/button>/,
  'fatal veil must provide an explicit accessible GPU retry without exposing it during normal boot');
assert.match(stylesSource, /\.render-failure-actions \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[^}]*gap: 8px;/,
  'fatal actions must share a bounded non-overlapping mobile layout');
assert.match(stylesSource, /\.render-veil\.failed \.render-failure-actions \{ display: grid; \}/,
  'the paired fatal actions must appear only on a failed veil');
assert.match(stylesSource, /\.render-veil \[data-render-return\] \{ display: none;/,
  'fatal return must stay hidden outside a failure surface');
assert.match(stylesSource, /\.render-veil\.failed \[data-render-return\] \{ display: inline-flex;/,
  'fatal return must become visible on every failed render veil');
assert.match(stylesSource, /\.render-veil \[data-render-return\] \{[^}]*min-height: 44px;/,
  'fatal return must retain a mobile-sized touch target');
assert.match(stylesSource, /\.render-veil \[data-render-retry\] \{[^}]*min-height: 44px;/,
  'GPU retry must retain a mobile-sized touch target');
assert.match(stylesSource, /\.render-veil \[data-render-retry\]\[hidden\] \{ display: none; \}/,
  'GPU retry must remain absent from normal and loading states');

const returnHandler = moduleSource.match(/async function returnToMassfrontFromFatalState\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.match(returnHandler, /selectedHost\?\.productionIntegrated === true/,
  'fatal return must distinguish the production host before opening a privileged base route');
assert.match(returnHandler, /selectedHost\.openBaseRoute\('war-room', fatalReturnLocation\(\)\)/,
  'an intact production bridge must use the signed Classic War Room route');
assert.match(returnHandler, /armClassicFallbackSession\(\)/,
  'fatal return must latch one-session Classic ownership before leaving UGA');
assert.match(returnHandler, /resolveBaseRuntimeNavigation\('\.\.\/\.\.\/\.\.\/index\.html\?galacticFallback=classic'\)/,
  'a broken bridge must retain the validated unprivileged Classic War Room escape');
assert.match(moduleSource, /installFatalReturn\(\);/,
  'fatal return must be bound before document boot can expose a failure');
assert.match(moduleSource, /window\.__MASSFRONT_FATAL_RETURN_HANDLER__ = returnToMassfrontFromFatalState;/,
  'the evaluated module must delegate the pre-import emergency control to its signed route owner');
assert.match(moduleSource, /window\.__MASSFRONT_SPACE_MODULE_BOUND__ = true;/,
  'the evaluated module must acknowledge the independent bootstrap watchdog');

const inlineDispatcher = indexSource.indexOf('function inlineFatalReturn(event)');
const moduleImport = indexSource.indexOf('<script id="spaceModuleScript" type="module"');
assert.ok(inlineDispatcher >= 0 && moduleImport > inlineDispatcher,
  'the dependency-free fatal return dispatcher must exist before the first module import');
assert.match(indexSource, /returnButton\.addEventListener\('click', inlineFatalReturn\)/,
  'the emergency return must be clickable even when the module graph never evaluates');
assert.match(indexSource, /event\.target\?\.id === 'spaceModuleScript'/,
  'the inline bootstrap must expose failure immediately when the module entry file cannot load');
assert.match(indexSource, /window\.__MASSFRONT_SPACE_MODULE_BOUND__ !== true[\s\S]*?12000\);/,
  'the inline bootstrap must expose a bounded watchdog escape for dependency-graph stalls');
assert.match(indexSource, /current\.pathname\.startsWith\('\/_capacitor_file_\/'\)[\s\S]*?current\.hostname === 'localhost'/,
  'a missing native mount may recover only to Capacitor localhost, never to an arbitrary origin');

const retryHandler = moduleSource.match(/function retrySpaceAfterFatalState\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.match(retryHandler, /if \(gpuRebuildPending\) return;/,
  'GPU retry must ignore repeated taps while recovery is already running');
assert.match(retryHandler, /gpuRebuilds = 0;/,
  'an explicit retry must reset the bounded automatic recovery budget');
assert.match(retryHandler, /rebuildAfterGpuInterruption\(\);/,
  'GPU retry must invoke the renderer disposal and rebuild path');
assert.doesNotMatch(retryHandler, /location\.(?:reload|replace|assign)/,
  'GPU retry must not reload or navigate the document');
assert.match(moduleSource, /installFatalRetry\(\);/,
  'GPU retry must be bound before document boot can expose a failure');
assert.match(experienceSource, /let button = veil\.querySelector\('\[data-render-retry\]'\);/,
  'renderer failures must reuse the explicit retry control');
assert.match(experienceSource, /if \(button\) button\.hidden = !retry;/,
  'renderer failures must preserve the retry control and toggle only its visibility');

assert.match(commandSource, /Promise\.resolve\(result\)\.catch\(error => \{[\s\S]*?options\.onError\(error, \{ callback: name, args \}\)[\s\S]*?\.finally\(\(\) => \{[\s\S]*?root\.classList\.remove\('is-busy'\)/,
  'rejected UGA commands must report the failure and always clear the busy lock');
assert.match(experienceSource, /context\.callback === 'onHostRoute'[\s\S]*?BASE COMMAND UNAVAILABLE[\s\S]*?PLAY REMAINS AVAILABLE/,
  'base-route rejection must tell the player that UGA play remains available');

console.log('Fatal MASSFRONT return and GPU retry contract: PASS');
