/* ============================================================================
   MASSFRONT ACCOUNTS SERVER  —  Cloudflare Worker + D1
   ----------------------------------------------------------------------------
   Core account routes:

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
     GET  /social/capabilities
     POST /social/message/send  {username,body}
     GET  /social/messages      ?with=<username>&before=<message-id>&limit=<n>
     POST /social/message/report {messageId,reason}
     POST /social/world/send    {body}
     GET  /social/world/messages ?before=<message-id>&limit=<n>
     POST /social/world/report  {messageId,reason}
     POST /social/presence      {state}
     GET  /social/presence
     POST /social/online/heartbeat
     GET  /social/online

   Two rules hold across all of them, and both are load-bearing:

   1. POLICY FIRST. Every ordinary /social/* route passes through socialGate(),
      which always enforces authentication, age, bans, sanctions and the
      moderation ledger. E-mail ownership is also required by default; an
      exact operator flag may temporarily make it optional when the deployed
      service cannot deliver codes. That exception never marks an account
      verified and does not weaken the other gates.

   2. USERNAMES ONLY, NEVER E-MAIL. Nothing in a /social/* response is built by
      spreading a row: requireSession() returns a row carrying the account's
      e-mail address, so one `...s` or `...row` in a response object would ship
      it to another player. Every social response below is an explicit literal,
      and the queries behind them select `username` and never `email`. There is
      also no lookup BY e-mail anywhere — friends are found by exact username,
      and there is no search endpoint, because a searchable account list is a
      directory that can be enumerated.

   Chat and presence are a compiled, tested foundation, not an active release
   feature. Capability discovery reports both false unless the operator sets
   the exact feature flags and the required tables pass a live schema probe.
   The checked-in wrangler configuration intentionally enables neither flag.
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
const MATCH_RECORD_TTL_MS = 5 * 60 * 1000;
const MATCH_TOKEN_TTL_MS = 60 * 1000;
const MATCH_PROTOCOL_VERSION = 1;
const MATCH_TICK_HZ = 30;
const MATCH_INPUT_DELAY_MIN = 2;
const MATCH_INPUT_DELAY_MAX = 3;
const MATCH_RECONNECT_GRACE_MS = 10 * 1000;
const MATCH_MAX_MESSAGE_BYTES = 16 * 1024;
const MATCH_MAX_COMMAND_BYTES = 2048;
const MATCH_MAX_COMMANDS_PER_BATCH = 8;
const MATCH_MAX_MESSAGES_PER_SECOND = 45;
const MATCH_MAX_COMMANDS_PER_SECOND = 180;
const MATCH_MAX_BYTES_PER_SECOND = 128 * 1024;
const BUILD_VERSION_RE = /^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}(?:-[a-z0-9](?:[a-z0-9.-]{0,30}[a-z0-9])?)?$/i;
const HASH_256_RE = /^[a-f0-9]{64}$/i;

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
  capabilities_user: { limit: 120, windowSec: 3600, keyed: 'user' },
  message_send_user: { limit: 30, windowSec: 60, keyed: 'user' },
  message_send_pair: { limit: 120, windowSec: 3600, keyed: 'pair' },
  message_list_user: { limit: 240, windowSec: 3600, keyed: 'user' },
  message_report_user: { limit: 10, windowSec: 43200, keyed: 'user' },
  world_send_user: { limit: 12, windowSec: 60, keyed: 'user' },
  world_list_user: { limit: 240, windowSec: 3600, keyed: 'user' },
  world_report_user: { limit: 10, windowSec: 43200, keyed: 'user' },
  presence_write_user: { limit: 240, windowSec: 3600, keyed: 'user' },
  presence_list_user: { limit: 240, windowSec: 3600, keyed: 'user' },
  online_heartbeat_user: { limit: 120, windowSec: 3600, keyed: 'user' },
  online_count_user: { limit: 240, windowSec: 3600, keyed: 'user' },
  lobby_create_user: { limit: 12, windowSec: 3600, keyed: 'user' },
  lobby_mutate_user: { limit: 120, windowSec: 3600, keyed: 'user' },
  lobby_read_user: { limit: 360, windowSec: 3600, keyed: 'user' },
  lobby_invite_user: { limit: 40, windowSec: 3600, keyed: 'user' },
  lobby_invite_pair: { limit: 12, windowSec: 43200, keyed: 'pair' },
  lobby_invites_list_user: { limit: 180, windowSec: 3600, keyed: 'user' },
  lobby_compat_user: { limit: 120, windowSec: 3600, keyed: 'user' },
  lobby_launch_user: { limit: 30, windowSec: 3600, keyed: 'user' },
  match_token_user: { limit: 30, windowSec: 3600, keyed: 'user' },
  appeal_create_user: { limit: 5, windowSec: 43200, keyed: 'user' },
  appeal_list_user: { limit: 60, windowSec: 3600, keyed: 'user' },
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
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
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
   required. Admission is ONE conditional INSERT. A separate COUNT followed
   by INSERT lets parallel requests all observe the same pre-insert count and
   overrun the limit; SQLite serializes this write statement and evaluates the
   indexed subquery while it owns the write transaction. */
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
  const now = Date.now(), cutoff = now - rule.windowSec * 1000;
  const admission = await env.DB.prepare(
    'INSERT INTO attempts (bucket,akey,created_at) '
    + 'SELECT ?1,?2,?4 WHERE ('
    + 'SELECT COUNT(*) FROM attempts WHERE bucket=?1 AND akey=?2 AND created_at>?3'
    + ')<?5'
  ).bind(bucket, key, cutoff, now, rule.limit).run();
  const admitted = Number(admission && admission.meta && admission.meta.changes) === 1;
  if (!admitted) return false;
  /* Opportunistic prune on ~2% of calls — keeps the table bounded without a
     cron trigger or a second binding. */
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM attempts WHERE created_at < ?1')
      .bind(now - 86400000).run().catch(() => {});
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
    'SELECT id, email, pass_hash, pass_salt, pass_iter, created_at, username, age_ok FROM users WHERE email=?1'
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
                /* Login must hydrate the same canonical account identity as
                   register and /me. Omitting these two persisted fields made
                   every fresh sign-in look like an unnamed legacy account. */
                user: { email: user.email, createdAt: user.created_at,
                        username: user.username || null, ageOk: !!user.age_ok } });
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
function redactDeletedIdentity(snapshot, username) {
  let value;try{value=JSON.parse(String(snapshot||'{}'));}catch(e){value={v:1,kind:'unparseable_report'};}
  const target=String(username||'').toLowerCase(),identityKeys=new Set(['reporter','subject','from','to','username']);
  function visit(node){
    if(!node||typeof node!=='object')return;
    for(const key of Object.keys(node)){
      if(identityKeys.has(key)&&typeof node[key]==='string'&&node[key].toLowerCase()===target)node[key]=null;
      else visit(node[key]);
    }
  }
  if(target)visit(value);
  return JSON.stringify(value);
}
async function preserveModerationEvidenceForDeletion(env, uid) {
  const deletedName=await usernameOf(env,uid);
  const rows = await env.DB.prepare(
    'SELECT id,reporter_id,subject_user,body_snapshot,created_at FROM reports '
    + 'WHERE reporter_id=?1 OR subject_user=?1 ORDER BY id'
  ).bind(Number(uid)).all();
  for (const row of (rows.results || [])) {
    const redacted=redactDeletedIdentity(row.body_snapshot,deletedName);
    const existing = await env.DB.prepare('SELECT id,subject_ref,evidence_snapshot FROM moderation_cases WHERE report_id=?1')
      .bind(Number(row.id)).first();
    if (existing) {
      if(String(existing.evidence_snapshot)!==redacted){
        const now=Date.now(),changed=await env.DB.batch([
          env.DB.prepare('UPDATE moderation_cases SET evidence_snapshot=?2,updated_at=?3 WHERE id=?1').bind(existing.id,redacted,now),
          env.DB.prepare("INSERT INTO moderation_events(case_id,subject_ref,actor_kind,actor_ref,action,reason,details_json,created_at) VALUES(?1,?2,'system','account-deletion','identity_redacted','Remove deleted username from retained evidence',NULL,?3)").bind(existing.id,existing.subject_ref,now),
        ]);
        if(Number(changed[0].meta.changes)!==1||Number(changed[1].meta.changes)!==1)throw new Error('moderation_deletion_redaction');
      }
      continue;
    }
    const reporterRef = await ensureModerationSubject(env, row.reporter_id);
    const subjectRef = await ensureModerationSubject(env, row.subject_user);
    const caseId = randomHex(16), now = Date.now();
    const made = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO moderation_cases(id,report_id,reporter_ref,subject_ref,evidence_snapshot,state,claimed_by,created_at,updated_at,resolved_at) "
        + "VALUES(?1,?2,?3,?4,?5,'open',NULL,?6,?6,NULL)"
      ).bind(caseId, Number(row.id), reporterRef, subjectRef, redacted, Number(row.created_at) || now),
      env.DB.prepare(
        "INSERT INTO moderation_events(case_id,subject_ref,actor_kind,actor_ref,action,reason,details_json,created_at) "
        + "VALUES(?1,?2,'system','account-deletion','legacy_report_preserved','Preserve report evidence before identity deletion',NULL,?3)"
      ).bind(caseId, subjectRef, now),
    ]);
    if (Number(made[0].meta.changes) !== 1 || Number(made[1].meta.changes) !== 1)
      throw new Error('moderation_deletion_preservation');
  }
}
async function handleAccountDelete(request, env) {
  const s = await requireSession(request, env);
  if (!s) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');
  const uid = s.user_id;
  const email = String(s.email || '');
  const moderationReady = await moderationSchemaAvailable(env);
  /* Preserve every relevant report under opaque subject refs BEFORE deleting
     any account data. If the moderation schema exists but preservation fails,
     the delete fails rather than silently erasing an audit record. */
  if (moderationReady) await preserveModerationEvidenceForDeletion(env, uid);
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
  /* Live reports in BOTH directions go too. Review evidence was copied or
     updated above under an opaque subject_ref, with the deleting account's
     structured username fields redacted. The identity map is removed in the
     final batch, so retained evidence has no user-id or username join path. */
  await env.DB.prepare('DELETE FROM reports WHERE reporter_id=?1 OR subject_user=?1').bind(uid).run().catch(() => {});
  /* Messages and ephemeral presence are both purged explicitly. These deletes
     are caught so account deletion still succeeds against an older database
     where the social migrations have not been applied yet. */
  await env.DB.prepare('DELETE FROM messages WHERE from_id=?1 OR to_id=?1').bind(uid).run().catch(() => {});
  await env.DB.prepare('DELETE FROM world_messages WHERE user_id=?1').bind(uid).run().catch(() => {});
  await env.DB.prepare('DELETE FROM presence WHERE user_id=?1').bind(uid).run().catch(() => {});
  await env.DB.prepare('DELETE FROM online_heartbeats WHERE user_id=?1').bind(uid).run().catch(() => {});
  /* Launch credentials are ephemeral but still account-linked. Explicitly
     purge them because D1 foreign-key enforcement is not assumed. A host
     deletion cancels its launch; a non-host deletion removes that player's
     compatibility and seat so no credential remains usable. */
  await env.DB.prepare(
    'DELETE FROM multiplayer_match_seats WHERE user_id=?1 OR lobby_id IN (SELECT id FROM multiplayer_lobbies WHERE host_id=?1)'
  ).bind(uid).run().catch(() => {});
  await env.DB.prepare('DELETE FROM multiplayer_matches WHERE host_user_id=?1').bind(uid).run().catch(() => {});
  await env.DB.prepare(
    'DELETE FROM multiplayer_lobby_compatibility WHERE user_id=?1 OR lobby_id IN (SELECT id FROM multiplayer_lobbies WHERE host_id=?1)'
  ).bind(uid).run().catch(() => {});
  /* Foreign keys are not guaranteed to be enabled on every D1 execution
     path. Purge the COMPLETE footprint of lobbies this account hosts before
     deleting only this player's rows elsewhere. Without these two hosted-id
     deletes, other members and their invites become orphans when the lobby
     row is removed with PRAGMA foreign_keys=OFF. */
  await env.DB.prepare(
    'DELETE FROM multiplayer_invites WHERE lobby_id IN (SELECT id FROM multiplayer_lobbies WHERE host_id=?1)'
  ).bind(uid).run().catch(() => {});
  await env.DB.prepare(
    'DELETE FROM multiplayer_lobby_members WHERE lobby_id IN (SELECT id FROM multiplayer_lobbies WHERE host_id=?1)'
  ).bind(uid).run().catch(() => {});
  await env.DB.prepare('DELETE FROM multiplayer_invites WHERE from_id=?1 OR to_id=?1').bind(uid).run().catch(() => {});
  await env.DB.prepare('DELETE FROM multiplayer_lobby_members WHERE user_id=?1').bind(uid).run().catch(() => {});
  await env.DB.prepare('DELETE FROM multiplayer_lobbies WHERE host_id=?1').bind(uid).run().catch(() => {});
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
  if (moderationReady) {
    await env.DB.batch([
      env.DB.prepare('UPDATE moderation_sanctions SET user_id=NULL WHERE user_id=?1').bind(uid),
      env.DB.prepare('DELETE FROM moderation_subjects WHERE user_id=?1').bind(uid),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?1').bind(uid),
      env.DB.prepare('DELETE FROM users WHERE id=?1').bind(uid),
    ]);
  } else {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=?1').bind(uid).run();
    await env.DB.prepare('DELETE FROM users WHERE id=?1').bind(uid).run();
  }
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

/* ---- optional e-mail verification --------------------------------------------
   Verification is account metadata, not a gameplay or Social entitlement.
   MASSFRONT's browser-install release must never lose multiplayer because a
   mail provider or deployment variable is missing. Age, username, moderation,
   bans and rate limits remain the access controls; this optional workflow may
   still confirm an address for future account-recovery features.

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
const SOCIAL_PROTOCOL_VERSION = 1;
const MAX_MESSAGE_CHARS = 500;
const MAX_MESSAGE_BYTES = 2000;
const MESSAGE_PAGE_DEFAULT = 30;
const MESSAGE_PAGE_MAX = 50;
const PRESENCE_TTL_MS = 120000;
const PRESENCE_LIST_MAX = 512;
const ONLINE_HEARTBEAT_TTL_MS = 120000;
const LOBBY_TTL_MS = 2 * 3600 * 1000;
const LOBBY_INVITE_TTL_MS = 30 * 60 * 1000;
const LOBBY_MAX_MEMBERS = 4;
const MOD_REASON_MAX = 500;
const MOD_DETAILS_MAX = 2000;
const MOD_QUEUE_MAX = 100;

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

/* ---- Cloudflare Email Service binding ----------------------------------------
   THE ONE INTEGRATION POINT FOR OUTBOUND E-MAIL. When env.EMAIL (a native
   `send_email` binding) and env.MAIL_FROM are both configured, the structured
   MessageBuilder path is used. When either is absent, the old no-provider
   behavior remains exactly intact. See wrangler.toml for the intentionally
   commented binding/var contract; no live domain is assumed here.

   Contract:
     - returns { delivered: true } once a provider accepts the message;
     - returns { delivered: false, reason } otherwise;
     - MUST NOT throw. A provider outage is not a reason for /verify/request to
       500; the code is already stored and the player can ask again.
     - MUST NOT log `code`. It is a credential for the length of its TTL.

   No code, bearer token, raw provider error, or message body is logged. */
async function sendVerificationEmail(env, email, code) {
  if (!env || !env.EMAIL || typeof env.EMAIL.send !== 'function')
    return { delivered: false, reason: 'no_provider' };
  const from = validateEmail(env.MAIL_FROM);
  const to = validateEmail(email);
  if (!from.ok) return { delivered: false, reason: 'mail_from_invalid' };
  if (!to.ok) return { delivered: false, reason: 'recipient_invalid' };
  const value = String(code || '');
  if (!/^[0-9]{6}$/.test(value)) return { delivered: false, reason: 'code_invalid' };
  try {
    await env.EMAIL.send({
      to: to.value,
      from: from.value,
      subject: 'Your MASSFRONT verification code',
      text: 'Your MASSFRONT verification code is ' + value + '. It expires in 15 minutes. If you did not request it, ignore this message.',
      html: '<p>Your MASSFRONT verification code is <strong>' + value + '</strong>.</p><p>It expires in 15 minutes. If you did not request it, ignore this message.</p>',
    });
    return { delivered: true };
  } catch (e) {
    /* Fail closed and quiet: provider errors can contain addresses or message
       fragments. /verify/request only needs the delivered boolean. */
    return { delivered: false, reason: 'provider_error' };
  }
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
   Access conditions live in one place. Every /social/* handler starts with socialGate()
   and returns whatever it hands back — there is no route that reaches another
   player without passing through here, which is the only way this stays true
   as routes are added.

   Order matters: a banned account is told it is banned before age or username
   resolution. E-mail verification is intentionally absent from this path. */
async function moderationSchemaAvailable(env) {
  try { await env.DB.prepare('SELECT id FROM moderation_events LIMIT 1').first(); return true; }
  catch (e) { return false; }
}
async function requireSocialAccess(s, env) {
  const row = await env.DB.prepare('SELECT age_ok, social_banned, username FROM users WHERE id=?1')
    .bind(s.user_id).first();
  if (!row) return err(401, 'unauthenticated', 'Your session has expired — sign in again.');
  if (Number(row.social_banned) === 1)
    return err(403, 'social_banned', 'Social features are turned off for this account.');
  if (Number(row.age_ok) !== 1)
    return err(403, 'age_restricted', 'Confirm your age before using friends and chat.');
  /* Social records are public-username records. Refuse every read and write
     before an account has a valid canonical handle so a legacy nullable row
     can never create an anonymous World Chat message, lobby seat or presence
     entry. /username intentionally remains outside this gate so the player
     can resolve it exactly once. */
  if (!validateUsername(row.username).ok)
    return err(403, 'username_required', 'Choose your commander username before using Social Command.');
  /* New social traffic fails closed when the moderation ledger migration is
     missing. Deploying Worker code ahead of D1 must disable the surface, not
     accept unreviewable reports or bypass a sanction. */
  if (!(await moderationSchemaAvailable(env)))
    return err(503, 'moderation_unavailable', 'Social safety checks are unavailable — try again later.');
  const sanction = await env.DB.prepare(
    "SELECT id FROM moderation_sanctions WHERE user_id=?1 AND status='active' "
    + "AND kind IN ('suspend','ban') AND (expires_at IS NULL OR expires_at>?2) LIMIT 1"
  ).bind(Number(s.user_id), Date.now()).first();
  if (sanction)
    return err(403, 'social_sanctioned', 'Social features are temporarily unavailable for this account.');
  return null;
}
/* Returns { s } to proceed, or { res } to return immediately. */
async function socialGate(request, env) {
  const s = await requireSession(request, env);
  if (!s) return { res: err(401, 'unauthenticated', 'Your session has expired — sign in again.') };
  const gate = await requireSocialAccess(s, env);
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
async function areFriends(env, a, b) {
  const pair = pairKey(a, b);
  const row = await env.DB.prepare('SELECT lo_id FROM friendships WHERE lo_id=?1 AND hi_id=?2')
    .bind(pair.lo, pair.hi).first();
  return !!row;
}
function featureEnabled(env, key) {
  return !!(env && String(env[key] || '') === '1');
}
function chatEnabled(env) { return featureEnabled(env, 'SOCIAL_CHAT_ENABLED'); }
function worldChatEnabled(env) { return featureEnabled(env, 'SOCIAL_WORLD_CHAT_ENABLED'); }
function presenceEnabled(env) { return featureEnabled(env, 'SOCIAL_PRESENCE_ENABLED'); }
function onlineCountEnabled(env) { return featureEnabled(env, 'ONLINE_COUNT_ENABLED'); }
function lobbiesEnabled(env) { return featureEnabled(env, 'MULTIPLAYER_LOBBIES_ENABLED'); }
function invitesEnabled(env) { return featureEnabled(env, 'MULTIPLAYER_INVITES_ENABLED'); }
function realtimeEnabled(env) { return featureEnabled(env, 'MULTIPLAYER_REALTIME_ENABLED'); }
function matchRoomBound(env) {
  return !!(env&&env.MATCH_ROOMS&&typeof env.MATCH_ROOMS.idFromName==='function'&&
    typeof env.MATCH_ROOMS.get==='function');
}
async function chatAvailable(env) {
  /* The external moderation binding is preferred, while the conservative
     local UGC gate keeps release chat usable if that optional service is not
     bound. The live table probe still prevents a lying capability. */
  if (!chatEnabled(env)) return false;
  try { await env.DB.prepare('SELECT id FROM messages LIMIT 1').first(); return true; }
  catch (e) { return false; }
}
async function worldChatAvailable(env) {
  if (!worldChatEnabled(env)) return false;
  try { await env.DB.prepare('SELECT id FROM world_messages LIMIT 1').first(); return true; }
  catch (e) { return false; }
}
async function presenceAvailable(env) {
  if (!presenceEnabled(env)) return false;
  try { await env.DB.prepare('SELECT user_id FROM presence LIMIT 1').first(); return true; }
  catch (e) { return false; }
}
async function onlineCountAvailable(env) {
  if (!onlineCountEnabled(env)) return false;
  try { await env.DB.prepare('SELECT user_id FROM online_heartbeats LIMIT 1').first(); return true; }
  catch (e) { return false; }
}
async function lobbiesAvailable(env) {
  if (!lobbiesEnabled(env)) return false;
  try { await env.DB.prepare('SELECT id FROM multiplayer_lobbies LIMIT 1').first(); return true; }
  catch (e) { return false; }
}
async function invitesAvailable(env) {
  if (!invitesEnabled(env) || !(await lobbiesAvailable(env))) return false;
  try { await env.DB.prepare('SELECT id FROM multiplayer_invites LIMIT 1').first(); return true; }
  catch (e) { return false; }
}
async function matchLaunchAvailable(env) {
  if (!(await lobbiesAvailable(env))||!matchRoomBound(env)) return false;
  try {
    await env.DB.prepare('SELECT lobby_id FROM multiplayer_lobby_compatibility LIMIT 1').first();
    await env.DB.prepare('SELECT id FROM multiplayer_matches LIMIT 1').first();
    await env.DB.prepare('SELECT match_id FROM multiplayer_match_seats LIMIT 1').first();
    return true;
  } catch (e) { return false; }
}
async function realtimeMatchAvailable(env) {
  return realtimeEnabled(env)&&await matchLaunchAvailable(env);
}
function featureDisabled(name) {
  return err(503, 'feature_disabled', name + ' is not enabled on this server.');
}
function parsePositiveInt(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!/^[0-9]+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
function normalizeMessageBody(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'invalid_message', message: 'Write a message first.' };
  let value = raw.normalize ? raw.normalize('NFKC') : raw;
  value = value.replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  if (!value) return { ok: false, error: 'invalid_message', message: 'Write a message first.' };
  if (Array.from(value).length > MAX_MESSAGE_CHARS || new TextEncoder().encode(value).byteLength > MAX_MESSAGE_BYTES)
    return { ok: false, error: 'message_too_long', message: 'Keep messages to 500 characters.' };
  return { ok: true, value };
}
async function inspectMessageSafety(env, text, kind) {
  const service = env && env.CONTENT_SAFETY;
  if (!service || typeof service.fetch !== 'function') return inspectBuiltinMessageSafety(text);
  try {
    const response = await service.fetch(new Request('https://content-safety.internal/v1/check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: kind === 'world_message' ? 'world_message' : 'friend_message', text }),
    }));
    if (!response || !response.ok) return { ok: false, unavailable: true };
    const result = await response.json();
    if (result && result.allow === true) return { ok: true, mode: 'service' };
    return { ok: false, unavailable: false };
  } catch (e) {
    return { ok: false, unavailable: true };
  }
}

/* World Chat must remain usable when the optional external moderation worker
   is not bound. Prefer that binding when present; otherwise this conservative
   local gate rejects contact exchange, links, spam shaping and a short set of
   high-severity abusive phrases. Player reports remain the review backstop. */
function inspectBuiltinMessageSafety(text) {
  const value = String(text || ''), folded = value.normalize ? value.normalize('NFKC').toLowerCase() : value.toLowerCase();
  if (/\b(?:https?:\/\/|www\.|discord(?:app)?\.com|discord\.gg|t\.me\/|@[a-z0-9_.-]+\.[a-z]{2,})/i.test(folded) ||
     /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(folded) ||
     /(?:\+?\d[\s().-]*){7,}/.test(folded)) return { ok: false, unavailable: false, code: 'contact_info' };
  if (/(.)\1{11,}/u.test(folded) || /(\b\S+\b)(?:\s+\1){7,}/iu.test(folded))
    return { ok: false, unavailable: false, code: 'spam' };
  const deny = [
    /\bkys\b/i, /\bkill\s+yourself\b/i, /\bgo\s+die\b/i,
    /\bn[i1]gg(?:er|a)s?\b/i, /\bf[a@]gg?(?:ot|it)s?\b/i,
  ];
  if (deny.some(re => re.test(folded))) return { ok: false, unavailable: false, code: 'abuse' };
  return { ok: true, mode: 'builtin' };
}
async function inspectWorldMessageSafety(env, text) {
  return inspectMessageSafety(env, text, 'world_message');
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
  /* A pending lobby invitation is another direct reachability path. Revoke
     both directions immediately so neither an inbox refresh nor a known
     invite id can bridge a newly-created block. Keep this optional for older
     databases that have not applied the lobby migration yet. */
  await env.DB.prepare(
    "UPDATE multiplayer_invites SET status='revoked',responded_at=?3 WHERE status='pending' "
    + 'AND ((from_id=?1 AND to_id=?2) OR (from_id=?2 AND to_id=?1))'
  ).bind(pair.lo, pair.hi, now).run().catch(() => {});
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

function normalizeModerationReason(raw, label) {
  let value = String(raw == null ? '' : raw);
  value = value.normalize ? value.normalize('NFKC') : value;
  value = value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').trim();
  if (!value) return { ok: false, res: err(400, 'invalid_reason', label || 'Tell us what happened.') };
  if (Array.from(value).length > MOD_REASON_MAX)
    return { ok: false, res: err(400, 'invalid_reason', 'Keep the reason to 500 characters.') };
  return { ok: true, value };
}
async function ensureModerationSubject(env, userId) {
  let row = await env.DB.prepare('SELECT subject_ref FROM moderation_subjects WHERE user_id=?1')
    .bind(Number(userId)).first();
  if (row) return String(row.subject_ref);
  const subjectRef = randomHex(16), now = Date.now();
  await env.DB.prepare(
    'INSERT INTO moderation_subjects(user_id,subject_ref,created_at) VALUES(?1,?2,?3) '
    + 'ON CONFLICT(user_id) DO NOTHING'
  ).bind(Number(userId), subjectRef, now).run();
  row = await env.DB.prepare('SELECT subject_ref FROM moderation_subjects WHERE user_id=?1')
    .bind(Number(userId)).first();
  if (!row) throw new Error('moderation_subject_unavailable');
  return String(row.subject_ref);
}
async function insertModerationReport(env, reporterId, subjectId, snapshot, reason, now) {
  const reporterRef = await ensureModerationSubject(env, reporterId);
  const subjectRef = await ensureModerationSubject(env, subjectId);
  const caseId = randomHex(16);
  const result = await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO reports(reporter_id,subject_user,body_snapshot,created_at,resolved) VALUES(?1,?2,?3,?4,0)'
    ).bind(Number(reporterId), Number(subjectId), snapshot, now),
    env.DB.prepare(
      'INSERT INTO moderation_cases(id,report_id,reporter_ref,subject_ref,evidence_snapshot,state,claimed_by,created_at,updated_at,resolved_at) '
      + "VALUES(?1,last_insert_rowid(),?2,?3,?4,'open',NULL,?5,?5,NULL)"
    ).bind(caseId, reporterRef, subjectRef, snapshot, now),
    env.DB.prepare(
      "INSERT INTO moderation_events(case_id,subject_ref,actor_kind,actor_ref,action,reason,details_json,created_at) "
      + "VALUES(?1,?2,'player',?3,'report_created',?4,NULL,?5)"
    ).bind(caseId, subjectRef, reporterRef, reason, now),
  ]);
  if (Number(result && result[0] && result[0].meta && result[0].meta.changes) !== 1
      || Number(result && result[1] && result[1].meta && result[1].meta.changes) !== 1
      || Number(result && result[2] && result[2].meta && result[2].meta.changes) !== 1)
    throw new Error('moderation_report_atomicity');
  return { reportId: Number(result[0].meta.last_row_id), caseId };
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
  const rv = normalizeModerationReason(body && body.reason);
  if (!rv.ok) return rv.res;
  const reason = rv.value;

  const now = Date.now();
  const snapshot = buildReportSnapshot(
    await usernameOf(env, s.user_id), target.username, reason, body && body.context, now);
  const made = await insertModerationReport(env, s.user_id, target.id, snapshot, reason, now);
  return json({ ok: true, reported: true, id: made.reportId, caseId: made.caseId }, 201);
}

