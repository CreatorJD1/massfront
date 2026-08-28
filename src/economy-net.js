;
;
/* ============================================================================
   ECONOMY NET — client for the server-authoritative currency worker
   ----------------------------------------------------------------------------
   cloudflare/massfront-economy/ is the source of truth for cores once a
   player is signed in. This file is the ONLY thing in src/ that talks to it.
   Three rules, matching src/offline.js's contract for every other online
   module in this game:

     1. NEVER block gameplay on a network call. Every function here returns
        (or queues) immediately; nothing awaits a fetch before letting a
        match, a grant, or a menu render proceed.
     2. Signed-out or offline is a NORMAL state, not an error. META.cores
        (src/game/meta.js) stays the number the player plays with the whole
        time — this file only ever adjusts it FROM a confirmed server
        response, never removes or blocks access to it.
     3. Never present an unconfirmed number as if it were confirmed. See
        ecoGetBalance() — it always returns an explicit `confirmed` flag
        rather than silently mixing "what the server said" with "what we
        are hoping is still true".

   ---- namespacing --------------------------------------------------------------
   Prefixed `ECO`/`eco`, same convention authportal.js uses (`AP`/`ap`) for
   the same reason: classic <script> files share one global scope, and a
   second module redeclaring a name silently wins or throws depending on
   load order (see the big comment at the top of authportal.js). This file
   loads AFTER offline.js, game/meta.js, authportal.js and account.js (see
   boot.js MANIFEST / assets/data/manifest.json), so it can safely read
   netAllowed(), META/metaSave(), and AP_SESSION. Core grants arrive through
   game/meta.js's observer; the two auth transitions are wrapped using the
   same non-invasive pattern offline.js uses on renderSettings:

     metaGrantCores   (game/meta.js)   -> after any source pays cores locally,
                                          queue that same grant for the server
                                          without crediting locally again.
     apSetSessionFrom (authportal.js)  -> after a real sign-in/register,
                                          reconcile with the server.
     apClearSession   (authportal.js)  -> on sign-out, drop the confirmed
                                          balance (it belongs to whichever
                                          account was just signed out of).

   ---- what is NOT wired here, and why -------------------------------------------
   Store purchases (Armory perks, commander colors — src/game/meta.js
   renderArmory) still spend META.cores locally only. Rewiring that buy flow
   to await a real server confirmation touches meta.js's DOM event handlers,
   which is out of this file's ownership for this change (see task file
   ownership) and is exactly the kind of thing offline spending should NOT
   be optimistic about (crediting currency late is harmless; un-granting an
   item a player already sees as "owned" is not). ecoSpend() below is a
   complete, ready-to-call function for that future wiring — see
   docs/ECONOMY.md "next integration step" — it is simply not invoked from
   the Armory UI yet. Until then, the local Armory purchase is what it
   already was before this file existed: client-side only, reconciled
   against the server ledger the next time this file's reconcile runs
   (server balance wins if the two disagree — see ecoReconcile).
   ============================================================================ */

/* ---- state -------------------------------------------------------------------
   ECO.serverCores / ECO.confirmed are the ONLY state a UI should ever treat
   as "the real balance". Everything else here is plumbing to keep that pair
   as fresh as possible without ever blocking on it. */
const ECO = {
  endpoint: null, endpointResolved: false,
  serverCores: null, confirmed: false, lastSync: 0,
  entitlements: null,
  queue: [],            // [{id,kind:'grant'|'spend',...,idemKey,queuedAt}]
  flushing: false,
};
const ECO_QUEUE_KEY = 'massfront_econ_queue_v1';
const ECO_URL_KEY = 'massfront_econ_url';

/* ---- id generation -------------------------------------------------------------
   Only needs to be unique, not cryptographically secure — the worker's
   UNIQUE(user_id, idem_key) index is what actually enforces "applied once";
   this just needs to not collide with itself. Generated ONCE per logical
   operation and persisted with it in the queue, so every retry (including
   across an app restart, since the queue is in localStorage) resends the
   SAME key rather than minting a new one — that is the entire idempotency
   contract from the client side. */
