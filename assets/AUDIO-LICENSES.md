# MASSFRONT audio provenance and rights ledger

Last repository audit: 2026-08-03.

This file records what the repository can prove about the audio currently used
by MASSFRONT. It is an inventory and evidence checklist, not a legal opinion.
It intentionally does not invent a composer, sound-library vendor, marketplace,
license name, receipt number, or attribution requirement.

## Rights status at this snapshot

The project owner explicitly stated in the project conversation: **"I own the
files."** The owner supplied the audio source folders and instructed that the
music and sound samples be used in MASSFRONT. `docs/HANDOFF.md` also records the
project understanding that the soundtrack and sound-effect library are the
owner's, purchased or self-made.

That statement is the current ownership assertion. It is not, by itself, a
receipt, license agreement, composer release, work-for-hire agreement, or
vendor record. No such documents are stored in this repository at this audit.
Before a commercial store submission, the owner must fill in the evidence table
near the end of this file and store copies of the supporting documents outside
the public game package.

Two Google Drive source folders were supplied by the owner during the audio
pass:

- `https://drive.google.com/drive/folders/195q7blrGvwnFdWMh5k2JL4Kc4SRM-N8G`
- `https://drive.google.com/drive/folders/1H2ixBjT9DY_KiOWX3lU6fYzysmcZj5q3`

The repository does not currently preserve a Drive export manifest, permission
snapshot, vendor name, order number, or one-to-one mapping from those folders to
every processed output. Do not describe the Drive links as proof of a specific
commercial license until that metadata is added.

## Delivery model

MASSFRONT deliberately uses several audio tiers:

1. **Bundled effects and ambience:** 73 effect/ambience basenames in
   `assets/audio/`, each supplied as both `.m4a` and `.ogg` (146 files). M4A/AAC
   covers Safari/iOS; Ogg covers open-source Chromium/Firefox.
2. **Bundled score seeds:** 13 short M4A files in `assets/audio/music/`, one for
   each faction/intensity combination plus the menu. These are the owner-supplied
   score heard in a fresh or offline install.
3. **Bundled generic fallback score:** three project-generated music beds,
   `mus_ambient`, `mus_tension`, and `mus_combat`, in both codecs. They remain a
   decode/failure fallback and are not part of the nine-master soundtrack pack.
4. **Optional full soundtrack pack:** nine 92-second M4A masters in
   `releases/audio-pack/pack/music/`, indexed and hashed by
   `releases/audio-pack/packs.json`. The repository says these were recovered
   byte-for-byte from the owner-provided prior build `releases/MASSFRONT.apk`.

The optional soundtrack files are release assets but were not verified as live
on the active Hugging Face channel at this audit. Local presence is not proof of
remote publication.

## Bundled sound-effect and ambience inventory

The 73 effect/ambience basenames below exist in both M4A and Ogg form. This is a
complete basename inventory of the non-`mus_*` audio files at the root of
`assets/audio/`:

```text
alarm
alarm0
alarm_loop0
amb_high0
amb_low0
boom0
boom1
boom2
boombig
boomsmall
boomsmall0
build0
cannon0
cannon1
carrier_deploy0
confirm0
cre_attack0
cre_attack1
cre_attack2
cre_attack3
cre_death0
cre_death1
cre_death2
cre_death3
cre_idle0
cre_idle1
cre_idle2
cre_idle3
cre_pain0
cre_pain1
cre_pain2
cre_pain3
deploy
factory_hum0
flame
flyby0
gauss0
gauss1
gauss2
heal
heal0
hit0
hit1
hit2
laser0
laser1
laser2
level0
level1
missile
missile0
missile1
missile2
move_air0
move_brood0
move_brood1
move_vehicle0
move_vehicle1
notify0
pickup0
pickup1
radio0
shot0
shot1
shot2
sonic
structure_hum0
structure_hum1
surge
thrust
ui0
ui1
ui2
```