/* ---- disabled-by-default staging lobbies + friend invitations --------------
   These routes provide authenticated roster coordination. They deliberately
   never advertise realtimeMatch: the later launch credential proves an agreed
   roster and immutable inputs, but no deterministic command relay exists yet. */
function lobbyRules(raw) {
  const r=raw&&typeof raw==='object'?raw:{};
  const mode=r.mode==='coop'?'coop':'skirmish';
  const slots=Math.max(2,Math.min(LOBBY_MAX_MEMBERS,Number(r.slots)||2));
  const map=String(r.map||'auto').replace(/[^a-z0-9_-]/gi,'').slice(0,64)||'auto';
  return {mode,slots,map};
}
function validateLobbyRules(raw,status) {
  const r=raw&&typeof raw==='object'?raw:{};
  const mode=r.mode==null?'skirmish':r.mode,slots=r.slots==null?2:r.slots;
  if(mode!=='coop'&&mode!=='skirmish')
    return {res:err(status||400,'invalid_lobby_mode','Choose Co-op vs AI or two-player Skirmish.')};
  if(typeof slots!=='number'||!Number.isInteger(slots)||slots<2||slots>LOBBY_MAX_MEMBERS)
    return {res:err(status||400,'invalid_lobby_slots','Choose between two and four human player slots.')};
  /* The deterministic PvP runtime currently owns exactly two human seats.
     Co-op can fan two to four humans against AI, but silently normalizing a
     forged 3/4-player Skirmish request would launch an unsupported topology. */
  if(mode==='skirmish'&&slots!==2)
    return {res:err(status||400,'unsupported_lobby_tuple','Skirmish supports exactly two human players.')};
  return {value:lobbyRules({mode,slots,map:r.map})};
}
async function lobbyAvailableOrError(env, invites) {
  const ok=invites?await invitesAvailable(env):await lobbiesAvailable(env);
  return ok?null:featureDisabled(invites?'Lobby invitations':'Player lobbies');
}
async function lobbyView(env,id,userId) {
  const lobby=await env.DB.prepare(
    'SELECT id,code,host_id,state,revision,rules_json,created_at,expires_at FROM multiplayer_lobbies WHERE id=?1'
  ).bind(String(id)).first();
  if(!lobby||lobby.state!=='waiting'||Number(lobby.expires_at)<=Date.now())return null;
  const mine=await env.DB.prepare('SELECT user_id FROM multiplayer_lobby_members WHERE lobby_id=?1 AND user_id=?2')
    .bind(String(id),Number(userId)).first();
  if(!mine)return null;
  const rows=await env.DB.prepare(
    'SELECT u.username AS username,m.user_id AS user_id,m.ready AS ready,m.joined_at AS joined_at,'
    +'c.lobby_revision AS compatibility_revision FROM multiplayer_lobby_members m JOIN users u ON u.id=m.user_id '
    +'LEFT JOIN multiplayer_lobby_compatibility c ON c.lobby_id=m.lobby_id AND c.user_id=m.user_id '
    +'WHERE m.lobby_id=?1 ORDER BY m.joined_at,m.user_id'
  ).bind(String(id)).all();
  let rawRules;try{rawRules=JSON.parse(lobby.rules_json);}catch(e){return null;}
  const checkedRules=validateLobbyRules(rawRules,409);if(checkedRules.res)return null;
  const rules=checkedRules.value;
  return {id:String(lobby.id),code:String(lobby.code),state:'waiting',revision:Number(lobby.revision),
    hostId:Number(lobby.host_id),rules,expiresAt:Number(lobby.expires_at),
    members:(rows.results||[]).map(r=>({username:String(r.username||''),ready:Number(r.ready)===1,
      host:Number(r.user_id)===Number(lobby.host_id),self:Number(r.user_id)===Number(userId),
      compatible:Number(r.compatibility_revision)===Number(lobby.revision),
      compatibilityRevision:r.compatibility_revision==null?null:Number(r.compatibility_revision)}))};
}
/* A launch closes the mutable lobby before any seat may claim a credential.
   Members still need one read-only way to discover the immutable match id;
   otherwise only the host (who receives the launch response) can connect.
   Joining through the frozen seat row keeps this receipt roster-private. */
