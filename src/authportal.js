;
;
/* ============================================================================
   AUTH PORTAL — email + password accounts, cloud save push/pull
   ----------------------------------------------------------------------------
   A second, independent account system alongside the one in src/account.js.
   That one is Google/Facebook sign-in — deliberately disabled (see the block
   comment at the top of account.js) because a shipped build has no way to
   supply OAuth app credentials. This one is plain email + password against a
   MASSFRONT-owned server (Cloudflare Worker + D1, see cloudflare/massfront-
   auth/), so it needs no third-party app registration to turn on — only a
   deployed worker and a URL.

   NAMESPACING. Every binding in this file is prefixed `AP` / `ap` (Auth
   Portal) and nothing here is declared with the same name as anything in
   account.js (AUTH_CFG, ACCOUNT, SYNC, ...). That is deliberate, not
   incidental: classic <script> files sharing one global scope means a second
   `let SYNC = ...` anywhere would be a page-breaking SyntaxError (redeclaring
   a lexical binding), and a second `function signOut(){}` would silently
   replace whichever one loaded second. Boot order (see boot.js) currently
   loads this file BEFORE account.js, so the risk is exactly backwards from
   what it looks like — collide with account.js and IT clobbers whatever THIS
   file defined, not the other way round. Distinct names sidestep the whole
   question. The two systems otherwise don't know about each other on
   purpose: this module reads only the small set of globals the task
   describes as shared (META, metaSave/metaLoad, PROFILES, activeProf,
   profSave, toast, sfx, encodeSave/decodeSave, renderMetaHead, renderProfile)
   and never reaches into account.js's private state or DOM (#accPanel,
   #accDlg, ...), so either module can keep changing without breaking this
   one.

   ENTRY POINT. A button is appended to the existing `.menuStrip` element on
   the start screen (chosen over Settings' `#setList`): menuStrip is static
   markup in index.html that this file only ever appends to once, whereas
   #setList is fully rebuilt from scratch by renderSettings() (src/game/
   meta.js) every time the Settings screen opens — appending there would get
   silently wiped the first time a player opened Settings, without a
   MutationObserver this module has no reason to need otherwise.

   HONEST DEGRADATION — the actual contract this file is held to:
     * No server configured at all -> say exactly that, in the panel, and
       point at the save-code path under Profile. Never show sign-in fields
       pretending they would work.
     * Server configured but unreachable -> say that, distinctly from "no
       server". Never fall back to a fake signed-in state.
     * A cached session survives a restart, but ONLY the client ever sets
       AP_SESSION from a real 2xx server response (register/login). A network
       failure while re-verifying it on boot marks it "unverified", it does
       not manufacture a new one, and an explicit 401 clears it immediately.

   ENDPOINT RESOLUTION mirrors updResolveEndpoint() in src/updater.js:
     1. window.MASSFRONT_AUTH_URL   — set by an embedder before boot
     2. a URL saved on this device  — the "Set server URL" affordance below
     3. assets/auth.json `syncUrl`  — same field src/account.js already reads
        for its own (disabled) cloud sync, so one shipped config file lights
        up both systems; this file never writes that JSON, only reads it
     4. nothing — and the panel says so, plainly
   ============================================================================ */

/* ---- state ------------------------------------------------------------------
   AP_SESSION is the ONLY source of truth for "signed in". It is either null,
   or {token,email,expiresAt,offline?} where every field except `offline` came
   from a real server response. Cached in localStorage so a restart doesn't
   sign a player out, but re-checked against /me on boot (apVerifySession). */
let AP_CFG = { endpoint: null, src: 'none', resolved: false };
let AP_SESSION = null;
let AP_BUSY = false;
let AP_TAB = 'signin';           // 'signin' | 'register'
let AP_LAST_PUSH = 0, AP_LAST_PULL = 0;
let AP_LAST_FOCUS = null;
let AP_CONFIRM_LAST_FOCUS = null;
let AP_CONFIRM_LAST_FOCUS_ID = '';
let AP_CONFIRM_FOCUS_TOKEN = 0;
let AP_SYNC_KIND = 'idle';       // idle | busy | success | error
let AP_SYNC_MESSAGE = '';
let AP_SESSION_EPOCH = 0;        // invalidates authenticated work across account switches

const AP_SESSION_KEY = 'massfront_authp_session_v1';
const AP_URL_KEY = 'massfront_authp_url';
const AP_REQUEST_TIMEOUT_MS = 12000;
const AP_NET_PROBE = {
  requests:0, responses:0, timeouts:0, networkErrors:0,
  staleResponses:0, unauthorized:0, httpErrors:0
};
/* Capability state starts maximally conservative and is never persisted. A
   new process or account must complete a fresh authenticated server handshake
   before any communication flag can become true. */
let AP_SOCIAL_CAPS={
  handshake:false,sessionEpoch:-1,checkedAt:0,version:0,
  friends:false,blocking:false,reporting:false,chat:false,presence:false,
  lobbies:false,invites:false,realtimeMatch:false,multiplayer:false,
  note:'Social capabilities have not been confirmed by this server.'
};

/* ---- endpoint resolution ----------------------------------------------------
   Deliberately no "packaged host -> relative path" tier the way updater.js
   has one: there is no same-origin `auth.json` convention to fall back to
   here, so 4 tiers is the whole chain (task spec names exactly these 4). */
async function apResolveEndpoint(){
  AP_CFG.resolved = true;
  if (typeof window !== 'undefined' && window.MASSFRONT_AUTH_URL){
    AP_CFG.src = 'embed';
    return (AP_CFG.endpoint = String(window.MASSFRONT_AUTH_URL));
  }
  try{
    const s = localStorage.getItem(AP_URL_KEY);
    if (s && s.trim()){ AP_CFG.src = 'device'; return (AP_CFG.endpoint = s.trim()); }
  }catch(e){}
  try{
    const r = await fetch('./assets/auth.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok){
      const c = await r.json();
      if (c && typeof c.syncUrl === 'string' && c.syncUrl.trim()){
        AP_CFG.src = 'config';
        return (AP_CFG.endpoint = c.syncUrl.trim());
      }
    }
  }catch(e){}
  AP_CFG.src = 'none';
  return (AP_CFG.endpoint = null);
}
function apEndpoint(){ return AP_CFG.endpoint || ''; }
function apSetEndpoint(url){
  try{
    if (url && url.trim()) localStorage.setItem(AP_URL_KEY, url.trim());
    else localStorage.removeItem(AP_URL_KEY);
  }catch(e){}
  AP_CFG = { endpoint: null, src: 'none', resolved: false };
  apResolveEndpoint().then(apRender);
}

/* ---- session persistence ----------------------------------------------------
   Storing {token,email,expiresAt} in localStorage, per the task spec ("not
   JWT-without-verification") — the token is an opaque, meaningless-on-its-own
   lookup key the server verifies against its own `sessions` table on every
   call. Losing this value just means signing in again; it is not a secret
   that unlocks anything by itself without the server's cooperation. */
function apSaveSession(){
  try{
    if (AP_SESSION) localStorage.setItem(AP_SESSION_KEY, JSON.stringify(AP_SESSION));
    else localStorage.removeItem(AP_SESSION_KEY);
  }catch(e){}
}
function apLoadSession(){
  try{
    const s = localStorage.getItem(AP_SESSION_KEY);
    if (s){
      const o = JSON.parse(s);
      const token=o&&typeof o.token==='string'?o.token:'';
      const email=o&&typeof o.email==='string'?o.email.trim().toLowerCase():'';
      const expiresAt=Number(o&&o.expiresAt)||0;
      /* Treat localStorage as untrusted input. The server still authenticates
         the opaque bearer token; these bounds keep a corrupted cache from
         becoming a multi-megabyte Authorization header or a fake live badge. */
      if(token.length>=16&&token.length<=4096&&email.length>0&&email.length<=254&&
         (!expiresAt||expiresAt>Date.now())){
        AP_SESSION={token,email,
          username:o.username==null?null:String(o.username).slice(0,32),
          ageOk:Object.prototype.hasOwnProperty.call(o,'ageOk')
            ? (o.ageOk===null?null:!!o.ageOk) : null,
          expiresAt,offline:!!o.offline};
        AP_SESSION_EPOCH++;
      }else{
        AP_SESSION=null;
        localStorage.removeItem(AP_SESSION_KEY);
      }
    }
  }catch(e){
    AP_SESSION = null;
    try{ localStorage.removeItem(AP_SESSION_KEY); }catch(ignore){}
  }
}
function apClearSession(){
  AP_SESSION_EPOCH++;
  AP_SESSION = null;
  apSocialResetCapabilities();
  AP_SYNC_KIND = 'idle'; AP_SYNC_MESSAGE = '';
  apSaveSession();
  /* Re-arm the launch gate. apGateSatisfied() latches mf_auth_gate_v1 on a
     successful sign-in AND on PLAY OFFLINE, but nothing ever cleared it, so
     once set the portal never appeared again — a player who signed out was
     left with no launch prompt at all. Signing out is exactly the moment the
     gate should ask again. */
  try{ localStorage.removeItem(AP_GATE_KEY); }catch(e){}
  if(typeof renderAccount==='function')renderAccount();
}

/* ---- validation --------------------------------------------------------------
   The server re-validates everything independently (never trust the client) —
   this copy exists purely so a typo is caught before a round trip, with text
   specific enough to actually fix. */
const AP_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function apValidEmail(raw){
  const s = String(raw || '').trim();
  if (!s) return { ok: false, msg: 'Enter your email address.' };
  if (s.length > 254) return { ok: false, msg: 'That email address is too long.' };
  if (!AP_EMAIL_RE.test(s))
    return { ok: false, msg: "That doesn't look like a valid email — check for a typo like a missing @ or domain." };
  return { ok: true, value: s.toLowerCase() };
}

/* ---- networking --------------------------------------------------------------
   apThrow tags every failure with a `.kind` (plus `.status` when the server
   answered at all) so apErrorText() can turn it into one honest sentence
   without every caller re-deriving what went wrong. */