`assets/audio/sfx.json` currently defines 29 runtime override slots containing
56 variant references. The engine merges those overrides with its default sound
map in `src/audio.js`, which is why the complete on-disk list is larger than the
JSON override list.

### Evidence for library-derived effects

`assets/audio/sfx-assign.json` records 43 processed clips derived from 31 source
WAV filenames. Long creature recordings contain several distinct takes and were
split at real pauses; the assignment file records onset, retained duration,
gain, slot and variant index. The original 31 WAV files are currently present
under `.tmp/audio-source/` and total approximately 53.63 MiB.

The `.tmp` location is not durable provenance storage. Before making the master
source handoff, copy these files byte-for-byte to
`source-media/audio/sfx-originals/` and preserve their hashes. Do not recompress,
rename, or replace them during that archival copy.

| Owner-supplied source filename | Bytes | SHA-256 |
|---|---:|---|
| `Alarm Loop Sci Fi Alarm Loop 01.wav` | 348804 | `82c725da9dac1ac6b99e7c9927e0473ba92622008867d41501566db77cd4b47c` |
| `Alarm Warning Beep.wav` | 192236 | `c7d211465b4e75cb7b498df60695d1c6e1a0f0406b939fb3f5040674f2ab2dff` |
| `Build Hydraulics 01.wav` | 66584 | `287f37a11bdce8182d5683a0162164429021357baf1ab1981b15e1c34ec0d75e` |
| `Confirm Switch 01.wav` | 53600 | `80823117339724284b050c2a37888e11aa558999e1cb684e02244921d178b4c8` |
| `Explosion 01.wav` | 573724 | `33f2816e66e55e1d92efdd0de05b568474c18f4493119b8328b5b8a12070dce1` |
| `Explosion 02.wav` | 563356 | `0c9fb68a03a0cf9ae4423d6406c0d4f15750f2862acf39e64a3ce3d9e6e3c4b9` |
| `Explosion Small Metal Debris.wav` | 277336 | `5a54061d7417767cf29d0af16c27227bef96e166956b46a2b5d92993c0635959` |
| `Factory Hum Large Industrial Fan Loop.wav` | 283054 | `bb4d02ee2e95503773125115477a26703a263222f18d5514900c38adb6362d20` |
| `Fly By 01.wav` | 344706 | `46581d4bf6c88fd6b13d1b8c77f014d5e0de250f604e699c7f701d97cef854c5` |
| `Laser Gun.wav` | 51320 | `092ac37f9101449412a1f58e68f21d0e472fb6c1c83d7a8b19c526bcfa877701` |
| `MBDS Small Velociraptor Attack.wav` | 10875000 | `c5c8df82cd13cd8cd956eaaf8c3ac3b19d113beb78a4b640b2ecddb591cccdeb` |
| `MBDS Small Velociraptor Death.wav` | 16742200 | `78654d36788a0dcf981798d65ad54910c5754ad6d07f19bef9f0595b2853616a` |
| `MBDS Small Velociraptor Idle.wav` | 16223530 | `45daaa367321736eda44408357ab8fc466b31baeb88daff85edde14bea2cc413` |
| `MBDS Small Velociraptor Pain.wav` | 7066882 | `4d3a01ce029b9e294b462e60075acce6c408bb02853d95e4ece1c1d4d9428e1c` |
| `Missile 01.wav` | 425682 | `bd7701d2a0c7147b00443c89e788f06c3aa5e33e570a37e4fb063765add499ec` |
| `Move Air Sci Fi Drone Loop.wav` | 263358 | `792a6262031b83eeb6649d48dbb7697e1aa09dcb49b19e2a17cb3c27afe30122` |
| `Move Brood Alien Locusts Loop 01.wav` | 275084 | `d563597c77da870d9b0d0068fd33681fc372ea1ad8829f2a25ef363c67648978` |
| `Move Brood Alien Locusts Loop 02.wav` | 264702 | `998b819a5dc6229118a6a89fe388f17022afa68303a6c19668903d6c9102c874` |
| `Move Vehicle Car Engine Run 01.wav` | 133070 | `60ad864924e08483434e85669a6e00b767228d343f72fe3e741d5bec93c895b0` |
| `Move Vehicle Car Engine Run 02.wav` | 245256 | `ec5883d4ea66926d8a07f94b7d0fe0bcd83317ed0e4826fea301d483ee6d2026` |
| `Notify Digital Disturbance.wav` | 97222 | `31d9398168496ed9813d1bd5d7522d98895cb653075022060d6e1ebe8be43a66` |
| `Pickup Metal Ting 01.wav` | 43420 | `874c48a938edc9a4a1af9a837d27c9dacd518245ad083c60aa9a9593ae6dd791` |
| `Pickup Metal Ting 02.wav` | 66960 | `cb93f21c9c98ba0466476393ccbfddd96a9e26eb083f55c5bc7931ed5e5ad4ee` |
| `Radio Walkie Talkie Static 01.wav` | 56524 | `9a4188c48753a87fff10b092d1f4fafb629b4831faf5cc82ea3f2d2876037b85` |
| `Reward Metal Gong.wav` | 238824 | `4738d39c0818d42b469f91e14df609756e34d7a7e408da7a2cd22412b46e508d` |
| `Reward Radio Hit Digital Bull Horn 01.wav` | 235248 | `b24a9290d7e7f6580c438e6a99c1cb48266d0dc22b83987cbae6545a30ea9f20` |
| `Structure Hum Main Reactor Loop 01.wav` | 105486 | `a9617e26430438d35fbb03957e6435d1651300cf8581a7071a26aada3ae8746c` |
| `Structure Hum Main Reactor Loop 02.wav` | 81646 | `31cfe760fdbfbff8d6fed17e75cbd4d897f88582f205cd18f48295ed38896213` |
| `UI Switch 02.wav` | 16554 | `ffdf922ad2382bbbc3c4f2ba3475b3ac9592d877cd2a455dce9ef4ff2e8bc21f` |
| `UI Switch 03.wav` | 20600 | `7481ac860396ee767088f94869003b75540ab686267b50653b1badd3389721d4` |
| `UI Switch 04.wav` | 7254 | `677cdcb10b285b0cb5839655904cdc2739c7c168a8ea4955958cc8c6a7326d09` |

