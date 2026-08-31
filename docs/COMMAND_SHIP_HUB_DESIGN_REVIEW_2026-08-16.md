# Command Ship Meta Layer — Spaceship Interior & UI Specification (2026-08-16)

This document formalizes the **Command Dreadnought Interior Deck Architecture** and UI layout for MASSFRONT, translating the user's exact concept screenshot into technical specs and visual guidelines.

---

## 1. Spaceship Interior Base Building (The Dreadnought Deck)

Rather than an external ground surface base, the Command Base represents the **internal decks, bridge compartments, and module bays of the NCX-221 Command Dreadnought**:

### 1.1 Internal Dreadnought Bays & Compartments
- **Command Core (Level 3):** The central Captain's Bridge and main tactical holo-map deck.
- **Power Plant (Level 3):** Primary plasma reactor core powering internal ship systems and shields.
- **Barracks (Level 2):** Security quarters and marine deployment armory.
- **Vehicle Factory (Level 2):** Internal mechanical fabrication bay and hangar deck.
- **Supply Depot (Level 2):** Main cargo hold and mass storage vaults.
- **Resource Extractor (Level 3):** Deep-space refinery bay processing raw asteroid materials.
- **Defense Tower (Level 2):** Point-defense control station and automated interceptor console.
- **Research Lab (Level 2):** GHC Xenology & Tech Matrix analysis laboratory.

### 1.2 Interior Visual Language
- **Structural Corridors:** Reinforced metallic bulkheads, internal deck plating, and steel catwalks.
- **Energy Conduits:** Glowing plasma lines radiating from the central Reactor Core to all outer ship bays.
- **Perimeter Defense Consoles:** Outer nodes monitor internal deck integrity and defensive turrets mounted along the outer hull.

---

## 2. 1:1 Concept UI Layout Breakdown (Image Reference Match)

| UI Element | Visual Specification | Content & Interactive Target |
|---|---|---|
| **Top Profile Bar** | Avatar frame + level `6` pill badge | Commander Name `ELARA KAI`, Guild `IRON VEIL`, Rank Progress `43% TO MAJOR`. |
| **Top Action Icons** | 3 dark square buttons | Mail (with red notification dot), Group/Social, System Hamburger Menu. |
| **Resource Ledger** | 5 inline resource items | Mass (`125.7K +340/m`), Energy (`98.5K +280/m`), Data (`67.3K +200/m`), Cores (`3,250`), Gold Cores (`1,250 +`). |
| **Mode Carousel** | 5 cards with high-res sci-fi artwork | `STANDARD` (vs AI, cyan border), `CAMPAIGN` (Story Missions, gold border), `MMO WARFRONT` (Persistent World, purple `LIVE` badge), `CO-OP` (vs Adaptive AI, green border), `EVENTS` (Limited Time). |
| **Perimeter Overview** | Isometric Spaceship Interior Deck | Central `COMMAND CORE LEVEL 3`, glowing energy conduits, 8 node indicators (`NORTH 100%` .. `SOUTHWEST UNDER ATTACK`). |
| **Floating Alert Card** | Red glowing banner (top left) | `⚠ UNDER ATTACK · SOUTHWEST NODE · WAVE 3/5 · 00:00:28` with `VIEW ALERTS >` button. |
| **Quick Actions Grid** | 5 neon square tile buttons | `BUILD` (blue), `RESEARCH` (purple), `CRAFT` (gold), `UPGRADE` (green), `INVENTORY` (cyan). |
| **MMO Warfront Banner** | Wide card with orbital fleet art | `MMO WARFRONT · PERSISTENT WORLD · MASSIVE BATTLES` + `ENTER WORLD >>` CTA button. |
| **Bottom Navigation Bar** | 5 persistent tabs | `COMMAND` (active gold badge), `FACTION`, `CONTRACTS`, `INTEL`, `STORE`. |

---

## 3. Interactive Mockup Location

The interactive mockup is located at [`docs/command-ship-hub-mockup.html`](file:///c:/Users/Jason/Documents/Codex/2026-08-01/massfront-rts-mobile-game-for-apple/docs/command-ship-hub-mockup.html).

It provides a 1:1 pixel-perfect implementation of the concept UI, rendering the central perimeter area as an isometric spaceship interior deck with internal module bays and glowing reactor conduits.
