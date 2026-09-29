# MASSFRONT host notes

The entire Stormpeak source tree is vendored here from
`CreatorJD1/Stormpeak-MASSFRONT` at `c97b76a`. Auth, server, migrations, and
scripts stay in this module for continued theatre work. They do not enter
`www/` or the APK.

The player tester is a slim static build:

```powershell
cd modules/stormpeak_ocean
npm install
npm run build:tester
```

MASSFRONT opens `dist/index.html` as a sibling document. Return to MASSFRONT
is on the HUD, pause overlay, and result overlays. The host launcher is
`src/stormpeak-tester.js`.

The static player tester does not need the vendored auth server. For later
server use, `.env.example` documents the required private environment keys.
Only an explicit `VITE_AUTH_ENABLED=false` permits a local shared dev user;
enabling auth without injected broker credentials rejects user access. Never
commit a populated `.env` file or a preview client secret. Rotate the old
broker preview credential before reusing upstream auth, because this module
was vendored from a separate repository.