The filenames help identify the material, but they do not identify a vendor or
license. `MBDS` is retained as part of the supplied filename; this ledger does
not expand it into a vendor or product name without evidence.

### Project-produced effects and fallbacks

`tools/make-audio.py` is repository source for a deterministic DSP rendering
pipeline: layered transients/bodies/tails, filtered noise, convolution,
saturation, dynamics, and dual-codec encoding. It defines 30 effect targets and
three generic music fallback targets. Later library ingestion replaces or adds
some outputs; `assets/audio/sfx-assign.json` is the evidence for those replaced
targets (`boom0`, `boom1`, and `laser0` overlap scripted target names).

The current commander cannon and carrier deployment effects also have local
project production masters that must be preserved in the master source archive:

| Project master | Bytes | SHA-256 |
|---|---:|---|
| `.tmp/cannon0-master.wav` | 414694 | `de9c575187fcc96e8a6f20655f07daF6f5ef2d3516cf7acf1559da232cbb85f2` |
| `.tmp/cannon1-master.wav` | 397054 | `cd9d8175b9f8077b028a1c57191f6c911af859286d1b4bac06da6441f46f633a` |
| `.tmp/carrier-deploy-master.wav` | 414694 | `c89e943d22bc7fb6a1fa49e8207d1c8719060f8151ac2a218663ad75cd938975` |

Case is not significant for SHA-256. Their durable destination should be
`source-media/audio/project-masters/`; `.tmp` is only their current location.

