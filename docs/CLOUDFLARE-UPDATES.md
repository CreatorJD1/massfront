# Over-the-air updates on Cloudflare

MASSFRONT patches itself without going through a store. The game is a list of
ordered plain scripts, so a patch is just a newer set of those scripts: the app
fetches a small manifest, compares versions, streams the payload down with real
byte progress, stores it in IndexedDB, and runs it instead of the packaged files
on the next launch. If a patched bundle fails to boot, the loader notices on the
following launch and rolls back to the packaged build automatically.

This document covers the server half.

## What exists already

* **R2 bucket `massfront-releases`** — created. Holds every published release.
* **Worker `cloudflare/massfront-update/`** — written, not yet deployed. You have
  to run the deploy yourself; Workers cannot be deployed from the container this
  was built in.

The worker has two routes and deliberately no more:

| Route | Serves |
|---|---|
| `GET /update.json` | the manifest the game polls |
| `GET /f/<version>/<path>` | one source file from that release |

The version lives in the download path, so a release is immutable once
published. That matters: the updater verifies total bytes before committing, and
a client halfway through downloading 1.10.0 must never be handed a file from
1.11.0.

CORS is wide open, and it has to be. An installed Capacitor build has an origin
of `http://localhost` or `capacitor://localhost`, so *every* request the shipped
game makes is cross-origin. Without `access-control-allow-origin` the updater
could never read a response. Everything served is public game code and nothing
is writable over HTTP, so there is nothing an origin allowlist would protect.

## One-time setup

```bash
cd cloudflare/massfront-update
npx wrangler login        # opens a browser, authorises your Cloudflare account
```

## Publishing a release

Bump `APP_VERSION` in `src/updater.js` first — the publish script refuses to run
if it disagrees with the version you pass, because a mismatch means clients
would install the release and still think they were out of date.

```bash
node tools/publish-cloudflare.mjs 1.11.0 "What changed in this build"
```

That single command:

1. deploys the worker and reads its public URL out of the wrangler output
2. uploads every file listed in `assets/data/manifest.json` to
   `massfront/<version>/…` in R2
3. writes the manifest **last** — see below
4. patches `assets/update-config.json` with the endpoint, so the next APK you
   build already knows where to look and nobody has to type a URL on a phone

Then rebuild so the shipped config carries the endpoint:

```bash
node tools/pack-www.mjs && npx cap sync android && (cd android && ./gradlew assembleDebug)
```

### Why the manifest goes up last

The manifest is the switch that turns a release on. The game polls
`/update.json`, and the moment it names version X it starts fetching X's files.
Uploaded in the other order, every player who happened to poll during the upload
would receive a manifest promising files that were not there yet, fail
mid-download, and — because the updater verifies total bytes before it commits —
discard the whole thing and show a failure you could not reproduce ten seconds
later. Files first, manifest last, always.

## Checking it works

```bash
curl https://<your-worker>.workers.dev/health
curl https://<your-worker>.workers.dev/update.json
```

In the game: **Settings → Update Source** shows the endpoint, and the version
line on the main menu opens the updater panel. With no endpoint configured the
panel says so in plain words rather than reporting "up to date" forever, which
is what the old build did — it fetched its own packaged manifest, compared the
version against itself, and could never find anything.

## Overriding the endpoint without a rebuild

Resolution order, most specific first:

1. `window.MASSFRONT_UPDATE_URL`, set by an embedder before boot
2. a URL saved on the device via **Settings → Update Source**
3. `assets/update-config.json`, shipped with the build
4. `./update.json`, but only when served from a genuine remote web origin —
   never from a packaged app, because there it would resolve to the build's own
   manifest

## Rollback

Every install keeps the packaged build on disk. **Revert to the packaged build**
appears in the updater panel whenever a patch is running. To pull a bad release
server-side, re-publish the previous version number; clients compare numerically
(`1.10.0` beats `1.9.9`), so you may need to publish a *higher* number
containing the older code rather than relying on clients downgrading.