function ecoId(prefix) {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return prefix + ':' + crypto.randomUUID();
  } catch (e) {}
  return prefix + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* ---- endpoint resolution ------------------------------------------------------
   Mirrors apResolveEndpoint() in authportal.js (same 3-of-4 tiers — there is
   no packaged same-origin config this project ships for the economy worker
   specifically, so the auth.json `economyUrl` field is opportunistic, not
   required):
     1. window.MASSFRONT_ECONOMY_URL — set by an embedder before boot
     2. a URL saved on this device — device-local override
     3. assets/auth.json `economyUrl` — read-only best-effort; this file
        never writes that JSON (it is not owned by this change)
     4. nothing — every call below degrades to "not configured", same as no
        server at all */
async function ecoResolveEndpoint() {
  ECO.endpointResolved = true;
  if (typeof window !== 'undefined' && window.MASSFRONT_ECONOMY_URL)
    return (ECO.endpoint = String(window.MASSFRONT_ECONOMY_URL));
  try {
    const s = localStorage.getItem(ECO_URL_KEY);
    if (s && s.trim()) return (ECO.endpoint = s.trim());
  } catch (e) {}
  try {
    const r = await fetch('./assets/auth.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) {
      const c = await r.json();
      if (c && typeof c.economyUrl === 'string' && c.economyUrl.trim())
        return (ECO.endpoint = c.economyUrl.trim());
    }
  } catch (e) {}
  return (ECO.endpoint = null);
}
function ecoEndpoint() { return ECO.endpoint || ''; }

/* ---- queue persistence --------------------------------------------------------- */
function ecoSaveQueue() { try { localStorage.setItem(ECO_QUEUE_KEY, JSON.stringify(ECO.queue)); } catch (e) {} }
function ecoLoadQueue() {
  try {
    const s = localStorage.getItem(ECO_QUEUE_KEY);
    if (s) { const a = JSON.parse(s); if (Array.isArray(a)) ECO.queue = a; }
  } catch (e) { ECO.queue = []; }
}

/* ---- low-level request ----------------------------------------------------------
   Same shape as apRequest() in authportal.js: refuses when offline (offline
   is a normal state, not an error worth surfacing as one), times out rather
   than hanging, and never throws INTO a caller that isn't expecting it —
   every public function below catches this itself. */
async function ecoRequest(method, path, body) {
  if (typeof netAllowed === 'function' && !netAllowed()) throw new Error('offline');
  if (!ECO.endpointResolved) await ecoResolveEndpoint();
  const base = ecoEndpoint();
  if (!base) throw Object.assign(new Error('no economy server configured'), { kind: 'no_server' });
  if (typeof AP_SESSION === 'undefined' || !AP_SESSION || !AP_SESSION.token)
    throw Object.assign(new Error('not signed in'), { kind: 'no_session' });
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const t = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) {} }, 12000);
  let r;
  try {
    r = await fetch(base.replace(/\/+$/, '') + path, {
      method,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + AP_SESSION.token },
      cache: 'no-store',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctl ? ctl.signal : undefined,
    });
  } catch (netErr) {
    throw Object.assign(new Error('could not reach the economy server'), { kind: 'network' });
  } finally { clearTimeout(t); }
  let data = null;
  try { data = await r.json(); } catch (e) {}
  if (!r.ok) throw Object.assign(new Error((data && data.message) || ('server error ' + r.status)),
    { kind: (data && data.error) || 'server', status: r.status });
  return data;
}

/* ---- public: balance / entitlements (read-only, always local-first) ------------ */
function ecoGetBalance() { return { cores: ECO.serverCores, confirmed: ECO.confirmed, lastSync: ECO.lastSync }; }
function ecoGetEntitlements() { return { entitlements: ECO.entitlements, confirmed: ECO.confirmed }; }

