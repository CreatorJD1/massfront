import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createStoryTransmissionController,
  normalizeStoryTransmissionCue
} from '../../src/ui/story_transmission_controller.js';

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.classList = new FakeClassList();
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = '';
    this.alt = '';
    this.src = '';
    this.poster = '';
    this.ownerDocument = null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'src') this.src = '';
    if (name === 'poster') this.poster = '';
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  querySelectorAll(selector) { return selector === 'button' ? this.children : []; }
  contains(child) { return this.children.includes(child); }
  closest(selector) { return selector === '[data-story-action]' && this.dataset.storyAction ? this : null; }
  dispatchEvent(event) { this.lastEvent = event; return !event.defaultPrevented; }
  pause() {}
  play() { return Promise.resolve(); }
}

function createFixture() {
  const selectors = {};
  const rail = new FakeElement('storyRail');
  rail.querySelector = selector => selectors[selector] || null;
  const document = {
    createElement() {
      const element = new FakeElement();
      element.ownerDocument = document;
      return element;
    }
  };
  rail.ownerDocument = document;
  for (const [selector, id] of [
    ['[data-story-default]', 'storyDefault'],
    ['#storyTransmission', 'storyTransmission'],
    ['#storyTransmissionChannel', 'storyTransmissionChannel'],
    ['#storyTransmissionStage', 'storyTransmissionStage'],
    ['#storyTransmissionSpeaker', 'storyTransmissionSpeaker'],
    ['#storyTransmissionRole', 'storyTransmissionRole'],
    ['#storyTransmissionAffiliation', 'storyTransmissionAffiliation'],
    ['#storyTransmissionTitle', 'storyTransmissionTitle'],
    ['#storyTransmissionText', 'storyTransmissionText'],
    ['#storyTransmissionProgress', 'storyTransmissionProgress'],
    ['#storyTransmissionActions', 'storyTransmissionActions'],
    ['#storyTransmissionMedia', 'storyTransmissionMedia'],
    ['#storyTransmissionVideo', 'storyTransmissionVideo'],
    ['#storyTransmissionPortrait', 'storyTransmissionPortrait']
  ]) {
    selectors[selector] = new FakeElement(id);
    selectors[selector].ownerDocument = document;
  }
  return { rail, selectors };
}

const normalized = normalizeStoryTransmissionCue({
  schema: 'massfront.keel-hint.v1',
  hintId: 'uga-command',
  surface: 'space-hud',
  speaker: 'KEEL',
  speakerId: 'keel',
  affiliation: 'nova',
  speakerRole: 'Nova field agent',
  voiceId: 'keel',
  voiceAction: 'greeting',
  profileId: 'keel-ship-liaison',
  animationId: 'keel-space-link',
  text: 'Command link online.',
  durationMs: 999999,
  priority: 45
});
assert.equal(normalized.id, 'uga-command');
assert.equal(normalized.voiceId, 'keel');
assert.equal(normalized.voiceAction, 'greeting');
assert.equal(normalized.profileId, 'uga-keel-expedition-guide');
assert.equal(normalized.animationId, 'keel-space-link');
assert.equal(normalized.durationMs, 60000, 'duration must be bounded');
assert.equal(normalized.affiliation, 'uga', 'KEEL must never inherit a selectable-faction affiliation');
assert.equal(normalized.speakerRole, 'UGA EXPEDITION GUIDE');
assert.equal(normalized.channel, 'UGA PERSONNEL LINK');

const { rail, selectors } = createFixture();
let time = 100;
let nextTimer = 0;
const timers = new Map();
const selected = [];
const presented = [];
const dismissed = [];
const controller = createStoryTransmissionController(rail, {
  now: () => time,
  setTimer(callback, delay) {
    const id = ++nextTimer;
    timers.set(id, { callback, delay });
    return id;
  },
  clearTimer(id) { timers.delete(id); },
  onPresent(cue) { presented.push(cue); },
  onDismiss(cue, reason) { dismissed.push({ cue, reason }); },
  onAction(detail) { selected.push(detail.action.id); }
});

assert.equal(controller.present({ id: 'low', speaker: 'KEEL', text: 'Low priority.', durationMs: 2000, priority: 10 }), true);
assert.equal(controller.getState().current.id, 'low');
assert.equal(selectors['[data-story-default]'].hidden, true);
assert.equal(selectors['#storyTransmission'].hidden, false);
assert.equal(rail.dataset.speaker, 'KEEL');
assert.equal(rail.dataset.affiliation, 'uga');
assert.equal(selectors['#storyTransmissionRole'].textContent, 'UGA EXPEDITION GUIDE');
assert.equal(presented[0].voiceId, 'keel');
assert.equal(presented[0].voiceAction, '');

controller.present({ id: 'queued', speaker: 'COMMANDER', text: 'Queued.', durationMs: 1000, priority: 5 });
assert.equal(controller.getState().queued[0].id, 'queued');
controller.present({ id: 'urgent', speaker: 'COMMANDER', text: 'Urgent.', durationMs: 1000, priority: 20 });
assert.equal(controller.getState().current.id, 'urgent', 'higher priority must interrupt the active cue');
assert.equal(dismissed.at(-1).reason, 'interrupted');

controller.setScene('uga');
assert.equal(controller.getState().accepting, false);
assert.equal(rail.getAttribute('aria-hidden'), 'true');
const hiddenEvent = {
  detail: { speaker: 'KEEL', text: 'Do not render over UGA.', durationMs: 1000 },
  cancelable: true,
  preventDefault() { this.defaultPrevented = true; }
};
assert.equal(controller.receiveEvent(hiddenEvent), false);
assert.equal(hiddenEvent.detail.handled, undefined);
controller.setScene('system');
assert.equal(controller.getState().accepting, true);