## Bundled owner-supplied score seeds

**Removed from source 2026-08-15.** Every row below was a Suno song with
sung vocals/lyrics. The files are no longer in `assets/audio/music/` or the
optional pack. Hashes stay as provenance of what used to ship. The live score
is the project-generated `mus_*` beds.

`assets/audio/music.json` maps 13 bundled 18-second M4A excerpts to five
playlists (Nova, Red Ascendancy, Syndicate, Brood and menu) and three intensity
states. `docs/AUDIO-IDENTITY-MAP.md` records that they are derived from the nine
owner-supplied masters recovered from the prior build. They are normalized
delivery derivatives, not additional independent compositions.

| Bundled seed file | Use | Source composition | Bytes | SHA-256 |
|---|---|---|---:|---|
| `nova_explore_black_iron_pulse_seed.m4a` | Nova explore | Black Iron Pulse | 222043 | `2345f0be2fa86820152f8ce7aef3b289eb0d4b887a264ab7b476986dd63cd7ed` |
| `nova_tension_black_iron_pulse_seed.m4a` | Nova tension | Black Iron Pulse | 221368 | `9cdbe1e9cd3f3b4e1ed9abf5500ca7539133e41561ddd3c2dd43be585309ddc3` |
| `nova_combat_blackout_crown_seed.m4a` | Nova combat | Blackout Crown | 224781 | `a5298229b367bdc60d071649748a59e1f3fe65f5b393cc613ef006bbdb6cd1b8` |
| `ascendancy_explore_ashes_to_crown_seed.m4a` | Red explore | Ashes to Crown | 224839 | `d278126015ddea332473710636a2e404ac1942c67de0a86853527d11d71d4f44` |
| `ascendancy_tension_ashes_to_crown_seed.m4a` | Red tension | Ashes to Crown | 223289 | `489a85f1f8ec677fe5eeccb292bcedf664a3e2ed9b2d59829945c1eb551d609d` |
| `ascendancy_combat_iron_crown_seed.m4a` | Red combat | Iron Crown | 223243 | `05ca7747086fe34dea219cb3a6909da76c03d6106829891e07107f97f82e3e80` |
| `syndicate_explore_bassquake_seed.m4a` | Syndicate explore | Bassquake Chronicles Remastered | 223671 | `27a956298cdf7809588f95fe5d1ca62f8f825c13089766d1db431b353d418e74` |
| `syndicate_tension_bassquake_seed.m4a` | Syndicate tension | Bassquake Chronicles Remastered | 224445 | `3977fded44e07b40979671d356274e1bcf0d50b228b9076bb91ea2dc86188d38` |
| `syndicate_combat_black_flag_vulture_seed.m4a` | Syndicate combat | Black Flag Vulture | 222642 | `86c5d5804e2cfad03832548f1db0969680837f6600bfcf52823cfab47303109d` |
| `horde_explore_black_helmets_seed.m4a` | Brood explore | Black Helmets | 222562 | `beafceafcb7c750d9d7934b3dc21cf88efe51e6093d0f129d0c475470fb4c27a` |
| `horde_tension_black_helmets_seed.m4a` | Brood tension | Black Helmets | 221776 | `1892fd22ceadd17823fb271b21de2618b8ec1f6b0448cfd05197a2ff37597fbf` |
| `horde_combat_black_iron_pulse_seed.m4a` | Brood combat | Black Iron Pulse | 221538 | `35ec49a3da70fdb9ae8d3135715ced4f8a3fc7e451653cde994bdbf705128663` |
| `menu_cold_crown_seed.m4a` | Main menu | Cold Crown | 222908 | `3fd5c8e5ddb9b5650af64cb3c38cc85411d344c625c5214fab3b00cee5bbaffd` |

## Optional owner-supplied full soundtrack pack

