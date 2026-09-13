/* --------------------------------------------------------------------------
   MASSFRONT — NORMAL-SPACE STORY TRANSMISSION CONTROLLER

   The upper-left story rail is intentionally reused instead of adding a modal:
   live space remains visible and the flight/target/resource controls keep their
   established screen regions. Authored media is optional; failed animation or
   video loads fall back to the supplied portrait without inventing replacement
   art.
   -------------------------------------------------------------------------- */

export const STORY_TRANSMISSION_EVENT = 'massfront:story-transmission';
export const KEEL_HINT_EVENT = 'massfront:keel-hint';

const MAX_DURATION_MS = 60000;

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mediaUrl(value) {
  return text(value).slice(0, 2048);
}

function normalizeAction(action, index) {
  if (!action || typeof action !== 'object') return null;
  const label = text(action.label);
  if (!label) return null;
  return {
    id: text(action.id || action.choice, `action-${index + 1}`).slice(0, 96),
    label: label.slice(0, 120),
    kind: text(action.kind, index === 0 ? 'primary' : 'secondary').slice(0, 32),
    description: text(action.description).slice(0, 240),
    metaLabel: text(action.metaLabel || action.kicker).slice(0, 96),
    choice: text(action.choice),
    outcome: text(action.outcome),
    nextStep: text(action.nextStep),
    continuation: action.continuation && typeof action.continuation === 'object'
      ? action.continuation
      : null,
    onSelect: typeof action.onSelect === 'function' ? action.onSelect : null
  };
}

export function normalizeStoryTransmissionCue(source = {}) {
  if (!source || typeof source !== 'object') throw new TypeError('A story transmission cue object is required.');
  const cueText = text(source.text);
  if (!cueText) throw new TypeError('A story transmission cue requires text.');
  const duration = Math.max(0, Math.min(MAX_DURATION_MS, number(source.durationMs, 4600)));
  const priority = Math.max(-1000, Math.min(1000, Math.round(number(source.priority, 0))));
  const speaker = text(source.speaker, 'COMMAND').slice(0, 80);
  const speakerId = text(source.speakerId).slice(0, 96);
  const isKeel = speakerId.toLowerCase() === 'keel' || speaker.toUpperCase() === 'KEEL';
  const sequenceTotal = Math.max(0, Math.min(9, Math.round(number(source.sequenceTotal, 0))));
  const sequenceStep = sequenceTotal
    ? Math.max(1, Math.min(sequenceTotal, Math.round(number(source.sequenceStep, 1))))
    : 0;
  return {
    schema: text(source.schema, 'massfront.story-transmission.v1'),
    id: text(source.id || source.hintId, 'transmission').slice(0, 128),
    context: text(source.context, 'normal-space').slice(0, 96),
    surface: text(source.surface, 'space-story-rail').slice(0, 96),
    speaker: isKeel ? 'KEEL' : speaker,
    speakerId: isKeel ? 'keel' : speakerId,
    /* KEEL is UGA expedition personnel, never a selectable-faction actor.
       Ignore conflicting authored affiliation metadata rather than letting a
       generic transmission skin silently recast the onboarding guide. */
    affiliation: isKeel ? 'uga' : text(source.affiliation).toLowerCase().slice(0, 64),
    speakerRole: isKeel ? 'UGA EXPEDITION GUIDE' : text(source.speakerRole || source.role, 'COMMAND PERSONNEL').slice(0, 120),
    channel: isKeel ? 'UGA PERSONNEL LINK' : text(source.channel, 'COMMAND TRANSMISSION').slice(0, 120),
    title: text(source.title).slice(0, 180),
    stageLabel: text(source.stageLabel).slice(0, 96),
    sequenceStep,
    sequenceTotal,
    voiceId: isKeel ? 'keel' : text(source.voiceId).slice(0, 96),
    /* A subtitle is not proof that a matching recording exists. Audio may
       address only an explicitly declared action from the approved bank. */
    voiceAction: isKeel ? text(source.voiceAction).toLowerCase().slice(0, 96) : '',
    profileId: isKeel ? 'uga-keel-expedition-guide' : text(source.profileId).slice(0, 128),
    animationId: isKeel ? 'keel-space-link' : text(source.animationId).slice(0, 128),
    text: cueText.slice(0, 1600),
    durationMs: duration,
    priority,
    videoUrl: mediaUrl(source.videoUrl || source.video),
    animationUrl: mediaUrl(source.animationUrl || source.animation),
    portraitUrl: mediaUrl(source.portraitUrl || source.portrait),
    posterUrl: mediaUrl(source.posterUrl || source.poster),
    mediaType: text(source.mediaType).toLowerCase().slice(0, 24),
    actions: (Array.isArray(source.actions) ? source.actions : [])
      .map(normalizeAction)
      .filter(Boolean)
      .slice(0, 3),
    meta: source.meta && typeof source.meta === 'object' ? source.meta : null
  };
}