function apThrow(kind, message, status){
  const e = new Error(message);
  e.kind = kind;
  if (status != null) e.status = status;
  throw e;
}
async function apRequest(method, path, body, needsAuth){
  /* Offline is a normal state here too. Refusing up front means the sign-in
     screen says "you are offline" instead of spinning for a timeout and then
     showing a server error that misdescribes what happened. */
  if(typeof netAllowed === 'function' && !netAllowed())
    apThrow('offline', 'This device is offline.');
  const base = apEndpoint();
  if (!base) apThrow('no_server', 'No account server is set up for this build.');
  const headers = { 'content-type': 'application/json' };
  let authToken = '', authEpoch = AP_SESSION_EPOCH;
  if (needsAuth){
    if (!AP_SESSION || !AP_SESSION.token) apThrow('no_session', 'Not signed in.');
    authToken = AP_SESSION.token;
    authEpoch = AP_SESSION_EPOCH;
    headers.authorization = 'Bearer ' + authToken;
  }
  const ctl=(typeof AbortController!=='undefined')?new AbortController():null;
  let timedOut=false;
  const timer=setTimeout(()=>{ timedOut=true; try{ if(ctl) ctl.abort(); }catch(e){} },AP_REQUEST_TIMEOUT_MS);
  let r;
  AP_NET_PROBE.requests++;
  try{
    r = await fetch(base.replace(/\/+$/, '') + path, {
      method, headers, cache: 'no-store',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctl?ctl.signal:undefined,
    });
  }catch(netErr){
    clearTimeout(timer);
    if(timedOut){ AP_NET_PROBE.timeouts++; apThrow('timeout', 'The account server took too long to answer.'); }
    AP_NET_PROBE.networkErrors++;
    apThrow('network', 'Could not reach the account server.');
  }
  let data = null;
  try{ data = await r.json(); }
  catch(bodyErr){
    if(timedOut){ AP_NET_PROBE.timeouts++; apThrow('timeout', 'The account server took too long to answer.'); }
    data = null;
  }finally{ clearTimeout(timer); }
  /* An authenticated response belongs to the token that sent it, not merely
     whichever account happens to be current when fetch resolves. Without this
     guard, a slow friends/save response from account A could repaint account B
     after sign-out + sign-in, and an old /me 401 could sign B out. */
  if(needsAuth&&(authEpoch!==AP_SESSION_EPOCH||!AP_SESSION||AP_SESSION.token!==authToken)){
    AP_NET_PROBE.staleResponses++;
    apThrow('stale_session', 'The signed-in account changed while that request was in flight.');
  }
  AP_NET_PROBE.responses++;
  if (!r.ok){
    AP_NET_PROBE.httpErrors++;
    if(needsAuth&&r.status===401){
      AP_NET_PROBE.unauthorized++;
      /* Still the same token (checked above), so clearing it cannot sign out a
         newer account. Every authenticated surface now recovers from expiry,
         not only the boot-time /me call. */
      apClearSession();
    }
    apThrow((data && data.error) || 'server', (data && data.message) || ('Server error (' + r.status + ')'), r.status);
  }
  return data;
}
function apErrorText(e){
  if (!e) return 'Something went wrong.';
  if (e.kind === 'no_server')
    return 'No account server is set up for this build. Your progress is safe on this device — use a game save file (Profile ▸ Local Save File) to move it to another phone.';
  if (e.kind === 'network')
    return "Can't reach the account server right now. Your progress is still safe on this device — try again later, or export a game save file instead.";
  if (e.kind === 'timeout')
    return 'The account server took too long to answer. Your game is unaffected — try again in a moment.';
  if (e.kind === 'stale_session')
    return 'The signed-in account changed while that request was running. Try the action again.';
  return e.message || 'Something went wrong — try again in a moment.';
}

/* ---- account actions ---------------------------------------------------------- */
function apSetSessionFrom(data, email){
  const u = data&&data.user || null;
  const token=data&&typeof data.token==='string'?data.token:'';
  const sessionEmail=String((u&&u.email)||email||'').trim().toLowerCase();
  if(token.length<16||token.length>4096||!apValidEmail(sessionEmail).ok)
    apThrow('bad_response','The account server returned an invalid session.');
  AP_SESSION_EPOCH++;
  apSocialResetCapabilities();
  AP_SESSION = { token, email: sessionEmail,
                 username: (u && u.username) ? String(u.username).slice(0,32) : null,
                 /* A MISSING ageOk means the server did not say — not that the
                    player answered and failed. Coercing absence to false is why
                    a perfectly good signed-in account meets the ONE-TIME AGE
                    CHECK panel on every single sign-in, and the CONFIRM button
                    behind it posts to a route the deployed worker does not
                    have. Only `false` should nag; `null` is "unknown, carry on".
                    Line 256 already gets this right with an `in` test — the two
                    paths into the same field disagreed. */
                 ageOk: (u && 'ageOk' in u) ? !!u.ageOk : null,
                 expiresAt: data.expiresAt || 0 };
  AP_SYNC_KIND = 'idle';
  AP_SYNC_MESSAGE = '';
  apSaveSession();
  if(typeof renderAccount==='function')renderAccount();
  apGateSatisfied();
  apGreet();
}
/* "Welcome Commander <name>" — shown once per sign-in, on the menu the player
   is about to land on. The name resolution lives in meta.js (mfGreetName) so the
   header greeting and this toast can never disagree. */
function apGreet(){
  let nm = 'Commander';
  try{ if (typeof mfGreetName === 'function') nm = mfGreetName(); }catch(e){}
  const line = 'Welcome Commander ' + nm;
  if (typeof renderMetaHead === 'function'){ try{ renderMetaHead(); }catch(e){} }
  setTimeout(() => {
    if (typeof toast === 'function'){ try{ toast(line); return; }catch(e){} }
    apToast(line);
  }, 260);
}
async function apRegister(email, password, username){
  const body = { email, password, ageOk: true };
  if (username) body.username = username;
  const data = await apRequest('POST', '/register', body, false);
  apSetSessionFrom(data, email);
}
/* ---- account deletion (App Store 5.1.1(v)) ---------------------------------
   Two-step by design: the first tap arms it, the second commits. Deletion is
   irreversible and the local career is erased too, so a single mis-tap must not
   be able to do it. */
async function apDeleteAccount(){
  const data = await apRequest('POST', '/account/delete', {}, true);
  apClearSession();
  return data;
}
async function apLogin(email, password){
  const data = await apRequest('POST', '/login', { email, password }, false);
  apSetSessionFrom(data, email);
}
async function apLogout(){
  try{ await apRequest('POST', '/logout', undefined, true); }catch(e){ /* best-effort — clear locally regardless */ }
  apClearSession();
}
/* Runs once at boot if a cached session exists. A confirmed-invalid session
   (401) is cleared — that's the server actively saying "this is not real
   anymore". Any other failure (network, 5xx) leaves the cached identity in
   place but marks it unverified rather than guessing either way. */
async function apVerifySession(){
  if (!AP_SESSION) return;
  const token=AP_SESSION.token, epoch=AP_SESSION_EPOCH;
  try{
    const data = await apRequest('GET', '/me', undefined, true);
    if(!AP_SESSION||AP_SESSION_EPOCH!==epoch||AP_SESSION.token!==token) return;
    AP_SESSION.email = (data.user && data.user.email) || AP_SESSION.email;
    if (data.user && 'username' in data.user) AP_SESSION.username = data.user.username;
    if (data.user && 'ageOk' in data.user) AP_SESSION.ageOk = !!data.user.ageOk;
    AP_SESSION.offline = false;
    apSaveSession();
  }catch(e){
    if(e.kind==='stale_session') return;
    if (e.status === 401){
      /* apRequest already clears the matching token. Do not clear again: a
         synchronous sign-in callback may already have installed a new one. */
      if(AP_SESSION&&AP_SESSION_EPOCH===epoch&&AP_SESSION.token===token) apClearSession();
      apToast('Your session expired — sign in again.');
    }else if (AP_SESSION&&AP_SESSION_EPOCH===epoch&&AP_SESSION.token===token) AP_SESSION.offline = true;
  }
  if(typeof renderAccount==='function')renderAccount();
  apRender();
}

/* ---- cloud save push / pull ----------------------------------------------------
   Reuses encodeSave()/decodeSave() from src/account.js unmodified — the same
   deflate+base64url blob a save code is, just PUT/GET instead of copy/paste.

   A successful sign-in performs a READ-ONLY comparison. It never guesses
   which copy is authoritative: different saves produce an explicit choice,
   while manual Pull and Push each require confirmation before replacing an
   existing career. This is deliberately more cautious than career-score-only
   auto-selection because two equal-score careers can still contain different
   gear, research purchases, settings, names or faction records. */