`assets/audio/music-assign.json` explicitly says
`"recoveredFrom": "releases/MASSFRONT.apk"` and leaves every artist field
blank. `docs/AUDIO-IDENTITY-MAP.md` says the nine AAC masters were recovered
intact and kept byte-identical in the optional pack. This is evidence of the
files' route into the repository; it is not evidence of their original creator
or purchase license.

| Full master file | Faction/use | Bytes | SHA-256 |
|---|---|---:|---|
| `ascendancy_ashes_to_crown.m4a` | Red explore/tension | 1147835 | `f566b1b8602e60386607925b4aee27c99d3acfabfe8855101b35d1f2b8fc392f` |
| `ascendancy_iron_crown_1.m4a` | Red combat | 1144013 | `21d5d830b842a22e82ea4e7739941e8cef5db6946beb7e5ce5c0806be2fb8e17` |
| `horde_black_helmets.m4a` | Brood explore/tension | 1142041 | `b6f342c14eab85f1f68d628d52ba0fb107819d2556484ad4f4cd77307a61716b` |
| `horde_black_iron_pulse.m4a` | Brood combat | 1138822 | `a881dee799d011e533146990dd7f80242b772acbbe8612cc15628d28f77cefc6` |
| `menu_cold_crown.m4a` | Main menu | 1149917 | `bf4e8bdba8794a0068a01fa613627b74d19aabcb6f062e0ab739f2a693b07968` |
| `nova_black_iron_pulse_1.m4a` | Nova explore/tension | 1138722 | `0632b9eb8c175b34a8d6f2ccfe6a5e89e8c4ff495cf76d85b1468214cff1592e` |
| `nova_blackout_crown.m4a` | Nova combat | 1134835 | `1a62e2294801067322706bafdd24f963dddbc462784ca3ede90b0ba119a1bdf5` |
| `syndicate_bassquake_chronicles_remastered_1.m4a` | Syndicate explore/tension | 1153748 | `da0097f6daf9c176cff4c42d75fc04667046f2363f95d78b6b02c85eecef5035` |
| `syndicate_black_flag_vulture.m4a` | Syndicate combat | 1153348 | `d626a03fef4c8ba5d55c19c11b091815f9e543d3a63e4a602bc7cbef5f091729` |

Total indexed pack: 9 files, 10,303,281 bytes (about 9.83 MiB).

## Project-generated generic fallback score

`tools/make-audio.py` is the repository source for these three beds. The script
describes them as shared-key/shared-tempo layers produced with code and encoded
to both codecs. This is separate from the owner's nine supplied compositions.

| File | Bytes | SHA-256 |
|---|---:|---|
| `mus_ambient.m4a` | 772240 | `d6fe44e75b39dc70828d2ea5459c375770ac91cedca10dc309f9326915c0652c` |
| `mus_ambient.ogg` | 174861 | `a594bfb9e595dc154745457ac2c1d7df3b04a91c7f7829bd4d7199455fd66c32` |
| `mus_tension.m4a` | 748574 | `e438aa9f4d7b19e0b54357d5fedb5f0f72241a3eed3b26d94dd11ca9292509aa` |
| `mus_tension.ogg` | 408343 | `8ca43ef3364a6afc36f8c6fa481a7769cec2beee9ec273c94879280fb7e874a8` |
| `mus_combat.m4a` | 750937 | `11bdae3eace8670489529e194a53dca1bcd521775fd6e63d6bdb7d959bcb4e8c` |
| `mus_combat.ogg` | 450685 | `cfcd9dce3a5b11be4c9c7859887b32f330d8f4968b98461ddfe7f839628d8438` |

## Missing evidence for commercial review

The following fields are not established by the current repository or by the
owner's general ownership statement:

- original composer/recordist/designer legal name
- library, marketplace, studio, or vendor
- whether each source was purchased, commissioned, or self-made
- acquisition/creation date
- exact license name/version and a copy of its terms
- order, invoice, account, contract, or receipt identifier
- whether modification, commercial game synchronization, binary redistribution,
  standalone soundtrack distribution, trailers/advertising, and content-ID use
  are permitted