function cueSnapshot(cue) {
  if (!cue) return null;
  return {
    schema: cue.schema,
    id: cue.id,
    context: cue.context,
    surface: cue.surface,
    speaker: cue.speaker,
    speakerId: cue.speakerId,
    affiliation: cue.affiliation,
    speakerRole: cue.speakerRole,
    channel: cue.channel,
    title: cue.title,
    stageLabel: cue.stageLabel,
    sequenceStep: cue.sequenceStep,
    sequenceTotal: cue.sequenceTotal,
    voiceId: cue.voiceId,
    voiceAction: cue.voiceAction,
    profileId: cue.profileId,
    animationId: cue.animationId,
    text: cue.text,
    durationMs: cue.durationMs,
    priority: cue.priority,
    videoUrl: cue.videoUrl,
    animationUrl: cue.animationUrl,
    portraitUrl: cue.portraitUrl,
    posterUrl: cue.posterUrl,
    mediaType: cue.mediaType,
    actions: cue.actions.map(action => ({
      id: action.id,
      label: action.label,
      kind: action.kind,
      description: action.description,
      metaLabel: action.metaLabel,
      choice: action.choice,
      outcome: action.outcome,
      nextStep: action.nextStep,
      continuation: action.continuation
    })),
    meta: cue.meta
  };
}

