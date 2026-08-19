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

   ---- social ------------------------------------------------------------------
   Later additions, all bearer-token routes:

     POST /verify/request   -> {ok,sent,expiresAt}      issue a 6-digit code
     POST /verify/confirm    {code}                     -> {ok,verified}
     POST /social/friend/request  {username}
     POST /social/friend/respond  {id,accept}
     GET  /social/friends                               -> {friends:[{username}]}
     GET  /social/requests                              -> {requests:[...]}
     POST /social/block     {username}
     POST /social/unblock   {username}
     POST /social/report    {username,reason}

   Two rules hold across all of them, and both are load-bearing:

   1. VERIFICATION FIRST. Every /social/* route passes through socialGate(),
      which refuses an account that has not confirmed its e-mail address, has
      not confirmed it is 13+, or has been social-banned. A player can install
      the game, play it forever, and never be reachable by a stranger until
      they have proved an inbox — which is what makes a ban cost something.

   2. USERNAMES ONLY, NEVER E-MAIL. Nothing in a /social/* response is built by
      spreading a row: requireSession() returns a row carrying the account's
      e-mail address, so one `...s` or `...row` in a response object would ship
      it to another player. Every social response below is an explicit literal,
      and the queries behind them select `username` and never `email`. There is
      also no lookup BY e-mail anywhere — friends are found by exact username,
      and there is no search endpoint, because a searchable account list is a
      directory that can be enumerated.

   Messaging is NOT in this release. schema.sql declares the table shape so the
   eventual change is routes-only, but nothing reads or writes it — a DM
   surface needs the reporting flow here to be live and proven first.
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
  register_ip: { limit: 8, windowSec: 3600, keyed: 'ip' },
  login_ip: { limit: 20, windowSec: 900, keyed: 'ip' },
  login_email: { limit: 8, windowSec: 900, keyed: 'email' },

/* verify_request_user: three codes per twelve hours is enough for "it didn't
   arrive, send another" twice and nowhere near enough to use this worker as a
   free way to send mail at somebody. verify_confirm_user backstops the
   per-code attempt counter for the case where an attacker keeps requesting
   fresh codes to reset it.
   friend requests get TWO buckets: a generous per-account one, and a tight
   per-PAIR one, because repeatedly re-requesting one person is the harassment
   pattern and a per-account limit alone does not see it.
   EVERY window here is strictly under 24h on purpose: checkRateLimit prunes
   `attempts` rows older than 86400000ms, so a longer window would silently
   reset itself when the prune ran. */
  verify_request_user: { limit: 3, windowSec: 43200, keyed: 'user' },   // 3 / 12h
  verify_confirm_user: { limit: 12, windowSec: 3600, keyed: 'user' },
  friend_req_user: { limit: 20, windowSec: 3600, keyed: 'user' },
  friend_req_pair: { limit: 8, windowSec: 43200, keyed: 'pair' },
  friend_respond_user: { limit: 60, windowSec: 3600, keyed: 'user' },
  friends_list_user: { limit: 120, windowSec: 3600, keyed: 'user' },
  requests_list_user: { limit: 120, windowSec: 3600, keyed: 'user' },
  block_user: { limit: 30, windowSec: 3600, keyed: 'user' },
  unblock_user: { limit: 30, windowSec: 3600, keyed: 'user' },
  report_user: { limit: 10, windowSec: 43200, keyed: 'user' },
  /* These two were being asked for by handleUsernameCheck/handleUsernameClaim
     without ever being declared here, which made checkRateLimit throw on
     `rule.windowSec` and turned both username routes into a 500. */
  uname_check_ip: { limit: 60, windowSec: 300, keyed: 'ip' },
  uname_claim_user: { limit: 5, windowSec: 43200, keyed: 'user' },
};

/* The buckets whose akey is a user id, so account deletion can find and purge
   their rows. Derived from the table above rather than written out a second
   time — a new user-keyed bucket is purged the moment it is declared. */