async function launchedMatchView(env,lobbyId,userId) {
  const now=Date.now(),row=await env.DB.prepare(
    'SELECT m.id,m.lobby_id,m.launch_revision,m.roster_size,m.build_version,m.manifest_hash,m.balance_hash,m.rules_hash,m.expires_at '
    +'FROM multiplayer_matches m JOIN multiplayer_match_seats s ON s.match_id=m.id AND s.user_id=?2 '
    +'WHERE m.lobby_id=?1 AND m.expires_at>?3 ORDER BY m.created_at DESC LIMIT 1'
  ).bind(String(lobbyId),Number(userId),now).first();
  if(!row)return null;
  return {id:String(row.id),lobbyId:String(row.lobby_id),launchRevision:Number(row.launch_revision),
    rosterSize:Number(row.roster_size),buildVersion:String(row.build_version),manifestHash:String(row.manifest_hash),
    balanceHash:String(row.balance_hash),rulesHash:String(row.rules_hash),expiresAt:Number(row.expires_at)};
}
async function lobbyJoin(env,lobby,userId,now) {
  const blocked=await env.DB.prepare(
    'SELECT b.blocker_id FROM blocks b JOIN multiplayer_lobby_members m ON m.user_id=CASE WHEN b.blocker_id=?2 THEN b.blocked_id ELSE b.blocker_id END '
    +'WHERE m.lobby_id=?1 AND ((b.blocker_id=?2) OR (b.blocked_id=?2)) LIMIT 1'
  ).bind(String(lobby.id),Number(userId)).first();
  if(blocked)return {res:err(403,'blocked','A lobby member cannot be joined.')};
  let rawRules;try{rawRules=JSON.parse(lobby.rules_json);}catch(e){
    return {res:err(409,'unsupported_lobby_rules','That lobby has unsupported match rules.')};
  }
  const checkedRules=validateLobbyRules(rawRules,409);if(checkedRules.res)return {res:checkedRules.res};
  const rules=checkedRules.value;
  /* Capacity is enforced inside the INSERT itself. D1/SQLite serializes this
     write, so two simultaneous last-slot requests cannot both observe the
     old COUNT and overfill the roster. The revision update is in the same D1
     batch and is conditional on changes() from the INSERT. */
  const results=await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO multiplayer_lobby_members(lobby_id,user_id,ready,joined_at,updated_at) '
      +'SELECT l.id,?2,0,?3,?3 FROM multiplayer_lobbies l '
      +'WHERE l.id=?1 AND l.state=\'waiting\' AND l.expires_at>?3 '
      +'AND (SELECT COUNT(*) FROM multiplayer_lobby_members c WHERE c.lobby_id=l.id)<?4 '
      +'AND NOT EXISTS (SELECT 1 FROM blocks b JOIN multiplayer_lobby_members m ON m.lobby_id=l.id '
      +'WHERE (b.blocker_id=?2 AND b.blocked_id=m.user_id) OR (b.blocked_id=?2 AND b.blocker_id=m.user_id)) '
      +'ON CONFLICT(lobby_id,user_id) DO NOTHING'
    ).bind(String(lobby.id),Number(userId),now,rules.slots),
    env.DB.prepare('UPDATE multiplayer_lobbies SET revision=revision+1 WHERE id=?1 AND changes()=1')
      .bind(String(lobby.id)),
  ]);
  const inserted=Number(results&&results[0]&&results[0].meta&&results[0].meta.changes)===1;
  const revised=Number(results&&results[1]&&results[1].meta&&results[1].meta.changes)===1;
  if(inserted!==revised)throw new Error('lobby_join_atomicity');
  if(inserted)return {ok:true};
  const existing=await env.DB.prepare(
    'SELECT user_id FROM multiplayer_lobby_members WHERE lobby_id=?1 AND user_id=?2'
  ).bind(String(lobby.id),Number(userId)).first();
  if(existing)return {ok:true,existing:true};
  const nowBlocked=await env.DB.prepare(
    'SELECT b.blocker_id FROM blocks b JOIN multiplayer_lobby_members m ON m.user_id=CASE WHEN b.blocker_id=?2 THEN b.blocked_id ELSE b.blocker_id END '
    +'WHERE m.lobby_id=?1 AND ((b.blocker_id=?2) OR (b.blocked_id=?2)) LIMIT 1'
  ).bind(String(lobby.id),Number(userId)).first();
  if(nowBlocked)return {res:err(403,'blocked','A lobby member cannot be joined.')};
  const live=await env.DB.prepare(
    'SELECT id FROM multiplayer_lobbies WHERE id=?1 AND state=\'waiting\' AND expires_at>?2'
  ).bind(String(lobby.id),now).first();
  return {res:live?err(409,'lobby_full','That lobby is full.'):err(404,'no_such_lobby','That lobby is unavailable.')};
}
async function handleLobbyCreate(request,env){
  const g=await socialGate(request,env);if(g.res)return g.res;
  const unavailable=await lobbyAvailableOrError(env,false);if(unavailable)return unavailable;
  if(!(await checkRateLimit(env,'lobby_create_user',String(g.s.user_id))))return err(429,'rate_limited','Too many lobbies created — wait a while.');
  let body={};try{body=await request.json();}catch(e){}
  const checkedRules=validateLobbyRules(body&&body.rules);if(checkedRules.res)return checkedRules.res;
  const now=Date.now(),id=randomHex(16),code=randomHex(4).toUpperCase(),rules=checkedRules.value;
  const made=await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO multiplayer_lobbies(id,code,host_id,state,revision,rules_json,created_at,expires_at) VALUES(?1,?2,?3,\'waiting\',1,?4,?5,?6)'
    ).bind(id,code,Number(g.s.user_id),JSON.stringify(rules),now,now+LOBBY_TTL_MS),
    env.DB.prepare('INSERT INTO multiplayer_lobby_members(lobby_id,user_id,ready,joined_at,updated_at) VALUES(?1,?2,0,?3,?3)')
      .bind(id,Number(g.s.user_id),now),
  ]);
  if(Number(made&&made[0]&&made[0].meta&&made[0].meta.changes)!==1
    ||Number(made&&made[1]&&made[1].meta&&made[1].meta.changes)!==1)
    throw new Error('lobby_create_atomicity');
  return json({ok:true,lobby:await lobbyView(env,id,g.s.user_id)},201);
}
async function handleLobbyGet(request,env,id){
  const g=await socialGate(request,env);if(g.res)return g.res;
  const unavailable=await lobbyAvailableOrError(env,false);if(unavailable)return unavailable;
  if(!(await checkRateLimit(env,'lobby_read_user',String(g.s.user_id))))return err(429,'rate_limited','Slow down a moment.');
  const lobby=await lobbyView(env,id,g.s.user_id);if(lobby)return json({ok:true,lobby});
  const match=await launchedMatchView(env,id,g.s.user_id);
  return match?json({ok:true,match}):err(404,'no_such_lobby','That lobby is unavailable.');
}
async function handleLobbyJoin(request,env){
  const g=await socialGate(request,env);if(g.res)return g.res;
  const unavailable=await lobbyAvailableOrError(env,false);if(unavailable)return unavailable;
  if(!(await checkRateLimit(env,'lobby_mutate_user',String(g.s.user_id))))return err(429,'rate_limited','Slow down a moment.');
  let body;try{body=await request.json();}catch(e){return err(400,'bad_request','Malformed request.');}
  const key=String(body&&body.code||'').trim().toUpperCase();
  if(!/^[A-F0-9]{8}$/.test(key))return err(400,'invalid_code','Enter the eight-character lobby code.');
  const row=await env.DB.prepare('SELECT id,rules_json,state,expires_at FROM multiplayer_lobbies WHERE code=?1').bind(key).first();
  if(!row||row.state!=='waiting'||Number(row.expires_at)<=Date.now())return err(404,'no_such_lobby','That lobby is unavailable.');
  const joined=await lobbyJoin(env,row,g.s.user_id,Date.now());if(joined.res)return joined.res;
  return json({ok:true,lobby:await lobbyView(env,row.id,g.s.user_id)});
}
async function handleLobbyAction(request,env,id,action){
  const g=await socialGate(request,env);if(g.res)return g.res;
  const unavailable=await lobbyAvailableOrError(env,false);if(unavailable)return unavailable;
  if(!(await checkRateLimit(env,'lobby_mutate_user',String(g.s.user_id))))return err(429,'rate_limited','Slow down a moment.');
  const lobby=await lobbyView(env,id,g.s.user_id);if(!lobby)return err(404,'no_such_lobby','That lobby is unavailable.');
  let body={};try{body=await request.json();}catch(e){}
  if(body.revision!=null&&Number(body.revision)!==lobby.revision)return err(409,'stale_revision','Lobby state changed — refresh and try again.');
  const now=Date.now();
  if(action==='ready'){
    const ready=body.ready===true?1:0;
    /* Reserve this revision with a compare-and-swap, then mutate the member
       only when changes() proves this batch won. Parallel requests carrying
       the same revision therefore produce one success and one 409. */
    const changed=await env.DB.batch([
      env.DB.prepare(
        'UPDATE multiplayer_lobbies SET revision=revision+1 WHERE id=?1 AND revision=?2 '
        +'AND state=\'waiting\' AND expires_at>?4 AND EXISTS ('
        +'SELECT 1 FROM multiplayer_lobby_members WHERE lobby_id=?1 AND user_id=?3)'
      ).bind(String(id),lobby.revision,Number(g.s.user_id),now),
      env.DB.prepare(
        'UPDATE multiplayer_lobby_members SET ready=?3,updated_at=?4 '
        +'WHERE lobby_id=?1 AND user_id=?2 AND changes()=1'
      ).bind(String(id),Number(g.s.user_id),ready,now),
    ]);
    const reserved=Number(changed&&changed[0]&&changed[0].meta&&changed[0].meta.changes)===1;
    const memberChanged=Number(changed&&changed[1]&&changed[1].meta&&changed[1].meta.changes)===1;
    if(!reserved)return err(409,'stale_revision','Lobby state changed — refresh and try again.');
    if(!memberChanged)throw new Error('lobby_ready_atomicity');
  }else if(action==='leave'){
    const nextRevision=lobby.revision+1;
    const left=await env.DB.batch([
      env.DB.prepare(
        'UPDATE multiplayer_lobbies SET revision=revision+1 WHERE id=?1 AND revision=?2 '
        +'AND state=\'waiting\' AND expires_at>?4 AND EXISTS ('
        +'SELECT 1 FROM multiplayer_lobby_members WHERE lobby_id=?1 AND user_id=?3)'
      ).bind(String(id),lobby.revision,Number(g.s.user_id),now),
      env.DB.prepare(
        'DELETE FROM multiplayer_lobby_members WHERE lobby_id=?1 AND user_id=?2 AND changes()=1'
      ).bind(String(id),Number(g.s.user_id)),
      env.DB.prepare(
        'UPDATE multiplayer_lobbies SET host_id=(SELECT user_id FROM multiplayer_lobby_members '
        +'WHERE lobby_id=?1 ORDER BY joined_at,user_id LIMIT 1) WHERE id=?1 AND revision=?2 '
        +'AND NOT EXISTS (SELECT 1 FROM multiplayer_lobby_members WHERE lobby_id=?1 AND user_id=?3) '
        +'AND EXISTS (SELECT 1 FROM multiplayer_lobby_members WHERE lobby_id=?1)'
      ).bind(String(id),nextRevision,Number(g.s.user_id)),
      env.DB.prepare(
        'DELETE FROM multiplayer_invites WHERE lobby_id=?1 AND EXISTS ('
        +'SELECT 1 FROM multiplayer_lobbies WHERE id=?1 AND revision=?2) '
        +'AND NOT EXISTS (SELECT 1 FROM multiplayer_lobby_members WHERE lobby_id=?1)'
      ).bind(String(id),nextRevision),
      env.DB.prepare(
        'DELETE FROM multiplayer_lobbies WHERE id=?1 AND revision=?2 '
        +'AND NOT EXISTS (SELECT 1 FROM multiplayer_lobby_members WHERE lobby_id=?1)'
      ).bind(String(id),nextRevision),
    ]);
    const reserved=Number(left&&left[0]&&left[0].meta&&left[0].meta.changes)===1;
    const memberDeleted=Number(left&&left[1]&&left[1].meta&&left[1].meta.changes)===1;
    if(!reserved)return err(409,'stale_revision','Lobby state changed — refresh and try again.');
    if(!memberDeleted)throw new Error('lobby_leave_atomicity');
    const closed=Number(left&&left[4]&&left[4].meta&&left[4].meta.changes)===1;
    return json({ok:true,left:true,closed,revision:closed?null:nextRevision});
  }else return err(404,'route_not_found','No such lobby action.');
  return json({ok:true,lobby:await lobbyView(env,id,g.s.user_id)});
}
async function handleLobbyInvite(request,env){
  const g=await socialGate(request,env);if(g.res)return g.res;
  const unavailable=await lobbyAvailableOrError(env,true);if(unavailable)return unavailable;
  let body;try{body=await request.json();}catch(e){return err(400,'bad_request','Malformed request.');}
  const lobby=await lobbyView(env,body&&body.lobbyId,g.s.user_id);if(!lobby)return err(404,'no_such_lobby','That lobby is unavailable.');
  const found=await findUserByUsername(env,body&&body.username);if(!found.ok)return found.res;
  const target=found.user;if(Number(target.id)===Number(g.s.user_id))return err(400,'self_invite',"You can't invite yourself.");
  if(await blockedEitherWay(env,g.s.user_id,target.id))return err(403,'blocked',"You can't invite that player.");
  if(!(await areFriends(env,g.s.user_id,target.id)))return err(403,'friend_only','Only accepted friends can be invited.');
  if(!(await checkRateLimit(env,'lobby_invite_user',String(g.s.user_id))))return err(429,'rate_limited','Too many invitations — wait a while.');
  const pair=pairKey(g.s.user_id,target.id);if(!(await checkRateLimit(env,'lobby_invite_pair',pair.lo+':'+pair.hi)))return err(429,'rate_limited','That player was invited too often.');
  const now=Date.now(),iid=randomHex(16);
  try{await env.DB.prepare('INSERT INTO multiplayer_invites(id,lobby_id,from_id,to_id,status,created_at,expires_at) VALUES(?1,?2,?3,?4,\'pending\',?5,?6)')
    .bind(iid,lobby.id,Number(g.s.user_id),Number(target.id),now,now+LOBBY_INVITE_TTL_MS).run();}
  catch(e){return err(409,'already_invited','That player already has a pending invitation.');}
  return json({ok:true,invite:{id:iid,lobbyId:lobby.id,to:target.username,expiresAt:now+LOBBY_INVITE_TTL_MS}},201);
}
async function handleLobbyInvites(request,env){
  const g=await socialGate(request,env);if(g.res)return g.res;
  const unavailable=await lobbyAvailableOrError(env,true);if(unavailable)return unavailable;
  if(!(await checkRateLimit(env,'lobby_invites_list_user',String(g.s.user_id))))return err(429,'rate_limited','Slow down a moment.');
  const now=Date.now();await env.DB.prepare(
    "UPDATE multiplayer_invites SET status='revoked',responded_at=?2 WHERE to_id=?1 AND status='pending' AND ("
    +'expires_at<=?2 OR NOT EXISTS (SELECT 1 FROM multiplayer_lobbies l WHERE l.id=multiplayer_invites.lobby_id AND l.state=\'waiting\' AND l.expires_at>?2) '
    +'OR NOT EXISTS (SELECT 1 FROM friendships f WHERE (f.lo_id=multiplayer_invites.from_id AND f.hi_id=?1) OR (f.lo_id=?1 AND f.hi_id=multiplayer_invites.from_id)) '
    +'OR EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=?1 AND b.blocked_id=multiplayer_invites.from_id) OR (b.blocked_id=?1 AND b.blocker_id=multiplayer_invites.from_id)))'
  ).bind(Number(g.s.user_id),now).run();
  const rows=await env.DB.prepare(
    "SELECT i.id,i.lobby_id,i.expires_at,l.code,u.username AS from_name FROM multiplayer_invites i JOIN multiplayer_lobbies l ON l.id=i.lobby_id JOIN users u ON u.id=i.from_id WHERE i.to_id=?1 AND i.status='pending' AND i.expires_at>?2 AND l.state='waiting' AND l.expires_at>?2 "
    +"AND EXISTS (SELECT 1 FROM friendships f WHERE (f.lo_id=i.from_id AND f.hi_id=?1) OR (f.lo_id=?1 AND f.hi_id=i.from_id)) "
    +"AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=?1 AND b.blocked_id=i.from_id) OR (b.blocked_id=?1 AND b.blocker_id=i.from_id)) ORDER BY i.created_at DESC LIMIT 50"
  ).bind(Number(g.s.user_id),now).all();
  return json({ok:true,invites:(rows.results||[]).map(r=>({id:String(r.id),lobbyId:String(r.lobby_id),code:String(r.code),from:String(r.from_name),expiresAt:Number(r.expires_at)}))});
}
async function handleLobbyInviteRespond(request,env,id){
  const g=await socialGate(request,env);if(g.res)return g.res;
  const unavailable=await lobbyAvailableOrError(env,true);if(unavailable)return unavailable;
  let body={};try{body=await request.json();}catch(e){}
  const row=await env.DB.prepare("SELECT i.id,i.lobby_id,i.from_id,i.expires_at,l.rules_json,l.state,l.expires_at AS lobby_expires FROM multiplayer_invites i JOIN multiplayer_lobbies l ON l.id=i.lobby_id WHERE i.id=?1 AND i.to_id=?2 AND i.status='pending'")
    .bind(String(id),Number(g.s.user_id)).first();
  if(!row||Number(row.expires_at)<=Date.now()||row.state!=='waiting'||Number(row.lobby_expires)<=Date.now())return err(404,'no_such_invite','That invitation is unavailable.');
  const now=Date.now(),accept=body.accept===true;
  if(await blockedEitherWay(env,g.s.user_id,row.from_id)||!(await areFriends(env,g.s.user_id,row.from_id))){
    await env.DB.prepare("UPDATE multiplayer_invites SET status='revoked',responded_at=?3 WHERE id=?1 AND to_id=?2 AND status='pending'")
      .bind(String(id),Number(g.s.user_id),now).run();
    return err(404,'no_such_invite','That invitation is unavailable.');
  }
  if(accept){const joined=await lobbyJoin(env,{id:row.lobby_id,rules_json:row.rules_json},g.s.user_id,now);if(joined.res)return joined.res;}
  await env.DB.prepare("UPDATE multiplayer_invites SET status=?3,responded_at=?4 WHERE id=?1 AND to_id=?2").bind(String(id),Number(g.s.user_id),accept?'accepted':'declined',now).run();
  return json({ok:true,accepted:accept,lobby:accept?await lobbyView(env,row.lobby_id,g.s.user_id):null});
}