let routed = false;
controller.playSequence([
  { id: 'world-intro', speaker: 'KEEL', text: 'Live space.', durationMs: 1000, priority: 90 },
  {
    id: 'career-choice', speaker: 'KEEL', text: 'Choose.', durationMs: 0, priority: 90,
    actions: [{
      id: 'training', label: 'BEGIN BASIC TUTORIAL',
      description: 'Protected planetary mission.', metaLabel: 'RECOMMENDED · PROTECTED',
      onSelect: () => { routed = true; }
    }]
  }
], { replace: true, priority: 90 });
assert.equal(controller.getState().current.id, 'world-intro');
assert.equal(controller.getState().current.sequenceStep, 1);
assert.equal(controller.getState().current.sequenceTotal, 2);
assert.equal(selectors['#storyTransmissionProgress'].children.length, 2);
const introTimer = [...timers.values()].at(-1);
assert.ok(introTimer, 'timed story cue did not schedule');
time += introTimer.delay;
introTimer.callback();
assert.equal(controller.getState().current.id, 'career-choice');
assert.equal(controller.getState().current.actions[0].description, 'Protected planetary mission.');
assert.equal(controller.select('training'), true);
assert.equal(routed, true);
assert.deepEqual(selected, ['training']);

controller.present({
  id: 'media-fallback', speaker: 'KEEL', text: 'Visual link.', durationMs: 0,
  videoUrl: 'keel-link.webm', portraitUrl: 'keel-portrait.webp'
}, { replace: true });
assert.equal(selectors['#storyTransmissionVideo'].hidden, false);
selectors['#storyTransmissionVideo'].onerror();
assert.equal(selectors['#storyTransmissionPortrait'].src, 'keel-portrait.webp');
assert.equal(selectors['#storyTransmissionPortrait'].hidden, false);

controller.destroy();
assert.equal(selectors['[data-story-default]'].hidden, false);
assert.equal(selectors['#storyTransmission'].hidden, true);

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.resolve(here, '../..');
const experience = fs.readFileSync(path.join(moduleRoot, 'src/space_experience.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(moduleRoot, 'src/space_module.js'), 'utf8');
const shell = fs.readFileSync(path.join(moduleRoot, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(moduleRoot, 'src/ui/space_module.css'), 'utf8');

assert.match(experience, /routeId = training \? 'mode-training' : 'new-career-faction'/);
assert.match(experience, /'protected-planetary-training'/);
assert.match(experience, /'required-faction-selection'/);
assert.match(experience, /\['faction-selection', 'starter-commander-1', 'full-uga-space'\]/);
assert.match(experience, /moduleImplemented: true/);
assert.match(experience, /host\.productionIntegrated !== true \|\| entryView !== 'system'/);
const firstEntryBlock = experience.slice(
  experience.indexOf('function signalFirstEntryChoice'),
  experience.indexOf('function refreshResources')
);
assert.doesNotMatch(firstEntryBlock, /openCampaignHub/, 'an unresolved new career must not bypass faction commissioning');
assert.doesNotMatch(firstEntryBlock, /minimap|cmdrTx/i, 'normal-space first entry must stay on the dedicated story receiver');
assert.match(firstEntryBlock, /SKIP TO FACTION SELECTION/);
assert.match(firstEntryBlock, /BEGIN BASIC TUTORIAL/);
assert.match(firstEntryBlock, /speakerRole: 'UGA EXPEDITION GUIDE'/);
assert.match(firstEntryBlock, /channel: 'UGA PERSONNEL LINK'/);
assert.match(firstEntryBlock, /profileId: 'uga-keel-expedition-guide'/);
assert.doesNotMatch(firstEntryBlock, /nova/i, 'KEEL onboarding copy must not imply a selectable-faction affiliation');
assert.match(bootstrap, /entryView === 'system' && introRequired && !hasIntegratedReturnQuery\(\)/);
assert.match(bootstrap, /experience\.startFirstEntryIntro\(\)/);
assert.match(shell, /id="storyTransmission"/);
assert.match(shell, /id="storyTransmissionVideo"/);
assert.match(shell, /id="storyTransmissionPortrait"/);
assert.match(shell, /id="storyTransmissionRole"/);
assert.match(shell, /id="storyTransmissionProgress"/);
const storyRailStart = shell.indexOf('<aside id="storyRail"');
const storyRailShell = shell.slice(storyRailStart, shell.indexOf('</aside>', storyRailStart) + '</aside>'.length);
assert.ok(storyRailStart >= 0 && storyRailShell.length > 0, 'dedicated normal-space story rail is missing');
assert.doesNotMatch(storyRailShell, /minimap|cmdrTx/i, 'normal-space transmissions must never reuse the battle minimap receiver');
const hintBinding = experience.slice(
  experience.indexOf('listen(window, KEEL_HINT_EVENT'),
  experience.indexOf("listen($('btnUgaCommand')")
);
assert.match(hintBinding, /storyTransmissions\.receiveEvent\(event\)/,
  'normal-space KEEL hints are no longer routed to the story transmission controller');
assert.doesNotMatch(hintBinding, /minimap|cmdrTx/i,
  'normal-space KEEL hint routing references the battle minimap receiver');
assert.match(css, /story-transmission-actions button \{[\s\S]*min-height: 76px/);
assert.match(css, /max-height: 620px[\s\S]*story-transmission-actions button \{ min-height: 44px/);
for (const scene of ['uga', 'galaxy', 'survey']) {
  assert.match(css, new RegExp(`data-scene="${scene}"\\] \\.story-rail`), `story rail is not hidden in ${scene}`);
}

console.log('PASS story transmission controller and first-entry route contract');
