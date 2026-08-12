# Accounts, sign-in and cloud saves

Three separate things, deliberately independent:

| | needs a provider | needs a server | works today |
|---|---|---|---|
| Local profiles | no | no | yes |
| Portable `.mfsave` files | no | no | yes |
| Google / Facebook sign-in | yes | no | once configured |
| Cloud saves | yes | yes | once configured |

Save files and local profiles are finished and working. Sign-in and cloud saves
are implemented end to end but cannot authenticate without credentials this
build has no way to invent — a Google client ID, a Facebook app ID, and a place
to store saves. Until those are supplied the buttons are shown dimmed and say
so, rather than pretending.

---

## Turning sign-in on

Fill in `assets/auth.json` and rebuild. Anything left blank stays off.

    {
      "googleClientId": "1234-abc.apps.googleusercontent.com",
      "facebookAppId":  "1234567890",
      "syncUrl":        "https://your-host/api"
    }

You can also set `window.MASSFRONT_AUTH` before boot, which takes precedence —
useful when one codebase is deployed to several environments.

### Google

1. Google Cloud console → APIs & Services → Credentials → **OAuth client ID**,
   type *Web application*.
2. Add your origins to *Authorised JavaScript origins*. For the Android app that
   is `https://localhost`; for iOS, `capacitor://localhost`; plus whatever host
   serves the web build.
3. Paste the client ID into `googleClientId`.

The game uses Google Identity Services and asks for One Tap first, falling back
to the rendered button when the browser suppresses it. No client secret is
involved and none should ever ship in a client.

### Facebook

1. developers.facebook.com → create an app → add **Facebook Login**.
2. Under *Valid OAuth Redirect URIs*, add the same origins.
3. Paste the app ID into `facebookAppId`.

Facebook requires App Review before `public_profile` and `email` work for anyone
outside your test users. Budget for that.

---

## The cloud-save contract

Two endpoints. Any backend can serve them — a Worker, a Lambda, forty lines of
Express.

    POST {syncUrl}/save
      { provider, id, token, payload }        ->  { ok:true, at }

    POST {syncUrl}/load
      { provider, id, token }                 ->  { ok:true, at, payload }

**The server must verify `token` before trusting `id`.** The client decodes the
Google ID token only to show a name and a picture; a decoded JWT is not proof of
anything, and a server that trusts the client's `id` field lets anyone claim
anyone's save. Verify against Google's JWKS or Facebook's debug-token endpoint,
and key the record on the verified subject.

`payload` is opaque to the server: store and return it unchanged.

### Conflict handling

The client never overwrites silently. On restore it compares a career score —
XP, plus cores weighted three times, plus forty per match played — and:

* if the cloud is clearly ahead, it restores
* if the device is clearly ahead, it *asks*, showing both scores
* if they are within 2% of each other, it takes the cloud copy

Pushes are fire-and-forget and retry on the next save; a failed push is not
something to interrupt a player about. A failed *pull* is, and says so.

---

## Portable save files

The reason none of the above is required to move a career between devices.

Export produces a binary `.mfsave` file that can be stored in Files, Drive, or
any other document provider. It contains an `MFRTSAVE` magic header, schema
version, structured profile/career payload, and SHA-256 digest. Load validates
the header, length, schema, and digest before asking for confirmation or touching
the current career. The same conflict logic used by cloud restore still applies.

The older `M1`/`M2` text codec remains internal so existing cloud records stay
readable, but it is no longer exposed to players as a copy-and-paste save code.

---

## Linking

Signing in attaches the account to the profile you are **already playing**. A
player with forty matches behind them must never be handed an empty career
because they pressed a sign-in button, so the local profile is always the
starting point and the cloud copy is reconciled against it afterwards.

Signing out leaves everything on the device. It is a disconnect, not a wipe.
