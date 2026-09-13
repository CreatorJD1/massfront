# Gameplay mechanics review — 2026-08-16

Review of live match feel, input accuracy, and haptic/screen-shake feedback. Android only (iOS out of scope).

---

## 1. Game status summary

The RTS loop is functional: economy, production, combat, veterancy, research, victory/defeat all work. The current pain points are polish-layer issues, not broken core systems. Three areas stand out from live phone play: selecting the wrong unit or window, vibration not firing in the Android app, and screen shake not lining up with walking-mech footfalls.

---

## 2. Wrong unit / wrong window selection

### 2.1 What the code does today

Selection lives in src/ui/input.js. pickUnit returns the closest unit under the tap. Tap own unit to select; double-tap same type to select all on screen. Tap enemy for attack. Tap building for menu. Ground tap issues move order.

The code already has fixes for common mis-taps: groundDoubleTap ignores friendly silhouettes between taps, TAP_JITTER_PX is 28px, and HOLD_MS is 520ms for intel cards.

### 2.2 Why it still feels wrong on phone

| Problem | Cause | Severity |
|---|---|---|
| Pick disc too big at command zoom | pickUnit likely uses a fixed world radius that covers multiple units at tactical zoom | High |
| Tapping ground between units selects a unit | Same large radius; empty ground inside the disc becomes a select | High |
| HUD windows steal taps | Build menu / selInfo / notices overlap the battlefield and do not always stop propagation | Medium |
| Command dock buttons are tight | 44–48px targets sit at the screen edge | Medium |
| Box select is hard to start | One-finger drag is camera pan by default | Medium |

### 2.3 Recommended fixes

1. Scale pick radius by zoom. At command zoom use a smaller world radius; at tactical zoom keep it generous.
2. Require the tap to be inside the unit's screen silhouette, not just within a disc.
3. Add a short pointer-capture guard on HUD overlays so battlefield taps do not leak through open menus.
4. Increase spacing or add hit-group padding on the bottom command dock.
5. Consider a two-finger box-select gesture or a dedicated box-select button.

---

## 3. Android vibration does not work

### 3.1 Code path

`src/ui/hud.js` defines `buzz(ms)` which calls `navigator.vibrate(ms)` if `META.settings.haptics !== false`. `src/rumble.js` wraps this in `rumbleHaptic(ms, pattern)` with distance scaling and throttling.

`android/app/src/main/AndroidManifest.xml` already declares `android.permission.VIBRATE`.

### 3.2 Why it still fails

| Reason | Evidence | Fix |
|---|---|---|
| Capacitor WebView may block navigator.vibrate even with permission | Comment in AndroidManifest.xml warns about this | Add a Capacitor plugin bridge or use the Haptics plugin |
| No amplitude control on older WebView | navigator.vibrate ignores amplitude | Acceptable; use pattern timing instead |
| Haptics setting may be defaulting off | META.settings.haptics checked before vibrate | Verify default is true and setting persists |
| Event may not be user-initiated | Some WebViews require gesture context | Ensure buzz is called from pointerdown/click handlers |

### 3.3 Recommended fix

Add a thin Android-native bridge or use `@capacitor/haptics` as a fallback when `navigator.vibrate` is a no-op. Keep `buzz()` as the single API; detect Capacitor and route to `Haptics.impact()` or `Haptics.vibrate()`. No changes to call sites.

Also verify `META.settings.haptics` defaults to `true` on first install and that the toggle in settings actually writes the value.

---

## 4. Screen shake does not match mech footsteps

### 4.1 Code path

`src/rumble.js` `rumbleUnitMove(i,T,travel,prevWalk)` handles walker feedback.

- For leg units it detects a foot plant when `Math.sin(uwalk[i])` crosses from positive to negative.
- `uwalk[i]` is advanced in `src/game/sim.js` by `travel * (utype===4 ? 0.19 : 0.16)`.
- Visual leg animation in `src/ui/render3d.js` uses the same `uwalk[i]` value.

### 4.2 Why it feels off

| Issue | Cause | Fix |
|---|---|---|
| Only one foot plant per sine cycle | Code triggers only on positive-to-negative zero crossing; a walker has two feet | Trigger on both zero crossings |
| Cadence is speed-scaled by a fixed constant | 0.16 * travel does not map to the visual leg length | Tune the constant per chassis size |
| Shake fires when the foot is in the air | Sine crossing may not align with the visual contact frame | Use the vertex bob phase or an explicit foot-contact flag |

### 4.3 Recommended fix

1. Detect foot plants on both sine zero crossings, not just one direction.
2. Add a per-chassis step frequency constant so Goliath, Basilisk, Harbinger, and Commander each have a cadence that matches their visual stride.
3. Align the shake impulse with the visual downward bob, not the raw sine crossing. The model vertex already bobs with `abs(sin(uwalk))`; the shake should fire at the bob minimum.
4. Gate the shake by `umov[i]` and `travel` so idle or sliding walkers do not rumble.

---

## 5. Priority and next steps

| Issue | Effort | Impact | Order |
|---|---|---|---|
| Scale pick radius by zoom | Small | High | 1 |
| Add Capacitor Haptics fallback for Android | Small | High | 1 |
| Fix walker foot-plant detection | Small | Medium | 2 |
| HUD tap isolation / dock spacing | Medium | Medium | 2 |
| Box-select gesture | Medium | Medium | 3 |

Both selection accuracy and vibration are one-day fixes that would immediately improve phone feel. The walker shake tuning is a half-day tuning pass once the cadence constants are exposed.