const USER_KEYED_BUCKETS = Object.keys(RATE_LIMITS).filter((b) => RATE_LIMITS[b].keyed === 'user');

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
  /* An undeclared bucket used to reach `rule.windowSec` and throw, which the
     router turned into a blanket 500 - so a route "protected" by a bucket
     nobody declared was broken rather than protected, and because the throw
     fires BEFORE the INSERT it left no trace in `attempts` either. Fail
     CLOSED: an unknown bucket denies, so the mistake surfaces as a visible
     429 on one route and never as an accidentally-open one. */
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
  const email = String(s.email || '');
  await env.DB.prepare('DELETE FROM saves WHERE user_id=?1').bind(uid).run();
  /* Social rows go before the account row for the same reason saves do: a
     failure part-way leaves an account that still works, not orphaned rows
     pointing at a user id that no longer exists (and that a future signup
     could be handed by AUTOINCREMENT reuse if the table were ever rebuilt).
     Both directions of every pair table, because "my friends" and "who has me
     as a friend" are the same row seen from two sides. */
  await env.DB.prepare('DELETE FROM email_verifications WHERE user_id=?1').bind(uid).run().catch(() => {});
  await env.DB.prepare('DELETE FROM friendships WHERE lo_id=?1 OR hi_id=?1').bind(uid).run().catch(() => {});
  await env.DB.prepare('DELETE FROM friend_requests WHERE from_id=?1 OR to_id=?1').bind(uid).run().catch(() => {});
  await env.DB.prepare('DELETE FROM blocks WHERE blocker_id=?1 OR blocked_id=?1').bind(uid).run().catch(() => {});
  /* Reports in BOTH directions go too. That does mean deleting an account
     erases the moderation history filed against it — a real trade-off, made
     this way because App Store 5.1.1(v) deletion means the record goes, and a
     retained report keyed to a live user id is exactly the kind of leftover
     that makes a deletion claim untrue. If moderation ever needs continuity,
     the answer is a pseudonymous hash on the report, not a retained user id. */
  await env.DB.prepare('DELETE FROM reports WHERE reporter_id=?1 OR subject_user=?1').bind(uid).run().catch(() => {});
  /* messages has no routes yet (see schema.sql) — deleted anyway so that
     shipping them later cannot resurrect a deleted player's words. Caught in
     case this worker is running against a database where migration 0001 and
     the social tables have not been applied yet. */
  await env.DB.prepare('DELETE FROM messages WHERE from_id=?1 OR to_id=?1').bind(uid).run().catch(() => {});
  /* Rate-limit rows are personal data too: `attempts` holds this account's
     e-mail address against every sign-in it made. The e-mail-keyed rows go by
     address, the user-keyed ones by id and bucket (bucket-scoped so a numeric
     akey can never collide with an IP-keyed row). Pair-keyed rows are left —
     their key names two accounts, so it is not this account's alone to delete,
     and they prune themselves within 24h. */
  await env.DB.prepare('DELETE FROM attempts WHERE akey=?1').bind(email).run().catch(() => {});
  for (let i = 0; i < USER_KEYED_BUCKETS.length; i++) {
    await env.DB.prepare('DELETE FROM attempts WHERE bucket=?1 AND akey=?2')
      .bind(USER_KEYED_BUCKETS[i], String(uid)).run().catch(() => {});
  }
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

/* ---- e-mail verification -----------------------------------------------------
   Verification is the gate the whole social layer hangs off: an account that
   has not proved it owns its e-mail address cannot reach another player at
   all. That ordering is deliberate — a throwaway account is the cheapest tool
   an abuser has, and a code round-trip is the cheapest thing that raises its
   price. It also means a ban has something to bite on.

   The code is six digits because it is typed on a phone, and six digits is
   only safe because all three of these hold at once: the code expires in
   VERIFY_CODE_TTL_MS, wrong guesses are capped at VERIFY_MAX_ATTEMPTS before
   the row is destroyed, and issuing new codes is rate limited. Any one of
   those missing turns a million-wide keyspace into a weekend of guessing.

   Only a salted PBKDF2 digest is ever stored — see email_verifications in
   schema.sql for why a plain SHA-256 would not be enough here. */
const VERIFY_CODE_TTL_MS = 15 * 60 * 1000;
const VERIFY_MAX_ATTEMPTS = 5;
const MAX_REPORT_REASON_LEN = 500;
const MAX_REPORT_CONTEXT_LEN = 2000;

/* Uniform over 000000..999999. `getRandomValues() % 1000000` is not: 2^32 is
   not a multiple of a million, so the low codes would come up very slightly
   more often. Rejection sampling costs one extra draw about once in 4,300
   calls and removes the bias entirely. */