function apRelTime(ts){
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 8) return 'just now';
  if (s < 90) return 'moments ago';
  if (s < 5400) return Math.round(s / 60) + 'm ago';
  return Math.round(s / 3600) + 'h ago';
}
function apSyncSet(kind, message, busy){
  AP_SYNC_KIND = kind || 'idle';
  AP_SYNC_MESSAGE = message || '';
  AP_BUSY = !!busy;
  apRender();
}
function apLocalPayload(){
  if (typeof syncPayload === 'function') return syncPayload();
  return { v: 1, at: Date.now(), profile: typeof activeProf === 'function' ? activeProf() : null, meta: META };
}
function apStableValue(v){
  /* A Date has no own enumerable keys, so the object branch below would render
     it as '{}' locally while the round-tripped cloud copy is an ISO string.
     Normalise to the form the cloud side will always have. */
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return '[' + v.map(apStableValue).join(',') + ']';
  if (v && typeof v === 'object'){
    /* Drop undefined-valued keys. Object.keys() still lists a key set to
       undefined and JSON.stringify(undefined) returns the VALUE undefined,
       which concatenates as the literal "key":undefined - while the cloud copy
       has been through JSON round-tripping, which DROPS such keys. That is a
       permanent, invisible inequality between two identical saves. */
    const keys = Object.keys(v).filter(k => k !== 'at' && v[k] !== undefined).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + apStableValue(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
function apSavesEquivalent(a, b){
  if (!a || !b) return false;
  /* profile.id is a device-local slot name ('p1','p2'...) that syncPayload
     ships but which NO restore path ever writes back - applyCareerPayload and
     apCommitIncoming both copy only name/emblem/etc. So two copies of the same
     career made on different slots differ forever on a field the player cannot
     see or change. Exclude it rather than report an unactionable difference. */
  const prof = p => { if (!p || typeof p !== 'object') return p || null;
                      const q = Object.assign({}, p); delete q.id; return q; };
  return apStableValue({ profile: prof(a.profile), meta: a.meta || {} }) ===
         apStableValue({ profile: prof(b.profile), meta: b.meta || {} });
}
function apSaveStats(data){
  const m = data && data.meta || {};
  return (m.xp || 0).toLocaleString() + ' XP / ' + (m.cores || 0).toLocaleString() +
    ' CORES\n' + (m.researchData || 0).toLocaleString() + ' DATA / ' +
    (m.matches || 0).toLocaleString() + ' matches';
}
function apCompareMessage(local, cloud, cloudAt, lead){
  const when = cloudAt ? ' / saved ' + apRelTime(cloudAt) : '';
  return (lead || 'A cloud save was found.') + '\n\n' +
    'THIS DEVICE\n' + apSaveStats(local) + '\n\n' +
    'CLOUD' + when + '\n' + apSaveStats(cloud) + '\n\n' +
    'Nothing changes until you choose.';
}
async function apReadCloudSave(){
  const res = await apRequest('GET', '/save', undefined, true);
  if (!res || !res.payload) return { data: null, at: res && res.at || 0 };
  let data;
  try{ data = await decodeSave(res.payload); }
  catch(e){ apThrow('bad_save', 'The cloud save exists but could not be read. This device was not changed.'); }
  if (!data || !data.meta || typeof data.meta !== 'object')
    apThrow('bad_save', 'The cloud save is incomplete. This device was not changed.');
  return { data, at: Number(res.at || data.at || 0) };
}
function apCommitIncoming(data){
  META = Object.assign({}, META, data.meta);
  if (data.profile){
    const p = activeProf();
    if (p){
      p.name = data.profile.name || p.name;
      p.emblem = data.profile.emblem || p.emblem;
      if (typeof profSave === 'function') profSave();
    }
  }
  metaSave();
  if (typeof applyColor === 'function') applyColor();
  if (typeof applySettings === 'function') applySettings();
  if (typeof renderMetaHead === 'function') renderMetaHead();
  if (typeof renderProfile === 'function') renderProfile();
  if (typeof renderAccount === 'function') renderAccount();
  AP_LAST_PULL = Date.now();
  apSyncSet('success', 'SYNCED: Cloud save restored to this device - ' + apSaveStats(data), false);
  apToast('✓ Cloud save restored');
}
async function apWriteCloudSave(){
  apSyncSet('busy', 'SYNC: Uploading this device to your account…', true);
  try{
    const blob = await encodeSave();
    const res = await apRequest('PUT', '/save', { payload: blob }, true);
    AP_LAST_PUSH = Date.now();
    apSyncSet('success', 'SYNCED: This device is backed up to your account - ' + apSaveStats(apLocalPayload()), false);
    apToast('☁ Save pushed to the cloud');
    return res;
  }catch(e){
    const msg = apErrorText(e);
    apSyncSet('error', 'ERROR: ' + msg, false);
    apSetError(msg);
    return null;
  }
}
async function apPullSave(){
  if (!AP_SESSION || AP_BUSY) return;
  if (typeof sfx === 'function') sfx('ui');
  apSetError('');
  apSyncSet('busy', 'SYNC: Checking your cloud save…', true);
  try{
    const cloud = await apReadCloudSave();
    if (!cloud.data){
      apSyncSet('success', 'No cloud save exists yet. This device was not changed.', false);
      apConfirm(
        'There is no cloud save for this account yet. Back up this device now?',
        'BACK UP DEVICE', 'NOT NOW',
        () => { apWriteCloudSave(); },
        () => { apSyncSet('idle', 'No cloud save yet - this device remains your only copy', false); });
      return;
    }
    const local = apLocalPayload();
    apSyncSet('idle', 'Cloud save ready - waiting for your confirmation', false);
    apConfirm(
      apCompareMessage(local, cloud.data, cloud.at, 'Pull found a cloud save. Restore it onto this device?'),
      'RESTORE CLOUD', 'CANCEL',
      () => { apCommitIncoming(cloud.data); },
      () => { apSyncSet('idle', 'Restore canceled - this device was kept unchanged', false); });
  }catch(e){
    const msg = apErrorText(e);
    apSyncSet('error', 'ERROR: Pull failed: ' + msg, false);
    apSetError(msg);
  }
}
async function apPushSave(){
  if (!AP_SESSION || AP_BUSY) return;
  if (typeof sfx === 'function') sfx('ui');
  apSetError('');
  apSyncSet('busy', 'SYNC: Checking the existing cloud save…', true);
  try{
    const cloud = await apReadCloudSave();
    const local = apLocalPayload();
    if (!cloud.data){
      await apWriteCloudSave();
      return;
    }
    if (apSavesEquivalent(local, cloud.data)){
      AP_LAST_PUSH = Date.now();
      /* Equivalent means this session has reconciled with the account, even
         though there was nothing to write. Record that, or the push path stays
         disabled by the pulledFor guard and the device silently stops backing
         up for the rest of the session. */
      if(typeof cloudMarkPulled==='function') cloudMarkPulled();
      apSyncSet('success', 'SYNCED: Cloud and this device already match - nothing was overwritten', false);
      return;
    }
    apSyncSet('idle', 'Existing cloud save found - waiting for your confirmation', false);
    apConfirm(
      apCompareMessage(local, cloud.data, cloud.at, 'Push will replace the existing cloud save with this device.'),
      'OVERWRITE CLOUD', 'CANCEL',
      () => { apWriteCloudSave(); },
      () => { apSyncSet('idle', 'Upload canceled - the existing cloud save was kept', false); });
  }catch(e){
    const msg = apErrorText(e);
    apSyncSet('error', 'ERROR: Push failed: ' + msg, false);
    apSetError(msg);
  }
}

/* Sign-in is the moment players expect their account and device to meet. The
   comparison is automatic; the overwrite is not. Three explicit outcomes are
   offered when the saves differ, and a brand-new account offers a one-tap
   backup rather than silently creating one. */
async function apOfferSyncAfterSignIn(){
  if (!AP_SESSION || AP_BUSY) return;
  apSetError('');
  apSyncSet('busy', 'SYNC: Signed in - comparing this device with your cloud save…', true);
  try{
    const cloud = await apReadCloudSave();
    const local = apLocalPayload();
    if (!cloud.data){
      apSyncSet('idle', 'Signed in - no cloud save exists for this account yet', false);
      apConfirm(
        'Signed in successfully. This account has no cloud save yet. Back up this device now?',
        'BACK UP DEVICE', 'NOT NOW',
        () => { apWriteCloudSave(); },
        () => { apSyncSet('idle', 'Signed in - cloud backup skipped for now', false); });
      return;
    }
    if (apSavesEquivalent(local, cloud.data)){
      AP_LAST_PULL = Date.now();
      /* Equivalent means this session has reconciled with the account, even
         though there was nothing to write. Record that, or the push path stays
         disabled by the pulledFor guard and the device silently stops backing
         up for the rest of the session. */
      if(typeof cloudMarkPulled==='function') cloudMarkPulled();
      apSyncSet('success', 'SYNCED: Signed in - cloud and this device already match', false);
      return;
    }
    apSyncSet('idle', 'Signed in - choose which save you want to keep', false);
    apConfirm(
      apCompareMessage(local, cloud.data, cloud.at, 'Your account and this device contain different saves.'),
      'USE CLOUD', 'NOT NOW',
      () => { apCommitIncoming(cloud.data); },
      () => { apSyncSet('idle', 'Signed in - no save was changed', false); },
      'USE THIS DEVICE',
      () => { apWriteCloudSave(); });
  }catch(e){
    const msg = apErrorText(e);
    apSyncSet('error', 'ERROR: Signed in, but save comparison failed: ' + msg, false);
    apSetError(msg);
  }
}

/* ---- local confirm dialog ------------------------------------------------------
   Deliberately a second, separate confirm box rather than reaching into
   index.html's #accDlg (owned by account.js) — same visual language, zero
   shared DOM. Focus defaults to the non-destructive choice. */
function apConfirmBuildUI(){
  if (document.getElementById('apConfirmOverlay')) return;
  const ov = document.createElement('div');
  ov.id = 'apConfirmOverlay';
  ov.className = 'apConfirmOverlay';
  ov.innerHTML =
    '<div class="apConfirmBox" role="alertdialog" aria-modal="true" aria-labelledby="apConfirmTx">' +
      '<div id="apConfirmTx" class="apConfirmTx"></div>' +
      '<div class="apConfirmBtns">' +
        '<button type="button" class="accBtn ghost" id="apConfirmNo"></button>' +
        '<button type="button" class="accBtn" id="apConfirmAlt"></button>' +
        '<button type="button" class="accBtn" id="apConfirmYes"></button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
}
function apConfirmIsOpen(){
  const ov = document.getElementById('apConfirmOverlay');
  return !!(ov && ov.style.display === 'flex');
}
function apDismissConfirm(){
  if (!apConfirmIsOpen()) return false;
  const n = document.getElementById('apConfirmNo');
  if (!n || typeof n.click !== 'function') return false;
  n.click();
  return true;
}
function apRestoreConfirmFocus(node,id){
  requestAnimationFrame(() => {
    /* A callback may synchronously rerender #apBody. Prefer the original node,
       then its stable id in the new DOM, then the parent modal's first control. */
    if (apConfirmIsOpen()) return;
    const parent = document.getElementById('apOverlay');
    const valid = target => !!(target && target !== document.body &&
      target.isConnected !== false && parent && parent.contains(target));
    let target = valid(node) ? node : null;
    if (!target && id){
      const replacement = document.getElementById(id);
      if (valid(replacement)) target = replacement;
    }
    if (!target && parent && parent.style.display !== 'none'){
      target = Array.prototype.slice.call(parent.querySelectorAll('button,input,[tabindex]'))
        .find(el => !el.disabled && el.offsetParent !== null) || null;
    }
    if (target && typeof target.focus === 'function') target.focus();
  });
}
function apConfirm(message, yesLabel, noLabel, onYes, onNo, altLabel, onAlt){
  apConfirmBuildUI();
  const ov = document.getElementById('apConfirmOverlay');
  document.getElementById('apConfirmTx').textContent = message;
  const y = document.getElementById('apConfirmYes'), n = document.getElementById('apConfirmNo');
  const a = document.getElementById('apConfirmAlt'), row = y.parentElement;
  y.textContent = yesLabel || 'CONFIRM';
  n.textContent = noLabel || 'CANCEL';
  a.textContent = altLabel || '';
  a.style.display = altLabel ? '' : 'none';
  row.classList.toggle('apConfirmTriple', !!altLabel);
  AP_CONFIRM_LAST_FOCUS = document.activeElement;
  AP_CONFIRM_LAST_FOCUS_ID = AP_CONFIRM_LAST_FOCUS && AP_CONFIRM_LAST_FOCUS.id || '';
  const focusToken = ++AP_CONFIRM_FOCUS_TOKEN;
  ov.style.display = 'flex';
  const close = () => {
    const restore = AP_CONFIRM_LAST_FOCUS, restoreId = AP_CONFIRM_LAST_FOCUS_ID;
    AP_CONFIRM_LAST_FOCUS = null; AP_CONFIRM_LAST_FOCUS_ID = ''; AP_CONFIRM_FOCUS_TOKEN++;
    ov.style.display = 'none'; y.onclick = null; n.onclick = null; a.onclick = null;
    return [restore, restoreId];
  };
  const finish = callback => {
    const restore = close();
    try{ if (callback) callback(); }
    finally{ apRestoreConfirmFocus(restore[0], restore[1]); }
  };
  y.onclick = () => finish(onYes);
  n.onclick = () => finish(onNo);
  a.onclick = () => finish(onAlt);
  requestAnimationFrame(() => {
    if (apConfirmIsOpen() && AP_CONFIRM_FOCUS_TOKEN === focusToken) n.focus();
  });
}

/* ---- small helpers -------------------------------------------------------------- */
function apToast(msg){ if (typeof toast === 'function') toast(msg); }
function apEsc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function apSetError(msg){
  const el = document.getElementById('apErr');
  if (!el) return;
  if (msg){ el.textContent = msg; el.style.display = 'block'; }
  else { el.textContent = ''; el.style.display = 'none'; }
}
function apRenderBusy(b){
  AP_BUSY = b;
  const body = document.getElementById('apBody');
  if (body) body.classList.toggle('apBusy', b);
}

/* ---- UI: html builders ------------------------------------------------------------ */
function apNoServerHtml(){
  return '' +
    '<div class="apEmpty">' +
      '<div class="apEmptyEm">☁</div>' +
      '<div class="apEmptyTx">No account server is set up for this build.</div>' +
      '<div class="apEmptyHint">Your progress is already safe — it\'s saved on this device. To carry a career to another phone, export a file from <b>Profile ▸ Local Save File</b>.</div>' +
      '<button type="button" class="accBtn ghost" id="apSetSrvBtn">⚙ Set server URL</button>' +
    '</div>';
}
function apCheckingHtml(){
  return '<div class="apEmpty"><div class="spin apEmptyEm">◈</div><div class="apEmptyTx">Checking for an account server…</div></div>';
}
function apFormHtml(){
  const signIn = AP_TAB !== 'register';
  return '' +
    '<div class="apTabs" role="tablist">' +
      '<button type="button" class="apTab' + (signIn ? ' on' : '') + '" role="tab" aria-selected="' + signIn + '" data-tab="signin">SIGN IN</button>' +
      '<button type="button" class="apTab' + (!signIn ? ' on' : '') + '" role="tab" aria-selected="' + (!signIn) + '" data-tab="register">REGISTER</button>' +
    '</div>' +
    '<form id="apForm" novalidate>' +
      '<label class="apLbl" for="apEmail">EMAIL</label>' +
      '<input id="apEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="you@example.com">' +
      '<label class="apLbl" for="apPass">PASSWORD</label>' +
      '<div class="apPassWrap">' +
        '<input id="apPass" type="password" autocomplete="' + (signIn ? 'current-password' : 'new-password') + '" placeholder="' + (signIn ? 'Your password' : 'At least 8 characters') + '">' +
        '<button type="button" class="apEye" id="apEyeBtn" aria-label="Show password" aria-pressed="false">👁</button>' +
      '</div>' +
      (signIn ? '' :
        '<label class="apLbl" for="apPass2">CONFIRM PASSWORD</label>' +
        '<input id="apPass2" type="password" autocomplete="new-password" placeholder="Type it again">' +
        '<label class="apLbl" for="apUser">USERNAME <i>(optional — how friends find you)</i></label>' +
        '<input id="apUser" type="text" autocomplete="username" autocapitalize="off" autocorrect="off" ' +
          'spellcheck="false" maxlength="16" placeholder="3-16 characters, a-z 0-9 _">' +
        apAgeFieldHtml()) +
      '<div class="apErr" id="apErr" role="alert" style="display:none"></div>' +
      '<button type="submit" class="mbtn apSubmit" id="apSubmitBtn">' + (signIn ? '▶ SIGN IN' : '▶ CREATE ACCOUNT') + '</button>' +
    '</form>' +
    '<div class="apFoot">No account needed — a real <b>.mfsave file</b> moves your career between phones. Profile ▸ Local Save File.</div>';
}
/* ---- age gate ---------------------------------------------------------------
   MASSFRONT has player-to-player communication, so it is a 13+ product.

   This is a NEUTRAL age screen, which is the part that matters: it asks for a
   birth month and year rather than "are you 13?", because a yes/no question
   about an age limit tells the person the answer they need to give. The date is
   computed HERE and only the boolean leaves the device — the server never
   receives or stores a date of birth. Collecting a child's birth date in order
   to decide whether you are allowed to collect a child's data is precisely the
   trap to avoid.

   A refusal is remembered locally so the form cannot simply be re-rolled. It is
   a screen, not a proof of age; nothing on the open internet is. */
const AP_AGE_MIN = 13;
const AP_AGE_FAIL_KEY = 'mf_age_refused_v1';
function apAgeRefused(){
  try{ return localStorage.getItem(AP_AGE_FAIL_KEY) === '1'; }catch(e){ return false; }
}
function apAgeFieldHtml(){
  const now = new Date(), thisYear = now.getFullYear();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let mo = '<option value="">Month</option>';
  for (let i = 0; i < 12; i++) mo += '<option value="' + i + '">' + months[i] + '</option>';
  let yr = '<option value="">Year</option>';
  for (let y = thisYear; y >= thisYear - 100; y--) yr += '<option value="' + y + '">' + y + '</option>';
  return '<label class="apLbl" for="apDobY">DATE OF BIRTH</label>' +
    '<div class="apDobRow">' +
      '<select id="apDobM" aria-label="Birth month">' + mo + '</select>' +
      '<select id="apDobY" aria-label="Birth year">' + yr + '</select>' +
    '</div>' +
    '<div class="apDobNote">Used once to check you are ' + AP_AGE_MIN +
      ' or over. It is not sent anywhere and not stored.</div>';
}
/* null = not answered yet; true/false = the computed result. */
function apAgeOk(){
  const mEl = document.getElementById('apDobM'), yEl = document.getElementById('apDobY');
  if (!mEl || !yEl || mEl.value === '' || yEl.value === '') return null;
  const m = parseInt(mEl.value, 10), y = parseInt(yEl.value, 10);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() < m) age--;          // birthday not reached this year
  return age >= AP_AGE_MIN;
}

function apSignedInHtml(){
  const s = AP_SESSION;
  const statusTx =
    AP_SYNC_MESSAGE ? AP_SYNC_MESSAGE :
    AP_BUSY ? '☁ Working…' :
    s.offline ? '⚠ Could not verify this session — check your connection' :
    (AP_LAST_PUSH || AP_LAST_PULL) ? '☁ Last synced ' + apRelTime(Math.max(AP_LAST_PUSH, AP_LAST_PULL)) :
    '☁ Not synced yet this session';
  const statusClass = AP_SYNC_KIND === 'success' ? ' apSyncOk' : AP_SYNC_KIND === 'error' ? ' apSyncError' :
    AP_SYNC_KIND === 'busy' ? ' apSyncBusy' : '';
  const disabled = AP_BUSY ? ' disabled aria-disabled="true"' : '';
  return '' +
    '<div class="apAccHead">' +
      '<div class="apAv">✉</div>' +
      '<div class="apWho"><b>' + apEsc(s.username || s.email) + '</b><span>' +
        (s.username ? apEsc(s.email) + ' · ' : '') + 'Signed in' + (s.offline ? ' · unverified' : '') + '</span></div>' +
    '</div>' +
    /* Accounts created before the age gate shipped carry ageOk=0. They are
       asked once, here, and no social surface opens until they answer. */
    (s.ageOk === false ?
      '<div class="apAgeAsk">' +
        '<b>ONE-TIME AGE CHECK</b>' +
        '<p>MASSFRONT is adding player-to-player features, so accounts need to confirm they are ' +
          AP_AGE_MIN + ' or over. Nothing is stored except the answer.</p>' +
        apAgeFieldHtml() +
        '<button type="button" class="accBtn" id="apAgeBtn"' + disabled + '>CONFIRM</button>' +
      '</div>' : '') +
    '<div class="apUserRow">' +
      '<label class="apLbl" for="apUserSet">USERNAME</label>' +
      '<div class="apUserSetRow">' +
        '<input id="apUserSet" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" ' +
          'maxlength="16" placeholder="3-16 characters" value="' + apEsc(s.username || '') + '">' +
        '<button type="button" class="accBtn" id="apUserBtn"' + disabled + '>' +
          (s.username ? 'CHANGE' : 'CLAIM') + '</button>' +
      '</div>' +
      '<div class="apDobNote">This is how friends will find you. Your email is never shown to other players.</div>' +
    '</div>' +
    '<div class="apSyncRow' + statusClass + '" role="status" aria-live="polite">' + apEsc(statusTx) + '</div>' +
    '<div class="apErr" id="apErr" role="alert" style="display:none"></div>' +
    '<div class="apBtnCol">' +
      '<button type="button" class="accBtn" id="apPushBtn"' + disabled + '>⬆ PUSH SAVE TO CLOUD</button>' +
      '<button type="button" class="accBtn" id="apPullBtn"' + disabled + '>⬇ PULL SAVE FROM CLOUD</button>' +
      '<button type="button" class="accBtn ghost" id="apSignOutBtn"' + disabled + '>SIGN OUT</button>' +
      '<button type="button" class="accBtn danger" id="apDelBtn"' + disabled + '>' +
        (AP_DEL_ARMED ? '⚠ TAP AGAIN TO DELETE PERMANENTLY' : 'DELETE ACCOUNT') + '</button>' +
    '</div>';
}

/* ---- UI: wiring (re-run every time the innerHTML above is rebuilt) ------------------ */
function apWireNoServer(){
  const b = document.getElementById('apSetSrvBtn');
  if (b) apTapBind(b, () => {
    let v = null;
    try{ v = prompt('Account server URL\n\nThe https:// base address of your MASSFRONT auth worker.\n\nLeave blank to clear.', apEndpoint() || ''); }catch(e){}
    if (v === null) return;
    apSetEndpoint(v);
    apToast(v.trim() ? 'Saved — checking…' : 'Cleared');
  });
}
function apWireForm(){
  const form = document.getElementById('apForm');
  /* Keeps Enter and assistive-tech activation working. */
  if (form) form.addEventListener('submit', e => { e.preventDefault(); apSubmit(); });
  document.querySelectorAll('#apBody .apTab').forEach(b => {
    apTapBind(b, () => {
      AP_TAB = b.dataset.tab;
      apRenderSignedOut();
      const em = document.getElementById('apEmail'); if (em) em.focus();
    });
  });
  /* The submit control is <button type="submit">: when the click is cancelled the
     form never gets a submit event either, so drive apSubmit() from the pointer
     binding. Only when mfBindTap is present — its fallback would otherwise fire
     alongside the form's own submit handler and double-submit. */
  if (typeof mfBindTap === 'function')
    apTapBind(document.getElementById('apSubmitBtn'), () => { if (!AP_BUSY) apSubmit(); });
  apTapBind(document.getElementById('apEyeBtn'), () => {
    const eye = document.getElementById('apEyeBtn');
    const p = document.getElementById('apPass'); if (!p || !eye) return;
    const show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', String(show));
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
}
function apWireSignedIn(){
  /* Samsung Internet and Android WebView may cancel the compatibility click
     after a small finger drift inside this scroll area. Use the game's
     pointer-up/slop binding when available; click remains the keyboard path. */
  const bind = (el, fn) => {
    if (!el) return;
    if (typeof mfBindTap === 'function') mfBindTap(el, fn);
    else el.addEventListener('click', fn);
  };
  bind(document.getElementById('apPushBtn'), apPushSave);
  bind(document.getElementById('apPullBtn'), apPullSave);
  bind(document.getElementById('apSignOutBtn'), apDoSignOut);
  bind(document.getElementById('apUserBtn'), apDoClaimUsername);
  bind(document.getElementById('apDelBtn'), apDoDeleteAccount);
  bind(document.getElementById('apAgeBtn'), apDoConfirmAge);
}

/* An endpoint this build knows about but the deployed worker does not yet
   answer comes back 404. Say so plainly rather than showing a generic failure —
   "not deployed yet" and "broken" are different problems for whoever reads it. */
function apNotDeployed(e){
  return e && (e.status === 404 || e.kind === 'no_server');
}
async function apDoClaimUsername(){
  if (AP_BUSY) return;
  const el = document.getElementById('apUserSet');
  const v = (el && el.value || '').trim();
  if (!/^[a-z0-9_]{3,16}$/i.test(v)){
    apSetError('Username must be 3-16 characters — letters, numbers and underscore only.');
    if (el) el.focus(); return;
  }
  apSetError(''); AP_BUSY = true; apRenderBusy(true);
  try{
    const d = await apRequest('POST', '/username', { username: v }, true);
    if (AP_SESSION) { AP_SESSION.username = d.username || v; apSaveSession(); }
    sfx('level'); apToast('✓ Username set to ' + (d.username || v));
  }catch(e){
    sfx('alarm');
    apSetError(apNotDeployed(e)
      ? 'Usernames need the updated account server — it has not been deployed yet.'
      : apErrorText(e));
  }
  AP_BUSY = false; apRenderBusy(false); apRender();
  if (typeof renderMetaHead === 'function') renderMetaHead();
}
async function apDoConfirmAge(){
  if (AP_BUSY) return;
  const ok = apAgeOk();
  if (ok === null){ apSetError('Select your date of birth to continue.'); return; }
  if (ok === false){
    apSetError('MASSFRONT accounts are for players ' + AP_AGE_MIN + ' and over. '
      + 'You can keep playing on this device — your progress is saved locally.');
    return;
  }
  apSetError(''); AP_BUSY = true; apRenderBusy(true);
  try{
    await apRequest('POST', '/age', { ageOk: true }, true);
    if (AP_SESSION) { AP_SESSION.ageOk = true; apSaveSession(); }
    sfx('level'); apToast('✓ Thanks — that is confirmed.');
  }catch(e){
    sfx('alarm');
    apSetError(apNotDeployed(e)
      ? 'This needs the updated account server — it has not been deployed yet.'
      : apErrorText(e));
  }
  AP_BUSY = false; apRenderBusy(false); apRender();
}
/* Two taps, and the second one says exactly what it does. The arm resets on any
   re-render, so leaving the panel and coming back does not leave it primed. */
let AP_DEL_ARMED = false;
async function apDoDeleteAccount(){
  if (AP_BUSY) return;
  if (!AP_DEL_ARMED){
    AP_DEL_ARMED = true; sfx('alarm');
    apSetError('This permanently deletes your account and its cloud save. '
      + 'Your career on THIS device is not touched. Tap again to confirm.');
    apRender(); return;
  }
  AP_DEL_ARMED = false;
  apSetError(''); AP_BUSY = true; apRenderBusy(true);
  try{
    await apDeleteAccount();
    sfx('level'); apToast('✓ Account deleted.');
  }catch(e){
    sfx('alarm');
    apSetError(apNotDeployed(e)
      ? 'Account deletion needs the updated account server — it has not been deployed yet.'
      : apErrorText(e));
  }
  AP_BUSY = false; apRenderBusy(false); apRender();
}
async function apDoSignOut(){
  if (AP_BUSY) return;
  sfx('ui');
  AP_BUSY = true; apRenderBusy(true);
  await apLogout();
  AP_BUSY = false;
  apToast('Signed out — your progress stays on this device');
  apRender();
}

/* ---- UI: state dispatch ------------------------------------------------------------ */
function apRenderNoServer(){ const b = document.getElementById('apBody'); if (!b) return; b.innerHTML = apNoServerHtml(); apWireNoServer(); }
function apRenderSignedOut(){ const b = document.getElementById('apBody'); if (!b) return; b.innerHTML = apFormHtml(); apWireForm(); }
function apRenderSignedIn(){ const b = document.getElementById('apBody'); if (!b) return; b.innerHTML = apSignedInHtml(); apWireSignedIn(); }
function apRender(){
  const body = document.getElementById('apBody');
  if (!body) return;
  if (!AP_CFG.resolved){ body.innerHTML = apCheckingHtml(); return; }
  if (!apEndpoint()){ apRenderNoServer(); return; }
  if (AP_SESSION){ apRenderSignedIn(); return; }
  apRenderSignedOut();
}

/* ---- form submit ------------------------------------------------------------------- */
async function apSubmit(){
  if (AP_BUSY) return;
  const emailEl = document.getElementById('apEmail');
  const passEl = document.getElementById('apPass');
  const pass2El = document.getElementById('apPass2');
  if (!emailEl || !passEl) return;
  const isRegister = AP_TAB === 'register';

  const ev = apValidEmail(emailEl.value);
  if (!ev.ok){ apSetError(ev.msg); emailEl.focus(); return; }
  const pass = passEl.value || '';
  if (!pass){ apSetError('Enter a password.'); passEl.focus(); return; }
  if (pass.length < 8){ apSetError('Password needs at least 8 characters.'); passEl.focus(); return; }
  if (pass.length > 256){ apSetError('Password is too long — 256 characters max.'); passEl.focus(); return; }
  let uname = '';
  if (isRegister){
    const pass2 = (pass2El && pass2El.value) || '';
    if (pass !== pass2){ apSetError("Passwords don't match — check both fields."); if (pass2El) pass2El.focus(); return; }
    const uEl = document.getElementById('apUser');
    uname = (uEl && uEl.value || '').trim();
    if (uname && !/^[a-z0-9_]{3,16}$/i.test(uname)){
      apSetError('Username must be 3-16 characters — letters, numbers and underscore only.');
      if (uEl) uEl.focus(); return;
    }
    /* The gate runs BEFORE the network call, so an under-13 registration never
       creates an account and never transmits anything. */
    const ok = apAgeOk();
    if (ok === null){ apSetError('Select your date of birth to continue.');
      const d=document.getElementById('apDobM'); if(d) d.focus(); return; }
    if (ok === false){
      try{ localStorage.setItem(AP_AGE_FAIL_KEY, '1'); }catch(e){}
      apSetError('You need to be ' + AP_AGE_MIN + ' or over to create a MASSFRONT account. '
        + 'You can keep playing on this device — your progress is saved locally.');
      return;
    }
  }
  apSetError('');
  AP_BUSY = true; apRenderBusy(true);
  try{
    if (isRegister) await apRegister(ev.value, pass, uname);
    else await apLogin(ev.value, pass);
    AP_BUSY = false; apRenderBusy(false);
    sfx('level');
    apToast(isRegister ? '✓ Account created — signed in as ' + ev.value : '✓ Signed in as ' + ev.value);
    apRender();
    await apOfferSyncAfterSignIn();
  }catch(e){
    AP_BUSY = false; apRenderBusy(false);
    sfx('alarm');
    if (e.status === 409){
      /* Registering an email that already exists — the useful next step is
         signing in, not staring at an error, so switch there and keep what
         they typed. */
      AP_TAB = 'signin';
      apRenderSignedOut();
      const em = document.getElementById('apEmail'); if (em) em.value = ev.value;
      apSetError(apErrorText(e));
      const pw = document.getElementById('apPass'); if (pw) pw.focus();
    } else {
      apSetError(apErrorText(e));
    }
  }
}

/* ---- modal shell: open / close / focus management -------------------------------- */
function apKeyHandler(e){
  if (e.key === 'Escape'){
    e.preventDefault(); e.stopPropagation();
    if (!apDismissConfirm()) apClose();
    return;
  }
  if (e.key === 'Tab') apTrapFocus(e);
}
function apTrapFocus(e){
  const ov = apConfirmIsOpen()
    ? document.getElementById('apConfirmOverlay')
    : document.getElementById('apOverlay');
  if (!ov) return;
  const items = Array.prototype.slice.call(ov.querySelectorAll('button,input,[tabindex]'))
    .filter(el => !el.disabled && el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (!ov.contains(document.activeElement)){
    e.preventDefault(); (e.shiftKey ? last : first).focus(); return;
  }
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}
function apOpen(triggerEl){
  const ov = document.getElementById('apOverlay');
  if (!ov) return;
  /* Prefer an explicit trigger element over document.activeElement: apBindTap
     calls preventDefault() on the opening pointerdown, so the browser never
     runs its default "focus the target" action, and for a mouse-initiated
     open document.activeElement at this instant is still whatever had focus
     BEFORE the click (often <body>, nothing sensible to return to later).
     Passing the actual trigger button makes "restore focus on close" work
     for mouse/touch users too, not just keyboard users (who already have it
     focused via Tab before Enter/Space activates it, so document.activeElement
     happens to be correct for them regardless). */
  AP_LAST_FOCUS = triggerEl || document.activeElement;
  ov.style.display = 'flex';
  document.addEventListener('keydown', apKeyHandler, true);
  apRender();
  /* Synchronous, not requestAnimationFrame: the display:flex above already
     took effect on this same tick, so the close button is focusable right
     now. Deferring a frame used to lose the race against a keyboard user who
     Tabs immediately after Enter/Space-activating the trigger — focus was
     still outside the modal when their Tab landed, so the (also-correct)
     trap below had nothing to trap yet and let them tab into the page
     underneath. */
  const f = ov.querySelector('input,button');
  if (f && f.focus) f.focus();
}
function apClose(){
  AP_DEL_ARMED = false;
  const ov = document.getElementById('apOverlay');
  if (!ov) return;
  /* Dismissing the gate by ✕ counts as answering it — otherwise the same modal
     returns on the next launch and reads as a bug. */
  if (typeof AP_GATE_OPEN !== 'undefined' && AP_GATE_OPEN){
    AP_GATE_OPEN = false;
    try{ localStorage.setItem(AP_GATE_KEY, '1'); }catch(e){}
  }
  if (typeof apGateFoot === 'function') apGateFoot(false);
  ov.style.display = 'none';
  document.removeEventListener('keydown', apKeyHandler, true);
  if (AP_LAST_FOCUS && AP_LAST_FOCUS.focus) AP_LAST_FOCUS.focus();
}

/* ---- build the modal DOM once (createElement/innerHTML, appended to body) --------- */
function apBuildUI(){
  if (document.getElementById('apOverlay')) return;
  const ov = document.createElement('div');
  ov.id = 'apOverlay';
  ov.className = 'apOverlay';
  ov.style.display = 'none';
  ov.innerHTML =
    '<div class="apBox" role="dialog" aria-modal="true" aria-labelledby="apTitleTx">' +
      '<div class="apHead">' +
        '<div id="apTitleTx" class="apTitleTx">⬡ ACCOUNT</div>' +
        '<button type="button" class="apClose" id="apCloseBtn" aria-label="Close account panel">✕</button>' +
      '</div>' +
      '<div class="apScroll" id="apBody"></div>' +
    '</div>';
  document.body.appendChild(ov);
  apTapBind(document.getElementById('apCloseBtn'), apClose);
  ov.addEventListener('pointerdown', (e) => {
    if (e.target === ov) apClose();
  });
  apConfirmBuildUI();
}

/* ---- entry point: one button appended into the existing .menuStrip ---------------- */
/* pointerdown alone (what the sibling .sbtn buttons in index.html use, via
   main.js) never fires for a keyboard Enter/Space activation — only a real
   pointer/touch/mouse interaction dispatches pointerdown. click fires for
   both, but binding click ALONE reintroduces the ~300ms tap latency this
   game avoids everywhere else. Binding both with a debounce (a real tap
   fires pointerdown then click within the same gesture) is exactly the
   pattern src/updater.js's own tap() helper uses for this identical
   problem — mirrored here rather than imported, since nothing in this file
   may reference updater.js internals. */
function apBindTap(el, fn){
  let last = 0;
  const go = e => {
    /* An OTA restart can finish while the install finger is still lifting.
       The replacement shell publishes this brief guard so that release cannot
       be mistaken for a fresh tap on the newly injected Account button. */
    /* Honour it ONLY within its intended brief window. That guard is a bare
       window value that the boot/OTA shell parks far in the future
       (Number.MAX_SAFE_INTEGER) until a release hook lowers it to ~now+450ms.
       On the packaged-into-body OTA path that hook can fail to run, stranding
       the value at the sentinel — and because apBindTap is the ONLY input path
       that reads it, that leaves this Account button (hence the whole portal)
       permanently dead while every pointerdown/mfBindTap menu control, which
       never consults the guard, keeps working. A real install-gesture guard is
       never more than a fraction of a second out, so treat any deadline past a
       wide ceiling as that stuck sentinel and ignore it rather than suppressing
       the tap forever. */
    const until = Number(window.__MASSFRONT_INPUT_GUARD_UNTIL||0);
    const nowMs = Date.now();
    if(nowMs < until && until - nowMs <= 8000){
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    e.stopPropagation();
    /* Without this, the browser's own default action for pointerdown
       focuses `el` (the trigger) AFTER this handler returns — clobbering
       the focus apOpen() just moved onto the close button inside the
       modal. Harmless to prevent here: el is a plain <button>, not
       something that depends on default pointerdown behaviour (text
       selection, scrolling, drag). */
    e.preventDefault();
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (t - last < 350) return;
    last = t;
    fn();
  };
  el.addEventListener('pointerdown', go);
  el.addEventListener('click', go);
}

/* Every control INSIDE this dialog was bound with a plain click. Android WebView
   cancels the compatibility click after a few pixels of finger drift, so on a
   phone the SIGN IN / REGISTER tabs, the submit button and the reveal toggle
   were completely dead while the pointerdown-bound Account button that opened
   the dialog still worked — exactly the symptom reported. apWireSignedIn()
   already guarded its own buttons this way; the signed-OUT form, which is what
   a new player sees, was missed. Same binding, one shared helper. */
function apTapBind(el, fn){
  if (!el) return false;
  if (typeof mfBindTap === 'function'){ mfBindTap(el, fn); return true; }
  el.addEventListener('click', fn);
  return false;
}
/* Account used to be a fifth icon in .menuStrip while Profile ALREADY carried an
   ACCOUNT tab — two doors into one room, and the strip door was the one nobody
   could find a reason for. The tab is now the only route. Any stale button from
   a previous shell is removed, and .apStrip5 is dropped so the strip returns to
   its four-column grid. */
function apInjectMenuButton(){
  const old = document.getElementById('acctBtn');
  if (old && old.parentNode) old.parentNode.removeChild(old);
  const strip = document.querySelector('.menuStrip');
  if (strip) strip.classList.remove('apStrip5');
}

/* ---- first-run gate ---------------------------------------------------------------
   The sign-in screen now appears between the launch title and the menu. It is a
   GATE, not a WALL: "PLAY OFFLINE" dismisses it and the flag below stops it ever
   asking again, so the game keeps working with no signal and no account. That
   distinction is deliberate — a hard requirement would break offline play, put a
   network call before any consent, and pull App Store 5.1.1(v)'s account-deletion
   requirement onto a build that has no deletion path yet. */
const AP_GATE_KEY = 'mf_auth_gate_v1';
let AP_GATE_OPEN = false;
function apGateSeen(){
  try{ return localStorage.getItem(AP_GATE_KEY) === '1'; }catch(e){ return true; }
}
function apGateSatisfied(){
  try{ localStorage.setItem(AP_GATE_KEY, '1'); }catch(e){}
  if (AP_GATE_OPEN){ AP_GATE_OPEN = false; apClose(); }
}
function apGateFoot(on){
  const box = document.querySelector('#apOverlay .apBox');
  let f = document.getElementById('apGateFoot');
  if (!on){ if (f && f.parentNode) f.parentNode.removeChild(f); return; }
  if (!box || f) return;
  f = document.createElement('div');
  f.id = 'apGateFoot';
  f.innerHTML = '<button type="button" class="mbtn alt" id="apOfflineBtn">PLAY OFFLINE</button>' +
                '<small>You can sign in any time from Profile ▸ Account. ' +
                'Your progress is saved on this device either way.</small>';
  box.appendChild(f);
  apTapBind(document.getElementById('apOfflineBtn'), () => {
    if (typeof sfx === 'function'){ try{ sfx('ui'); }catch(e){} }
    apGateSatisfied();
  });
}
/* Called by intro.js the moment the launch title hands off to the front end. */
function mfAuthGate(){
  try{
    if (AP_SESSION) return;        // already signed in — nothing to ask
    if (apGateSeen()) return;      // asked once; never nag again
    if (!document.getElementById('apOverlay')) return;
    AP_GATE_OPEN = true;
    apGateFoot(true);
    /* On the gate this modal is a welcome, not a settings panel. */
    const t = document.getElementById('apTitleTx');
    if (t) t.textContent = '\u2b21 SIGN IN OR REGISTER';
    apOpen(null);
  }catch(e){ AP_GATE_OPEN = false; }
}

/* ---- boot -------------------------------------------------------------------------- */
function initAuthPortal(){
  apBuildUI();
  apInjectMenuButton();
  apLoadSession();
  apResolveEndpoint().then(() => {
    apRender();
    if (AP_SESSION) apVerifySession();
  });
}

/* ============================================================================
   SOCIAL CLIENT — thin, NON-THROWING wrappers over apRequest
   ============================================================================
   The verification-first server exposes:

     GET  /social/friends            -> {friends:[…]}                  (server pre-filters blocks)
     GET  /social/requests           -> {requests:[…]}
     POST /social/friend/request  {username}   exact username, no search, no discovery
     POST /social/friend/respond  {id,accept}
     POST /social/block    {username}
     POST /social/unblock  {username}
     POST /social/report   {username,reason,context?}

   and refuses an account that may not use social at all with 403 plus one of
   three codes: 'unverified', 'age_restricted', 'social_banned'. apRequest
   already lifts {error,message} off a non-2xx body onto e.kind/e.message, so
   those three arrive here intact.

   Everything below RESOLVES. Not one of these functions rejects, because the
   caller is a mailbox section that repaints mid-match: an unhandled rejection
   from a friends list is not allowed to be the reason a player loses a game.
   Failure is {ok:false, code, message} and the message is always a sentence a
   player can read.

   THE 'offline' DEFECT ENDS HERE. apRequest refuses an offline device by
   throwing `new Error('offline')` — a BARE error with no .kind, whose .message
   is the single lowercase word "offline". Any caller that printed e.message
   showed a player the literal word "offline" with no capital, no punctuation
   and no explanation. This layer is where that word becomes a sentence; no
   caller above should ever see it again. */
const AP_SOCIAL_OFFLINE_MSG =
  "You're offline — friends will sync the next time you have a connection.";
const AP_SOCIAL_USERNAME_RE=/^[a-z0-9_]{3,16}$/i;
const AP_SOCIAL_MAX_LIST=512;
const AP_SOCIAL_PENDING=new Map();
const AP_SOCIAL_PROBE={
  listCalls:0,mutations:0,coalesced:0,invalidInputs:0,
  droppedRows:0,reports:0,handshakes:0,messagesSent:0,presenceWrites:0,
  lastCode:'',maxPending:0
};
const AP_SOCIAL_PROTOCOL='massfront-social';
const AP_SOCIAL_PROTOCOL_VERSION=1;
const AP_SOCIAL_CAP_TTL_MS=300000;
const AP_SOCIAL_MAX_MESSAGE_CHARS=500;
const AP_SOCIAL_MAX_MESSAGE_ROWS=50;

function apSocialResetCapabilities(){
  AP_SOCIAL_CAPS={
    handshake:false,sessionEpoch:-1,checkedAt:0,version:0,
    friends:false,blocking:false,reporting:false,chat:false,presence:false,
    lobbies:false,invites:false,realtimeMatch:false,multiplayer:false,
    note:'Social capabilities have not been confirmed by this server.'
  };
}

function apSocialFail(e){
  const kind = (e && e.kind) || '';
  const raw  = (e && e.message) || '';
  /* Bare Error('offline') from apRequest's own offline gate: no kind at all,
     which is the only way to tell it apart from a server that answered. */
  if (!kind && raw === 'offline')
    return { ok:false, code:'offline', message: AP_SOCIAL_OFFLINE_MSG };
  if (kind === 'network')
    return { ok:false, code:'offline',
             message:"Can't reach the friends service right now — your game is unaffected." };
  if (kind === 'timeout')
    return { ok:false, code:'timeout',
             message:'The friends service took too long to answer — your game is unaffected.' };
  if (kind === 'stale_session')
    return { ok:false, code:'account_changed',
             message:'The signed-in account changed. Open Friends again to refresh it.' };
  if (kind === 'no_server')
    return { ok:false, code:'no_server',
             message:'This build has no friends service set up.' };
  if (kind === 'no_session')
    return { ok:false, code:'signed_out',
             message:'Sign in to send and accept friend requests.' };
  if (e && e.status === 401)
    return { ok:false, code:'signed_out',
             message:'Your session expired — sign in again to use friends.' };
  if (kind === 'unverified')
    return { ok:false, code:'unverified',
             message: raw || 'Verify your email address before using friends.' };
  if (kind === 'age_restricted')
    return { ok:false, code:'age_restricted',
             message: raw || 'Friends are not available on this account.' };
  if (kind === 'social_banned')
    return { ok:false, code:'social_banned',
             message: raw || 'Friends have been disabled on this account.' };
  if (kind === 'feature_disabled'){
    apSocialResetCapabilities();
    return {ok:false,code:'feature_disabled',message:raw||'That social feature is not enabled on this server.'};
  }
  const out={ ok:false, code: kind || 'server',
              message: raw || 'Something went wrong — try again in a moment.' };
  AP_SOCIAL_PROBE.lastCode=out.code;
  return out;
}
function apSocialUsername(raw){
  const value=String(raw==null?'':raw).trim();
  if(!AP_SOCIAL_USERNAME_RE.test(value)){
    AP_SOCIAL_PROBE.invalidInputs++;
    return {ok:false,value:'',result:{ok:false,code:'invalid_username',
      message:'Use the exact 3-16 character username — letters, numbers and underscore only.'}};
  }
  return {ok:true,value};
}
async function apSocialOnce(key,work){
  const scoped=(AP_SESSION?AP_SESSION_EPOCH:'guest')+':'+key;
  if(AP_SOCIAL_PENDING.has(scoped)){
    AP_SOCIAL_PROBE.coalesced++;
    return AP_SOCIAL_PENDING.get(scoped);
  }
  const p=(async()=>{ try{ return await work(); }catch(e){ return apSocialFail(e); } })();
  AP_SOCIAL_PENDING.set(scoped,p);
  if(AP_SOCIAL_PENDING.size>AP_SOCIAL_PROBE.maxPending) AP_SOCIAL_PROBE.maxPending=AP_SOCIAL_PENDING.size;
  try{ return await p; }
  finally{ if(AP_SOCIAL_PENDING.get(scoped)===p) AP_SOCIAL_PENDING.delete(scoped); }
}
/* One shape out, whatever shape the server sends in. Remote strings are
   COERCED here (String(), never trusted as objects) so that the renderer only
   ever meets primitives — a username that arrives as {toString:…} cannot then
   surprise a text node. */
function apSocialList(v){
  if (!Array.isArray(v)) return [];
  const out = [];
  const lim=Math.min(v.length,AP_SOCIAL_MAX_LIST);
  if(v.length>lim) AP_SOCIAL_PROBE.droppedRows+=v.length-lim;
  for (let vi=0;vi<lim;vi++){
    const raw=v[vi];
    if (raw == null) continue;
    if (typeof raw === 'string' || typeof raw === 'number'){
      const uv=apSocialUsername(raw);
      if(uv.ok) out.push({ id:'', username:uv.value, at:0, status:'' });
      else AP_SOCIAL_PROBE.droppedRows++;
      continue;
    }
    if (typeof raw !== 'object') continue;
    const u = raw.username != null ? raw.username
            : raw.name     != null ? raw.name
            : raw.from     != null ? raw.from : '';
    const id = raw.id != null ? raw.id
             : raw.requestId != null ? raw.requestId : '';
    const uv=apSocialUsername(u);
    if(!uv.ok){ AP_SOCIAL_PROBE.droppedRows++; continue; }
    out.push({ id:String(id).slice(0,64), username:uv.value,
               at:Number(raw.at || raw.createdAt || 0) || 0,
               status:String(raw.status == null ? '' : raw.status).slice(0,32) });
  }
  return out;
}
async function socialFriends(){
  AP_SOCIAL_PROBE.listCalls++;
  return apSocialOnce('list',async()=>{
    /* The worker deliberately separates friends and pending requests. The old
       client called only /social/friends and looked for an `incoming` field
       that can never exist, so the mailbox could never show a request. */
    const rows = await Promise.all([
      apRequest('GET', '/social/friends', undefined, true),
      apRequest('GET', '/social/requests', undefined, true)
    ]);
    const d=rows[0], req=rows[1];
    return { ok:true,
             friends:  apSocialList(d && (d.friends  || d.list)),
             incoming: apSocialList(req && (req.requests || req.incoming || req.pending)),
             /* No `blocked` key on purpose. The server filters blocked
                parties out of BOTH friends and incoming, in both
                directions, before it answers - so a client-side list here
                would be a decorative second gate that the next reader
                mistakes for enforcement. Blocking is a server control. */
             };
  });
}
/* Exact username, deliberately. There is no directory and no search: the only
   way to be found is for someone to already know what you call yourself. */
async function socialRequest(u){
  const uv=apSocialUsername(u);
  if(!uv.ok) return uv.result;
  const name=uv.value;
  return apSocialOnce('request:'+name.toLowerCase(),async()=>{
    AP_SOCIAL_PROBE.mutations++;
    const d = await apRequest('POST', '/social/friend/request', { username:name }, true);
    return { ok:true, data: d || null };
  });
}
async function socialRespond(id, ok){
  const rid = String(id == null ? '' : id).trim();
  const ridN=Number(rid);
  if (!/^\d+$/.test(rid)||!Number.isSafeInteger(ridN)||ridN<=0){
    AP_SOCIAL_PROBE.invalidInputs++;
    return { ok:false, code:'bad_request',
             message:'That friend request is no longer available.' };
  }
  return apSocialOnce('respond:'+rid,async()=>{
    AP_SOCIAL_PROBE.mutations++;
    const d = await apRequest('POST', '/social/friend/respond', { id:ridN, accept: !!ok }, true);
    return { ok:true, data: d || null };
  });
}
async function socialBlock(u){
  const uv=apSocialUsername(u); if(!uv.ok) return uv.result;
  const name=uv.value;
  return apSocialOnce('block:'+name.toLowerCase(),async()=>{
    AP_SOCIAL_PROBE.mutations++;
    const d = await apRequest('POST', '/social/block', { username:name }, true);
    return { ok:true, data: d || null };
  });
}
async function socialUnblock(u){
  const uv=apSocialUsername(u); if(!uv.ok) return uv.result;
  const name=uv.value;
  return apSocialOnce('unblock:'+name.toLowerCase(),async()=>{
    AP_SOCIAL_PROBE.mutations++;
    const d = await apRequest('POST', '/social/unblock', { username:name }, true);
    return { ok:true, data: d || null };
  });
}
/* Server-backed abuse report. There is deliberately no local "reported"
   fiction: success means the existing /social/report route accepted it. */
async function socialReport(u,reason,context){
  const uv=apSocialUsername(u); if(!uv.ok) return uv.result;
  const why=String(reason==null?'':reason).trim();
  if(!why){ AP_SOCIAL_PROBE.invalidInputs++; return {ok:false,code:'invalid_reason',message:'Tell us what happened.'}; }
  if(why.length>500){ AP_SOCIAL_PROBE.invalidInputs++; return {ok:false,code:'invalid_reason',message:'Keep the report to 500 characters.'}; }
  const ctx=String(context==null?'':context).trim();
  if(ctx.length>2000){ AP_SOCIAL_PROBE.invalidInputs++; return {ok:false,code:'invalid_context',message:'Report context is limited to 2000 characters.'}; }
  const name=uv.value;
  return apSocialOnce('report:'+name.toLowerCase()+':'+why,async()=>{
    AP_SOCIAL_PROBE.mutations++; AP_SOCIAL_PROBE.reports++;
    const body={username:name,reason:why};
    if(ctx) body.context=ctx;
    const d=await apRequest('POST','/social/report',body,true);
    return {ok:true,data:d||null};
  });
}
/* A literal, authenticated handshake. Values such as 1, "true", or a response
   from an older/unknown protocol do not enable anything. Capability state is
   bound to AP_SESSION_EPOCH, so it cannot carry across sign-out/sign-in. */
async function socialHandshake(force){
  if(!mfSocialSignedIn()) return {ok:false,code:'signed_out',message:'Sign in to check social capabilities.'};
  if(!force&&AP_SOCIAL_CAPS.handshake&&AP_SOCIAL_CAPS.sessionEpoch===AP_SESSION_EPOCH&&
     Date.now()-AP_SOCIAL_CAPS.checkedAt<AP_SOCIAL_CAP_TTL_MS)
    return {ok:true,capabilities:mfSocialCapabilities()};
  return apSocialOnce('capabilities',async()=>{
    const epoch=AP_SESSION_EPOCH,token=AP_SESSION&&AP_SESSION.token;
    AP_SOCIAL_PROBE.handshakes++;
    let d;
    try{ d=await apRequest('GET','/social/capabilities',undefined,true); }
    catch(e){
      if(AP_SESSION&&AP_SESSION_EPOCH===epoch&&AP_SESSION.token===token) apSocialResetCapabilities();
      throw e;
    }
    const c=d&&d.capabilities;
    if(!d||d.protocol!==AP_SOCIAL_PROTOCOL||Number(d.version)!==AP_SOCIAL_PROTOCOL_VERSION||!c||typeof c!=='object'){
      if(AP_SESSION&&AP_SESSION_EPOCH===epoch&&AP_SESSION.token===token) apSocialResetCapabilities();
      return {ok:false,code:'bad_response',message:'This server did not confirm a compatible social protocol.'};
    }
    if(!AP_SESSION||AP_SESSION_EPOCH!==epoch||AP_SESSION.token!==token)
      return {ok:false,code:'account_changed',message:'The signed-in account changed. Check capabilities again.'};
    AP_SOCIAL_CAPS={
      handshake:true,sessionEpoch:epoch,checkedAt:Date.now(),version:AP_SOCIAL_PROTOCOL_VERSION,
      friends:c.friends===true,blocking:c.blocking===true,reporting:c.reporting===true,
      chat:c.chat===true,presence:c.presence===true,
      lobbies:c.lobbies===true,invites:c.invites===true,realtimeMatch:c.realtimeMatch===true,
      multiplayer:c.realtimeMatch===true,
      note:(c.chat===true||c.presence===true||c.lobbies===true)
        ?'Server-confirmed social communication capabilities.'
        :'This server has not enabled chat or presence.'
    };
    return {ok:true,capabilities:mfSocialCapabilities()};
  });
}
async function apSocialRequireCapability(kind){
  let caps=mfSocialCapabilities();
  if(!caps.handshake){
    const h=await socialHandshake(false);
    if(!h.ok)return h;
    caps=h.capabilities;
  }
  if(caps[kind]!==true){
    const label=kind==='chat'?'Friend chat':kind==='presence'?'Friend presence':
      kind==='lobbies'?'Player lobbies':kind==='invites'?'Lobby invitations':kind;
    return {ok:false,code:'feature_disabled',message:label+' is not enabled on this server.'};
  }
  return null;
}
function apSocialMessageText(raw){
  let value=String(raw==null?'':raw);
  value=value.normalize?value.normalize('NFKC'):value;
  value=value.replace(/\r\n?/g,'\n').trim();
  if(!value){AP_SOCIAL_PROBE.invalidInputs++;return {ok:false,result:{ok:false,code:'invalid_message',message:'Write a message first.'}};}
  if(Array.from(value).length>AP_SOCIAL_MAX_MESSAGE_CHARS){AP_SOCIAL_PROBE.invalidInputs++;return {ok:false,result:{ok:false,code:'message_too_long',message:'Keep messages to 500 characters.'}};}
  return {ok:true,value};
}
function apSocialMessageRows(v){
  if(!Array.isArray(v))return [];
  const out=[],lim=Math.min(v.length,AP_SOCIAL_MAX_MESSAGE_ROWS);
  if(v.length>lim)AP_SOCIAL_PROBE.droppedRows+=v.length-lim;
  for(let i=0;i<lim;i++){
    const r=v[i];if(!r||typeof r!=='object')continue;
    const id=Number(r.id),from=apSocialUsername(r.from),to=apSocialUsername(r.to);
    if(!Number.isSafeInteger(id)||id<=0||!from.ok||!to.ok){AP_SOCIAL_PROBE.droppedRows++;continue;}
    out.push({id,from:from.value,to:to.value,body:String(r.body==null?'':r.body).slice(0,2000),
      at:Number(r.at)||0,mine:r.mine===true,readAt:r.readAt==null?null:(Number(r.readAt)||0)});
  }
  return out;
}
async function socialSendMessage(u,body){
  const uv=apSocialUsername(u);if(!uv.ok)return uv.result;
  const mv=apSocialMessageText(body);if(!mv.ok)return mv.result;
  const gate=await apSocialRequireCapability('chat');if(gate)return gate;
  return apSocialOnce('message:'+uv.value.toLowerCase()+':'+mv.value,async()=>{
    AP_SOCIAL_PROBE.mutations++;AP_SOCIAL_PROBE.messagesSent++;
    const d=await apRequest('POST','/social/message/send',{username:uv.value,body:mv.value},true);
    const m=d&&d.message,id=Number(m&&m.id),to=apSocialUsername(m&&m.to);
    if(!Number.isSafeInteger(id)||id<=0||!to.ok)
      return {ok:false,code:'bad_response',message:'The server returned an invalid message receipt.'};
    return {ok:true,message:{id,to:to.value,body:String(m.body==null?'':m.body).slice(0,2000),at:Number(m.at)||0,mine:true}};
  });
}
async function socialMessages(u,before,limit){
  const uv=apSocialUsername(u);if(!uv.ok)return uv.result;
  const lim=limit==null?30:Number(limit),cursor=before==null?0:Number(before);
  if(!Number.isSafeInteger(lim)||lim<1||lim>AP_SOCIAL_MAX_MESSAGE_ROWS||
     (before!=null&&(!Number.isSafeInteger(cursor)||cursor<=0))){
    AP_SOCIAL_PROBE.invalidInputs++;return {ok:false,code:'invalid_page',message:'That message page is invalid.'};
  }
  const gate=await apSocialRequireCapability('chat');if(gate)return gate;
  let path='/social/messages?with='+encodeURIComponent(uv.value)+'&limit='+lim;
  if(cursor>0)path+='&before='+cursor;
  return apSocialOnce('messages:'+uv.value.toLowerCase()+':'+cursor+':'+lim,async()=>{
    const d=await apRequest('GET',path,undefined,true),messages=apSocialMessageRows(d&&d.messages);
    return {ok:true,with:uv.value,messages,hasMore:d&&d.hasMore===true,
      nextBefore:Number.isSafeInteger(Number(d&&d.nextBefore))&&Number(d.nextBefore)>0?Number(d.nextBefore):null};
  });
}
async function socialReportMessage(messageId,reason){
  const id=Number(messageId),why=String(reason==null?'':reason).trim();
  if(!Number.isSafeInteger(id)||id<=0){AP_SOCIAL_PROBE.invalidInputs++;return {ok:false,code:'bad_request',message:'That message is not available.'};}
  if(!why||Array.from(why).length>500){AP_SOCIAL_PROBE.invalidInputs++;return {ok:false,code:'invalid_reason',message:'Tell us what happened in 500 characters or fewer.'};}
  return apSocialOnce('message-report:'+id+':'+why,async()=>{
    AP_SOCIAL_PROBE.mutations++;AP_SOCIAL_PROBE.reports++;
    const d=await apRequest('POST','/social/message/report',{messageId:id,reason:why},true);
    return {ok:true,data:d||null};
  });
}
async function socialSetPresence(state){
  const value=String(state==null?'':state).trim().toLowerCase();
  if(value!=='online'&&value!=='away'&&value!=='offline'){
    AP_SOCIAL_PROBE.invalidInputs++;return {ok:false,code:'invalid_presence',message:'Presence must be online, away or offline.'};
  }
  const gate=await apSocialRequireCapability('presence');if(gate)return gate;
  return apSocialOnce('presence-write',async()=>{
    AP_SOCIAL_PROBE.mutations++;AP_SOCIAL_PROBE.presenceWrites++;
    const d=await apRequest('POST','/social/presence',{state:value},true);
    return {ok:true,state:String(d&&d.state||'offline'),expiresAt:d&&d.expiresAt==null?null:(Number(d.expiresAt)||0)};
  });
}
function apSocialPresenceRows(v){
  if(!Array.isArray(v))return [];
  const out=[],lim=Math.min(v.length,AP_SOCIAL_MAX_LIST);
  if(v.length>lim)AP_SOCIAL_PROBE.droppedRows+=v.length-lim;
  for(let i=0;i<lim;i++){
    const r=v[i];if(!r||typeof r!=='object')continue;const uv=apSocialUsername(r.username);
    if(!uv.ok){AP_SOCIAL_PROBE.droppedRows++;continue;}
    const state=r.state==='online'||r.state==='away'?r.state:'offline';
    out.push({username:uv.value,state,at:state==='offline'?0:(Number(r.at)||0)});
  }
  return out;
}
async function socialPresence(){
  const gate=await apSocialRequireCapability('presence');if(gate)return gate;
  return apSocialOnce('presence-list',async()=>{
    const d=await apRequest('GET','/social/presence',undefined,true);
    return {ok:true,friends:apSocialPresenceRows(d&&d.friends),truncated:d&&d.truncated===true};
  });
}
function apSocialLobby(raw){
  if(!raw||typeof raw!=='object')return null;
  const id=String(raw.id||''),code=String(raw.code||'').toUpperCase(),rev=Number(raw.revision);
  if(!/^[a-f0-9]{32}$/i.test(id)||!/^[A-F0-9]{8}$/.test(code)||!Number.isSafeInteger(rev)||rev<1)return null;
  const members=[];for(const r of Array.isArray(raw.members)?raw.members.slice(0,4):[]){const u=apSocialUsername(r&&r.username);if(u.ok)members.push({username:u.value,ready:r.ready===true,host:r.host===true,self:r.self===true});}
  const rules=raw.rules&&typeof raw.rules==='object'?raw.rules:{};
  return {id,code,revision:rev,state:'waiting',expiresAt:Number(raw.expiresAt)||0,
    rules:{mode:rules.mode==='coop'?'coop':'skirmish',slots:Math.max(2,Math.min(4,Number(rules.slots)||2)),map:String(rules.map||'auto').slice(0,64)},members};
}
async function socialLobbyCreate(rules){
  const gate=await apSocialRequireCapability('lobbies');if(gate)return gate;
  return apSocialOnce('lobby-create',async()=>{AP_SOCIAL_PROBE.mutations++;const d=await apRequest('POST','/multiplayer/lobbies',{rules:rules||{}},true),lobby=apSocialLobby(d&&d.lobby);return lobby?{ok:true,lobby}:{ok:false,code:'bad_response',message:'The server returned an invalid lobby.'};});
}
async function socialLobbyJoin(code){
  const value=String(code||'').trim().toUpperCase();if(!/^[A-F0-9]{8}$/.test(value))return {ok:false,code:'invalid_code',message:'Enter the eight-character lobby code.'};
  const gate=await apSocialRequireCapability('lobbies');if(gate)return gate;
  return apSocialOnce('lobby-join:'+value,async()=>{AP_SOCIAL_PROBE.mutations++;const d=await apRequest('POST','/multiplayer/lobbies/join',{code:value},true),lobby=apSocialLobby(d&&d.lobby);return lobby?{ok:true,lobby}:{ok:false,code:'bad_response',message:'The server returned an invalid lobby.'};});
}
async function socialLobbyGet(id){
  const value=String(id||'');if(!/^[a-f0-9]{32}$/i.test(value))return {ok:false,code:'invalid_lobby',message:'That lobby is invalid.'};
  const gate=await apSocialRequireCapability('lobbies');if(gate)return gate;
  const d=await apRequest('GET','/multiplayer/lobbies/'+value,undefined,true),lobby=apSocialLobby(d&&d.lobby);return lobby?{ok:true,lobby}:{ok:false,code:'bad_response',message:'The server returned an invalid lobby.'};
}
async function socialLobbyReady(id,revision,ready){
  const gate=await apSocialRequireCapability('lobbies');if(gate)return gate;
  const d=await apRequest('POST','/multiplayer/lobbies/'+String(id)+'/ready',{revision:Number(revision),ready:ready===true},true),lobby=apSocialLobby(d&&d.lobby);return lobby?{ok:true,lobby}:{ok:false,code:'bad_response',message:'The server returned an invalid lobby.'};
}
async function socialLobbyLeave(id,revision){
  const gate=await apSocialRequireCapability('lobbies');if(gate)return gate;
  const d=await apRequest('POST','/multiplayer/lobbies/'+String(id)+'/leave',{revision:Number(revision)},true);return {ok:true,left:d&&d.left===true,closed:d&&d.closed===true,lobby:apSocialLobby(d&&d.lobby)};
}
async function socialLobbyInvite(id,username){
  const u=apSocialUsername(username);if(!u.ok)return u.result;const gate=await apSocialRequireCapability('invites');if(gate)return gate;
  const d=await apRequest('POST','/multiplayer/invites',{lobbyId:String(id),username:u.value},true);return {ok:true,invite:d&&d.invite||null};
}
async function socialLobbyInvites(){
  const gate=await apSocialRequireCapability('invites');if(gate)return gate;const d=await apRequest('GET','/multiplayer/invites',undefined,true),rows=[];
  for(const r of Array.isArray(d&&d.invites)?d.invites.slice(0,50):[]){const from=apSocialUsername(r&&r.from);if(from.ok&&/^[a-f0-9]{32}$/i.test(String(r.id||''))&&/^[A-F0-9]{8}$/.test(String(r.code||'')))rows.push({id:String(r.id),lobbyId:String(r.lobbyId||''),code:String(r.code),from:from.value,expiresAt:Number(r.expiresAt)||0});}
  return {ok:true,invites:rows};
}
async function socialLobbyInviteRespond(id,accept){
  const value=String(id||'');if(!/^[a-f0-9]{32}$/i.test(value))return {ok:false,code:'invalid_invite',message:'That invitation is invalid.'};
  const gate=await apSocialRequireCapability('invites');if(gate)return gate;const d=await apRequest('POST','/multiplayer/invites/'+value+'/respond',{accept:accept===true},true);return {ok:true,accepted:d&&d.accepted===true,lobby:apSocialLobby(d&&d.lobby)};
}
/* ---- gates ------------------------------------------------------------------
   mfSocialGate answers ONE question — "is this account allowed to use social at
   all?" — and nothing else. A network failure is not a gate, so it answers
   'ok': the UI must not tell an offline player that their account is banned.
   Accepts either a wrapper result or a bare code string. */
function mfSocialGate(x){
  const code = (x && typeof x === 'object') ? (x.code || x.kind || '') : String(x || '');
  if (code === 'unverified'     || code === 'email_unverified') return 'unverified';
  if (code === 'age_restricted' || code === 'age')              return 'age';
  if (code === 'social_banned'  || code === 'banned')           return 'banned';
  return 'ok';
}
/* The nudge that goes with each gate. Only ONE of the three is actionable —
   an unverified email is fixed by the player, from the account portal, which
   is why this lives in the file that owns the portal rather than in the
   mailbox. Age and ban are stated plainly and offer no button, because
   offering a button that cannot help is worse than offering none. */
function mfSocialNudge(gate){
  const g = mfSocialGate(gate);
  if (g === 'unverified')
    return { gate:g,
             text:'Verify your email address to send and accept friend requests. '+
                  'Everything else in the game keeps working.',
             cta:'OPEN ACCOUNT',
             act:(trigger)=>{ try{ if (typeof apOpen === 'function') apOpen(trigger || null); }catch(e){} } };
  if (g === 'age')
    return { gate:g, text:'Friends are not available on this account.', cta:'', act:null };
  if (g === 'banned')
    return { gate:g, text:'Friends have been disabled on this account.', cta:'', act:null };
  return null;
}
/* The mailbox asks this before it renders anything or fetches anything.
   AP_SESSION is a top-level `let` in this file, so it is reachable from every
   other classic script — but only through a function that lives HERE, so that
   a bundle built without authportal.js degrades to "signed out" instead of
   throwing a ReferenceError inside renderInbox(). */
function mfSocialSignedIn(){
  try{ return !!(AP_SESSION && AP_SESSION.token &&
    (!(AP_SESSION.expiresAt>0)||AP_SESSION.expiresAt>Date.now())); }catch(e){ return false; }
}
function mfSocialCapabilities(){
  if(!mfSocialSignedIn()||!AP_SOCIAL_CAPS.handshake||AP_SOCIAL_CAPS.sessionEpoch!==AP_SESSION_EPOCH||
     Date.now()-AP_SOCIAL_CAPS.checkedAt>=AP_SOCIAL_CAP_TTL_MS){
    return {handshake:false,version:0,friends:false,blocking:false,reporting:false,
      chat:false,presence:false,lobbies:false,invites:false,realtimeMatch:false,multiplayer:false,
      note:'Social capabilities have not been confirmed by this server.'};
  }
  return {handshake:true,version:AP_SOCIAL_CAPS.version,
    friends:AP_SOCIAL_CAPS.friends,blocking:AP_SOCIAL_CAPS.blocking,reporting:AP_SOCIAL_CAPS.reporting,
    chat:AP_SOCIAL_CAPS.chat,presence:AP_SOCIAL_CAPS.presence,
    lobbies:AP_SOCIAL_CAPS.lobbies,invites:AP_SOCIAL_CAPS.invites,
    realtimeMatch:AP_SOCIAL_CAPS.realtimeMatch,multiplayer:AP_SOCIAL_CAPS.realtimeMatch,
    note:AP_SOCIAL_CAPS.note};
}
function mfSocialProbe(reset){
  const out={
    sessionEpoch:AP_SESSION_EPOCH,signedIn:mfSocialSignedIn(),pending:AP_SOCIAL_PENDING.size,
    listCalls:AP_SOCIAL_PROBE.listCalls,mutations:AP_SOCIAL_PROBE.mutations,
    coalesced:AP_SOCIAL_PROBE.coalesced,invalidInputs:AP_SOCIAL_PROBE.invalidInputs,
    droppedRows:AP_SOCIAL_PROBE.droppedRows,reports:AP_SOCIAL_PROBE.reports,
    handshakes:AP_SOCIAL_PROBE.handshakes,messagesSent:AP_SOCIAL_PROBE.messagesSent,
    presenceWrites:AP_SOCIAL_PROBE.presenceWrites,
    lastCode:AP_SOCIAL_PROBE.lastCode,maxPending:AP_SOCIAL_PROBE.maxPending,
    requests:AP_NET_PROBE.requests,responses:AP_NET_PROBE.responses,timeouts:AP_NET_PROBE.timeouts,
    networkErrors:AP_NET_PROBE.networkErrors,staleResponses:AP_NET_PROBE.staleResponses,
    unauthorized:AP_NET_PROBE.unauthorized,httpErrors:AP_NET_PROBE.httpErrors
  };
  if(reset){
    for(const k in AP_SOCIAL_PROBE) AP_SOCIAL_PROBE[k]=k==='lastCode'?'':0;
    for(const k in AP_NET_PROBE) AP_NET_PROBE[k]=0;
  }
  return out;
}
if(typeof window!=='undefined') window.MFSocial={
  friends:socialFriends,request:socialRequest,respond:socialRespond,
  block:socialBlock,unblock:socialUnblock,report:socialReport,
  handshake:socialHandshake,sendMessage:socialSendMessage,messages:socialMessages,
  reportMessage:socialReportMessage,setPresence:socialSetPresence,presence:socialPresence,
  createLobby:socialLobbyCreate,joinLobby:socialLobbyJoin,getLobby:socialLobbyGet,
  readyLobby:socialLobbyReady,leaveLobby:socialLobbyLeave,inviteLobby:socialLobbyInvite,
  lobbyInvites:socialLobbyInvites,respondLobbyInvite:socialLobbyInviteRespond,
  signedIn:mfSocialSignedIn,capabilities:mfSocialCapabilities,probe:mfSocialProbe
};
/* ---- end social client ---- */
