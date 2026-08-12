/* ============================================================================
   MASSFRONT UPDATE SERVER  —  Cloudflare Worker + R2
   ----------------------------------------------------------------------------
   Two routes, and deliberately no more:

     GET /update.json          the manifest the game polls
     GET /f/<version>/<path>   one source file from that release

   The manifest is {version, notes, base, files:[{path,size}]} and its `base`
   points back at /f/<version>/ on this same worker, so a release is immutable
   once published: the version is IN the download path, and a client that is
   halfway through downloading 1.10.0 cannot be handed a file from 1.11.0. That
   matters here because the updater verifies total bytes before committing, and
   a mixed-version payload would fail that check with no way to explain itself.

   CORS is wide open because it has to be. An installed Capacitor build has an
   origin of `http://localhost` or `capacitor://localhost` — every request from
   the shipped game is cross-origin, so without ACAO the updater can never read
   a response. Everything served here is public game code; there is nothing to
   protect with an origin allowlist, and nothing is writable over HTTP.
   ============================================================================ */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'range, if-none-match',
  'access-control-expose-headers': 'content-length, etag',
};

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8',
               'cache-control': 'no-store', ...CORS, ...extra },
  });

/* Reject anything that could climb out of the release prefix. */
function safePath(p) {
  if (!p || p.length > 512) return null;
  const segs = p.split('/');
  for (const s of segs) {
    if (s === '' || s === '.' || s === '..') return null;
    if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(s)) return null;
  }
  return segs.join('/');
}
const safeVersion = v => (/^[0-9]+\.[0-9]+\.[0-9]+$/.test(v) ? v : null);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return json({ error: 'method_not_allowed' }, 405, { allow: 'GET, HEAD, OPTIONS' });

    if (path === '/' )
      return new Response(
        'MASSFRONT update server\n\n  GET /update.json\n  GET /f/<version>/<path>\n',
        { headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS } });

    if (path === '/health')
      return json({ status: 'ok', service: 'massfront-update' });

    /* ---- the manifest ---- */
    if (path === '/update.json') {
      const obj = await env.RELEASES.get('massfront/latest.json');
      if (!obj) return json({ error: 'no_release',
        message: 'No MASSFRONT release has been published yet.' }, 404);
      const body = await obj.text();
      return new Response(request.method === 'HEAD' ? null : body, {
        headers: { 'content-type': 'application/json; charset=utf-8',
                   'cache-control': 'no-store', etag: obj.httpEtag, ...CORS },
      });
    }

    /* ---- ASSET PACKS ------------------------------------------------------
       Large media that does not belong in the installer. The app ships lean and
       pulls these on first launch, which is what keeps a 50 MB build down to
       something a phone will install over cellular. Content-addressed by pack
       name so a pack can be replaced without touching the app binary. */
    if (path === '/packs.json') {
      const obj = await env.RELEASES.get('packs/index.json');
      if (!obj) return json({ error: 'no_packs', packs: {} }, 404);
      return new Response(request.method === 'HEAD' ? null : await obj.text(), {
        headers: { 'content-type': 'application/json; charset=utf-8',
                   'cache-control': 'no-store', ...CORS },
      });
    }
    const pk = /^\/pack\/([a-z0-9_-]+)\/(.+)$/.exec(path);
    if (pk) {
      const rel = safePath(pk[2]);
      if (!rel) return json({ error: 'invalid_path' }, 400);
      const key = `packs/${pk[1]}/${rel}`;
      const head = await env.RELEASES.head(key);
      if (!head) return json({ error: 'not_found', key }, 404);
      const headers = new Headers(CORS);
      head.writeHttpMetadata(headers);
      headers.set('etag', head.httpEtag);
      headers.set('content-length', String(head.size));
      headers.set('cache-control', 'public, max-age=604800');
      headers.set('x-content-type-options', 'nosniff');
      if (request.method === 'HEAD') return new Response(null, { headers });
      const obj = await env.RELEASES.get(key);
      if (!obj) return json({ error: 'not_found' }, 404);
      return new Response(obj.body, { headers });
    }

    /* ---- one file from a release ---- */
    const m = /^\/f\/([^/]+)\/(.+)$/.exec(path);
    if (m) {
      const version = safeVersion(m[1]);
      const rel = safePath(m[2]);
      if (!version || !rel) return json({ error: 'invalid_path' }, 400);

      const key = `massfront/${version}/${rel}`;
      const head = await env.RELEASES.head(key);
      if (!head) return json({ error: 'not_found', key }, 404);

      /* Conditional GET: the updater re-downloads whole releases, but a browser
         or a retried download should not pay for bytes it already has. */
      const inm = request.headers.get('if-none-match');
      if (inm && inm.split(',').some(v => v.trim().replace(/^W\//, '') === head.httpEtag))
        return new Response(null, { status: 304, headers: { etag: head.httpEtag, ...CORS } });

      const headers = new Headers(CORS);
      head.writeHttpMetadata(headers);
      headers.set('etag', head.httpEtag);
      headers.set('content-length', String(head.size));
      /* Immutable: the version is in the path, so this bytes-for-URL mapping
         can never change. Cache it hard. */
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      headers.set('x-content-type-options', 'nosniff');
      if (rel.endsWith('.js')) headers.set('content-type', 'text/javascript; charset=utf-8');
      if (request.method === 'HEAD') return new Response(null, { headers });

      const obj = await env.RELEASES.get(key);
      if (!obj) return json({ error: 'not_found' }, 404);
      return new Response(obj.body, { headers });
    }

    return json({ error: 'route_not_found' }, 404);
  },
};
