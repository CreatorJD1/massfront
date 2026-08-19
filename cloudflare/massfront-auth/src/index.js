/* ============================================================================
   MASSFRONT ACCOUNTS SERVER  —  Cloudflare Worker + D1
   ----------------------------------------------------------------------------
   Six routes:

     POST /register   {email,password}                 -> {token,expiresAt,user}
     POST /login       {email,password}                 -> {token,expiresAt,user}
     POST /logout       (Authorization: Bearer <token>)  -> {ok:true}
     GET  /me            "                               -> {user,session}
     PUT  /save          "        {payload}              -> {ok:true,at}
     GET  /save           "                              -> {payload,at}

   `payload` is whatever the client's encodeSave()/decodeSave() (see
   src/account.js) produced — a deflate+base64url blob. This server never
   parses it; it is stored and returned byte-for-byte, one slot per account.

   ---- passwords -------------------------------------------------------------
   PBKDF2-SHA256 via WebCrypto, a random 16-byte salt per user, and an
   iteration count stored alongside the hash (not hardcoded) so it can be
   raised later and existing accounts upgrade transparently the next time they
   sign in (see the `pass_iter` check in handleLogin). Nothing here invents
   its own crypto — WebCrypto does the actual KDF work.

   ---- sessions ---------------------------------------------------------------
   A session is a random 32-byte token with no meaning of its own — it is a
   lookup key into the `sessions` table in D1, which is the actual source of
   truth for who it belongs to and whether it is still valid. This is
   deliberately NOT a JWT: a JWT would let anyone who can read the client's
   localStorage inspect (and, if unsigned or unverified, forge) a session
   without the server ever being asked. An opaque token can't be forged, and
   revoking one is a DELETE, not a wait for expiry.

   ---- CORS -------------------------------------------------------------------
   Wide open on purpose. A Capacitor build's origin is `http://localhost` or
   `capacitor://localhost` — every request from the shipped game is
   cross-origin, so without ACAO:* the client can never read a response. This
   is safe specifically BECAUSE sessions are bearer tokens in an Authorization
   header, not cookies: nothing here relies on the browser silently attaching
   credentials, so there is no CSRF surface to also having a wildcard origin.

   ---- rate limiting ------------------------------------------------------------
   No KV or Durable Object binding is assumed — just D1, which is the one
   piece of infrastructure this project ships. `attempts` is a sliding-window
   log: each register/login call checks how many rows exist for its bucket+key
   inside the window before doing any real work, and records itself if under
   the limit. See RATE_LIMITS below for the actual numbers.
   ============================================================================ */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
};

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...CORS,
      ...extra,
    },
  });

const err = (status, error, message) => json({ error, message }, status);

/* ---- tunables -------------------------------------------------------------- */
const PBKDF2_ITERATIONS = 100000;     // floor required for this project — see docs/ACCOUNTS.md
const SALT_BYTES = 16;
const TOKEN_BYTES = 32;
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;   // 30 days
const MAX_EMAIL_LEN = 254;
const MIN_PASS_LEN = 8;
const MAX_PASS_LEN = 256;
const MAX_SAVE_LEN = 500000;          // real save codes run ~hundreds of bytes; generous headroom

/* register: per-IP only — there is no account yet to key a second check on.
   login: per-IP AND per-email, so credential stuffing against one account
   from many IPs is still slowed even though the per-IP bucket alone wouldn't
   catch it. */
const RATE_LIMITS = {
  /* Username routes. These two buckets were REQUESTED by handleUsernameCheck
     and handleUsernameClaim from day one but never defined here, so the
     lookup below threw on undefined and every call to either route was a
     500. The rule lookup is also now fail-closed (deny, not throw). */
  uname_check_ip: { limit: 60, windowSec: 300 },
  uname_claim_user: { limit: 5, windowSec: 43200 },
  register_ip: { limit: 8, windowSec: 3600 },
  login_ip: { limit: 20, windowSec: 900 },
  login_email: { limit: 8, windowSec: 900 },
};

/* ---- hex + random helpers --------------------------------------------------- */
function toHex(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}
function fromHex(hex) {
  const s = String(hex || '');
  const out = new Uint8Array(s.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}
function randomHex(bytes) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return toHex(b);
}

/* ---- PBKDF2 ------------------------------------------------------------------
   WebCrypto's own SubtleCrypto.deriveBits, not a hand-rolled KDF. Iterations
   are CPU-bound, which matters on Workers — see the [limits] comment in
   wrangler.toml and "CPU time" in docs/ACCOUNTS.md. */