function randomCode6() {
  const b = new Uint32Array(1);
  const LIMIT = 4294000000;   // largest multiple of 1e6 below 2^32
  let v;
  do { crypto.getRandomValues(b); v = b[0]; } while (v >= LIMIT);
  return String(v % 1000000).padStart(6, '0');
}
/* '<saltHex>$<digestHex>' in one column, so the stored shape stays the four
   columns the schema declares and the salt still travels with the digest. */
async function hashVerifyCode(code, saltHex) {
  const digest = await pbkdf2(String(code), saltHex, PBKDF2_ITERATIONS);
  return saltHex + '$' + digest;
}
async function verifyCodeMatches(code, stored) {
  const s = String(stored || '');
  const cut = s.indexOf('$');
  if (cut <= 0) return false;              // malformed row fails closed
  const saltHex = s.slice(0, cut);
  const digest = await pbkdf2(String(code), saltHex, PBKDF2_ITERATIONS);
  return timingSafeEqual(saltHex + '$' + digest, s);
}

/* ---- TODO-provider ------------------------------------------------------------
   THE ONE INTEGRATION POINT FOR OUTBOUND E-MAIL. No provider is wired up yet,
   so this is the entire seam: when a transactional sender is chosen (Resend,
   Postmark, MailChannels, SES, ...), it is implemented HERE and nothing else
   in this worker changes. Everything around it — issuing, hashing, storing,
   expiring, confirming, rate limiting — already works and is already tested.

   Contract:
     - returns { delivered: true } once a provider accepts the message;
     - returns { delivered: false, reason } otherwise;
     - MUST NOT throw. A provider outage is not a reason for /verify/request to
       500; the code is already stored and the player can ask again.
     - MUST NOT log `code`. It is a credential for the length of its TTL.

   Sketch of the eventual body:
     const r = await fetch('https://api.<provider>/send', {
       method: 'POST',
       headers: { authorization: 'Bearer ' + env.MAIL_API_KEY,
                  'content-type': 'application/json' },
       body: JSON.stringify({ to: email, from: env.MAIL_FROM,
                              subject: 'Your MASSFRONT code',
                              text: 'Your code is ' + code + '. It expires in 15 minutes.' })
     });
     return r.ok ? { delivered: true } : { delivered: false, reason: 'provider_' + r.status };  */
async function sendVerificationEmail(env, email, code) {
  return { delivered: false, reason: 'no_provider' };
}

/* POST /verify/request — issue a code for the signed-in account's own address.
   There is no `email` parameter on purpose: the address is whatever the
   session already belongs to, so this endpoint can never be pointed at a
   stranger's inbox. The code is NEVER in the response unless the worker is
   explicitly running with DEV_ECHO_CODE=1, which exists so this path is
   testable end to end before a provider is wired up — see wrangler.toml. */
