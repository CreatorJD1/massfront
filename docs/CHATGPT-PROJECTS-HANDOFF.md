# MASSFRONT — ChatGPT Projects handoff

Updated: 2026-08-09  
Current published baseline: `1.33.5`  
Active delivery targets: web/PWA and Google Android (Capacitor)  
Intentionally out of scope for the current track: iOS, StoreKit, IPA signing

## Paste this into a new ChatGPT Project

You are continuing MASSFRONT, a large-scale mobile RTS/RPG with a hand-written
WebGL2 engine in plain JavaScript. Read `AGENTS.md` first and then
`docs/HANDOFF.md`. Treat this file as the current product handoff. Work on the
web/PWA and Google Android versions only unless the owner explicitly reopens
iOS work. Never describe Co-op Versus, MMO, paid checkout, or server-authority
as complete until their verification gates below pass. Keep tests below two
minutes. After every source edit run `node tools/bundle.mjs`; visually inspect
phone screenshots because a clean console does not prove the renderer is good.

## Product direction

MASSFRONT should be newcomer-friendly at first contact but retain the depth of
a Supreme Commander-scale mobile RTS. The front end should feel like a command
system rather than a list of settings.

- Standard is solo player-versus-AI with an optional AI ally. It is not Co-op.
- Campaign is authored progression and should introduce systems in controlled
  missions rather than exposing every sandbox setting at once.
- Co-op Versus is a future online lobby/match mode, not allied-AI Standard.
- MMO is a persistent war layer. Planets become server/shard boundaries, four
  regions per planet hold faction influence, and maps are battle instances.
- Brood Tides are major world invasions. A failed region may displace an
  outpost and change the front, but inactivity must never delete paid/account
  ownership.
- The Brood/Swarm remains AI-only until the rest of the game is mature.

## Implemented in the current web/Android pass

### Standard deployment

`src/galaxyui.js` now turns Standard setup into a four-stage route:

1. Galaxy
2. Planet
3. Region
4. Deploy

The Deploy stage uses three one-tap battle plans instead of exposing all
settings immediately:

- **First Command** — assisted opening, rich economy, calm field, no infestation.
- **Classic War** — balanced economy/threat with infestation enabled.
- **Fortress** — hard defensive assault with turtle AI and a long match clock.

It also provides:

- Solo Command and Allied Strike team cards.
- Three actual commander portraits for the selected playable faction.
- A compact mission summary.
- One Advanced drawer containing command/forces, rules, and economy/risk.
- Compact-map enforcement: Allied Strike is disabled when only two faction
  slots fit because at least one enemy is mandatory.
- An assisted First Command default for the first three Standard matches in an
  app session.

Do not reintroduce the old duplicate setup drawers or a tab for every setting.

### Front navigation and Arsenal

Runtime labels now communicate destination rather than internal system names:

- War Room → Deploy
- Development → Research
- Armory → Arsenal
- Orders → Contracts
- Profile → Career
- Factions → Intel
- Mega → Sandbox

`src/storeui.js` and `src/styles/store.css` now present four Arsenal
destinations: Market, Vault, Loadout, Style. Market has one sub-filter row and a
reviewable earned-core basket. Tapping an upgrade stages it; cores are deducted
exactly once only when the basket is confirmed. Daily deals, permanent perks,
consumable restocks, and locked commander colors use the same basket.

Important commerce boundary:

- Earned cores are currently the functional in-game purchase currency.
- Paid products are not exposed as purchasable.
- If the server economy is confirmed, the local basket disables checkout until
  a server batch-cart endpoint exists. This avoids overwriting authoritative
  balances.
- Web checkout reports whether `window.MASSFRONT_CHECKOUT_URL` exists.
- Android checkout reports whether the `MassfrontBilling` Capacitor plugin is
  present.
- Neither provider grants an entitlement on the client.

### Google Android Billing bridge

Native files:

- `android/app/src/main/java/com/creatorjd/massfront/MassfrontBillingPlugin.java`
- `android/app/src/main/java/com/creatorjd/massfront/MainActivity.java`
- `android/app/build.gradle`

The bridge uses Google Play Billing `9.1.0` and exposes:

- `status`
- `queryProducts(productIds)`
- `purchase(productId)`
- `queryPurchases`
- `billingState` and `purchaseUpdated` events

It deliberately does **not** grant currency/items, acknowledge, or consume a
purchase. The backend must verify the purchase token, grant idempotently, then
acknowledge/consume. Never change this into client-authoritative granting.

