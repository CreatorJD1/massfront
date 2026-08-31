# Personnel Portrait Generation Record

> **Commander specification superseded 2026-08-28.** The realistic, cinematic,
> shaded commander prompts preserved below are provenance for the existing
> rejected style, not instructions for new work. Every human or robotic
> commander now follows `commander-anime-flat-v1` in
> `docs/FACTION-ART-CONVERSION.md`: flat anime shapes, crisp continuous lines,
> solid palette fills, and no gradients, cel bands, modeled/baked shadows, AO,
> specular highlights, or painterly lighting. The three current module
> commander portraits require replacement before approval. Non-commander
> specialist records below remain historical until separately redirected.

These 15 original personnel portraits were generated with the built-in image
generation tool on 2026-08-20 for this isolated MASSFRONT test room. No supplied
game screenshot, existing character, real person, logo, or third-party artwork
was used as an input image. Runtime copies live under
`assets/textures/personnel/`.

## Shared production specification

Every call used this prompt structure. The roster-specific request, subject,
lighting, and exclusion lines are recorded below.

```text
Use case: stylized-concept
Asset type: original MASSFRONT game personnel portrait
Primary request: <roster-specific request>
Subject: <roster-specific subject and equipment>
Style/medium: highly detailed cinematic character illustration, realistic rendering with subtle graphic-novel finish, presentation-ready original game art
Composition/framing: centered chest-up, full head or hair silhouette and both shoulders visible, readable at small dossier-card size
Lighting/mood: <faction- and role-specific lighting>
Scene/backdrop: genuinely transparent background, clean anti-aliased edge
Constraints: one character; no text, letters, logos, watermark, frame, weapon, background scene, or real-world insignia
Avoid: generic stock face, cartoon or anime exaggeration, glamour or superhero pose, plastic skin, fantasy gear, flat or simple art
```

The commander calls used the same constraints at a more detailed key-art level:
one original adult character, chest-up three-quarter framing, realistic anatomy
and skin, faction-specific worn armor and restrained emissive identification,
transparent background, and no text, logo, watermark, frame, real-world
insignia, weapon, environment, or placeholder treatment.

## Commander prompt set

### `nova_rhea_voss` → `commander-rhea-voss.png`

```text
Commander Rhea Voss, the starting Nova resident-faction commander, portrayed as a calm female expeditionary officer and measured-advance strategist. One original adult human character with a direct confident gaze, disciplined graphite and cold-blue ceramic field armor, practical communications collar, subtle cyan Nova identification lighting, realistic facial anatomy, natural skin, restrained scars, fabric wear, and controlled cool orbital lighting.
```

### `dominion_toren_vale` → `commander-toren-vale.png`

```text
Commander Toren Vale, the starting Dominion resident-faction commander, portrayed as a seasoned male defensive-line officer and hold-the-line strategist. One original adult human character with a steady unsmiling gaze, close-cropped dark hair graying at the temples, rugged natural skin, blackened-steel and oxidized-bronze command armor, high-impact collar, subtle amber Dominion identification lighting, realistic wear, warm amber key light, and cool steel rim light.
```

### `syndicate_mara_quill` → `commander-mara-quill.png`

```text
Commander Mara Quill, the starting Syndicate resident-faction commander, portrayed as a precise female covert-logistics officer and ghost-network strategist. One original adult human character with an observant controlled expression, asymmetrical short dark hair, realistic facial anatomy, smoke-black reconnaissance armor, compact data collar, subtle violet Syndicate identification lighting, practical weathering, and low-key covert lighting with restrained violet and magenta rim accents.
```

## Nova specialist prompt set

### `nova_scout_ilan` → `specialist-ilan-reeve.png`

```text
Ilan Reeve, adult Nova reconnaissance specialist, an alert male pathfinder trained for orbital survey insertions. Lean field operative with a focused gaze, cropped dark hair, realistic skin, graphite and cold-blue lightweight recon armor, compact sensor collar, optical survey module, subtle cyan identification light, and cool command lighting.
```

### `nova_tech_sumi` → `specialist-sumi-kade.png`

```text
Sumi Kade, adult Nova technical specialist, a female field engineer responsible for sensors, probes, and remote systems. Precise intelligent gaze, practical tied-back black hair, realistic skin, graphite and cold-blue technical pressure suit, articulated ceramic plates, diagnostic collar, compact tool-interface modules, subtle cyan status lights, and cool laboratory lighting.
```

### `nova_medic_orr` → `specialist-orr-sato.png`

```text
Orr Sato, adult Nova medical specialist, a male expedition medic trained for trauma stabilization and alien-environment containment. Composed empathetic gaze, close dark hair, mature realistic face, graphite and white-blue medical field armor, sealed fabric layers, compact bioscanner collar, modular trauma-kit fittings, restrained cyan medical lights, and clean cool clinical lighting. No cross symbol.
```