- attribution wording, if any
- territory, term, transfer, sublicensing, or seat restrictions
- whether the `MBDS` creature recordings carry any special restriction

Do not replace an unknown field with a guess. Use `Unknown - owner action
required` until documentary evidence is attached.

## Commercial-review fill-in table

Store receipts/contracts outside the public repository and record a secure
relative reference or document ID here. Add rows when a source family has
different terms.

| Audio family/files | Purchased, commissioned, or self-made | Creator/recordist | Vendor/library | Acquisition or creation date | License/contract and version | Order/receipt/document ID | Commercial game sync | Modification/derivatives | Binary redistribution | Standalone soundtrack distribution | Trailer/marketing use | Attribution required | Content-ID status | Evidence storage reference | Owner verification date | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 31 owner-supplied SFX WAV originals listed above | Unknown - owner action required | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | N/A unless separately distributed | Unknown | Unknown | Unknown | Unknown | Pending | Pending |
| Nine supplied soundtrack masters listed above | Unknown - owner action required | Unknown; `artist` fields are blank | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown - specifically confirm optional pack rights | Unknown | Unknown | Unknown | Unknown | Pending | Pending |
| 13 short soundtrack seed derivatives | Derived in project from the nine masters | Same as source masters | Same as source masters | 2026-08-03 project build | Source-master terms control | Same as source masters | Pending source confirmation | Pending source confirmation | Pending source confirmation | N/A as separate work; source terms control | Pending source confirmation | Pending source confirmation | Same as source masters | Same as source masters | Pending | Pending |
| Script-generated effects and generic fallback beds | Project-generated; confirm human author/commission record | Unknown - document project contributor | N/A unless third-party components were used | 2026-08 project | Project source record | Add internal record | Pending documentation | Pending documentation | Pending documentation | Pending documentation | Pending documentation | Pending documentation | Confirm no third-party Content ID | Repository tools + internal record | Pending | Pending |
| Commander cannon/carrier local project masters | Project-produced; exact author/source record missing | Unknown - document project contributor | Unknown/N/A | 2026-08 project | Unknown | Add internal record | Pending documentation | Pending documentation | Pending documentation | Pending documentation | Pending documentation | Pending documentation | Unknown | `source-media/audio/project-masters/` after archival copy | Pending | Pending |

## Pre-release evidence checklist

- [x] Copied all 31 original WAVs from `.tmp/audio-source/` into durable
  `source-media/audio/sfx-originals/` on 2026-08-03. Source and destination both
  contain 31 files / 56,239,222 bytes; every documented SHA-256 matched.
- [x] Copied all three cannon/carrier masters into
  `source-media/audio/project-masters/` on 2026-08-03. Source and destination
  both contain 3 files / 1,226,442 bytes; every documented SHA-256 matched.
- [ ] Export or screenshot the owner-supplied Drive folder inventory and record
  the export date without exposing credentials.
- [ ] Attach purchase receipts, licenses, contracts, or self-creation records to
  a private evidence store.
- [ ] Complete every applicable field in the commercial-review table.
- [ ] Confirm the rights for distributing the nine full masters as an optional
  soundtrack pack, not merely synchronizing them inside gameplay.
- [ ] Confirm trailer, advertising and social-media rights separately if needed.
- [ ] Record required attribution in the game credits/store listing.
- [ ] Check whether any source is enrolled in Content ID and retain dispute
  evidence.
- [ ] Preserve this ledger, the hashes, `sfx-assign.json`, `music-assign.json`,
  `music.json`, `packs.json`, and source receipts together in the master source
  handoff.

## Adding or replacing audio

For every future source file, add a row before it enters the shipped bank. Keep
the untouched source master, its SHA-256, the processed output mapping, the
license/contract record, and any attribution text. A filename or a web link is
not a license record.