/* ---- public: grant (match rewards, daily bonuses, ...) -------------------------
   Fire-and-forget by design (rule #1 above) — always queues first, THEN
   tries to flush immediately if online; a caller never needs to await this
   to keep the game responsive, and a failed send just leaves it queued. */
function ecoGrant(amount, reason, opts) {
  amount = Math.trunc(Number(amount));
  if (!Number.isFinite(amount) || amount <= 0) return;
  const op = { id: ecoId('grant'), kind: 'grant', amount, reason: String(reason || 'grant').slice(0, 64),
               idemKey: (opts && opts.idemKey) || ecoId('g'), queuedAt: Date.now() };
  ECO.queue.push(op); ecoSaveQueue();
  ecoFlush();   // best-effort, never awaited by the caller
}

/* ---- public: spend (purchases) --------------------------------------------------
   NOT queued offline — see file header "what is NOT wired here, and why".
   Returns a promise that ALWAYS resolves (never rejects) with
   {ok, ...} so a future caller can `const r = await ecoSpend(...)` without
   a try/catch. */
async function ecoSpend(sku, opts) {
  sku = String(sku || '').trim();
  if (!sku) return { ok: false, error: 'invalid_sku', message: 'No item specified.' };
  if (typeof netAllowed === 'function' && !netAllowed())
    return { ok: false, error: 'offline', message: 'Sign in and get back online to confirm purchases with the server.' };
  if (typeof AP_SESSION === 'undefined' || !AP_SESSION || !AP_SESSION.token)
    return { ok: false, error: 'no_session', message: 'Sign in to make a server-confirmed purchase.' };
  const idemKey = (opts && opts.idemKey) || ecoId('s');
  try {
    const data = await ecoRequest('POST', '/spend', { sku, idempotencyKey: idemKey });
    ECO.serverCores = data.balance; ECO.confirmed = true; ECO.lastSync = Date.now();
    ecoUpsertEntitlement(data.sku, data.tier);
    return data;
  } catch (e) {
    return { ok: false, error: e.kind || 'error', message: e.message };
  }
}
function ecoUpsertEntitlement(sku, tier) {
  if (!Array.isArray(ECO.entitlements)) ECO.entitlements = [];
  const row = ECO.entitlements.find(x => x.sku === sku);
  if (row) row.tier = tier; else ECO.entitlements.push({ sku, tier });
}

/* ---- flush: drain the offline grant queue in order ------------------------------
   Stops at the first failure and leaves the remainder queued — a network
   blip mid-flush must not drop or reorder the ops behind it. Each op keeps
   its idemKey across retries, so re-running this after a failure never
   double-grants (the worker's UNIQUE(user_id, idem_key) index is what
   actually guarantees that; this loop is just what makes retry happen). */
async function ecoFlush() {
  if (ECO.flushing) return;
  if (typeof netAllowed === 'function' && !netAllowed()) return;
  if (typeof AP_SESSION === 'undefined' || !AP_SESSION || !AP_SESSION.token) return;
  if (!ECO.queue.length) return;
  ECO.flushing = true;
  try {
    while (ECO.queue.length) {
      const op = ECO.queue[0];
      try {
        if (op.kind === 'grant') {
          const data = await ecoRequest('POST', '/grant', { amount: op.amount, reason: op.reason, idempotencyKey: op.idemKey });
          ECO.serverCores = data.balance; ECO.confirmed = true; ECO.lastSync = Date.now();
        } else {
          /* `continue` alone jumped straight back to the while test WITHOUT
             reaching the shift() below, so queue[0] stayed the same unknown op
             and the loop spun forever, wedging the tab. Drop it here instead. */
          ECO.queue.shift(); ecoSaveQueue(); continue;
        }
      } catch (e) {
        break; // leave op[0] in place, try again on the next flush trigger
      }
      ECO.queue.shift(); ecoSaveQueue();
    }
  } finally { ECO.flushing = false; }
}