function isVideoUrl(url, mediaType) {
  return mediaType === 'video' || /\.(?:mp4|webm|m4v|mov)(?:$|[?#])/i.test(url || '');
}

export function createStoryTransmissionController(rail, options = {}) {
  if (!rail || typeof rail.querySelector !== 'function') {
    throw new TypeError('createStoryTransmissionController requires the #storyRail element.');
  }
  const defaultStory = rail.querySelector('[data-story-default]');
  const transmission = rail.querySelector('#storyTransmission');
  const channel = rail.querySelector('#storyTransmissionChannel');
  const stage = rail.querySelector('#storyTransmissionStage');
  const speaker = rail.querySelector('#storyTransmissionSpeaker');
  const speakerRole = rail.querySelector('#storyTransmissionRole');
  const affiliation = rail.querySelector('#storyTransmissionAffiliation');
  const title = rail.querySelector('#storyTransmissionTitle');
  const body = rail.querySelector('#storyTransmissionText');
  const progress = rail.querySelector('#storyTransmissionProgress');
  const actions = rail.querySelector('#storyTransmissionActions');
  const media = rail.querySelector('#storyTransmissionMedia');
  const video = rail.querySelector('#storyTransmissionVideo');
  const portrait = rail.querySelector('#storyTransmissionPortrait');
  if (!defaultStory || !transmission || !channel || !stage || !speaker || !speakerRole || !affiliation || !title || !body || !progress || !actions || !media || !video || !portrait) {
    throw new Error('#storyRail is missing its transmission receiver elements.');
  }

  const ownerDocument = rail.ownerDocument || document;
  const now = typeof options.now === 'function'
    ? options.now
    : () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const setTimer = typeof options.setTimer === 'function'
    ? options.setTimer
    : (callback, delay) => window.setTimeout(callback, delay);
  const clearTimer = typeof options.clearTimer === 'function'
    ? options.clearTimer
    : handle => window.clearTimeout(handle);
  let scene = 'system';
  let current = null;
  let queue = [];
  let timer = 0;
  let order = 0;
  let announcedOrder = 0;
  let destroyed = false;

  function resetMedia() {
    try { video.pause(); } catch (_) {}
    video.onerror = null;
    video.removeAttribute('src');
    video.removeAttribute('poster');
    video.hidden = true;
    portrait.onerror = null;
    portrait.removeAttribute('src');
    portrait.alt = '';
    portrait.hidden = true;
    media.hidden = true;
  }

  function showPortrait(cue, url = cue.portraitUrl) {
    if (!url) {
      resetMedia();
      return;
    }
    try { video.pause(); } catch (_) {}
    video.hidden = true;
    portrait.alt = `${cue.speaker}, ${cue.speakerRole} transmission portrait`;
    portrait.onerror = () => resetMedia();
    portrait.src = url;
    portrait.hidden = false;
    media.hidden = false;
  }

  function showMedia(cue) {
    resetMedia();
    const source = cue.videoUrl || cue.animationUrl;
    if (!source) {
      showPortrait(cue);
      return;
    }
    if (cue.videoUrl || isVideoUrl(source, cue.mediaType)) {
      video.onerror = () => showPortrait(cue);
      video.src = source;
      if (cue.posterUrl || cue.portraitUrl) video.poster = cue.posterUrl || cue.portraitUrl;
      video.hidden = false;
      media.hidden = false;
      const playback = video.play();
      if (playback && typeof playback.catch === 'function') playback.catch(() => {});
      return;
    }
    portrait.alt = `${cue.speaker}, ${cue.speakerRole} transmission animation`;
    portrait.onerror = () => {
      if (cue.portraitUrl && cue.portraitUrl !== source) showPortrait(cue);
      else resetMedia();
    };
    portrait.src = source;
    portrait.hidden = false;
    media.hidden = false;
  }

  function clearActiveTimer({ preserve = false } = {}) {
    if (!timer) return;
    clearTimer(timer);
    timer = 0;
    if (preserve && current) {
      current.remainingMs = Math.max(0, current.deadline - now());
    }
  }

  function hideTransmission() {
    resetMedia();
    defaultStory.hidden = false;
    transmission.hidden = true;
    rail.classList.remove('is-transmitting');
    for (const key of ['transmissionId', 'speaker', 'affiliation', 'voiceId', 'profileId', 'animationId', 'priority']) {
      delete rail.dataset[key];
    }
  }

  function scheduleCurrent() {
    clearActiveTimer();
    if (!current || scene !== 'system' || current.cue.actions.length || current.remainingMs <= 0) return;
    const delay = current.remainingMs;
    current.deadline = now() + delay;
    timer = setTimer(() => {
      timer = 0;
      finishCurrent('elapsed');
    }, delay);
  }

  function renderCurrent() {
    if (!current) {
      hideTransmission();
      return;
    }
    const cue = current.cue;
    defaultStory.hidden = true;
    transmission.hidden = false;
    rail.classList.add('is-transmitting');
    rail.dataset.transmissionId = cue.id;
    rail.dataset.speaker = cue.speaker;
    rail.dataset.affiliation = cue.affiliation;
    rail.dataset.voiceId = cue.voiceId;
    rail.dataset.profileId = cue.profileId;
    rail.dataset.animationId = cue.animationId;
    rail.dataset.priority = String(cue.priority);
    channel.textContent = cue.channel;
    stage.textContent = cue.stageLabel || (cue.sequenceTotal
      ? `ENTRY BRIEF · ${String(cue.sequenceStep).padStart(2, '0')} / ${String(cue.sequenceTotal).padStart(2, '0')}`
      : 'LIVE TRANSMISSION');
    speaker.textContent = cue.speaker;
    speakerRole.textContent = cue.speakerRole;
    affiliation.textContent = cue.affiliation === 'uga'
      ? 'UGA PERSONNEL'
      : (cue.affiliation || 'COMMAND PERSONNEL').toUpperCase();
    title.textContent = cue.title;
    title.hidden = !cue.title;
    body.textContent = cue.text;
    progress.replaceChildren();
    progress.hidden = cue.sequenceTotal <= 1;
    for (let index = 1; index <= cue.sequenceTotal; index++) {
      const segment = ownerDocument.createElement('i');
      segment.className = index < cue.sequenceStep ? 'complete' : index === cue.sequenceStep ? 'active' : '';
      progress.appendChild(segment);
    }
    actions.replaceChildren();
    cue.actions.forEach((action, index) => {
      const button = ownerDocument.createElement('button');
      button.type = 'button';
      button.dataset.storyAction = action.id;
      button.dataset.outcome = action.outcome;
      button.className = action.kind === 'primary' ? 'primary' : 'secondary';
      button.setAttribute('aria-label', action.description ? `${action.label}. ${action.description}` : action.label);
      const numberLabel = ownerDocument.createElement('span');
      numberLabel.className = 'story-action-number';
      numberLabel.textContent = String(index + 1).padStart(2, '0');
      numberLabel.setAttribute('aria-hidden', 'true');
      const actionCopy = ownerDocument.createElement('span');
      actionCopy.className = 'story-action-copy';
      const actionTitle = ownerDocument.createElement('strong');
      actionTitle.textContent = action.label;
      const actionDescription = ownerDocument.createElement('small');
      actionDescription.textContent = action.description;
      actionDescription.hidden = !action.description;
      const actionMeta = ownerDocument.createElement('em');
      actionMeta.textContent = action.metaLabel;
      actionMeta.hidden = !action.metaLabel;
      actionCopy.appendChild(actionTitle);
      actionCopy.appendChild(actionDescription);
      actionCopy.appendChild(actionMeta);
      const chevron = ownerDocument.createElement('span');
      chevron.className = 'story-action-chevron';
      chevron.textContent = '›';
      chevron.setAttribute('aria-hidden', 'true');
      button.appendChild(numberLabel);
      button.appendChild(actionCopy);
      button.appendChild(chevron);
      actions.appendChild(button);
    });
    showMedia(cue);
    if (announcedOrder !== current.order) {
      announcedOrder = current.order;
      if (typeof options.onPresent === 'function') {
        try {
          const result = options.onPresent(cueSnapshot(cue));
          if (result && typeof result.catch === 'function') result.catch(error => options.onError?.(error));
        } catch (error) { if (typeof options.onError === 'function') options.onError(error); }
      }
    }
    scheduleCurrent();
  }

  function nextQueued() {
    if (destroyed || current || scene !== 'system' || !queue.length) return;
    current = queue.shift();
    renderCurrent();
  }

  function finishCurrent(reason = 'dismissed', { advance = true } = {}) {
    if (!current) return false;
    clearActiveTimer();
    const finished = current;
    current = null;
    hideTransmission();
    if (typeof options.onDismiss === 'function') {
      try { options.onDismiss(cueSnapshot(finished.cue), reason); } catch (_) {}
    }
    if (advance) nextQueued();
    return true;
  }

  function queueCue(cue) {
    queue.push({ cue, remainingMs: cue.durationMs, deadline: 0, order: ++order });
    queue.sort((left, right) => right.cue.priority - left.cue.priority || left.order - right.order);
  }

  function present(source, presentOptions = {}) {
    if (destroyed) return false;
    const cue = normalizeStoryTransmissionCue(source);
    if (scene !== 'system' && presentOptions.queueWhenHidden !== true) return false;
    if (scene !== 'system') {
      queueCue(cue);
      return true;
    }
    if (!current) {
      current = { cue, remainingMs: cue.durationMs, deadline: 0, order: ++order };
      renderCurrent();
      return true;
    }
    if (presentOptions.replace === true || cue.priority > current.cue.priority) {
      finishCurrent('interrupted', { advance: false });
      current = { cue, remainingMs: cue.durationMs, deadline: 0, order: ++order };
      renderCurrent();
      return true;
    }
    queueCue(cue);
    return true;
  }

  function playSequence(sources, sequenceOptions = {}) {
    if (destroyed || scene !== 'system' || !Array.isArray(sources) || !sources.length) return false;
    const normalized = sources.map(normalizeStoryTransmissionCue);
    const sequencePriority = number(sequenceOptions.priority, Math.max(...normalized.map(cue => cue.priority)));
    normalized.forEach((cue, index) => {
      cue.priority = sequencePriority;
      if (!cue.sequenceTotal) {
        cue.sequenceTotal = normalized.length;
        cue.sequenceStep = index + 1;
      }
    });
    if (sequenceOptions.replace !== false) {
      clearActiveTimer();
      current = null;
      queue = [];
      hideTransmission();
    }
    present(normalized.shift(), { replace: sequenceOptions.replace !== false });
    for (const cue of normalized) queueCue(cue);
    return true;
  }

  function select(actionId) {
    if (!current || destroyed) return false;
    const action = current.cue.actions.find(candidate => candidate.id === actionId);
    if (!action) return false;
    const cue = current.cue;
    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    finishCurrent('selected');
    const detail = {
      schema: 'massfront.story-choice.v1',
      cue: cueSnapshot(cue),
      action: {
        id: action.id,
        label: action.label,
        description: action.description,
        metaLabel: action.metaLabel,
        choice: action.choice,
        outcome: action.outcome,
        nextStep: action.nextStep,
        continuation: action.continuation
      }
    };
    try {
      rail.dispatchEvent(new CustomEvent('massfront:story-choice', { bubbles: true, detail }));
    } catch (_) {}
    let result;
    try {
      if (action.onSelect) result = action.onSelect(detail);
      if (typeof options.onAction === 'function') options.onAction(detail);
    } catch (error) {
      if (typeof options.onError === 'function') options.onError(error, detail);
      return true;
    }
    if (result && typeof result.catch === 'function') {
      result.catch(error => {
        if (typeof options.onError === 'function') options.onError(error, detail);
      });
    }
    return true;
  }

  function receiveEvent(event) {
    if (!event || !event.detail) return false;
    const accepted = present(event.detail);
    if (!accepted) return false;
    try { event.detail.handled = true; } catch (_) {}
    if (event.cancelable && typeof event.preventDefault === 'function') event.preventDefault();
    return true;
  }

  function setScene(nextScene) {
    if (destroyed) return;
    const normalSpace = nextScene === 'system';
    if (scene === nextScene) {
      rail.setAttribute('aria-hidden', normalSpace ? 'false' : 'true');
      return;
    }
    if (!normalSpace) clearActiveTimer({ preserve: true });
    scene = nextScene;
    rail.setAttribute('aria-hidden', normalSpace ? 'false' : 'true');
    if (normalSpace) {
      if (current) {
        renderCurrent();
        scheduleCurrent();
      } else nextQueued();
    }
  }

  function clear() {
    clearActiveTimer();
    current = null;
    queue = [];
    hideTransmission();
  }

  function onActionClick(event) {
    const button = event.target?.closest?.('[data-story-action]');
    if (!button || !actions.contains(button)) return;
    select(button.dataset.storyAction);
  }

  actions.addEventListener('click', onActionClick);
  rail.setAttribute('aria-hidden', 'false');
  hideTransmission();

  return {
    present,
    playSequence,
    receiveEvent,
    select,
    dismiss: () => finishCurrent('dismissed'),
    clear,
    setScene,
    getState: () => ({
      scene,
      accepting: !destroyed && scene === 'system',
      current: cueSnapshot(current?.cue),
      queued: queue.map(entry => cueSnapshot(entry.cue))
    }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clear();
      actions.removeEventListener('click', onActionClick);
      rail.removeAttribute('aria-hidden');
    }
  };
}