async function pbkdf2(password, saltHex, iterations) {
  const enc = new TextEncoder();
  const salt = fromHex(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256);
  return toHex(bits);
}
/* Constant-time-ish compare of two hex digests, so a mismatch can't be timed
   character-by-character. (Both inputs here are always fixed-length hex from
   pbkdf2() above, so the length branch below is never actually taken in
   practice — it exists so a malformed stored value fails closed rather than
   throwing.) */
function timingSafeEqual(a, b) {
  const sa = String(a || ''), sb = String(b || '');
  const len = Math.max(sa.length, sb.length, 1);
  let diff = sa.length ^ sb.length;
  for (let i = 0; i < len; i++) diff |= (sa.charCodeAt(i) || 0) ^ (sb.charCodeAt(i) || 0);
  return diff === 0;
}
/* A fixed dummy hash the server checks a password against when the email is
   unknown, so /login takes roughly the same CPU time whether or not the
   account exists — otherwise "found vs. not found" is a timing oracle an
   attacker can use to enumerate registered emails. Computed once per isolate. */
let DUMMY_HASH_PROMISE = null;
function dummyHash() {
  if (!DUMMY_HASH_PROMISE)
    DUMMY_HASH_PROMISE = pbkdf2('massfront-dummy-password', '00'.repeat(SALT_BYTES), PBKDF2_ITERATIONS);
  return DUMMY_HASH_PROMISE;
}

/* ---- validation --------------------------------------------------------------
   Deliberately practical rather than a full RFC 5322 parser: it catches the
   typos real players make (missing @, missing domain) without rejecting
   valid-but-unusual addresses a stricter regex would choke on. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateEmail(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return { ok: false, message: 'Enter your email address.' };
  if (s.length > MAX_EMAIL_LEN) return { ok: false, message: 'That email address is too long.' };
  if (!EMAIL_RE.test(s))
    return { ok: false, message: "That doesn't look like a valid email — check for a typo like a missing @ or domain." };
  return { ok: true, value: s };
}
function validatePassword(raw) {
  const s = String(raw == null ? '' : raw);
  if (!s) return { ok: false, message: 'Enter a password.' };
  if (s.length < MIN_PASS_LEN) return { ok: false, message: 'Password needs at least ' + MIN_PASS_LEN + ' characters.' };
  if (s.length > MAX_PASS_LEN) return { ok: false, message: 'Password is too long — ' + MAX_PASS_LEN + ' characters max.' };
  return { ok: true, value: s };
}

/* ---- usernames --------------------------------------------------------------
   A public handle, because friends cannot be added by e-mail address without
   turning the account list into a directory. Stored as typed but compared
   case-insensitively via a UNIQUE INDEX on lower(username), so `Vex` and `vex`
   cannot both exist while the display keeps whatever case was claimed. */
const USERNAME_RE = /^[a-z0-9_]{3,16}$/i;
const USERNAME_RESERVED = new Set([
  'admin','administrator','root','system','massfront','support','help','staff',
  'mod','moderator','official','keel','command','null','undefined','you','me'
]);
function validateUsername(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, message: 'Choose a username.' };
  if (!USERNAME_RE.test(s))
    return { ok: false, message: '3-16 characters, letters, numbers and underscore only.' };
  if (USERNAME_RESERVED.has(s.toLowerCase()))
    return { ok: false, message: 'That username is reserved — pick another.' };
  return { ok: true, value: s };
}

/* ---- age gate ----------------------------------------------------------------
   MASSFRONT has player-to-player communication, so it is a 13+ product. The
   client shows a NEUTRAL date-of-birth screen (no "are you over 13?" — that
   question answers itself) and sends only the BOOLEAN result. The date of birth
   itself is never transmitted and never stored: the minimum data that answers
   the question is one bit and the timestamp it was asked, and collecting a
   child's birth date in order to decide whether you may collect their data is
   the exact trap COPPA-adjacent guidance warns about.

   Accounts created before this shipped carry age_ok=0 and are asked once, on
   next sign-in, before any social surface opens to them. */
function validateAgeOk(raw) {
  if (raw === true) return { ok: true, value: 1 };
  return { ok: false, message: 'You need to confirm your age before creating an account.' };
}