/* ---- reconcile: the "on sign-in" contract ---------------------------------------
   1. Flush anything queued (so the server has every local grant applied).
   2. Pull the confirmed balance + entitlements.
   3. Only THEN adopt the server's cores into META — by that point every
      local mutation that touched META.cores has already been told to the
      server, so the two should agree; if they don't (a second device, or a
      balance change made server-side), the server wins. That is the whole
      point of "server-authoritative": on any disagreement, the number a
      human can see and edit loses to the number only the worker can write. */
async function ecoReconcile() {
  if (typeof netAllowed === 'function' && !netAllowed()) { ECO.confirmed = false; return; }
  if (typeof AP_SESSION === 'undefined' || !AP_SESSION || !AP_SESSION.token) { ECO.confirmed = false; return; }
  await ecoFlush();
  if (ECO.queue.length) return;   // flush didn't fully drain (offline/error) — don't claim confirmed on a partial picture
  try {
    const [bal, ent] = await Promise.all([
      ecoRequest('GET', '/balance'),
      ecoRequest('GET', '/entitlements'),
    ]);
    ECO.serverCores = bal.cores; ECO.entitlements = ent.entitlements || [];
    ECO.confirmed = true; ECO.lastSync = Date.now();
    if (typeof META === 'object' && META && META.cores !== bal.cores) {
      META.cores = bal.cores;
      if (typeof metaSave === 'function') metaSave();
      if (typeof renderMetaHead === 'function') renderMetaHead();
    }
  } catch (e) {
    ECO.confirmed = false;   // network/server problem — stay honest, keep playing on local currency
  }
}

/* ---- init --------------------------------------------------------------------- */
function initEconomyNet() {
  ecoLoadQueue();
  ecoResolveEndpoint();

  /* metaGrantCores already credited the active profile. Observe its durable
     grant event only; queued pre-init grants drain here before reconciliation,
     so a signed-in metaLoad migration cannot be overwritten and lost. */
  if (typeof metaObserveCoreGrants === 'function') {
    metaObserveCoreGrants(grant => {
      ecoGrant(grant.amount, grant.reason, grant.idemKey ? { idemKey: grant.idemKey } : undefined);
    });
  } else if (typeof console !== 'undefined') {
    console.error('economy-net: metaObserveCoreGrants not found at init — check MANIFEST load order (economy-net.js must load after game/meta.js)');
  }

  /* Hook sign-in / sign-out: wrap authportal.js's session setters the same
     way. */
  if (typeof apSetSessionFrom === 'function') {
    const _apSet0 = apSetSessionFrom;
    apSetSessionFrom = function (data, email) {
      _apSet0(data, email);
      ecoReconcile();   // fire-and-forget — never blocks the sign-in UI
    };
  }
  if (typeof apClearSession === 'function') {
    const _apClear0 = apClearSession;
    apClearSession = function () {
      _apClear0();
      ECO.serverCores = null; ECO.confirmed = false; ECO.entitlements = null;
    };
  }

  /* App relaunch while already signed in (cached session) — reconcile once
     the network state is known, without blocking boot. Also re-attempt
     whenever the browser regains connectivity, so a queued match reward
     earned on a subway platform lands the moment signal comes back. */
  if (typeof AP_SESSION !== 'undefined' && AP_SESSION && AP_SESSION.token) ecoReconcile();
  if (typeof window !== 'undefined')
    window.addEventListener('online', () => { ecoFlush(); ecoReconcile(); });

  /* Light periodic retry — covers "came back online but missed the event"
     (some WebViews don't fire it reliably) without polling aggressively. */
  setInterval(() => { if (ECO.queue.length) ecoFlush(); }, 45000);
}

/* ---- public surface ------------------------------------------------------------- */
window.EconomyNet = {
  grant: ecoGrant, spend: ecoSpend, reconcile: ecoReconcile, flush: ecoFlush,
  getBalance: ecoGetBalance, getEntitlements: ecoGetEntitlements,
};