Official reference:
`https://developer.android.com/google/play/billing/integrate.html`

### Asset/runtime fixes in this pass

- Corrected numbered UI, confirm, level-up, pickup, and reject audio mappings in
  `src/audio.js` so existing samples are actually requested.
- Corrected the modifier-art atlas path in `src/styles/ui.css`.
- Extended `tools/make-icons.py` and regenerated the icon bank for three faction
  research nodes and Neural Uplink.

## Verification completed

Web build:

```powershell
node tools/bundle.mjs
node tools/pack-www.mjs
node .tmp/verify-web-android.mjs
```

Verified at `412 × 915`, touch enabled:

- 3 battle plans
- 2 team choices
- 3 faction commander choices
- 1 Advanced setup drawer
- 0 visible legacy setup drawers
- 4 Arsenal destinations
- no horizontal document overflow or clipped setup controls
- basket staging does not change cores
- basket confirmation changes cores once and empties the basket
- no page-level JavaScript errors

Reference screenshots:

- `.tmp/standard-deploy-mobile.png`
- `.tmp/arsenal-cart-mobile.png`

Android Java compile:

```powershell
$env:JAVA_HOME=(Resolve-Path '..\.toolchains\jdk21\jdk-21.0.12+8').Path
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat :app:compileDebugJavaWithJavac
```

Run that command from `android/`. It passes. The repository-local portable JDK
was used because the machine-wide JDK is Java 17 while Capacitor currently
requires Java 21. `android/local.properties` points at the installed Android
SDK and is machine-local configuration, not a credential.

## Honest current limitations

- No update was published in this pass.
- No APK was assembled or signed in this pass; only Java/native compilation was
  completed.
- The economy worker is documented in source but is not confirmed deployed.
  Currency remains locally editable until server authority is live.
- Paid web checkout is a provider boundary only; no Stripe session endpoint or
  verified webhook entitlement flow is deployed.
- Google Play purchase tokens are surfaced safely but no backend verification,
  acknowledgement, consumption, or restoration grant is deployed.
- Co-op Versus has no production lobby, friends/presence, synchronized command
  stream, desync recovery, reconnect, or authoritative validation.
- MMO is a design/architecture target, not a live service.
- Do not remove the “service in development” locks from Co-op/MMO just to make
  the cards appear finished.

## Next implementation gates

### P0 — finish safe web/Android commerce

1. Deploy or replace the account/economy worker.
2. Add an idempotent batch earned-core cart endpoint.
3. Add a Google purchase-token verification endpoint using the Play Developer
   API; grant only `PURCHASED`, never `PENDING`.
4. Acknowledge or consume only after the grant transaction succeeds.
5. Query owned purchases on billing connection and app resume; restore through
   the same server path.
6. Add a web Checkout Session endpoint and verified webhook fulfillment.
7. Add purchase/refund audit records and receipt replay protection.

### P1 — make Co-op Versus genuinely playable

1. Account IDs, friend requests, block/report controls, presence.
2. Lobby create/join/invite, ready states, team slots, AI slots, and map voting.
3. Deterministic match seed and version/balance-hash compatibility checks.
4. Relay compact player commands, not rendered state; compute periodic state
   hashes and snapshot resync on disagreement.
5. Host migration or a small authoritative match coordinator.
6. Reconnect window, abandoned-match rules, moderation, and rate limits.
7. Two-device Android/web soak tests before unlocking the mode card.

Cloudflare Durable Objects are a suitable coordinator for a lobby or regional
actor, but one object should own one bounded coordination unit rather than the
entire galaxy. Reference:
`https://developers.cloudflare.com/durable-objects/best-practices/websockets/`

### P2 — persistent planet war/MMO foundation

- One planet service/shard boundary per planet.
- Four bounded region actors per planet.
- Append-only battle-result ledger feeding regional influence.
- Faction population balancing and protected newcomer regions.
- Brood pressure meter: probing → breach → Tide → occupation → recovery.
- Time-limited Tide instances with clear warnings and opt-in high-risk rewards.
- Defeat displaces the colony/outpost to reserve; it does not erase account
  inventory, paid ownership, or inactive players’ permanent collection.
- Snapshot/restore, moderation, audit logs, and disaster recovery before MMO
  rewards affect the account economy.

### P3 — continue the cinematic usability pass