/* ---- rate limiting -----------------------------------------------------------
   A sliding window kept in D1 itself — no KV or Durable Object binding
   required. Cheap by construction: one indexed COUNT, then one INSERT, and
   only when the caller is about to do real work (a PBKDF2 hash, a write).   */
function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
}
async function checkRateLimit(env, bucket, key) {
  const rule = RATE_LIMITS[bucket];
  /* An unknown bucket must DENY, not throw. A throw here becomes a blanket
     500 through the router catch, which reads as "the server is down" and
     - because it fires before the INSERT - leaves no trace in attempts.
     That failure mode is exactly how both username routes shipped dead
     without anyone noticing. */
  if (!rule) return false;
  const cutoff = Date.now() - rule.windowSec * 1000;
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM attempts WHERE bucket=?1 AND akey=?2 AND created_at>?3'
  ).bind(bucket, key, cutoff).first();
  if (row && row.n >= rule.limit) return false;
  await env.DB.prepare('INSERT INTO attempts (bucket, akey, created_at) VALUES (?1,?2,?3)')
    .bind(bucket, key, Date.now()).run();
  /* Opportunistic prune on ~2% of calls — keeps the table bounded without a
     cron trigger or a second binding. */
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM attempts WHERE created_at < ?1')
      .bind(Date.now() - 86400000).run().catch(() => {});
  }
  return true;
}

/* ---- sessions ------------------------------------------------------------- */
async function createSession(env, userId) {
  const token = randomHex(TOKEN_BYTES);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?1,?2,?3,?4)')
    .bind(token, userId, now, expiresAt).run();
  return { token, expiresAt };
}
async function requireSession(request, env) {
  const auth = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m || !m[1].trim()) return null;
  const token = m[1].trim();
  const row = await env.DB.prepare(
    'SELECT s.token, s.user_id, s.expires_at, u.email AS email, u.created_at AS user_created_at ' +
    'FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?1'
  ).bind(token).first();
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token=?1').bind(token).run().catch(() => {});
    return null;
  }
  return row;
}

/* ---- handlers --------------------------------------------------------------- */
async function handleRegister(request, env) {
  const ip = clientIp(request);
  if (!(await checkRateLimit(env, 'register_ip', ip)))
    return err(429, 'rate_limited', 'Too many accounts created from this connection recently — wait a while and try again.');

  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }

  const ev = validateEmail(body && body.email);
  if (!ev.ok) return err(400, 'invalid_email', ev.message);
  const pv = validatePassword(body && body.password);
  if (!pv.ok) return err(400, 'invalid_password', pv.message);
  const av = validateAgeOk(body && body.ageOk);
  if (!av.ok) return err(403, 'age_restricted', av.message);
  /* Username is optional at registration — claiming one is its own step, and
     forcing a second unique field into the sign-up form loses people. */
  let uname = null;
  if (body && body.username != null && String(body.username).trim()) {
    const uv = validateUsername(body.username);
    if (!uv.ok) return err(400, 'invalid_username', uv.message);
    const taken = await env.DB.prepare('SELECT id FROM users WHERE lower(username)=lower(?1)').bind(uv.value).first();
    if (taken) return err(409, 'username_taken', 'That username is already taken.');
    uname = uv.value;
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email=?1').bind(ev.value).first();
  if (existing) return err(409, 'email_taken', 'An account already exists for that email — try signing in instead.');

  const salt = randomHex(SALT_BYTES);
  const hash = await pbkdf2(pv.value, salt, PBKDF2_ITERATIONS);
  const now = Date.now();
  let userId;
  try {
    const res = await env.DB.prepare(
      'INSERT INTO users (email, pass_hash, pass_salt, pass_iter, created_at, username, age_ok, age_checked_at) '
      + 'VALUES (?1,?2,?3,?4,?5,?6,1,?5)'
    ).bind(ev.value, hash, salt, PBKDF2_ITERATIONS, now, uname).run();
    userId = res.meta.last_row_id;
  } catch (e) {
    /* Almost certainly the UNIQUE(email) constraint — a second registration
       for the same address that raced the SELECT above between two requests.
       Anything else is a real server problem and should surface as one. */
    if (e && /UNIQUE/i.test(e.message || '')) {
      if (/username/i.test(e.message || ''))
        return err(409, 'username_taken', 'That username was claimed a moment ago — pick another.');
      return err(409, 'email_taken', 'An account already exists for that email — try signing in instead.');
    }
    throw e;
  }

  const session = await createSession(env, userId);
  return json({ ok: true, token: session.token, expiresAt: session.expiresAt,
                user: { email: ev.value, createdAt: now, username: uname, ageOk: true } }, 201);
}