### `nova_support_vik` → `specialist-vik-arden.png`

```text
Vik Arden, adult Nova support specialist, a female expedition operations coordinator responsible for logistics uplinks and deployment support. Resolute practical expression, short textured brown hair, realistic skin, graphite and cold-blue support armor, reinforced harness, command-uplink collar, compact supply-control modules, restrained cyan indicators, and cool orbital lighting.
```

## Dominion specialist prompt set

### `dominion_scout_brann` → `specialist-brann-holt.png`

```text
Brann Holt, adult Dominion reconnaissance specialist, a rugged male perimeter scout trained to read hostile terrain and hold forward observation posts. Weathered face, shaved sides and short dark hair, vigilant gaze, blackened-steel and oxidized-bronze recon armor, reinforced collar, long-range sensor module, restrained amber indicators, warm amber key light, and cool steel rim light.
```

### `dominion_tech_vesk` → `specialist-vesk-orra.png`

```text
Vesk Orra, adult Dominion technical specialist, a female siege-systems engineer who maintains heavy field machinery and hardened infrastructure. Broad practical features, dark braided hair secured for work, exacting gaze, blackened-steel and oxidized-bronze engineering armor, reinforced collar, diagnostic interfaces, tool couplings, restrained amber lights, warm forge-like key light, and cool steel rim light.
```

### `dominion_medic_tala` → `specialist-tala-rune.png`

```text
Tala Rune, adult Dominion medical specialist, a female combat-trauma clinician for fortified expeditionary operations. Mature calm face, close-curled dark hair, steady compassionate gaze, blackened-steel, pale-ceramic, and oxidized-bronze sealed medical armor, biosensor collar, trauma modules, restrained amber indicators, warm controlled key light, and cool clinical rim light. No cross symbol.
```

### `dominion_support_kray` → `specialist-kray-damar.png`

```text
Kray Damar, adult Dominion support specialist, a male heavy-lift and fortification coordinator for expedition deployments. Solid believable build, shaved head, dark beard, patient resolute gaze, blackened-steel and oxidized-bronze support armor, reinforced load harness, logistics-uplink collar, heavy-lift control modules, restrained amber lights, warm industrial key light, and cool steel rim light.
```

## Syndicate specialist prompt set

### `syndicate_scout_nix` → `specialist-nix-ravel.png`

```text
Nix Ravel, adult Syndicate reconnaissance specialist, an androgynous covert pathfinder trained for silent surveillance and intelligence recovery. Lean face, short asymmetrical dark hair, watchful neutral expression, smoke-black and muted-plum flexible recon armor, compact optical data collar, concealed sensor modules, restrained violet indicators, and low-key cool lighting with a narrow violet rim.
```

### `syndicate_tech_aya` → `specialist-aya-senn.png`

```text
Aya Senn, adult Syndicate technical specialist, a female intrusion engineer responsible for covert sensors, data recovery, and silent systems access. Precise focused gaze, straight dark hair cut at the jaw, smoke-black and muted-plum technical suit, layered flexible armor, compact data collar, fine diagnostic modules, restrained violet lights, and cool low-key laboratory lighting.
```

### `syndicate_medic_lev` → `specialist-lev-iora.png`

```text
Lev Iora, adult Syndicate medical specialist, a male covert field clinician trained for toxin analysis, recovery, and discreet extraction. Thoughtful controlled expression, wavy dark hair and close beard, smoke-black, muted-plum, and pale-gray sealed medical suit, flexible armor, bioscanner collar, compact specimen modules, restrained violet lights, and low-key cool clinical lighting. No cross symbol.
```

### `syndicate_support_kest` → `specialist-kest-morrow.png`

```text
Kest Morrow, adult Syndicate support specialist, a female covert-logistics coordinator responsible for stealth supply routes and extraction timing. Sharp mature features, silver-black undercut hair, assessing confident gaze, smoke-black and muted-plum flexible support armor, layered harness, encrypted logistics collar, compact route-control modules, restrained violet lights, and low-key command lighting.
```

## Runtime acceptance contract

The UI does not substitute a crest, silhouette, initials, or CSS portrait when an
authored file is absent. A portrait is admitted only when its ID is explicitly
approved under `commander-anime-flat-v1`, the local image decodes, its
dimensions are at least 512 × 640, and its aspect ratio is between 0.6 and 1.0.
Approval must include the declared solid palette and visual evidence that no
gradient, surface shading, AO, specular response, material microtexture, or
modeled/baked shadow survives at 48, 96, and 192 pixels. Missing or invalid art
leaves that person unavailable and explains the lock instead of exposing
placeholder art.
