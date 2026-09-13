/* ============================================================================
   BROWSER VERIFICATION — simulation & combat correctness fixes
   ----------------------------------------------------------------------------
   Paste into the DevTools console of a RUNNING match (the integrator owns the
   browser; this file is source, not something to launch).

   Covers three fixes:
     1  Praetor cluster battery fired on an unversioned target handle
     2  groundTerrainRecovery was defined but never called
     3  five defence structures acquired through forUnitsIn without
        intelCanTarget, so they ignored GHOST cloak and the whole intel.js
        detection system

   HOUSE RULE: every probe carries a CONTROL that proves it can fail. A probe
   that cannot report a failure is measuring nothing.
   ========================================================================== */

(function verifySimCombatFixes() {
  const out = [];
  const rec = (name, ok, detail) => {
    out.push({ probe: name, result: ok ? 'PASS' : 'FAIL', detail });
    console.log((ok ? '%cPASS' : '%cFAIL') + ' %s — %s',
      ok ? 'color:#5c5' : 'color:#f55', name, detail);
    return ok;
  };

  /* ---------- 1. PRAETOR GENERATION GUARD --------------------------------- */
  // Static: the raw `ualive[ht]` gate must be gone, replaced by foeTgt.
  {
    const src = unitTick.toString();
    const raw = /ht>=0\s*&&\s*ualive\[ht\]/.test(src);
    const guarded = /ht>=0\s*&&\s*foeTgt\(i,ht,utgtg\[i\]\)/.test(src);
    rec('praetor: raw ualive[ht] gate removed', !raw, 'raw gate present=' + raw);
    rec('praetor: foeTgt generation guard present', guarded, 'guarded=' + guarded);
  }
  // Live: foeTgt must reject a recycled slot. CONTROL proves it still accepts
  // a genuine live enemy, so it is not simply always-false.
  {
    let self = -1, foe = -1;
    for (let i = 0; i < unitHigh; i++) {
      if (!ualive[i]) continue;
      if (self < 0 && uteam[i] === 0) self = i;
      else if (foe < 0 && uteam[i] === 1) foe = i;
      if (self >= 0 && foe >= 0) break;
    }
    if (self < 0 || foe < 0) {
      rec('praetor live check', false, 'SKIPPED — need one live unit on team 0 and one on team 1');
    } else {
      const good = !!foeTgt(self, foe, ugen[foe]);
      const stale = !!foeTgt(self, foe, ugen[foe] + 1);   // simulate a recycled slot
      rec('praetor: CONTROL foeTgt accepts a real live enemy', good, 'foeTgt(correct gen)=' + good);
      rec('praetor: foeTgt rejects a stale generation', !stale, 'foeTgt(stale gen)=' + stale);
    }
  }

  /* ---------- 2. GROUND TERRAIN RECOVERY IS WIRED IN ---------------------- */
  {
    const wired = /groundTerrainRecovery\(i,travel,dt\)/.test(unitTick.toString());
    rec('recovery: unitTick calls groundTerrainRecovery', wired,
      'call present in unitTick=' + wired);
    rec('recovery: counter exists', typeof groundRescues === 'number',
      'groundRescues=' + (typeof groundRescues === 'number' ? groundRescues : 'undefined'));
  }
  // INVARIANT, not noisy state: rescues must stay near zero. A large or fast
  // rising count means the slope gate itself is wrong, which is the thing the
  // counter was added to surface.
  {
    const before = groundRescues;
    const t0 = performance.now();
    setTimeout(() => {
      const dt = (performance.now() - t0) / 1000;
      const rate = (groundRescues - before) / Math.max(0.001, dt);
      const sane = rate < 5;
      rec('recovery: rescue RATE stays near zero', sane,
        (groundRescues - before) + ' rescues in ' + dt.toFixed(1) + 's = ' +
        rate.toFixed(2) + '/s (want < 5/s; a high rate indicts the slope gate)');
      console.log('%c--- deferred probe complete ---', 'color:#89f');
    }, 10000);
    console.log('%crecovery rate probe running for 10s…', 'color:#89f');
  }
  // Behavioural CONTROL: a unit standing on walkable ground must never be
  // re-sited, no matter how many times the backstop is invoked.
  {
    let g = -1;
    for (let i = 0; i < unitHigh; i++) {
      const T = TYPES[utype[i]];
      if (ualive[i] && T && !T.air && !T.naval && i !== heroIdx && isWalkable(ux[i], uy[i])) { g = i; break; }
    }
    if (g < 0) rec('recovery control', false, 'SKIPPED — no ground unit on walkable ground');
    else {
      const x0 = ux[g], y0 = uy[g], r0 = groundRescues;
      for (let k = 0; k < 40; k++) groundTerrainRecovery(g, 0, 0.5);
      const moved = ux[g] !== x0 || uy[g] !== y0;
      rec('recovery: CONTROL walkable unit never re-sited', !moved && groundRescues === r0,
        'moved=' + moved + ' rescueDelta=' + (groundRescues - r0));
    }
  }

  /* ---------- 3. DEFENCE STRUCTURES RESPECT GHOST / DETECTION ------------- */
  {
    const src = bldTick.toString();
    // Every target-SELECTING forUnitsIn scan must consult intelCanTarget.
    const lines = src.split('\n');
    const bypass = [];
    for (let k = 0; k < lines.length; k++) {
      if (!/forUnitsIn\(/.test(lines[k])) continue;
      const blob = lines.slice(k, k + 4).join(' ');
      if (!/uteam\[j\]/.test(blob)) continue;
      if (/intelCanTarget/.test(blob)) continue;
      if (!/\.push\(j\)|=\s*j\s*[;,}]/.test(blob)) continue;  // splash/heal select nothing
      bypass.push(lines[k].trim().slice(0, 70));
    }
    rec('defences: no target-selecting scan bypasses intelCanTarget',
      bypass.length === 0, 'bypassing scans=' + JSON.stringify(bypass));

    // CONTROL: the detector must be able to see a bypass at all. Feed it the
    // pre-fix shape and confirm it reports one.
    const fake = "        forUnitsIn(B.x,B.y,rng,j=>{\n" +
      "          if(uteam[j]!==B.team&&!TYPES[utype[j]].air) tgts.push(j);\n        });\n";
    const fl = fake.split('\n');
    let seen = 0;
    for (let k = 0; k < fl.length; k++) {
      if (!/forUnitsIn\(/.test(fl[k])) continue;
      const blob = fl.slice(k, k + 4).join(' ');
      if (/uteam\[j\]/.test(blob) && !/intelCanTarget/.test(blob) && /\.push\(j\)/.test(blob)) seen++;
    }
    rec('defences: CONTROL detector can see a bypass', seen === 1, 'detected in synthetic sample=' + seen);
  }
  // Live semantics: intelCanTarget must be the intel.js version (cloak-aware),
  // not sim.js's fallback. CONTROL: an ordinary enemy is still targetable.
  {
    const isIntel = /intelDetectedAt/.test(intelCanTarget.toString());
    rec('defences: intelCanTarget is the intel.js detection-aware build', isIntel,
      'intel.js binding active=' + isIntel + ' (sim.js fallback would ignore detectors)');

    let plain = -1;
    for (let i = 0; i < unitHigh; i++) if (ualive[i] && uteam[i] === 1 && umode[i] !== 4) { plain = i; break; }
    if (plain < 0) rec('defences control', false, 'SKIPPED — no ordinary team-1 unit alive');
    else rec('defences: CONTROL ordinary enemy still targetable', !!intelCanTarget(plain, 0),
      'intelCanTarget(plainEnemy, team0)=' + intelCanTarget(plain, 0));
  }
  /* MANUAL, and the one that actually proves the player-facing fix:
       1. build a Rail Turret / Minelaser / Missile Bastion / Hellstorm
       2. drive a Vulture or Kestrel into its range and switch to GHOST (mode 4)
       3. with NO scout / uplink / techlab covering that ground the structure
          must hold fire; bring a detector up and it must open fire.
     Before this fix the structure fired regardless of detection. */
  console.log('%cMANUAL: GHOST a Vulture inside a Rail Turret ring with no detector — it must hold fire.',
    'color:#fc0');

  console.table(out);
  return out;
})();