/* ---- immutable launch compatibility + single-use MatchRoom credentials -----
   This is still coordination, not realtime multiplayer. A compatibility row
   belongs to one authenticated roster seat and one exact lobby revision.
   Launch closes that revision atomically, numbers seats deterministically, and
   stores only SHA-256 token hashes. No public route consumes a token: the
   exported verifier below is for a future internal Durable Object binding. */
function normalizeCompatibility(raw) {
  const body=raw&&typeof raw==='object'?raw:{};
  const revision=parsePositiveInt(body.revision);
  if(!revision)return {res:err(400,'invalid_revision','Provide the current positive lobby revision.')};
  if(typeof body.buildVersion!=='string'||!BUILD_VERSION_RE.test(body.buildVersion))
    return {res:err(400,'invalid_build_version','Use a bounded semantic build version such as 1.33.35.')};
  const names=['manifestHash','balanceHash','rulesHash'],out={revision,buildVersion:body.buildVersion};
  for(const name of names){
    const value=body[name];
    if(typeof value!=='string'||!HASH_256_RE.test(value)||value!==value.toLowerCase())
      return {res:err(400,'invalid_'+name.replace(/[A-Z]/g,m=>'_'+m.toLowerCase()),name+' must be 64 lowercase hexadecimal characters.')};
    out[name]=value;
  }
  return {value:out};
}
async function canonicalLobbyRulesHash(rulesJson) {
  let source;try{source=JSON.parse(String(rulesJson||''));}catch(e){return null;}
  const checked=validateLobbyRules(source,409);if(checked.res)return null;
  return sha256Hex(JSON.stringify(checked.value));
}
async function handleLobbyCompatibility(request,env,id){
  const g=await socialGate(request,env);if(g.res)return g.res;
  if(!(await matchLaunchAvailable(env)))return err(503,'match_launch_unavailable','Match launch compatibility is unavailable.');
  if(!(await checkRateLimit(env,'lobby_compat_user',String(g.s.user_id))))return err(429,'rate_limited','Slow down a moment.');
  let body;try{body=await request.json();}catch(e){return err(400,'bad_request','Malformed request.');}
  const normalized=normalizeCompatibility(body);if(normalized.res)return normalized.res;
  const c=normalized.value,now=Date.now();
  const lobby=await env.DB.prepare(
    'SELECT l.id,l.state,l.revision,l.rules_json,l.expires_at,m.user_id FROM multiplayer_lobbies l '
    +'LEFT JOIN multiplayer_lobby_members m ON m.lobby_id=l.id AND m.user_id=?2 WHERE l.id=?1'
  ).bind(String(id),Number(g.s.user_id)).first();
  if(!lobby||lobby.user_id==null)return err(404,'no_such_lobby','That lobby is unavailable.');
  if(lobby.state!=='waiting'||Number(lobby.expires_at)<=now)return err(409,'lobby_closed','That lobby is no longer accepting compatibility submissions.');
  if(Number(lobby.revision)!==c.revision)return err(409,'stale_revision','Lobby state changed — refresh and try again.');
  const canonicalRules=await canonicalLobbyRulesHash(lobby.rules_json);
  if(!canonicalRules)return err(409,'unsupported_lobby_rules','That lobby has unsupported match rules.');
  if(c.rulesHash!==canonicalRules)return err(409,'rules_drift','The submitted rules do not match the server lobby rules.');
  const made=await env.DB.prepare(
    'INSERT INTO multiplayer_lobby_compatibility(lobby_id,user_id,lobby_revision,build_version,manifest_hash,balance_hash,rules_hash,submitted_at) '
    +'SELECT l.id,?2,?3,?4,?5,?6,?7,?8 FROM multiplayer_lobbies l JOIN multiplayer_lobby_members m ON m.lobby_id=l.id AND m.user_id=?2 '
    +'WHERE l.id=?1 AND l.state=\'waiting\' AND l.revision=?3 AND l.expires_at>?8 '
    +'ON CONFLICT(lobby_id,user_id) DO UPDATE SET lobby_revision=excluded.lobby_revision,build_version=excluded.build_version,'
    +'manifest_hash=excluded.manifest_hash,balance_hash=excluded.balance_hash,rules_hash=excluded.rules_hash,submitted_at=excluded.submitted_at'
  ).bind(String(id),Number(g.s.user_id),c.revision,c.buildVersion,c.manifestHash,c.balanceHash,c.rulesHash,now).run();
  if(Number(made&&made.meta&&made.meta.changes)!==1)return err(409,'stale_revision','Lobby state changed — refresh and try again.');
  return json({ok:true,compatibility:{lobbyId:String(id),revision:c.revision,buildVersion:c.buildVersion,
    manifestHash:c.manifestHash,balanceHash:c.balanceHash,rulesHash:c.rulesHash,submittedAt:now}});
}
async function handleLobbyLaunch(request,env,id){
  const g=await socialGate(request,env);if(g.res)return g.res;
  if(!(await matchLaunchAvailable(env)))return err(503,'match_launch_unavailable','Match launch compatibility is unavailable.');
  if(!(await checkRateLimit(env,'lobby_launch_user',String(g.s.user_id))))return err(429,'rate_limited','Too many launch attempts — wait a while.');
  let body;try{body=await request.json();}catch(e){return err(400,'bad_request','Malformed request.');}
  const revision=parsePositiveInt(body&&body.revision);if(!revision)return err(400,'invalid_revision','Provide the current positive lobby revision.');
  const now=Date.now(),lobby=await env.DB.prepare(
    'SELECT l.id,l.host_id,l.state,l.revision,l.rules_json,l.expires_at,m.user_id FROM multiplayer_lobbies l '
    +'LEFT JOIN multiplayer_lobby_members m ON m.lobby_id=l.id AND m.user_id=?2 WHERE l.id=?1'
  ).bind(String(id),Number(g.s.user_id)).first();
  if(!lobby||lobby.user_id==null)return err(404,'no_such_lobby','That lobby is unavailable.');
  if(Number(lobby.host_id)!==Number(g.s.user_id))return err(403,'host_only','Only the lobby host can launch the match.');
  if(lobby.state!=='waiting'||Number(lobby.expires_at)<=now)return err(409,'lobby_closed','That lobby has already closed.');
  if(Number(lobby.revision)!==revision)return err(409,'stale_revision','Lobby state changed — refresh and try again.');
  let rawRules;try{rawRules=JSON.parse(lobby.rules_json);}catch(e){
    return err(409,'unsupported_lobby_rules','That lobby has unsupported match rules.');
  }
  const checkedRules=validateLobbyRules(rawRules,409);if(checkedRules.res)return checkedRules.res;
  const rules=checkedRules.value;
  const members=await env.DB.prepare(
    'SELECT m.user_id,m.ready,m.joined_at,c.lobby_revision,c.build_version,c.manifest_hash,c.balance_hash,c.rules_hash '
    +'FROM multiplayer_lobby_members m LEFT JOIN multiplayer_lobby_compatibility c ON c.lobby_id=m.lobby_id AND c.user_id=m.user_id '
    +'WHERE m.lobby_id=?1 ORDER BY m.joined_at,m.user_id'
  ).bind(String(id)).all();
  const roster=members.results||[];
  if(roster.length!==rules.slots)return err(409,'lobby_not_full','Every configured lobby seat must be occupied before launch.');
  if(roster.some(r=>Number(r.ready)!==1))return err(409,'lobby_not_ready','Every player must be ready before launch.');
  if(roster.some(r=>r.build_version==null||Number(r.lobby_revision)!==revision))
    return err(409,'compatibility_missing','Every current roster seat must submit compatibility before launch.');
  const canonicalRules=await canonicalLobbyRulesHash(lobby.rules_json);
  if(!canonicalRules)return err(409,'unsupported_lobby_rules','That lobby has unsupported match rules.');
  if(roster.some(r=>String(r.rules_hash)!==canonicalRules))return err(409,'rules_drift','Lobby rules changed after compatibility was submitted.');
  const first=roster[0];
  if(roster.some(r=>String(r.build_version)!==String(first.build_version)
    ||String(r.manifest_hash)!==String(first.manifest_hash)||String(r.balance_hash)!==String(first.balance_hash)
    ||String(r.rules_hash)!==String(first.rules_hash)))
    return err(409,'compatibility_mismatch','Every roster seat must submit byte-identical compatibility values.');
  const matchId=randomHex(16),expiresAt=now+MATCH_RECORD_TTL_MS;
  const made=await env.DB.batch([
    env.DB.prepare(
      'UPDATE multiplayer_lobbies SET state=\'closed\',revision=revision+1 WHERE id=?1 AND host_id=?2 AND revision=?3 '
      +'AND state=\'waiting\' AND expires_at>?4 AND (SELECT COUNT(*) FROM multiplayer_lobby_members WHERE lobby_id=?1)=?5 '
      +'AND (SELECT COUNT(*) FROM multiplayer_lobby_members WHERE lobby_id=?1 AND ready=1)=?5 '
      +'AND (SELECT COUNT(*) FROM multiplayer_lobby_compatibility WHERE lobby_id=?1 AND lobby_revision=?3)=?5 '
      +'AND (SELECT COUNT(DISTINCT build_version) FROM multiplayer_lobby_compatibility WHERE lobby_id=?1 AND lobby_revision=?3)=1 '
      +'AND (SELECT COUNT(DISTINCT manifest_hash) FROM multiplayer_lobby_compatibility WHERE lobby_id=?1 AND lobby_revision=?3)=1 '
      +'AND (SELECT COUNT(DISTINCT balance_hash) FROM multiplayer_lobby_compatibility WHERE lobby_id=?1 AND lobby_revision=?3)=1 '
      +'AND NOT EXISTS (SELECT 1 FROM multiplayer_lobby_compatibility WHERE lobby_id=?1 AND lobby_revision=?3 AND rules_hash<>?6)'
    ).bind(String(id),Number(g.s.user_id),revision,now,rules.slots,canonicalRules),
    env.DB.prepare(
      'INSERT INTO multiplayer_matches(id,lobby_id,launch_revision,host_user_id,build_version,manifest_hash,balance_hash,rules_hash,roster_size,created_at,expires_at) '
      +'SELECT ?1,l.id,?3,l.host_id,?4,?5,?6,?7,?8,?9,?10 FROM multiplayer_lobbies l '
      +'WHERE l.id=?2 AND l.state=\'closed\' AND l.revision=?3+1 AND changes()=1'
    ).bind(matchId,String(id),revision,String(first.build_version),String(first.manifest_hash),String(first.balance_hash),canonicalRules,rules.slots,now,expiresAt),
    env.DB.prepare(
      'INSERT INTO multiplayer_match_seats(match_id,lobby_id,user_id,seat_number,build_version,manifest_hash,balance_hash,rules_hash) '
      +'SELECT ?1,m.lobby_id,m.user_id,ROW_NUMBER() OVER (ORDER BY m.joined_at,m.user_id),c.build_version,c.manifest_hash,c.balance_hash,c.rules_hash '
      +'FROM multiplayer_lobby_members m JOIN multiplayer_lobby_compatibility c ON c.lobby_id=m.lobby_id AND c.user_id=m.user_id '
      +'WHERE m.lobby_id=?2 AND c.lobby_revision=?3 AND EXISTS (SELECT 1 FROM multiplayer_matches x WHERE x.id=?1)'
    ).bind(matchId,String(id),revision),
  ]);
  const won=Number(made&&made[0]&&made[0].meta&&made[0].meta.changes)===1;
  if(!won)return err(409,'stale_revision','Another launch or lobby change won — refresh the lobby.');
  if(Number(made[1].meta.changes)!==1||Number(made[2].meta.changes)!==rules.slots)throw new Error('match_launch_atomicity');
  return json({ok:true,match:{id:matchId,lobbyId:String(id),launchRevision:revision,rosterSize:rules.slots,
    buildVersion:String(first.build_version),manifestHash:String(first.manifest_hash),balanceHash:String(first.balance_hash),
    rulesHash:canonicalRules,expiresAt}},201);
}
async function handleMatchTokenClaim(request,env,id){
  const g=await socialGate(request,env);if(g.res)return g.res;
  if(!(await matchLaunchAvailable(env)))return err(503,'match_launch_unavailable','Match launch compatibility is unavailable.');
  if(!(await checkRateLimit(env,'match_token_user',String(g.s.user_id))))return err(429,'rate_limited','Too many token requests — wait a while.');
  const now=Date.now(),seat=await env.DB.prepare(
    'SELECT s.*,m.expires_at AS match_expires FROM multiplayer_match_seats s JOIN multiplayer_matches m ON m.id=s.match_id '
    +'WHERE s.match_id=?1 AND s.user_id=?2'
  ).bind(String(id),Number(g.s.user_id)).first();
  if(!seat)return err(404,'no_such_match_seat','No launch seat is assigned to this account.');
  if(Number(seat.match_expires)<=now)return err(410,'match_expired','That match launch has expired.');
  if(seat.token_hash!=null)return err(409,'token_already_claimed','This seat already claimed its launch token.');
  const token=randomHex(32),tokenHash=await sha256Hex(token),expiresAt=Math.min(now+MATCH_TOKEN_TTL_MS,Number(seat.match_expires));
  const claimed=await env.DB.prepare(
    'UPDATE multiplayer_match_seats SET token_hash=?3,token_issued_at=?4,token_expires_at=?5 '
    +'WHERE match_id=?1 AND user_id=?2 AND token_hash IS NULL AND EXISTS ('
    +'SELECT 1 FROM multiplayer_matches WHERE id=?1 AND expires_at>?4)'
  ).bind(String(id),Number(g.s.user_id),tokenHash,now,expiresAt).run();
  if(Number(claimed&&claimed.meta&&claimed.meta.changes)!==1)return err(409,'token_already_claimed','Another token claim already won for this seat.');
  return json({ok:true,credential:{token,matchId:String(id),lobbyId:String(seat.lobby_id),seat:Number(seat.seat_number),
    userId:Number(g.s.user_id),buildVersion:String(seat.build_version),manifestHash:String(seat.manifest_hash),
    balanceHash:String(seat.balance_hash),rulesHash:String(seat.rules_hash),expiresAt}},201);
}

export async function consumeMatchLaunchToken(env,rawToken,expected){
  const e=expected&&typeof expected==='object'?expected:{};
  const token=String(rawToken||'');
  if(!env||!env.DB||!HASH_256_RE.test(token)||!e.matchId||!e.lobbyId||!parsePositiveInt(e.userId)
    ||!parsePositiveInt(e.seat)||!BUILD_VERSION_RE.test(String(e.buildVersion||''))
    ||!HASH_256_RE.test(String(e.manifestHash||''))||!HASH_256_RE.test(String(e.balanceHash||''))
    ||!HASH_256_RE.test(String(e.rulesHash||'')))return {ok:false,error:'invalid_or_expired_token'};
  const now=Date.now(),tokenHash=await sha256Hex(token);
  const used=await env.DB.prepare(
    'UPDATE multiplayer_match_seats SET token_consumed_at=?10 WHERE token_hash=?1 AND match_id=?2 AND lobby_id=?3 '
    +'AND user_id=?4 AND seat_number=?5 AND build_version=?6 AND manifest_hash=?7 AND balance_hash=?8 AND rules_hash=?9 '
    +'AND token_consumed_at IS NULL AND token_expires_at>?10 AND EXISTS ('
    +'SELECT 1 FROM multiplayer_matches WHERE id=?2 AND expires_at>?10)'
  ).bind(tokenHash,String(e.matchId),String(e.lobbyId),Number(e.userId),Number(e.seat),String(e.buildVersion),
    String(e.manifestHash).toLowerCase(),String(e.balanceHash).toLowerCase(),String(e.rulesHash).toLowerCase(),now).run();
  if(Number(used&&used.meta&&used.meta.changes)!==1)return {ok:false,error:'invalid_or_expired_token'};
  return {ok:true,matchId:String(e.matchId),lobbyId:String(e.lobbyId),userId:Number(e.userId),seat:Number(e.seat),consumedAt:now};
}