async function handleVerifyRequest(request, env) {
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');

  const u = await env.DB.prepare('SELECT verified_at FROM users WHERE id=?1').bind(s.user_id).first();
  if (u && u.verified_at != null)
    return json({ ok: true, verified: true, alreadyVerified: true });

  if (!(await checkRateLimit(env, 'verify_request_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Too many verification e-mails requested — try again later.');

  const code = randomCode6();
  const now = Date.now();
  const expiresAt = now + VERIFY_CODE_TTL_MS;
  const codeHash = await hashVerifyCode(code, randomHex(SALT_BYTES));
  /* Upsert, not insert: asking for a new code invalidates the old one and
     resets the attempt counter, so a player who mistyped three times can
     recover without waiting out an expiry. */
  await env.DB.prepare(
    'INSERT INTO email_verifications (user_id, code_hash, expires_at, attempts, created_at) VALUES (?1,?2,?3,0,?4) '
    + 'ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, '
    + 'attempts=0, created_at=excluded.created_at'
  ).bind(s.user_id, codeHash, expiresAt, now).run();

  const sent = await sendVerificationEmail(env, s.email, code).catch(() => ({ delivered: false, reason: 'threw' }));
  const out = { ok: true, sent: !!(sent && sent.delivered), expiresAt };
  if (env.DEV_ECHO_CODE === '1') out.code = code;   // DEV ONLY — never set in production
  return json(out);
}

/* POST /verify/confirm {code} */
async function handleVerifyConfirm(request, env) {
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');
  if (!(await checkRateLimit(env, 'verify_confirm_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Too many code attempts — try again later.');

  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const code = String((body && body.code) || '').trim();
  if (!/^[0-9]{6}$/.test(code))
    return err(400, 'invalid_code', 'Enter the 6-digit code from your e-mail.');

  const row = await env.DB.prepare(
    'SELECT user_id, code_hash, expires_at, attempts FROM email_verifications WHERE user_id=?1'
  ).bind(s.user_id).first();
  if (!row) return err(400, 'no_code', 'Request a verification code first.');

  if (row.expires_at <= Date.now()) {
    await env.DB.prepare('DELETE FROM email_verifications WHERE user_id=?1').bind(s.user_id).run().catch(() => {});
    return err(400, 'code_expired', 'That code has expired — request a new one.');
  }
  /* The cap is checked BEFORE the compare and the row is destroyed when it is
     hit, so the (VERIFY_MAX_ATTEMPTS+1)th guess never gets to test a code at
     all — the player has to request a fresh one, which is itself limited. */
  if (row.attempts >= VERIFY_MAX_ATTEMPTS) {
    await env.DB.prepare('DELETE FROM email_verifications WHERE user_id=?1').bind(s.user_id).run().catch(() => {});
    return err(429, 'too_many_attempts', 'Too many wrong codes — request a new one.');
  }

  if (!(await verifyCodeMatches(code, row.code_hash))) {
    await env.DB.prepare('UPDATE email_verifications SET attempts=attempts+1 WHERE user_id=?1')
      .bind(s.user_id).run().catch(() => {});
    return err(400, 'invalid_code', "That code isn't right — check it and try again.");
  }

  const now = Date.now();
  await env.DB.prepare('UPDATE users SET verified_at=?2 WHERE id=?1').bind(s.user_id, now).run();
  await env.DB.prepare('DELETE FROM email_verifications WHERE user_id=?1').bind(s.user_id).run().catch(() => {});
  return json({ ok: true, verified: true, verifiedAt: now });
}

/* ---- the social gate ----------------------------------------------------------
   Three conditions, one place. Every /social/* handler starts with socialGate()
   and returns whatever it hands back — there is no route that reaches another
   player without passing through here, which is the only way this stays true
   as routes are added.

   Order matters: a banned account is told it is banned rather than being sent
   off to verify an e-mail that will not help, and the age gate is checked last
   because it is the one the client can resolve inline (POST /age). */
async function requireVerified(s, env) {
  const row = await env.DB.prepare('SELECT verified_at, age_ok, social_banned FROM users WHERE id=?1')
    .bind(s.user_id).first();
  if (!row) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');
  if (Number(row.social_banned) === 1)
    return err(403, 'social_banned', 'Social features are turned off for this account.');
  if (row.verified_at == null)
    return err(403, 'unverified', 'Verify your e-mail address before using friends and chat.');
  if (Number(row.age_ok) !== 1)
    return err(403, 'age_restricted', 'Confirm your age before using friends and chat.');
  return null;
}
/* Returns { s } to proceed, or { res } to return immediately. */
async function socialGate(request, env) {
  const s = await requireSession(request, env);
  if (!s) return { res: err(401, 'unauthenticated', 'Your session has expired — sign in again.') };
  const gate = await requireVerified(s, env);
  if (gate) return { res: gate };
  return { s };
}

/* ---- pair helpers -------------------------------------------------------------
   Friendship rows are canonical (lo_id < hi_id, enforced by a CHECK), so every
   read and write of a pair goes through pairKey and there is exactly one row
   to find, delete, or fail to insert. */
function pairKey(a, b) {
  const x = Number(a), y = Number(b);
  return x < y ? { lo: x, hi: y } : { lo: y, hi: x };
}
/* Blocking is symmetric in effect: BOTH tables' directions are checked, so a
   blocked player cannot route around it by being the one who reaches out. */
async function blockedEitherWay(env, a, b) {
  const row = await env.DB.prepare(
    'SELECT blocker_id FROM blocks WHERE (blocker_id=?1 AND blocked_id=?2) OR (blocker_id=?2 AND blocked_id=?1)'
  ).bind(Number(a), Number(b)).first();
  return !!row;
}
/* EXACT username match, always. There is deliberately no search, no prefix
   match and no "people you may know": any of those turn the user table into a
   directory that can be enumerated, which is the thing the username exists to
   avoid in the first place. You add someone whose handle you already know. */
async function findUserByUsername(env, raw) {
  const uv = validateUsername(raw);
  if (!uv.ok) return { ok: false, res: err(400, 'invalid_username', uv.message) };
  const row = await env.DB.prepare('SELECT id, username FROM users WHERE lower(username)=lower(?1)')
    .bind(uv.value).first();
  if (!row) return { ok: false, res: err(404, 'no_such_user', 'No player is using that username.') };
  return { ok: true, user: row };
}
async function usernameOf(env, userId) {
  const row = await env.DB.prepare('SELECT username FROM users WHERE id=?1').bind(Number(userId)).first();
  return (row && row.username) || null;
}

/* POST /social/friend/request {username} */
async function handleFriendRequest(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  const s = g.s;
  if (!(await checkRateLimit(env, 'friend_req_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Too many friend requests — try again later.');

  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const found = await findUserByUsername(env, body && body.username);
  if (!found.ok) return found.res;
  const target = found.user;
  if (Number(target.id) === Number(s.user_id))
    return err(400, 'self_request', "You can't add yourself.");

  /* A second bucket keyed on the PAIR, so one account cannot re-request the
     same player over and over inside its generous per-user allowance — which
     is what "friend request" harassment actually looks like. */
  const pair = pairKey(s.user_id, target.id);
  if (!(await checkRateLimit(env, 'friend_req_pair', pair.lo + ':' + pair.hi)))
    return err(429, 'rate_limited', 'You have sent that player too many requests — try again later.');

  /* One generic answer for "they blocked you" and "you blocked them": telling
     the sender which it was hands them a block detector. */
  if (await blockedEitherWay(env, s.user_id, target.id))
    return err(403, 'blocked', "You can't send a request to that player.");

  const already = await env.DB.prepare('SELECT lo_id FROM friendships WHERE lo_id=?1 AND hi_id=?2')
    .bind(pair.lo, pair.hi).first();
  if (already) return err(409, 'already_friends', 'You are already friends with that player.');

  const incoming = await env.DB.prepare(
    "SELECT id FROM friend_requests WHERE from_id=?1 AND to_id=?2 AND status='pending'"
  ).bind(Number(target.id), Number(s.user_id)).first();
  if (incoming)
    return err(409, 'request_incoming', 'That player already sent you a request — answer it instead.');

  const now = Date.now();
  try {
    const res = await env.DB.prepare(
      "INSERT INTO friend_requests (from_id, to_id, status, created_at) VALUES (?1,?2,'pending',?3)"
    ).bind(Number(s.user_id), Number(target.id), now).run();
    return json({ ok: true, requested: true, id: Number(res.meta.last_row_id), username: target.username }, 201);
  } catch (e) {
    /* The partial unique index on (from_id,to_id) WHERE status='pending' is
       what actually prevents duplicates — two simultaneous requests cannot
       both pass a SELECT, but they cannot both pass this. */
    if (e && /UNIQUE/i.test(e.message || ''))
      return err(409, 'request_pending', 'You already have a pending request to that player.');
    throw e;
  }
}

/* POST /social/friend/respond {id, accept} */
async function handleFriendRespond(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  const s = g.s;
  if (!(await checkRateLimit(env, 'friend_respond_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Too many responses — try again later.');

  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const id = Number(body && body.id);
  if (!Number.isFinite(id) || id <= 0) return err(400, 'bad_request', 'Which request?');
  const accept = (body && body.accept) === true;

  const row = await env.DB.prepare('SELECT id, from_id, to_id, status FROM friend_requests WHERE id=?1')
    .bind(id).first();
  /* One answer for "no such id", "not yours" and "already answered": the
     recipient check and the existence check are the same 404 so a stranger
     cannot probe request ids for who is talking to whom. */
  if (!row || Number(row.to_id) !== Number(s.user_id) || row.status !== 'pending')
    return err(404, 'no_such_request', 'That friend request is no longer waiting for an answer.');

  const now = Date.now();
  if (!accept) {
    await env.DB.prepare("UPDATE friend_requests SET status='declined', responded_at=?2 WHERE id=?1")
      .bind(id, now).run();
    return json({ ok: true, accepted: false });
  }
  if (await blockedEitherWay(env, s.user_id, row.from_id)) {
    await env.DB.prepare("UPDATE friend_requests SET status='declined', responded_at=?2 WHERE id=?1")
      .bind(id, now).run().catch(() => {});
    return err(403, 'blocked', "You can't become friends with that player.");
  }

  const pair = pairKey(row.from_id, row.to_id);
  await env.DB.prepare('INSERT OR IGNORE INTO friendships (lo_id, hi_id, created_at) VALUES (?1,?2,?3)')
    .bind(pair.lo, pair.hi, now).run();
  await env.DB.prepare("UPDATE friend_requests SET status='accepted', responded_at=?2 WHERE id=?1")
    .bind(id, now).run();
  /* If they had also requested us, that invitation is answered too — leaving
     it pending would show a request from someone already on the friends list. */
  await env.DB.prepare(
    "DELETE FROM friend_requests WHERE status='pending' AND ((from_id=?1 AND to_id=?2) OR (from_id=?2 AND to_id=?1))"
  ).bind(pair.lo, pair.hi).run().catch(() => {});

  return json({ ok: true, accepted: true, username: await usernameOf(env, row.from_id) });
}

/* GET /social/friends — USERNAMES ONLY.
   Note the explicit object literal below. Nothing in any /social/* response is
   built by spreading a database row or the session: requireSession() carries
   the account's own e-mail address on it, so a single `...row` here would ship
   every friend's e-mail to every player who has them added. The friends query
   selects the username column and nothing else for the same reason. */
async function handleFriendsList(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  const s = g.s;
  if (!(await checkRateLimit(env, 'friends_list_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Slow down a moment.');
  const res = await env.DB.prepare(
    'SELECT u.username AS username FROM friendships f '
    + 'JOIN users u ON u.id = (CASE WHEN f.lo_id=?1 THEN f.hi_id ELSE f.lo_id END) '
    + 'WHERE f.lo_id=?1 OR f.hi_id=?1 ORDER BY lower(u.username)'
  ).bind(Number(s.user_id)).all();
  const rows = (res && res.results) || [];
  const friends = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].username) friends.push({ username: rows[i].username });
  }
  return json({ ok: true, friends, count: friends.length });
}

/* GET /social/requests — incoming and still pending. Usernames only, same
   rule as above. Requests from a player either side has since blocked are
   filtered out rather than deleted, so unblocking does not silently destroy an
   invitation that was never answered. */
async function handleRequestsList(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  const s = g.s;
  if (!(await checkRateLimit(env, 'requests_list_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Slow down a moment.');
  const res = await env.DB.prepare(
    'SELECT r.id AS id, r.created_at AS created_at, u.username AS username '
    + 'FROM friend_requests r JOIN users u ON u.id = r.from_id '
    + "WHERE r.to_id=?1 AND r.status='pending' AND NOT EXISTS ("
    + 'SELECT 1 FROM blocks b WHERE (b.blocker_id=?1 AND b.blocked_id=r.from_id) '
    + 'OR (b.blocker_id=r.from_id AND b.blocked_id=?1)) '
    + 'ORDER BY r.created_at DESC'
  ).bind(Number(s.user_id)).all();
  const rows = (res && res.results) || [];
  const requests = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].username)
      requests.push({ id: Number(rows[i].id), username: rows[i].username, at: Number(rows[i].created_at) });
  }
  return json({ ok: true, requests, count: requests.length });
}

/* POST /social/block {username}
   Blocking is not just a flag for later: it severs the relationship now. The
   friendship row goes, every request between the pair goes, and the block
   itself makes new ones impossible from either side. A block that left the
   friendship in place would still show the blocked player in a friends list
   somewhere, which is exactly what the player was trying to stop. */
async function handleBlock(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  const s = g.s;
  if (!(await checkRateLimit(env, 'block_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Too many changes — try again later.');

  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const found = await findUserByUsername(env, body && body.username);
  if (!found.ok) return found.res;
  const target = found.user;
  if (Number(target.id) === Number(s.user_id))
    return err(400, 'self_block', "You can't block yourself.");

  const now = Date.now();
  const pair = pairKey(s.user_id, target.id);
  await env.DB.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?1,?2,?3)')
    .bind(Number(s.user_id), Number(target.id), now).run();
  await env.DB.prepare('DELETE FROM friendships WHERE lo_id=?1 AND hi_id=?2').bind(pair.lo, pair.hi).run().catch(() => {});
  await env.DB.prepare(
    'DELETE FROM friend_requests WHERE (from_id=?1 AND to_id=?2) OR (from_id=?2 AND to_id=?1)'
  ).bind(pair.lo, pair.hi).run();
  return json({ ok: true, blocked: true, username: target.username });
}

/* POST /social/unblock {username} — idempotent; unblocking someone who was
   never blocked is a no-op, not an error. It does NOT restore the friendship
   the block removed: that was destroyed on purpose and has to be re-asked for. */
async function handleUnblock(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  const s = g.s;
  if (!(await checkRateLimit(env, 'unblock_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Too many changes — try again later.');

  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const found = await findUserByUsername(env, body && body.username);
  if (!found.ok) return found.res;
  const target = found.user;
  const res = await env.DB.prepare('DELETE FROM blocks WHERE blocker_id=?1 AND blocked_id=?2')
    .bind(Number(s.user_id), Number(target.id)).run();
  const removed = !!(res && res.meta && res.meta.changes);
  return json({ ok: true, blocked: false, removed, username: target.username });
}

/* POST /social/report {username, reason, context?}
   Apple 1.2 wants a reporting mechanism for user-generated content, and a
   report is only useful if it still means something after the reported player
   deletes whatever prompted it — hence body_snapshot, captured here and never
   updated afterwards. The snapshot carries usernames and the reporter's own
   words; it must never carry an e-mail address. */
function buildReportSnapshot(reporterName, subjectName, reason, context, at) {
  return JSON.stringify({
    v: 1,
    at,
    reporter: reporterName || null,
    subject: subjectName || null,
    reason: String(reason || '').slice(0, MAX_REPORT_REASON_LEN),
    context: context ? String(context).slice(0, MAX_REPORT_CONTEXT_LEN) : null,
  });
}
async function handleReport(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  const s = g.s;
  if (!(await checkRateLimit(env, 'report_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Too many reports — try again later.');

  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const found = await findUserByUsername(env, body && body.username);
  if (!found.ok) return found.res;
  const target = found.user;
  if (Number(target.id) === Number(s.user_id))
    return err(400, 'self_report', "You can't report yourself.");
  const reason = String((body && body.reason) || '').trim();
  if (!reason) return err(400, 'invalid_reason', 'Tell us what happened.');

  const now = Date.now();
  const snapshot = buildReportSnapshot(
    await usernameOf(env, s.user_id), target.username, reason, body && body.context, now);
  const res = await env.DB.prepare(
    'INSERT INTO reports (reporter_id, subject_user, body_snapshot, created_at, resolved) VALUES (?1,?2,?3,?4,0)'
  ).bind(Number(s.user_id), Number(target.id), snapshot, now).run();
  return json({ ok: true, reported: true, id: Number(res.meta.last_row_id) }, 201);
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
          + '  POST /account/delete\n'
          + '  POST /verify/request\n  POST /verify/confirm\n'
          + '  POST /social/friend/request\n  POST /social/friend/respond\n'
          + '  GET  /social/friends\n  GET  /social/requests\n'
          + '  POST /social/block\n  POST /social/unblock\n  POST /social/report\n',
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

      if (path === '/verify/request')
        return request.method === 'POST' ? handleVerifyRequest(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/verify/confirm')
        return request.method === 'POST' ? handleVerifyConfirm(request, env) : err(405, 'method_not_allowed', 'Use POST.');

      /* Every route below is behind socialGate() — verified e-mail, age
         confirmed, not social-banned. Adding a route here without that call is
         the one mistake that matters in this file. */
      if (path === '/social/friend/request')
        return request.method === 'POST' ? handleFriendRequest(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/social/friend/respond')
        return request.method === 'POST' ? handleFriendRespond(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/social/friends')
        return request.method === 'GET' ? handleFriendsList(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      if (path === '/social/requests')
        return request.method === 'GET' ? handleRequestsList(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      if (path === '/social/block')
        return request.method === 'POST' ? handleBlock(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/social/unblock')
        return request.method === 'POST' ? handleUnblock(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/social/report')
        return request.method === 'POST' ? handleReport(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      return err(404, 'route_not_found', 'No such endpoint.');
    } catch (e) {
      return err(500, 'server_error', 'Something went wrong on the server.');
    }
  },
};