- Replace remaining text-only Arsenal inventory cards with live 3D previews.
- Add an item comparison drawer, wishlist, and saved loadout presets.
- Build a real Operations timeline with authored mission art and reward tracks.
- Continue the guided Campaign tutorial before adding more Standard controls.
- Keep rare/expert map modifiers inside Advanced and unlock them through
  achievements/levels as already directed.

### P4 — reach the approved material and combat-FX standard

Read `docs/ART-SYSTEM-V2-AUDIT-AND-PLAN-2026-08-09.md` first. It is the
authoritative 25-point renderer/asset audit and gated Material V2 + controlled
procedural-assembly plan. Its one-tank opt-in material lab must pass before the
larger vertical slice below begins.

Local, unpublished Art V2 progress now passes that architecture gate:

- `src/engine/materials-v2.js` remains strictly opt-in through
  `?materiallab=1`; the ordinary game allocates no V2 program or maps.
- Arsenal/showcase now loads a dedicated baked Blender/GLB payload on demand:
  19,154 triangles, 29,876 UV-split vertices, one joined render part, nine
  semantic material regions and six retained named sockets. The authored
  source scene is 163 nodes/156 rendered parts. The payload is not in the normal
  boot bundle; ordinary game launches do not download or parse it.
- Battle LOD is 2,088 triangles, 207 UV islands and three 512 maps. The
  100/200-unit tests remain one V2 instance stream.
- The authored tank now has unique non-overlapping UV0 and three 1024 maps:
  Base+AO, NormalXY+Roughness+Emissive, and
  Metal+FactionPrimary+FactionSecondary+Wear. They add no shader sample and
  keep faction paint, glass, lights, weapons and machinery separated.
- Authored LOD1 is 8,810 triangles / 19,185 UV-split vertices, reuses the same
  maps, keeps all nine material regions and six sockets, and preserves the
  silhouette in close/tactical/far phone captures. Clean/worn/critical controls
  exercise the packed damage channel without another texture sample.
- The established Nova crest is baked onto dedicated identification plates and
  excluded from runtime paint tinting. Layered turret/skirt armor supplies
  large-form detail; ordinary wear and object-space strike damage share the
  packed mask without another runtime texture sample.
- SwiftShader comparison at 412 × 915: 100 legacy/V2 9.86/10.55 fps; 200
  legacy/V2 8.31/8.93 fps; zero V2-scoped GL errors, zero context loss.
- The Blender bake/import round trip is deterministic (SHA-256
  `0C4B04119E5B5C4E3C96CA32B63CC316C2B844E45258DD351C590221EDF9A883`).
  LOD1 is independently deterministic at
  `1494BE1D67730D1200DF80FF1F8995A4DE6D54D4EC9C91F06CEFCB1254A44888`.
  This is still not Supreme Commander 2 parity: the next gate is richer
  serial/stencil sheets, macro-normal refinement and real Android GPU
  calibration before any roster migration.

Read `docs/MATERIAL-FX-AUDIT-2026-08-09.md` before changing materials, models,
lighting or combat effects. The supplied blue/yellow heavy-unit references are
the new hero-asset quality bar. The renderer foundation is already capable;
the largest remaining gap is authored models, unique UVs, baked macro detail
and target-material-aware effects. Do not attempt to solve it by brightening the
shared atlas or adding indiscriminate particles.

Start with a six-asset vertical slice: Nova commander, Nova deployer/HQ, Nova
heavy tank, Legion artillery, Syndicate energy unit and Brood organic heavy.
Keep procedural/instanced mass-unit LODs so the 1,000-unit faction cap remains
credible. No whole-roster conversion should begin until the slice passes the
day/night/damage, UV, material-separation and 100-unit combat gates in the
audit.

## Build/release rules

Read `AGENTS.md`. The critical commands are:

```powershell
node tools/bundle.mjs
node tools/pack-www.mjs
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

After an APK build, run the mandatory shrink/re-sign tool documented in
`AGENTS.md`. Do not publish a release or activate `update.json` unless the owner
explicitly asks. When publishing, upload inactive artifacts first and activate
the updater manifest last.

## Files to inspect first

- `AGENTS.md`
- `docs/HANDOFF.md`
- `src/galaxyui.js`
- `src/storeui.js`
- `src/styles/store.css`
- `src/game/meta.js`
- `src/economy-net.js`
- `android/app/src/main/java/com/creatorjd/massfront/MassfrontBillingPlugin.java`
- `cloudflare/`