function matchSocketCredential(request){
  const protocols=String(request.headers.get('sec-websocket-protocol')||'')
    .split(',').map(v=>v.trim()).filter(Boolean);
  if(!protocols.includes('massfront.v1'))return null;
  const credentials=protocols.filter(v=>/^mf-(?:seat|resume)\.[1-4]\.[a-f0-9]{64}$/.test(v));
  if(credentials.length!==1||protocols.some(v=>v!=='massfront.v1'&&!credentials.includes(v)))return null;
  const m=credentials[0].match(/^mf-(seat|resume)\.([1-4])\.([a-f0-9]{64})$/);
  return m?{kind:m[1],seat:Number(m[2]),token:m[3],protocol:credentials[0]}:null;
}
async function handleMatchSocket(request,env,id){
  if(request.method!=='GET')return err(405,'method_not_allowed','Use GET with a WebSocket upgrade.');
  if(String(request.headers.get('upgrade')||'').toLowerCase()!=='websocket')
    return err(426,'websocket_required','Upgrade this route to WebSocket.');
  if(!(await realtimeMatchAvailable(env)))
    return err(503,'realtime_match_unavailable','Realtime matches are not enabled on this server.');
  const credential=matchSocketCredential(request);
  if(!credential)return err(401,'invalid_match_credential','Use the versioned match WebSocket subprotocol.');
  const roomId=env.MATCH_ROOMS.idFromName(String(id)),stub=env.MATCH_ROOMS.get(roomId);
  if(credential.kind==='resume'){
    const headers=new Headers({upgrade:'websocket','sec-websocket-protocol':
      'massfront.v1, '+credential.protocol,'x-mf-resume-forwarded':'1'});
    return stub.fetch(new Request(request.url,{method:'GET',headers}));
  }
  const tokenHash=await sha256Hex(credential.token),now=Date.now();
  const seat=await env.DB.prepare(
    'SELECT s.match_id,s.lobby_id,s.user_id,s.seat_number,s.build_version,s.manifest_hash,s.balance_hash,s.rules_hash,'
    +'s.token_expires_at,s.token_consumed_at,m.roster_size,m.expires_at AS match_expires '
    +'FROM multiplayer_match_seats s JOIN multiplayer_matches m ON m.id=s.match_id '
    +'WHERE s.match_id=?1 AND s.token_hash=?2'
  ).bind(String(id),tokenHash).first();
  if(!seat||seat.token_consumed_at!=null||Number(seat.token_expires_at)<=now||Number(seat.match_expires)<=now)
    return err(401,'invalid_or_expired_token','That match credential is invalid or expired.');
  if(credential.seat!=null&&credential.seat!==Number(seat.seat_number))
    return err(401,'invalid_or_expired_token','That match credential is invalid or expired.');
  const expected={matchId:String(seat.match_id),lobbyId:String(seat.lobby_id),userId:Number(seat.user_id),
    seat:Number(seat.seat_number),buildVersion:String(seat.build_version),manifestHash:String(seat.manifest_hash),
    balanceHash:String(seat.balance_hash),rulesHash:String(seat.rules_hash)};
  const consumed=await consumeMatchLaunchToken(env,credential.token,expected);
  if(!consumed.ok)return err(401,'invalid_or_expired_token','That match credential is invalid or expired.');
  const verified={matchId:expected.matchId,lobbyId:expected.lobbyId,userId:expected.userId,
    seat:expected.seat,buildVersion:expected.buildVersion,manifestHash:expected.manifestHash,
    balanceHash:expected.balanceHash,rulesHash:expected.rulesHash,rosterSize:Number(seat.roster_size)};
  const headers=new Headers({upgrade:'websocket','sec-websocket-protocol':'massfront.v1',
    'x-mf-seat-verification':JSON.stringify(verified)});
  return stub.fetch(new Request(request.url,{method:'GET',headers}));
}

/* ---- disabled-by-default friend chat + presence -----------------------------
   Capability discovery itself is gated, authenticated and rate limited. A
   client may only turn on chat/presence after THIS server answers with the
   expected protocol version and a literal true. Environment flags alone are
   not enough: the table probe must also succeed, so a missed migration cannot
   produce a lying handshake followed by 500s. */
async function handleSocialCapabilities(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  if (!(await checkRateLimit(env, 'capabilities_user', String(g.s.user_id))))
    return err(429, 'rate_limited', 'Slow down a moment.');
  const chat = await chatAvailable(env);
  const worldChat = await worldChatAvailable(env);
  const presence = await presenceAvailable(env);
  const onlineCount = await onlineCountAvailable(env);
  const lobbies = await lobbiesAvailable(env);
  const invites = await invitesAvailable(env);
  const matchLaunch = await matchLaunchAvailable(env);
  const realtimeMatch = realtimeEnabled(env)&&matchLaunch;
  return json({
    ok: true,
    protocol: 'massfront-social',
    version: SOCIAL_PROTOCOL_VERSION,
    capabilities: {
      friends: true,
      blocking: true,
      reporting: true,
      chat,
      worldChat,
      presence,
      onlineCount,
      lobbies,
      invites,
      matchLaunch,
      realtimeMatch,
    },
    limits: {
      messageChars: MAX_MESSAGE_CHARS,
      messageBytes: MAX_MESSAGE_BYTES,
      pageMax: MESSAGE_PAGE_MAX,
      worldPageMax: MESSAGE_PAGE_MAX,
      presenceTtlMs: PRESENCE_TTL_MS,
      onlineHeartbeatTtlMs: ONLINE_HEARTBEAT_TTL_MS,
    },
  });
}