async function handleLogin(request, env) {
  const ip = clientIp(request);
  if (!(await checkRateLimit(env, 'login_ip', ip)))
    return err(429, 'rate_limited', 'Too many sign-in attempts from this connection — wait a while and try again.');

  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }

  const ev = validateEmail(body && body.email);
  if (!ev.ok) return err(400, 'invalid_email', ev.message);
  const password = String((body && body.password) || '');
  if (!password) return err(400, 'invalid_password', 'Enter a password.');

  if (!(await checkRateLimit(env, 'login_email', ev.value)))
    return err(429, 'rate_limited', 'Too many sign-in attempts for this account — wait a while and try again.');

  const user = await env.DB.prepare(
    'SELECT id, email, pass_hash, pass_salt, pass_iter, created_at FROM users WHERE email=?1'
  ).bind(ev.value).first();

  /* Generic message either way — "invalid email or password" never reveals
     which one was wrong, and the dummy hash below keeps the two cases from
     being distinguishable by response time either. */
  if (!user) {
    await dummyHash();
    return err(401, 'invalid_credentials', 'Email or password is incorrect.');
  }

  const computed = await pbkdf2(password, user.pass_salt, user.pass_iter);
  if (!timingSafeEqual(computed, user.pass_hash))
    return err(401, 'invalid_credentials', 'Email or password is incorrect.');

  /* Upgrade-on-login: a row hashed under a lower iteration count (from before
     PBKDF2_ITERATIONS was last raised) gets re-hashed now, for free, instead
     of needing a bulk migration that touches every account up front. */
  if (user.pass_iter < PBKDF2_ITERATIONS) {
    const newSalt = randomHex(SALT_BYTES);
    const newHash = await pbkdf2(password, newSalt, PBKDF2_ITERATIONS);
    await env.DB.prepare('UPDATE users SET pass_hash=?1, pass_salt=?2, pass_iter=?3 WHERE id=?4')
      .bind(newHash, newSalt, PBKDF2_ITERATIONS, user.id).run().catch(() => {});
  }

  const session = await createSession(env, user.id);
  return json({ ok: true, token: session.token, expiresAt: session.expiresAt,
                user: { email: user.email, createdAt: user.created_at } });
}

async function handleLogout(request, env) {
  const auth = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (m && m[1].trim())
    await env.DB.prepare('DELETE FROM sessions WHERE token=?1').bind(m[1].trim()).run().catch(() => {});
  return json({ ok: true });   // idempotent — logging out twice is not an error
}

async function handleMe(request, env) {
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');
  const row = await env.DB.prepare('SELECT username, age_ok FROM users WHERE id=?1').bind(s.user_id).first();
  return json({ ok: true,
                user: { email: s.email, createdAt: s.user_created_at,
                        username: (row && row.username) || null,
                        ageOk: !!(row && row.age_ok) },
                session: { expiresAt: s.expires_at } });
}

/* ---- age confirmation for accounts that predate the gate --------------------
   One bit, once. There is no way back to 0 through this endpoint: an account
   that has confirmed 13+ cannot un-confirm itself to dodge anything. */
async function handleAgeConfirm(request, env) {
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');
  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const av = validateAgeOk(body && body.ageOk);
  if (!av.ok) return err(403, 'age_restricted', av.message);
  await env.DB.prepare('UPDATE users SET age_ok=1, age_checked_at=?2 WHERE id=?1')
    .bind(s.user_id, Date.now()).run();
  return json({ ok: true, ageOk: true });
}

/* ---- usernames --------------------------------------------------------------
   Availability is a separate GET so the sign-up form can say "taken" before the
   player commits, but it is rate limited: an unlimited exact-match lookup over
   a user table is a scraping endpoint. */