/* POST /social/message/send {username,body} */
async function handleMessageSend(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  if (!(await chatAvailable(env))) return featureDisabled('Friend chat');
  const s = g.s;
  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const message = normalizeMessageBody(body && body.body);
  if (!message.ok) return err(400, message.error, message.message);
  const found = await findUserByUsername(env, body && body.username);
  if (!found.ok) return found.res;
  const target = found.user;
  if (Number(target.id) === Number(s.user_id))
    return err(400, 'self_message', "You can't message yourself.");
  if (await blockedEitherWay(env, s.user_id, target.id))
    return err(403, 'blocked', "You can't message that player.");
  if (!(await areFriends(env, s.user_id, target.id)))
    return err(403, 'friend_only', 'Messages are only available between friends.');
  if (!(await checkRateLimit(env, 'message_send_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Too many messages — wait a moment.');
  const pair = pairKey(s.user_id, target.id);
  if (!(await checkRateLimit(env, 'message_send_pair', pair.lo + ':' + pair.hi)))
    return err(429, 'rate_limited', 'This conversation is moving too quickly — wait a moment.');
  const safety = await inspectMessageSafety(env, message.value);
  if (!safety.ok) {
    if (safety.unavailable)
      return err(503, 'safety_unavailable', 'Message safety checks are unavailable — try again later.');
    return err(400, 'unsafe_content', 'That message cannot be sent.');
  }
  const now = Date.now();
  const res = await env.DB.prepare(
    'INSERT INTO messages (from_id,to_id,body,created_at,read_at) VALUES (?1,?2,?3,?4,NULL)'
  ).bind(Number(s.user_id), Number(target.id), message.value, now).run();
  return json({
    ok: true,
    message: { id: Number(res.meta.last_row_id), to: target.username, body: message.value, at: now },
  }, 201);
}

/* GET /social/messages?with=<exact username>&before=<message id>&limit=30
   Newest-first keyset pagination. No offsets, no unbounded scans, and no
   arbitrary inbox: the requested party must still be an unblocked friend. */
async function handleMessagesList(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  if (!(await chatAvailable(env))) return featureDisabled('Friend chat');
  const s = g.s, url = new URL(request.url);
  const found = await findUserByUsername(env, url.searchParams.get('with'));
  if (!found.ok) return found.res;
  const target = found.user;
  if (Number(target.id) === Number(s.user_id))
    return err(400, 'self_message', "You can't open a conversation with yourself.");
  if (await blockedEitherWay(env, s.user_id, target.id))
    return err(403, 'blocked', "You can't open that conversation.");
  if (!(await areFriends(env, s.user_id, target.id)))
    return err(403, 'friend_only', 'Messages are only available between friends.');
  if (!(await checkRateLimit(env, 'message_list_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Slow down a moment.');
  let limit = MESSAGE_PAGE_DEFAULT;
  if (url.searchParams.has('limit')) {
    limit = parsePositiveInt(url.searchParams.get('limit'));
    if (limit == null || limit > MESSAGE_PAGE_MAX)
      return err(400, 'invalid_page', 'Message pages contain between 1 and 50 items.');
  }
  let before = 0;
  if (url.searchParams.has('before')) {
    before = parsePositiveInt(url.searchParams.get('before'));
    if (before == null) return err(400, 'invalid_page', 'That message page cursor is invalid.');
  }
  const res = await env.DB.prepare(
    'SELECT id,from_id,to_id,body,created_at,read_at FROM messages '
    + 'WHERE ((from_id=?1 AND to_id=?2) OR (from_id=?2 AND to_id=?1)) '
    + 'AND (?3=0 OR id<?3) ORDER BY id DESC LIMIT ?4'
  ).bind(Number(s.user_id), Number(target.id), before, limit + 1).all();
  const rows = (res && res.results) || [], hasMore = rows.length > limit;
  if (hasMore) rows.length = limit;
  const mineName = await usernameOf(env, s.user_id), messages = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], mine = Number(row.from_id) === Number(s.user_id);
    messages.push({
      id: Number(row.id),
      from: mine ? mineName : target.username,
      to: mine ? target.username : mineName,
      body: String(row.body),
      at: Number(row.created_at),
      mine,
      readAt: row.read_at == null ? null : Number(row.read_at),
    });
  }
  const nextBefore = hasMore && messages.length ? messages[messages.length - 1].id : null;
  return json({ ok: true, with: target.username, messages, count: messages.length, order: 'newest_first', hasMore, nextBefore });
}

function buildMessageReportSnapshot(reporterName, subjectName, reason, row, fromName, toName, at) {
  return JSON.stringify({
    v: 2,
    kind: 'friend_message',
    at,
    reporter: reporterName || null,
    subject: subjectName || null,
    reason,
    message: {
      id: Number(row.id),
      from: fromName || null,
      to: toName || null,
      body: String(row.body),
      at: Number(row.created_at),
    },
  });
}

/* POST /social/message/report {messageId,reason}
   Reporting remains available if an operator temporarily disables new chat:
   a player must still be able to report already-delivered evidence. It does
   not require the friendship to still exist, but it DOES require the reporter
   to be one of the two message participants. */
async function handleMessageReport(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  const s = g.s;
  if (!(await checkRateLimit(env, 'message_report_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Too many reports — try again later.');
  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const id = parsePositiveInt(body && body.messageId);
  if (id == null) return err(400, 'bad_request', 'Which message?');
  const rv = normalizeModerationReason(body && body.reason);
  if (!rv.ok) return rv.res;
  const reason = rv.value;
  const row = await env.DB.prepare('SELECT id,from_id,to_id,body,created_at FROM messages WHERE id=?1')
    .bind(id).first();
  const uid = Number(s.user_id);
  if (!row || (Number(row.from_id) !== uid && Number(row.to_id) !== uid))
    return err(404, 'no_such_message', 'That message is not available.');
  const subjectId = Number(row.from_id) === uid ? Number(row.to_id) : Number(row.from_id);
  const reporterName = await usernameOf(env, uid), subjectName = await usernameOf(env, subjectId);
  const fromName = Number(row.from_id) === uid ? reporterName : subjectName;
  const toName = Number(row.to_id) === uid ? reporterName : subjectName;
  const now = Date.now();
  const snapshot = buildMessageReportSnapshot(reporterName, subjectName, reason, row, fromName, toName, now);
  const made = await insertModerationReport(env, uid, subjectId, snapshot, reason, now);
  return json({ ok: true, reported: true, messageId: id, id: made.reportId, caseId: made.caseId }, 201);
}

/* ---- authenticated World Chat ---------------------------------------------
   This is a public-username feed, not a presence directory. Reads expose only
   bounded message rows and relationship booleans needed to render safe action
   states; they never expose e-mail, token, IP, presence or last-seen fields. */
async function handleWorldMessageSend(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  if (!(await worldChatAvailable(env))) return featureDisabled('World Chat');
  if (!(await checkRateLimit(env, 'world_send_user', String(g.s.user_id))))
    return err(429, 'rate_limited', 'World Chat is moving quickly — wait a moment.');
  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const message = normalizeMessageBody(body && body.body);
  if (!message.ok) return err(400, message.error, message.message);
  const safety = await inspectWorldMessageSafety(env, message.value);
  if (!safety.ok) {
    if (safety.unavailable)
      return err(503, 'safety_unavailable', 'World Chat safety checks are unavailable — try again later.');
    return err(400, safety.code === 'contact_info' ? 'contact_info' : 'unsafe_content',
      safety.code === 'contact_info' ? 'Do not share contact details or links in World Chat.' : 'That message cannot be posted.');
  }
  const now = Date.now();
  const made = await env.DB.prepare(
    'INSERT INTO world_messages(user_id,body,created_at) VALUES(?1,?2,?3)'
  ).bind(Number(g.s.user_id), message.value, now).run();
  const username = await usernameOf(env, g.s.user_id);
  return json({ ok: true, message: {
    id: Number(made.meta.last_row_id), username, body: message.value, at: now,
    self: true, friend: false,
  } }, 201);
}

async function handleWorldMessagesList(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  if (!(await worldChatAvailable(env))) return featureDisabled('World Chat');
  if (!(await checkRateLimit(env, 'world_list_user', String(g.s.user_id))))
    return err(429, 'rate_limited', 'Slow down a moment.');
  const url = new URL(request.url), beforeRaw = url.searchParams.get('before');
  const before = beforeRaw == null || beforeRaw === '' ? null : parsePositiveInt(beforeRaw);
  if (beforeRaw != null && before == null) return err(400, 'invalid_cursor', 'That World Chat cursor is invalid.');
  const limitRaw = url.searchParams.get('limit'), parsedLimit = limitRaw == null || limitRaw === '' ? 30 : parsePositiveInt(limitRaw);
  if (parsedLimit == null || parsedLimit > MESSAGE_PAGE_MAX)
    return err(400, 'invalid_limit', 'World Chat pages contain at most 50 messages.');
  const uid = Number(g.s.user_id);
  const out = await env.DB.prepare(
    'SELECT w.id,w.user_id,u.username,w.body,w.created_at,EXISTS('
    + 'SELECT 1 FROM friendships f WHERE (f.lo_id=w.user_id AND f.hi_id=?1) OR (f.lo_id=?1 AND f.hi_id=w.user_id)'
    + ') AS is_friend FROM world_messages w JOIN users u ON u.id=w.user_id '
    + 'WHERE (?2 IS NULL OR w.id<?2) AND NOT EXISTS ('
    + 'SELECT 1 FROM blocks b WHERE (b.blocker_id=?1 AND b.blocked_id=w.user_id) '
    + 'OR (b.blocker_id=w.user_id AND b.blocked_id=?1)) '
    + 'ORDER BY w.id DESC LIMIT ?3'
  ).bind(uid, before, parsedLimit + 1).all();
  const rows = (out && out.results) || [], hasMore = rows.length > parsedLimit;
  if (hasMore) rows.length = parsedLimit;
  const messages = rows.map(row => ({
    id: Number(row.id), username: row.username, body: row.body, at: Number(row.created_at),
    self: Number(row.user_id) === uid, friend: Number(row.is_friend) === 1,
  }));
  return json({ ok: true, messages, hasMore,
    nextBefore: hasMore && messages.length ? messages[messages.length - 1].id : null });
}

async function handleWorldMessageReport(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  if (!(await worldChatAvailable(env))) return featureDisabled('World Chat');
  if (!(await checkRateLimit(env, 'world_report_user', String(g.s.user_id))))
    return err(429, 'rate_limited', 'Too many reports — try again later.');
  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const id = parsePositiveInt(body && body.messageId);
  if (id == null) return err(400, 'bad_request', 'Which World Chat message?');
  const rv = normalizeModerationReason(body && body.reason);
  if (!rv.ok) return rv.res;
  const row = await env.DB.prepare(
    'SELECT w.id,w.user_id,w.body,w.created_at,u.username FROM world_messages w JOIN users u ON u.id=w.user_id WHERE w.id=?1'
  ).bind(id).first();
  if (!row) return err(404, 'no_such_message', 'That World Chat message is unavailable.');
  const uid = Number(g.s.user_id), subjectId = Number(row.user_id);
  if (subjectId === uid) return err(400, 'self_report', "You can't report your own message.");
  const reporterName = await usernameOf(env, uid), now = Date.now();
  const snapshot = JSON.stringify({ v: 1, kind: 'world_message', messageId: Number(row.id),
    reporter: reporterName || null, subject: row.username || null, reason: rv.value,
    message: { from: row.username || null, body: String(row.body), at: Number(row.created_at) }, reportedAt: now });
  const made = await insertModerationReport(env, uid, subjectId, snapshot, rv.value, now);
  return json({ ok: true, reported: true, messageId: id, id: made.reportId, caseId: made.caseId }, 201);
}

/* POST /social/presence {state:'online'|'away'|'offline'} */
async function handlePresenceWrite(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  if (!(await presenceAvailable(env))) return featureDisabled('Friend presence');
  const s = g.s;
  if (!(await checkRateLimit(env, 'presence_write_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Too many presence updates — wait a moment.');
  let body;
  try { body = await request.json(); } catch (e) { return err(400, 'bad_request', 'Malformed request.'); }
  const state = String((body && body.state) || '').trim().toLowerCase();
  if (state !== 'online' && state !== 'away' && state !== 'offline')
    return err(400, 'invalid_presence', 'Presence must be online, away or offline.');
  if (state === 'offline') {
    await env.DB.prepare('DELETE FROM presence WHERE user_id=?1').bind(Number(s.user_id)).run();
    return json({ ok: true, state: 'offline', expiresAt: null });
  }
  const now = Date.now(), expiresAt = now + PRESENCE_TTL_MS;
  await env.DB.prepare(
    'INSERT INTO presence (user_id,state,updated_at,expires_at) VALUES (?1,?2,?3,?4) '
    + 'ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at,expires_at=excluded.expires_at'
  ).bind(Number(s.user_id), state, now, expiresAt).run();
  return json({ ok: true, state, expiresAt });
}

/* GET /social/presence — no username parameter, by design. The only rows the
   query can produce are current friends, with a second two-way block filter as
   defense in depth even though blocking also severs the friendship. */
async function handlePresenceList(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  if (!(await presenceAvailable(env))) return featureDisabled('Friend presence');
  const s = g.s;
  if (!(await checkRateLimit(env, 'presence_list_user', String(s.user_id))))
    return err(429, 'rate_limited', 'Slow down a moment.');
  const now = Date.now();
  await env.DB.prepare('DELETE FROM presence WHERE expires_at<=?1').bind(now).run().catch(() => {});
  const res = await env.DB.prepare(
    'SELECT u.id AS user_id,u.username AS username,p.state AS state,p.updated_at AS updated_at '
    + 'FROM friendships f JOIN users u ON u.id=(CASE WHEN f.lo_id=?1 THEN f.hi_id ELSE f.lo_id END) '
    + 'LEFT JOIN presence p ON p.user_id=u.id AND p.expires_at>?2 '
    + 'WHERE (f.lo_id=?1 OR f.hi_id=?1) AND NOT EXISTS ('
    + 'SELECT 1 FROM blocks b WHERE (b.blocker_id=?1 AND b.blocked_id=u.id) '
    + 'OR (b.blocker_id=u.id AND b.blocked_id=?1)) '
    + 'ORDER BY lower(u.username) LIMIT ?3'
  ).bind(Number(s.user_id), now, PRESENCE_LIST_MAX + 1).all();
  const rows = (res && res.results) || [], truncated = rows.length > PRESENCE_LIST_MAX;
  if (truncated) rows.length = PRESENCE_LIST_MAX;
  const friends = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], live = row.state === 'online' || row.state === 'away';
    if (row.username) friends.push({ username: row.username, state: live ? row.state : 'offline', at: live ? Number(row.updated_at) : 0 });
  }
  return json({ ok: true, friends, count: friends.length, truncated });
}

/* Aggregate-only activity. Both routes are authenticated and return only a
   number; no query in this path selects username, e-mail, state or last-seen.
   Expiry makes a crashed/closed client disappear without an explicit logout. */
async function onlineAggregateCount(env, now) {
  await env.DB.prepare('DELETE FROM online_heartbeats WHERE expires_at<=?1').bind(now).run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM online_heartbeats WHERE expires_at>?1')
    .bind(now).first();
  const count = Number(row && row.count);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('online_count_invalid');
  return count;
}
async function handleOnlineHeartbeat(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  if (!(await onlineCountAvailable(env))) return featureDisabled('Online player count');
  if (!(await checkRateLimit(env, 'online_heartbeat_user', String(g.s.user_id))))
    return err(429, 'rate_limited', 'Too many online updates — wait a moment.');
  const now = Date.now(), expiresAt = now + ONLINE_HEARTBEAT_TTL_MS;
  await env.DB.prepare(
    'INSERT INTO online_heartbeats (user_id,updated_at,expires_at) VALUES (?1,?2,?3) '
    + 'ON CONFLICT(user_id) DO UPDATE SET updated_at=excluded.updated_at,expires_at=excluded.expires_at'
  ).bind(Number(g.s.user_id), now, expiresAt).run();
  const count = await onlineAggregateCount(env, now);
  return json({ ok: true, count, expiresAt, ttlMs: ONLINE_HEARTBEAT_TTL_MS });
}
async function handleOnlineCount(request, env) {
  const g = await socialGate(request, env);
  if (g.res) return g.res;
  if (!(await onlineCountAvailable(env))) return featureDisabled('Online player count');
  if (!(await checkRateLimit(env, 'online_count_user', String(g.s.user_id))))
    return err(429, 'rate_limited', 'Slow down a moment.');
  const now = Date.now(), count = await onlineAggregateCount(env, now);
  return json({ ok: true, count, ttlMs: ONLINE_HEARTBEAT_TTL_MS });
}

/* ---- moderation operations --------------------------------------------------
   Operator credentials are a separate authentication realm. The Cloudflare
   secret MODERATION_OPERATOR_KEYS_JSON is an object such as
   {"reviewer-a":"<random 32+ character token>"}. Player bearer sessions are
   never considered here, and each token is cryptographically tied to one
   actor label for the append-only audit ledger. */
function moderationKeyring(env) {
  let value;
  try { value = JSON.parse(String(env && env.MODERATION_OPERATOR_KEYS_JSON || '')); }
  catch (e) { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.length || entries.length > 32) return null;
  for (const [actor, token] of entries)
    if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/i.test(actor) || typeof token !== 'string'
        || token.length < 32 || token.length > 512) return null;
  return entries;
}
async function requireModerator(request, env) {
  if (!(await moderationSchemaAvailable(env)))
    return { res: err(503, 'moderation_unavailable', 'Moderation operations are not configured.') };
  const keys = moderationKeyring(env);
  if (!keys) return { res: err(503, 'moderation_unavailable', 'Moderation operations are not configured.') };
  const match = String(request.headers.get('authorization') || '').match(/^Moderator\s+(.+)$/i);
  if (!match) return { res: err(401, 'moderator_unauthorized', 'Moderator authorization is required.') };
  let actor = null;
  for (const entry of keys) if (timingSafeEqual(match[1], entry[1])) actor = entry[0];
  return actor ? { actor } : { res: err(401, 'moderator_unauthorized', 'Moderator authorization is invalid.') };
}
function moderationEvidence(raw) {
  try { return JSON.parse(String(raw || 'null')); } catch (e) { return null; }
}
function moderationCaseJson(row) {
  return { id:String(row.id),reportId:row.report_id==null?null:Number(row.report_id),
    state:String(row.state),claimedBy:row.claimed_by||null,createdAt:Number(row.created_at),
    updatedAt:Number(row.updated_at),resolvedAt:row.resolved_at==null?null:Number(row.resolved_at),
    evidence:moderationEvidence(row.evidence_snapshot) };
}
async function handleModerationQueue(request, env) {
  const g=await requireModerator(request,env);if(g.res)return g.res;
  const url=new URL(request.url),state=String(url.searchParams.get('state')||'open');
  if(!['open','claimed','resolved'].includes(state))return err(400,'invalid_state','Use open, claimed or resolved.');
  const limit=Math.min(MOD_QUEUE_MAX,parsePositiveInt(url.searchParams.get('limit')||'50')||50);
  let afterAt=0,afterId='';
  if(url.searchParams.has('after')){
    const cursor=String(url.searchParams.get('after')||''),match=cursor.match(/^([1-9][0-9]*):([a-f0-9]{32})$/i);
    if(!match||!Number.isSafeInteger(Number(match[1])))return err(400,'invalid_page','That queue cursor is invalid.');
    afterAt=Number(match[1]);afterId=match[2].toLowerCase();
  }
  const rows=await env.DB.prepare(
    'SELECT * FROM moderation_cases WHERE state=?1 AND (?2=0 OR created_at>?2 OR (created_at=?2 AND id>?3)) ORDER BY created_at,id LIMIT ?4'
  ).bind(state,afterAt,afterId,limit+1).all();
  const cases=(rows.results||[]),hasMore=cases.length>limit;if(hasMore)cases.length=limit;
  return json({ok:true,state,cases:cases.map(moderationCaseJson),hasMore,
    nextAfter:hasMore&&cases.length?(String(cases[cases.length-1].created_at)+':'+String(cases[cases.length-1].id)):null});
}
async function handleModerationCaseRead(request,env,id){
  const g=await requireModerator(request,env);if(g.res)return g.res;
  const row=await env.DB.prepare('SELECT * FROM moderation_cases WHERE id=?1').bind(String(id)).first();
  if(!row)return err(404,'no_such_case','That moderation case is unavailable.');
  const events=await env.DB.prepare(
    'SELECT id,actor_kind,actor_ref,action,reason,details_json,created_at FROM moderation_events WHERE case_id=?1 ORDER BY id'
  ).bind(String(id)).all();
  return json({ok:true,case:moderationCaseJson(row),events:(events.results||[]).map(e=>({id:Number(e.id),
    actorKind:e.actor_kind,actor:e.actor_ref,action:e.action,reason:e.reason,
    details:moderationEvidence(e.details_json),at:Number(e.created_at)}))});
}
async function handleModerationClaim(request,env,id){
  const g=await requireModerator(request,env);if(g.res)return g.res;
  let body;try{body=await request.json();}catch(e){return err(400,'bad_request','Malformed request.');}
  const rv=normalizeModerationReason(body&&body.reason,'Give a reason for claiming this case.');if(!rv.ok)return rv.res;
  const row=await env.DB.prepare('SELECT * FROM moderation_cases WHERE id=?1').bind(String(id)).first();
  if(!row)return err(404,'no_such_case','That moderation case is unavailable.');
  if(row.state==='resolved')return err(409,'case_resolved','That moderation case is already resolved.');
  if(row.state==='claimed')return row.claimed_by===g.actor?json({ok:true,case:moderationCaseJson(row)}):err(409,'case_claimed','Another moderator owns that case.');
  const now=Date.now(),changed=await env.DB.batch([
    env.DB.prepare("UPDATE moderation_cases SET state='claimed',claimed_by=?2,updated_at=?3 WHERE id=?1 AND state='open'").bind(String(id),g.actor,now),
    env.DB.prepare("INSERT INTO moderation_events(case_id,subject_ref,actor_kind,actor_ref,action,reason,details_json,created_at) SELECT id,subject_ref,'operator',?2,'case_claimed',?3,NULL,?4 FROM moderation_cases WHERE id=?1 AND state='claimed' AND claimed_by=?2").bind(String(id),g.actor,rv.value,now),
  ]);
  if(Number(changed[0].meta.changes)!==1||Number(changed[1].meta.changes)!==1)throw new Error('moderation_claim_atomicity');
  return handleModerationCaseRead(request,env,id);
}
async function handleModerationResolve(request,env,id){
  const g=await requireModerator(request,env);if(g.res)return g.res;
  let body;try{body=await request.json();}catch(e){return err(400,'bad_request','Malformed request.');}
  const rv=normalizeModerationReason(body&&body.reason,'Give a resolution reason.');if(!rv.ok)return rv.res;
  const outcome=['no_action','warning','suspend','ban'].includes(body&&body.outcome)?body.outcome:'no_action';
  const row=await env.DB.prepare('SELECT * FROM moderation_cases WHERE id=?1').bind(String(id)).first();
  if(!row)return err(404,'no_such_case','That moderation case is unavailable.');
  if(row.state==='resolved')return err(409,'case_resolved','That moderation case is already resolved.');
  if(row.claimed_by&&row.claimed_by!==g.actor)return err(409,'case_claimed','Another moderator owns that case.');
  const now=Date.now(),details=JSON.stringify({outcome});
  const changed=await env.DB.batch([
    env.DB.prepare("UPDATE moderation_cases SET state='resolved',claimed_by=COALESCE(claimed_by,?2),updated_at=?3,resolved_at=?3 WHERE id=?1 AND state!='resolved'").bind(String(id),g.actor,now),
    env.DB.prepare('UPDATE reports SET resolved=1 WHERE id=?1').bind(row.report_id),
    env.DB.prepare("INSERT INTO moderation_events(case_id,subject_ref,actor_kind,actor_ref,action,reason,details_json,created_at) VALUES(?1,?2,'operator',?3,'case_resolved',?4,?5,?6)").bind(String(id),row.subject_ref,g.actor,rv.value,details,now),
  ]);
  if(Number(changed[0].meta.changes)!==1||Number(changed[2].meta.changes)!==1)throw new Error('moderation_resolve_atomicity');
  const resolved=await env.DB.prepare('SELECT * FROM moderation_cases WHERE id=?1').bind(String(id)).first();
  return json({ok:true,case:moderationCaseJson(resolved),outcome});
}
async function handleModerationEnforce(request,env){
  const g=await requireModerator(request,env);if(g.res)return g.res;
  let body;try{body=await request.json();}catch(e){return err(400,'bad_request','Malformed request.');}
  const found=await findUserByUsername(env,body&&body.username);if(!found.ok)return found.res;
  const kind=String(body&&body.kind||'');if(!['warning','suspend','ban'].includes(kind))return err(400,'invalid_sanction','Use warning, suspend or ban.');
  const rv=normalizeModerationReason(body&&body.reason,'Give a reason for this sanction.');if(!rv.ok)return rv.res;
  let expiresAt=null;
  if(body&&body.expiresAt!=null){expiresAt=Number(body.expiresAt);if(!Number.isSafeInteger(expiresAt)||expiresAt<=Date.now()||expiresAt>Date.now()+366*86400000)return err(400,'invalid_expiry','Sanction expiry must be within the next 366 days.');}
  if(kind==='suspend'&&expiresAt==null)return err(400,'invalid_expiry','A suspension requires an expiry.');
  const caseId=body&&body.caseId==null?null:String(body.caseId);
  if(caseId&&!/^[a-f0-9]{32}$/i.test(caseId))return err(400,'invalid_case','That moderation case is invalid.');
  const subjectRef=await ensureModerationSubject(env,found.user.id);
  if(caseId){const c=await env.DB.prepare('SELECT subject_ref FROM moderation_cases WHERE id=?1').bind(caseId).first();if(!c||c.subject_ref!==subjectRef)return err(400,'invalid_case','That case does not belong to this player.');}
  const id=randomHex(16),now=Date.now(),details=JSON.stringify({sanctionId:id,kind,expiresAt});
  const made=await env.DB.batch([
    env.DB.prepare("INSERT INTO moderation_sanctions(id,case_id,subject_ref,user_id,kind,status,reason,actor_ref,created_at,expires_at) VALUES(?1,?2,?3,?4,?5,'active',?6,?7,?8,?9)").bind(id,caseId,subjectRef,Number(found.user.id),kind,rv.value,g.actor,now,expiresAt),
    env.DB.prepare("INSERT INTO moderation_events(case_id,subject_ref,actor_kind,actor_ref,action,reason,details_json,created_at) VALUES(?1,?2,'operator',?3,'sanction_created',?4,?5,?6)").bind(caseId,subjectRef,g.actor,rv.value,details,now),
  ]);
  if(Number(made[0].meta.changes)!==1||Number(made[1].meta.changes)!==1)throw new Error('moderation_enforce_atomicity');
  return json({ok:true,sanction:{id,username:found.user.username,kind,status:'active',expiresAt}},201);
}
async function handleModerationRevoke(request,env,id){
  const g=await requireModerator(request,env);if(g.res)return g.res;
  let body;try{body=await request.json();}catch(e){return err(400,'bad_request','Malformed request.');}
  const rv=normalizeModerationReason(body&&body.reason,'Give a reason for revoking this sanction.');if(!rv.ok)return rv.res;
  const row=await env.DB.prepare('SELECT * FROM moderation_sanctions WHERE id=?1').bind(String(id)).first();
  if(!row)return err(404,'no_such_sanction','That sanction is unavailable.');
  if(row.status!=='active')return err(409,'sanction_inactive','That sanction is no longer active.');
  const now=Date.now(),details=JSON.stringify({sanctionId:String(id),kind:row.kind});
  const changed=await env.DB.batch([
    env.DB.prepare("UPDATE moderation_sanctions SET status='revoked',revoked_at=?2,revoked_by=?3,revoke_reason=?4 WHERE id=?1 AND status='active'").bind(String(id),now,g.actor,rv.value),
    env.DB.prepare("INSERT INTO moderation_events(case_id,subject_ref,actor_kind,actor_ref,action,reason,details_json,created_at) VALUES(?1,?2,'operator',?3,'sanction_revoked',?4,?5,?6)").bind(row.case_id,row.subject_ref,g.actor,rv.value,details,now),
  ]);
  if(Number(changed[0].meta.changes)!==1||Number(changed[1].meta.changes)!==1)throw new Error('moderation_revoke_atomicity');
  return json({ok:true,sanction:{id:String(id),status:'revoked'}});
}
async function appealGate(request,env){
  const s=await requireSession(request,env);if(!s)return {res:err(401,'unauthenticated','Your session has expired — sign in again.')};
  const row=await env.DB.prepare('SELECT verified_at,age_ok FROM users WHERE id=?1').bind(s.user_id).first();
  if(!row)return {res:err(401,'unauthenticated','Your session has expired — sign in again.')};
  if(row.verified_at==null)return {res:err(403,'unverified','Verify your e-mail address before submitting an appeal.')};
  if(Number(row.age_ok)!==1)return {res:err(403,'age_restricted','Confirm your age before submitting an appeal.')};
  if(!(await moderationSchemaAvailable(env)))return {res:err(503,'moderation_unavailable','Appeals are unavailable — try again later.')};
  return {s};
}
async function handleAppealCreate(request,env){
  const g=await appealGate(request,env);if(g.res)return g.res;
  if(!(await checkRateLimit(env,'appeal_create_user',String(g.s.user_id))))return err(429,'rate_limited','Too many appeals submitted — try again later.');
  let body;try{body=await request.json();}catch(e){return err(400,'bad_request','Malformed request.');}
  const rv=normalizeModerationReason(body&&body.reason,'Explain why this sanction should be reviewed.');if(!rv.ok)return rv.res;
  const subjectRef=await ensureModerationSubject(env,g.s.user_id),sanctionId=body&&body.sanctionId?String(body.sanctionId):'';
  let row;
  if(sanctionId){if(!/^[a-f0-9]{32}$/i.test(sanctionId))return err(400,'invalid_sanction','That sanction is invalid.');row=await env.DB.prepare("SELECT * FROM moderation_sanctions WHERE id=?1 AND subject_ref=?2 AND status='active'").bind(sanctionId,subjectRef).first();}
  else row=await env.DB.prepare("SELECT * FROM moderation_sanctions WHERE subject_ref=?1 AND status='active' ORDER BY created_at DESC LIMIT 1").bind(subjectRef).first();
  if(!row||(row.expires_at!=null&&Number(row.expires_at)<=Date.now()))return err(404,'no_active_sanction','No active sanction is available to appeal.');
  const id=randomHex(16),now=Date.now(),details=JSON.stringify({appealId:id,sanctionId:String(row.id)});
  try{const made=await env.DB.batch([
    env.DB.prepare("INSERT INTO moderation_appeals(id,sanction_id,appellant_ref,state,reason,created_at) VALUES(?1,?2,?3,'open',?4,?5)").bind(id,String(row.id),subjectRef,rv.value,now),
    env.DB.prepare("INSERT INTO moderation_events(case_id,subject_ref,actor_kind,actor_ref,action,reason,details_json,created_at) VALUES(?1,?2,'player',?2,'appeal_created',?3,?4,?5)").bind(row.case_id,subjectRef,rv.value,details,now),
  ]);if(Number(made[0].meta.changes)!==1||Number(made[1].meta.changes)!==1)throw new Error('moderation_appeal_atomicity');}
  catch(e){if(/UNIQUE constraint/i.test(String(e&&e.message||e)))return err(409,'appeal_pending','An appeal for that sanction is already pending.');throw e;}
  return json({ok:true,appeal:{id,sanctionId:String(row.id),state:'open',createdAt:now}},201);
}
async function handleAppealList(request,env){
  const g=await appealGate(request,env);if(g.res)return g.res;
  if(!(await checkRateLimit(env,'appeal_list_user',String(g.s.user_id))))return err(429,'rate_limited','Slow down a moment.');
  const subjectRef=await ensureModerationSubject(env,g.s.user_id),rows=await env.DB.prepare(
    'SELECT id,sanction_id,state,reason,created_at,resolved_at,resolution_reason FROM moderation_appeals WHERE appellant_ref=?1 ORDER BY created_at DESC LIMIT 50'
  ).bind(subjectRef).all();
  return json({ok:true,appeals:(rows.results||[]).map(r=>({id:r.id,sanctionId:r.sanction_id,state:r.state,reason:r.reason,createdAt:Number(r.created_at),resolvedAt:r.resolved_at==null?null:Number(r.resolved_at),resolutionReason:r.resolution_reason||null}))});
}
async function handleModerationAppeals(request,env){
  const g=await requireModerator(request,env);if(g.res)return g.res;
  const state=String(new URL(request.url).searchParams.get('state')||'open');if(!['open','accepted','denied'].includes(state))return err(400,'invalid_state','Use open, accepted or denied.');
  const rows=await env.DB.prepare('SELECT id,sanction_id,state,reason,created_at,resolved_at FROM moderation_appeals WHERE state=?1 ORDER BY created_at,id LIMIT ?2').bind(state,MOD_QUEUE_MAX).all();
  return json({ok:true,state,appeals:(rows.results||[]).map(r=>({id:r.id,sanctionId:r.sanction_id,state:r.state,reason:r.reason,createdAt:Number(r.created_at),resolvedAt:r.resolved_at==null?null:Number(r.resolved_at)}))});
}
async function handleModerationAppealResolve(request,env,id){
  const g=await requireModerator(request,env);if(g.res)return g.res;
  let body;try{body=await request.json();}catch(e){return err(400,'bad_request','Malformed request.');}
  const rv=normalizeModerationReason(body&&body.reason,'Give a reason for the appeal decision.');if(!rv.ok)return rv.res;
  const row=await env.DB.prepare('SELECT a.*,s.case_id,s.subject_ref,s.status AS sanction_status,s.kind FROM moderation_appeals a JOIN moderation_sanctions s ON s.id=a.sanction_id WHERE a.id=?1').bind(String(id)).first();
  if(!row)return err(404,'no_such_appeal','That appeal is unavailable.');if(row.state!=='open')return err(409,'appeal_resolved','That appeal is already resolved.');
  const accept=body&&body.accept===true,state=accept?'accepted':'denied',now=Date.now(),details=JSON.stringify({appealId:String(id),sanctionId:row.sanction_id,state});
  const statements=[
    env.DB.prepare('UPDATE moderation_appeals SET state=?2,resolved_at=?3,resolver_ref=?4,resolution_reason=?5 WHERE id=?1 AND state=\'open\'').bind(String(id),state,now,g.actor,rv.value),
  ];
  if(accept&&row.sanction_status==='active')statements.push(env.DB.prepare("UPDATE moderation_sanctions SET status='revoked',revoked_at=?2,revoked_by=?3,revoke_reason=?4 WHERE id=?1 AND status='active'").bind(row.sanction_id,now,g.actor,'Appeal accepted: '+rv.value));
  statements.push(env.DB.prepare("INSERT INTO moderation_events(case_id,subject_ref,actor_kind,actor_ref,action,reason,details_json,created_at) VALUES(?1,?2,'operator',?3,?4,?5,?6,?7)").bind(row.case_id,row.subject_ref,g.actor,accept?'appeal_accepted':'appeal_denied',rv.value,details,now));
  const changed=await env.DB.batch(statements);if(Number(changed[0].meta.changes)!==1||Number(changed[changed.length-1].meta.changes)!==1)throw new Error('moderation_appeal_resolve_atomicity');
  return json({ok:true,appeal:{id:String(id),state},sanctionRevoked:accept&&row.sanction_status==='active'});
}

/* ---- realtime deterministic match room ------------------------------------
   One SQLite-backed Durable Object owns one launched match. D1 owns accounts,
   launch compatibility and the single-use admission credential; after the
   Worker consumes that credential, this room receives only the verified seat
   tuple. The room never receives a player session or writes gameplay payloads
   to audit storage. */
export class MatchRoom {
  constructor(state,env){
    this.state=state;this.env=env;this.match=null;this.tick=0;this.started=false;
    this.ended=false;this.nextTickAt=0;this.tickTimer=null;this.seats=new Map();
    this.commands=new Map();this.hashes=new Map();this.rates=new Map();this.strikes=new Map();
    try{
      state.storage.sql.exec('CREATE TABLE IF NOT EXISTS room_audit ('+
        'id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,event TEXT NOT NULL,'+
        'seat INTEGER,code TEXT,count INTEGER NOT NULL DEFAULT 0)');
    }catch(e){}
    state.blockConcurrencyWhile(async()=>{
      let saved=null;try{saved=await state.storage.get('room');}catch(e){}
      if(saved&&saved.schema===1){
        this.match=saved.match||null;this.tick=Number(saved.tick)||0;
        this.started=saved.started===true;this.ended=saved.ended===true;
        for(const row of saved.seats||[])this.seats.set(Number(row.seat),Object.assign({},row,{connected:false}));
        for(const row of saved.commands||[])this.commands.set(Number(row[0]),row[1]);
      }
      const sockets=typeof state.getWebSockets==='function'?state.getWebSockets():[];
      for(const ws of sockets){
        let a=null;try{a=ws.deserializeAttachment();}catch(e){}
        const seat=a&&this.seats.get(Number(a.seat));
        if(seat&&Number(a.generation)===Number(seat.generation))seat.connected=true;
      }
      if(this.started&&!this.ended)this._startTimer();
    });
  }
  _audit(event,seat,code,count){
    const clean=v=>String(v||'').replace(/[^a-z0-9_-]/gi,'').slice(0,48)||'none';
    try{this.state.storage.sql.exec(
      'INSERT INTO room_audit(at,event,seat,code,count) VALUES(?1,?2,?3,?4,?5)',
      Date.now(),clean(event),seat==null?null:Number(seat),clean(code),Number(count)||0);}catch(e){}
  }
  _snapshot(){
    return {schema:1,match:this.match,tick:this.tick,started:this.started,ended:this.ended,
      seats:Array.from(this.seats.values()).map(s=>Object.assign({},s,{connected:false})),
      commands:Array.from(this.commands.entries())};
  }
  _persist(){
    try{const p=this.state.storage.put('room',this._snapshot());if(p&&p.catch)p.catch(()=>{});}catch(e){}
  }
  _send(ws,value){try{ws.send(JSON.stringify(value));return true;}catch(e){return false;}}
  _broadcast(value){
    const sockets=typeof this.state.getWebSockets==='function'?this.state.getWebSockets():[];
    for(const ws of sockets)this._send(ws,value);
  }
  _error(ws,code,seq,extra){
    const value={protocol:'massfront-match',v:MATCH_PROTOCOL_VERSION,type:'reject',code};
    if(Number.isSafeInteger(seq))value.seq=seq;
    if(extra&&typeof extra==='object')Object.assign(value,extra);
    this._send(ws,value);
  }
  _closeAfterReject(ws,code,reason){
    setTimeout(()=>{try{ws.close(code,reason);}catch(e){}},20);
  }
  _attachment(ws){try{return ws.deserializeAttachment()||null;}catch(e){return null;}}
  _socketSeat(ws){const a=this._attachment(ws);return a&&this.seats.get(Number(a.seat));}
  _validVerified(v){
    return !!(v&&typeof v==='object'&&/^[a-f0-9]{32}$/.test(String(v.matchId||''))&&
      /^[a-f0-9]{32}$/.test(String(v.lobbyId||''))&&parsePositiveInt(v.userId)&&
      parsePositiveInt(v.seat)&&Number(v.seat)<=LOBBY_MAX_MEMBERS&&
      parsePositiveInt(v.rosterSize)&&Number(v.rosterSize)<=LOBBY_MAX_MEMBERS&&
      BUILD_VERSION_RE.test(String(v.buildVersion||''))&&HASH_256_RE.test(String(v.manifestHash||''))&&
      HASH_256_RE.test(String(v.balanceHash||''))&&HASH_256_RE.test(String(v.rulesHash||'')));
  }
  _sameMatch(v){
    const m=this.match;
    return !!(m&&m.matchId===v.matchId&&m.lobbyId===v.lobbyId&&m.rosterSize===v.rosterSize&&
      m.buildVersion===v.buildVersion&&m.manifestHash===v.manifestHash&&
      m.balanceHash===v.balanceHash&&m.rulesHash===v.rulesHash);
  }
  async _newResume(seat){
    const token=randomHex(32);
    seat.resumeHash=await sha256Hex(token);seat.generation=(Number(seat.generation)||0)+1;
    seat.resumeExpiresAt=Date.now()+4*3600*1000;
    return token;
  }
  _pair(){const pair=new WebSocketPair(),values=Object.values(pair);return {client:values[0],server:values[1]};}
  async _accept(server,seat,resumeToken,resumed){
    this.state.acceptWebSocket(server);
    server.serializeAttachment({seat:seat.seat,generation:seat.generation});
    seat.connected=true;seat.closing=false;seat.disconnectDeadline=null;
    this._persist();
    this._send(server,{protocol:'massfront-match',v:MATCH_PROTOCOL_VERSION,type:'welcome',
      matchId:this.match.matchId,seat:seat.seat,tick:this.tick,tickRate:MATCH_TICK_HZ,
      inputDelay:{min:MATCH_INPUT_DELAY_MIN,max:MATCH_INPUT_DELAY_MAX},
      reconnectGraceMs:MATCH_RECONNECT_GRACE_MS,resumed:resumed===true,
      resumeToken,generation:seat.generation,compatibility:{buildVersion:this.match.buildVersion,
        manifestHash:this.match.manifestHash,balanceHash:this.match.balanceHash,rulesHash:this.match.rulesHash}});
    if(!this.started&&this.seats.size===this.match.rosterSize&&
       Array.from(this.seats.values()).every(s=>s.connected&&!s.forfeited)){
      this.started=true;this.nextTickAt=Date.now()+1000/MATCH_TICK_HZ;
      this._broadcast({protocol:'massfront-match',v:MATCH_PROTOCOL_VERSION,type:'start',tick:0,
        seats:Array.from(this.seats.keys()).sort((a,b)=>a-b)});
      this._audit('match_start',null,'ready',this.match.rosterSize);this._persist();this._startTimer();
    }
  }
  async fetch(request){
    if(String(request.headers.get('upgrade')||'').toLowerCase()!=='websocket')
      return err(426,'websocket_required','Upgrade this route to WebSocket.');
    const verification=request.headers.get('x-mf-seat-verification');
    if(verification){
      let v=null;try{v=JSON.parse(verification);}catch(e){}
      if(!this._validVerified(v))return err(401,'invalid_match_credential','Verified seat metadata is invalid.');
      v={matchId:String(v.matchId),lobbyId:String(v.lobbyId),userId:Number(v.userId),seat:Number(v.seat),
        rosterSize:Number(v.rosterSize),buildVersion:String(v.buildVersion),manifestHash:String(v.manifestHash).toLowerCase(),
        balanceHash:String(v.balanceHash).toLowerCase(),rulesHash:String(v.rulesHash).toLowerCase()};
      if(!this.match)this.match={matchId:v.matchId,lobbyId:v.lobbyId,rosterSize:v.rosterSize,
        buildVersion:v.buildVersion,manifestHash:v.manifestHash,balanceHash:v.balanceHash,rulesHash:v.rulesHash};
      else if(!this._sameMatch(v))return err(409,'match_compatibility_mismatch','The room compatibility tuple is already fixed.');
      if(this.ended)return err(410,'match_ended','That match has ended.');
      if(this.seats.has(v.seat))return err(409,'seat_already_admitted','That seat already entered this room.');
      if(Array.from(this.seats.values()).some(s=>s.userId===v.userId))return err(409,'user_already_admitted','That account already entered this room.');
      const seat={seat:v.seat,userId:v.userId,connected:false,forfeited:false,
        closing:false,disconnectDeadline:null,lastSeq:0,generation:0,resumeHash:null,resumeExpiresAt:0};
      const resumeToken=await this._newResume(seat);this.seats.set(seat.seat,seat);
      const pair=this._pair();await this._accept(pair.server,seat,resumeToken,false);
      this._audit('seat_admit',seat.seat,'launch',1);
      return new Response(null,{status:101,webSocket:pair.client,
        headers:{'sec-websocket-protocol':'massfront.v1'}});
    }
    if(request.headers.get('x-mf-resume-forwarded')!=='1')
      return err(401,'invalid_match_credential','Missing verified seat admission.');
    const credential=matchSocketCredential(request);
    if(!credential||credential.kind!=='resume')return err(401,'invalid_resume','Resume credential is invalid.');
    const seat=this.seats.get(credential.seat),now=Date.now();
    if(!seat||seat.forfeited||seat.connected||!seat.disconnectDeadline||
       seat.disconnectDeadline<=now||seat.resumeExpiresAt<=now)
      return err(401,'invalid_resume','Resume credential is invalid or expired.');
    const hash=await sha256Hex(credential.token);
    if(hash!==seat.resumeHash)return err(401,'invalid_resume','Resume credential is invalid or expired.');
    const resumeToken=await this._newResume(seat),pair=this._pair();
    await this._accept(pair.server,seat,resumeToken,true);
    this._audit('seat_resume',seat.seat,'rotated',1);
    this._broadcast({protocol:'massfront-match',v:MATCH_PROTOCOL_VERSION,type:'reconnected',
      seat:seat.seat,tick:this.tick});
    return new Response(null,{status:101,webSocket:pair.client,
      headers:{'sec-websocket-protocol':'massfront.v1'}});
  }
  _rateAllowed(seat,bytes,commands){
    const now=Date.now();let r=this.rates.get(seat.seat);
    if(!r||now-r.at>=1000)r={at:now,messages:0,commands:0,bytes:0};
    r.messages++;r.commands+=commands||0;r.bytes+=bytes;this.rates.set(seat.seat,r);
    return r.messages<=MATCH_MAX_MESSAGES_PER_SECOND&&r.commands<=MATCH_MAX_COMMANDS_PER_SECOND&&
      r.bytes<=MATCH_MAX_BYTES_PER_SECOND;
  }
  _commandSafe(command){
    if(!command||typeof command!=='object'||Array.isArray(command))return false;
    if(!/^[a-z][a-z0-9_]{0,31}$/.test(String(command.type||''))||
       /^(?:chat|message|text|voice)$/.test(String(command.type)))return false;
    let encoded='';try{encoded=JSON.stringify(command);}catch(e){return false;}
    if(new TextEncoder().encode(encoded).byteLength>MATCH_MAX_COMMAND_BYTES)return false;
    const visit=(v,depth,key)=>{
      if(depth>4||/^(?:chat|message|text|body)$/i.test(String(key||'')))return false;
      if(v==null||typeof v==='boolean')return true;
      if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<=1e9;
      if(typeof v==='string')return v.length<=128&&!/[\u0000-\u001f\u007f]/.test(v);
      if(Array.isArray(v))return v.length<=64&&v.every(x=>visit(x,depth+1,''));
      if(typeof v==='object'){
        const keys=Object.keys(v);return keys.length<=32&&keys.every(k=>k.length<=48&&visit(v[k],depth+1,k));
      }
      return false;
    };
    return visit(command,0,'');
  }
  _strike(ws,seat,code,seq){
    const strikes=(this.strikes.get(seat.seat)||0)+1;this.strikes.set(seat.seat,strikes);
    this._error(ws,code,seq,{strikes});this._audit('protocol_reject',seat.seat,code,1);
    if(strikes>=5){seat.closing=true;this._closeAfterReject(ws,1008,'protocol violation');}
  }
  async webSocketMessage(ws,message){
    const seat=this._socketSeat(ws);
    if(!seat||seat.forfeited||!seat.connected||seat.closing)return;
    if(typeof message!=='string')return this._strike(ws,seat,'binary_not_allowed',null);
    const bytes=new TextEncoder().encode(message).byteLength;
    if(bytes>MATCH_MAX_MESSAGE_BYTES){
      this._audit('rate_reject',seat.seat,'message_bytes',bytes);
      this._error(ws,'message_too_large',null);seat.closing=true;
      this._closeAfterReject(ws,1009,'message too large');return;
    }
    let body;try{body=JSON.parse(message);}catch(e){return this._strike(ws,seat,'invalid_json',null);}
    const commandCount=body&&body.type==='commands'&&Array.isArray(body.commands)?body.commands.length:0;
    if(!this._rateAllowed(seat,bytes,commandCount)){
      this._audit('rate_reject',seat.seat,'socket_rate',commandCount);
      this._error(ws,'rate_limited',Number(body&&body.seq));seat.closing=true;
      this._closeAfterReject(ws,1008,'rate limit');return;
    }
    if(!body||body.protocol!=='massfront-match'||body.v!==MATCH_PROTOCOL_VERSION)
      return this._strike(ws,seat,'protocol_mismatch',Number(body&&body.seq));
    if(body.type==='commands'){
      const seq=Number(body.seq),target=Number(body.targetTick),commands=body.commands;
      if(!Number.isSafeInteger(seq)||seq<=0||seq>2147483647)return this._strike(ws,seat,'invalid_sequence',seq);
      if(seq<=seat.lastSeq)return this._error(ws,'duplicate_or_stale_sequence',seq,{lastAccepted:seat.lastSeq});
      if(!this.started||this.ended)return this._error(ws,'match_not_running',seq);
      if(!Number.isSafeInteger(target)||target<this.tick+MATCH_INPUT_DELAY_MIN)
        return this._error(ws,'stale_target_tick',seq,{tick:this.tick});
      if(target>this.tick+MATCH_INPUT_DELAY_MAX)
        return this._error(ws,'future_target_tick',seq,{tick:this.tick});
      if(!Array.isArray(commands)||!commands.length||commands.length>MATCH_MAX_COMMANDS_PER_BATCH||
         !commands.every(c=>this._commandSafe(c)))return this._strike(ws,seat,'invalid_commands',seq);
      seat.lastSeq=seq;
      const batch=this.commands.get(target)||[];
      batch.push({seat:seat.seat,seq,commands:JSON.parse(JSON.stringify(commands))});
      batch.sort((a,b)=>a.seat-b.seat||a.seq-b.seq);this.commands.set(target,batch);
      this._send(ws,{protocol:'massfront-match',v:MATCH_PROTOCOL_VERSION,type:'ack',seq,targetTick:target,
        count:commands.length});this._persist();return;
    }
    if(body.type==='stateHash'){
      const tick=Number(body.tick),hash=String(body.hash||'');
      if(!Number.isSafeInteger(tick)||tick<=0||tick%MATCH_TICK_HZ!==0||tick>this.tick||tick<this.tick-2*MATCH_TICK_HZ||
         !/^[a-f0-9]{64}$/.test(hash))return this._strike(ws,seat,'invalid_state_hash',null);
      let hashes=this.hashes.get(tick);if(!hashes){hashes=new Map();this.hashes.set(tick,hashes);}
      if(hashes.has(seat.seat))return this._error(ws,hashes.get(seat.seat)===hash?'duplicate_state_hash':'state_hash_rewrite',null,{tick});
      hashes.set(seat.seat,hash);
      this._send(ws,{protocol:'massfront-match',v:MATCH_PROTOCOL_VERSION,type:'hashAck',tick});
      const active=Array.from(this.seats.values()).filter(s=>!s.forfeited).map(s=>s.seat).sort((a,b)=>a-b);
      if(active.length&&active.every(s=>hashes.has(s))){
        const rows=active.map(s=>({seat:s,hash:hashes.get(s)})),unique=new Set(rows.map(r=>r.hash));
        if(unique.size===1)this._broadcast({protocol:'massfront-match',v:MATCH_PROTOCOL_VERSION,
          type:'hashAgreement',tick,hash:rows[0].hash});
        else{
          this._broadcast({protocol:'massfront-match',v:MATCH_PROTOCOL_VERSION,type:'divergence',tick,seats:rows});
          this._audit('state_divergence',null,'hash_mismatch',rows.length);
        }
      }
      return;
    }
    this._strike(ws,seat,'unknown_message_type',Number(body.seq));
  }
  async _disconnect(ws,code){
    const a=this._attachment(ws),seat=a&&this.seats.get(Number(a.seat));
    if(this.ended||!seat||Number(a.generation)!==Number(seat.generation)||!seat.connected)return;
    seat.connected=false;seat.closing=false;seat.disconnectDeadline=Date.now()+MATCH_RECONNECT_GRACE_MS;
    seat.resumeExpiresAt=seat.disconnectDeadline;
    this._audit('seat_disconnect',seat.seat,'close_'+String(Number(code)||0),1);
    this._broadcast({protocol:'massfront-match',v:MATCH_PROTOCOL_VERSION,type:'disconnected',
      seat:seat.seat,tick:this.tick,graceMs:MATCH_RECONNECT_GRACE_MS});
    this._persist();await this._scheduleAlarm();
  }
  async webSocketClose(ws,code){await this._disconnect(ws,code);}
  async webSocketError(ws){await this._disconnect(ws,1011);}
  async _scheduleAlarm(){
    const deadlines=Array.from(this.seats.values()).filter(s=>!s.connected&&!s.forfeited&&s.disconnectDeadline)
      .map(s=>s.disconnectDeadline);
    if(deadlines.length)try{await this.state.storage.setAlarm(deadlines.reduce((a,b)=>Math.min(a,b)));}catch(e){}
  }
  async _forfeitExpired(){
    const now=Date.now(),expired=Array.from(this.seats.values()).filter(s=>!s.connected&&!s.forfeited&&
      s.disconnectDeadline&&s.disconnectDeadline<=now).sort((a,b)=>a.seat-b.seat);
    for(const seat of expired){
      seat.forfeited=true;seat.resumeHash=null;seat.resumeExpiresAt=0;
      this._broadcast({protocol:'massfront-match',v:MATCH_PROTOCOL_VERSION,type:'forfeit',
        seat:seat.seat,tick:this.tick,reason:'reconnect_timeout'});
      this._audit('seat_forfeit',seat.seat,'reconnect_timeout',1);
    }
    const active=Array.from(this.seats.values()).filter(s=>!s.forfeited);
    if(!this.started&&expired.length){
      this.ended=true;
      this._broadcast({protocol:'massfront-match',v:MATCH_PROTOCOL_VERSION,type:'matchEnd',
        tick:this.tick,reason:'admission_forfeit',winnerSeat:null});
      this._audit('match_end',null,'admission_forfeit',expired.length);
    }
    if(this.started&&!this.ended&&active.length<=1){
      this.ended=true;
      this._broadcast({protocol:'massfront-match',v:MATCH_PROTOCOL_VERSION,type:'matchEnd',
        tick:this.tick,reason:'forfeit',winnerSeat:active.length?active[0].seat:null});
      this._audit('match_end',active.length?active[0].seat:null,'forfeit',expired.length);
      if(this.tickTimer){clearTimeout(this.tickTimer);this.tickTimer=null;}
    }
    if(expired.length)this._persist();
    await this._scheduleAlarm();
  }
  async alarm(){await this._forfeitExpired();}
  _startTimer(){
    if(this.tickTimer||!this.started||this.ended)return;
    if(!this.nextTickAt)this.nextTickAt=Date.now()+1000/MATCH_TICK_HZ;
    const wait=Math.max(0,Math.ceil(this.nextTickAt-Date.now()));
    this.tickTimer=setTimeout(()=>{this.tickTimer=null;this._runTicks().catch(()=>{});},wait);
  }
  async _runTicks(){
    if(!this.started||this.ended)return;
    const interval=1000/MATCH_TICK_HZ,now=Date.now();let count=0;
    while(now>=this.nextTickAt&&count<8&&!this.ended){
      this.tick++;this.nextTickAt+=interval;count++;
      const batch=(this.commands.get(this.tick)||[]).slice().sort((a,b)=>a.seat-b.seat||a.seq-b.seq);
      this.commands.delete(this.tick);
      this._broadcast({protocol:'massfront-match',v:MATCH_PROTOCOL_VERSION,type:'tick',tick:this.tick,commands:batch});
      for(const old of Array.from(this.hashes.keys()))if(old<this.tick-2*MATCH_TICK_HZ)this.hashes.delete(old);
      await this._forfeitExpired();
      if(this.tick%MATCH_TICK_HZ===0)this._persist();
    }
    if(count===8&&Date.now()>=this.nextTickAt)this.nextTickAt=Date.now()+interval;
    this._startTimer();
  }
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
          + '  POST /social/block\n  POST /social/unblock\n  POST /social/report\n'
          + '  GET  /social/capabilities\n  POST /social/message/send\n'
          + '  GET  /social/messages\n  POST /social/message/report\n'
          + '  POST /social/world/send\n  GET  /social/world/messages\n  POST /social/world/report\n'
          + '  GET|POST /social/moderation/appeals\n'
           + '  POST /social/presence\n  GET  /social/presence\n'
           + '  POST /social/online/heartbeat\n  GET  /social/online\n'
          + '  POST /multiplayer/lobbies\n  POST /multiplayer/lobbies/join\n'
          + '  GET  /multiplayer/lobbies/:id\n  POST /multiplayer/lobbies/:id/ready|leave\n'
          + '  POST /multiplayer/lobbies/:id/compatibility|launch\n'
          + '  POST /multiplayer/matches/:id/token\n'
          + '  GET  /multiplayer/matches/:id/socket (WebSocket)\n'
          + '  GET|POST /multiplayer/invites\n  POST /multiplayer/invites/:id/respond\n'
          + '  GET /moderation/reports\n  GET /moderation/reports/:id\n'
          + '  POST /moderation/reports/:id/claim|resolve\n  POST /moderation/enforce\n'
          + '  POST /moderation/sanctions/:id/revoke\n  GET /moderation/appeals\n'
          + '  POST /moderation/appeals/:id/resolve\n',
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

      /* Every ordinary route below is behind socialGate() — authenticated,
         age-confirmed, not banned or sanctioned, moderation-ready, and e-mail
         verified whenever policy requires it. Adding a route without that
         call is the one mistake that matters in this file. */
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
      if (path === '/social/capabilities')
        return request.method === 'GET' ? handleSocialCapabilities(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      if (path === '/social/message/send')
        return request.method === 'POST' ? handleMessageSend(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/social/messages')
        return request.method === 'GET' ? handleMessagesList(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      if (path === '/social/message/report')
        return request.method === 'POST' ? handleMessageReport(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/social/world/send')
        return request.method === 'POST' ? handleWorldMessageSend(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/social/world/messages')
        return request.method === 'GET' ? handleWorldMessagesList(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      if (path === '/social/world/report')
        return request.method === 'POST' ? handleWorldMessageReport(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/social/moderation/appeals') {
        if (request.method === 'GET') return handleAppealList(request, env);
        if (request.method === 'POST') return handleAppealCreate(request, env);
        return err(405, 'method_not_allowed', 'Use GET or POST.');
      }
      if (path === '/social/presence') {
        if (request.method === 'GET') return handlePresenceList(request, env);
        if (request.method === 'POST') return handlePresenceWrite(request, env);
        return err(405, 'method_not_allowed', 'Use GET or POST.');
      }
      if (path === '/social/online/heartbeat')
        return request.method === 'POST' ? handleOnlineHeartbeat(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/social/online')
        return request.method === 'GET' ? handleOnlineCount(request, env) : err(405, 'method_not_allowed', 'Use GET.');
      if (path === '/multiplayer/lobbies')
        return request.method === 'POST' ? handleLobbyCreate(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      if (path === '/multiplayer/lobbies/join')
        return request.method === 'POST' ? handleLobbyJoin(request, env) : err(405, 'method_not_allowed', 'Use POST.');
      let route=path.match(/^\/multiplayer\/lobbies\/([a-f0-9]{32})$/i);
      if(route)return request.method==='GET'?handleLobbyGet(request,env,route[1]):err(405,'method_not_allowed','Use GET.');
      route=path.match(/^\/multiplayer\/lobbies\/([a-f0-9]{32})\/(ready|leave)$/i);
      if(route)return request.method==='POST'?handleLobbyAction(request,env,route[1],route[2]):err(405,'method_not_allowed','Use POST.');
      route=path.match(/^\/multiplayer\/lobbies\/([a-f0-9]{32})\/(compatibility|launch)$/i);
      if(route)return request.method==='POST'?(route[2]==='compatibility'?handleLobbyCompatibility(request,env,route[1]):handleLobbyLaunch(request,env,route[1])):err(405,'method_not_allowed','Use POST.');
      route=path.match(/^\/multiplayer\/matches\/([a-f0-9]{32})\/token$/i);
      if(route)return request.method==='POST'?handleMatchTokenClaim(request,env,route[1]):err(405,'method_not_allowed','Use POST.');
      route=path.match(/^\/multiplayer\/matches\/([a-f0-9]{32})\/socket$/i);
      if(route)return handleMatchSocket(request,env,route[1]);
      if(path==='/multiplayer/invites'){
        if(request.method==='GET')return handleLobbyInvites(request,env);
        if(request.method==='POST')return handleLobbyInvite(request,env);
        return err(405,'method_not_allowed','Use GET or POST.');
      }
      route=path.match(/^\/multiplayer\/invites\/([a-f0-9]{32})\/respond$/i);
      if(route)return request.method==='POST'?handleLobbyInviteRespond(request,env,route[1]):err(405,'method_not_allowed','Use POST.');
      if(path==='/moderation/reports')return request.method==='GET'?handleModerationQueue(request,env):err(405,'method_not_allowed','Use GET.');
      route=path.match(/^\/moderation\/reports\/([a-f0-9]{32})$/i);
      if(route)return request.method==='GET'?handleModerationCaseRead(request,env,route[1]):err(405,'method_not_allowed','Use GET.');
      route=path.match(/^\/moderation\/reports\/([a-f0-9]{32})\/(claim|resolve)$/i);
      if(route)return request.method==='POST'?(route[2]==='claim'?handleModerationClaim(request,env,route[1]):handleModerationResolve(request,env,route[1])):err(405,'method_not_allowed','Use POST.');
      if(path==='/moderation/enforce')return request.method==='POST'?handleModerationEnforce(request,env):err(405,'method_not_allowed','Use POST.');
      route=path.match(/^\/moderation\/sanctions\/([a-f0-9]{32})\/revoke$/i);
      if(route)return request.method==='POST'?handleModerationRevoke(request,env,route[1]):err(405,'method_not_allowed','Use POST.');
      if(path==='/moderation/appeals')return request.method==='GET'?handleModerationAppeals(request,env):err(405,'method_not_allowed','Use GET.');
      route=path.match(/^\/moderation\/appeals\/([a-f0-9]{32})\/resolve$/i);
      if(route)return request.method==='POST'?handleModerationAppealResolve(request,env,route[1]):err(405,'method_not_allowed','Use POST.');
      return err(404, 'route_not_found', 'No such endpoint.');
    } catch (e) {
      return err(500, 'server_error', 'Something went wrong on the server.');
    }
  },
};