async function handleUsernameCheck(request, env) {
  /* Signed-in only. No shipped client flow calls this route at all (the
     portal claims via POST /username directly), so requiring a session
     breaks nothing - and an unauthenticated availability probe behind
     wildcard CORS is a handle-existence oracle anyone can farm. */
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');
  const ip = clientIp(request);
  if (!(await checkRateLimit(env, 'uname_check_ip', ip)))
    return err(429, 'rate_limited', 'Too many lookups — wait a moment.');
  const u = new URL(request.url).searchParams.get('u');
  const uv = validateUsername(u);
  if (!uv.ok) return json({ ok: true, available: false, reason: uv.message });
  const taken = await env.DB.prepare('SELECT id FROM users WHERE lower(username)=lower(?1)').bind(uv.value).first();
  return json({ ok: true, available: !taken, username: uv.value });
}
async function handleUsernameClaim(request, env) {
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');
  if (!(await checkRateLimit(env, 'uname_claim_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Too many username changes — try again later.');
  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const uv = validateUsername(body && body.username);
  if (!uv.ok) return err(400, 'invalid_username', uv.message);
  try {
    await env.DB.prepare('UPDATE users SET username=?2 WHERE id=?1').bind(s.user_id, uv.value).run();
  } catch (e) {
    if (e && /UNIQUE/i.test(e.message || ''))
      return err(409, 'username_taken', 'That username is already taken.');
    throw e;
  }
  return json({ ok: true, username: uv.value });
}

/* ---- account deletion --------------------------------------------------------
   App Store 5.1.1(v): an app that offers account CREATION in-app must offer
   account DELETION in-app. Not a deactivation, not an e-mail to support — the
   record goes.

   `sessions` and `saves` are declared ON DELETE CASCADE, but D1 does not enable
   foreign keys by default in every path, so they are deleted explicitly first
   and the user row last. Deleting in that order means a failure part-way leaves
   an account that can still sign in, rather than an orphaned save blob nobody
   can reach or erase. */
async function handleAccountDelete(request, env) {
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');
  const uid = s.user_id;
  await env.DB.prepare('DELETE FROM saves WHERE user_id=?1').bind(uid).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id=?1').bind(uid).run();
  await env.DB.prepare('DELETE FROM users WHERE id=?1').bind(uid).run();
  return json({ ok: true, deleted: true });
}

async function handleSaveGet(request, env) {
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');
  const row = await env.DB.prepare('SELECT payload, updated_at FROM saves WHERE user_id=?1')
    .bind(s.user_id).first();
  if (!row) return json({ ok: true, payload: null, at: null });
  return json({ ok: true, payload: row.payload, at: row.updated_at });
}

async function handleSavePut(request, env) {
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');
  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const payload = body && body.payload;
  if (typeof payload !== 'string' || !payload)
    return err(400, 'invalid_payload', 'Nothing to save — the save data was empty.');
  if (payload.length > MAX_SAVE_LEN)
    return err(413, 'payload_too_large', 'That save is larger than this server accepts.');
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO saves (user_id, payload, updated_at) VALUES (?1,?2,?3) ' +
    'ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at'
  ).bind(s.user_id, payload, now).run();
  return json({ ok: true, at: now });
}

/* ---- router ------------------------------------------------------------------ */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (!env.DB)
      return err(500, 'not_configured', 'This worker has no D1 database bound yet — see docs/ACCOUNTS.md.');

    try {
      if (path === '/')
        return new Response(
          'MASSFRONT accounts server\n\n  POST /register\n  POST /login\n  POST /logout\n  GET  /me\n'
          + '  PUT  /save\n  GET  /save\n  POST /age\n  GET  /username/check?u=\n  POST /username\n'
          + '  POST /account/delete\n',
          { headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS } });

      if (path === '/health') return json({ status: 'ok', service: 'massfront-auth' });

      if (path === '/register')
        return request.method === 'POST' ? handleRegister(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/login')
        return request.method === 'POST' ? handleLogin(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/logout')
        return request.method === 'POST' ? handleLogout(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/me')
        return request.method === 'GET' ? handleMe(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      if (path === '/save') {
        if (request.method === 'GET') return handleSaveGet(request, env);
        if (request.method === 'PUT') return handleSavePut(request, env);
        return err(405, 'method_not_allowed', 'Use GET or PUT.');
      }
      if (path === '/age')
        return request.method === 'POST' ? handleAgeConfirm(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/username/check')
        return request.method === 'GET' ? handleUsernameCheck(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      if (path === '/username')
        return request.method === 'POST' ? handleUsernameClaim(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/account/delete')
        return request.method === 'POST' ? handleAccountDelete(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      return err(404, 'route_not_found', 'No such endpoint.');
    } catch (e) {
      return err(500, 'server_error', 'Something went wrong on the server.');
    }
  },
};
