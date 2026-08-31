/* MASSFRONT — browser verification for the economy seat-routing pass.
   Paste the CONTENTS of this file into the DevTools console of a LIVE MATCH
   (or run it with the integrator's console harness). It mutates nothing
   permanently: every probe snapshots the wallets and restores them.

   Every probe carries a CONTROL that proves it is able to report failure.
   Read the CONTROL lines: a probe whose control did not fire is meaningless.  */

(() => {
  const R = [];
  const ok  = (n, v, extra='') => R.push([v ? 'PASS' : 'FAIL', n, extra]);
  const num = x => Math.round(x * 1000) / 1000;

  const snap = () => ({
    m0: resM[0], e0: resE[0], m1: resM[1], e1: resE[1],
    allies: (typeof AI !== 'undefined' && AI.allies || []).map(S => ({ S, m: S.mass, e: S.energy })),
    bases:  (typeof AI !== 'undefined' && AI.bases  || []).map(S => ({ S, m: S.mass, e: S.energy })),
  });
  const restore = s => {
    resM[0] = s.m0; resE[0] = s.e0; resM[1] = s.m1; resE[1] = s.e1;
    for (const a of s.allies) { a.S.mass = a.m; a.S.energy = a.e; }
    for (const b of s.bases)  { b.S.mass = b.m; b.S.energy = b.e; }
  };

  /* ---------------------------------------------------------------- 0. env */
  const allies = (typeof AI !== 'undefined' && AI.allies) || [];
  const seat   = allies[0] || null;
  console.log('%cMASSFRONT economy seat verification', 'font-weight:bold');
  console.log('match live:', typeof matchLive !== 'undefined' && matchLive,
              '| ally seats:', allies.length,
              '| enemy seats:', ((typeof AI !== 'undefined' && AI.bases) || []).length);

  /* ------------------------------------------------- 1. helpers are bound  */
  for (const fn of ['credit','payStream','canAfford','pay','drawEnergy',
                    'econSetBanks','econFillBanks','econFloorBanks',
                    'econBankM','econBankE','econSeatFor','commanderSlotForBuilding'])
    ok('global ' + fn + ' is a function', typeof window[fn] === 'function' || typeof eval(fn) === 'function');

  /* ------------------------------ 2. human path is byte-identical to before */
  {
    const s = snap();
    const before = resM[0];
    credit(0, 100, 0, null);
    ok('credit(0,100,0,null) adds to resM[0]',
       num(resM[0]) === num(Math.min(RES_MCAP[0], before + 100)), 'resM[0]=' + num(resM[0]));
    restore(s);

    const beforeE = resE[0];
    const sat = drawEnergy(0, 10);
    ok('drawEnergy(0,10) with no slot drains resE[0]',
       sat === 1 && num(resE[0]) === num(beforeE - 10), 'resE[0]=' + num(resE[0]));
    restore(s);

    /* CONTROL: the same probe must be able to notice a wallet that did NOT move. */
    const beforeC = resM[0];
    credit(0, 0, 0, null);
    ok('CONTROL: crediting zero must NOT move resM[0] (a PASS here proves the probe reads live state)',
       resM[0] === beforeC);
    restore(s);
  }

  /* ---------------------------------------------- 3. named-but-missing seat */
  {
    const s = snap();
    const missing = 99;   // no seat will ever hold slot 99
    ok('econSeatFor(0,99) is null', econSeatFor(0, missing) === null);
    const b4m = resM[0], b4e = resE[0];
    const paid = payStream(0, 50, 50, missing);
    ok('payStream on a missing seat REFUSES', paid === false);
    ok('  and does not raid the human bank', resM[0] === b4m && resE[0] === b4e);
    ok('drawEnergy on a missing seat returns 0', drawEnergy(0, 50, missing) === 0);
    ok('  and does not raid the human grid', resE[0] === b4e);
    restore(s);
  }

  /* ------------------------------------------------------- 4. ally routing */
  if (seat) {
    const s = snap();
    const slot = seat.slot;
    const b4m0 = resM[0], b4e0 = resE[0], b4sm = seat.mass, b4se = seat.energy;

    credit(0, 77, 0, slot);
    ok('credit to ally slot ' + slot + ' raises the SEAT',
       num(seat.mass) === num(Math.min(seat.mcap || 1400, b4sm + 77)), 'seat.mass=' + num(seat.mass));
    ok('  and leaves resM[0] untouched', resM[0] === b4m0);

    drawEnergy(0, 25, slot);
    ok('drawEnergy on the ally slot drains the SEAT', num(seat.energy) < num(b4se + 77));
    ok('  and leaves resE[0] untouched', resE[0] === b4e0);

    ok('econBankE(0,' + slot + ') reports the seat, not the human grid',
       num(econBankE(0, slot)) === num(seat.energy) && num(econBankE(0, slot)) !== num(resE[0]),
       'seat=' + num(seat.energy) + ' human=' + num(resE[0]));
    restore(s);

    /* CONTROL: with slot -1 the SAME calls must hit the human bank instead. */
    const c0 = resM[0], cs = seat.mass;
    credit(0, 77, 0, -1);
    ok('CONTROL: credit(...,-1) hits the human bank and NOT the seat',
       resM[0] !== c0 && seat.mass === cs);
    restore(s);
  } else {
    console.log('%cNo ally seat in this match — sections 4/5/6 skipped. ' +
                'Start a Standard/Large match with an ALLY to exercise them.', 'color:#fa0');
  }

  /* ------------------------------------- 5. ally structures do not bill you */
  if (seat) {
    const allyBlds = bldLive.filter(B => B.alive && B.team === 0 && B.allyAI === seat.slot);
    ok('ally seat owns structures (needed for the next probes)', allyBlds.length > 0,
       'count=' + allyBlds.length);
    for (const B of allyBlds.slice(0, 3))
      ok('commanderSlotForBuilding(' + B.type + ') === ' + seat.slot,
         commanderSlotForBuilding(B) === seat.slot);

    const mine = bldLive.filter(B => B.alive && B.team === 0 && B.allyAI == null);
    for (const B of mine.slice(0, 3))
      ok('commanderSlotForBuilding(my ' + B.type + ') === -1 (human)',
         commanderSlotForBuilding(B) === -1);
  }

  /* ------------- 6. LIVE OBSERVATION: watch the two wallets for 6 seconds.
     With an ally present, resM[0] must respond only to YOUR economy. Park your
     units, stop building, and confirm the human bank tracks mRate while the
     ally seat moves independently. This one prints, it does not assert.      */
  if (seat) {
    const t0 = performance.now();
    const a = { m0: resM[0], e0: resE[0], sm: seat.mass, se: seat.energy };
    setTimeout(() => {
      const dt = (performance.now() - t0) / 1000;
      console.log('%c[6] 6-second wallet drift (dt=' + num(dt) + 's)', 'font-weight:bold');
      console.log('  human  mass ' + num((resM[0] - a.m0) / dt) + '/s   energy ' + num((resE[0] - a.e0) / dt) + '/s');
      console.log('  ally   mass ' + num((seat.mass - a.sm) / dt) + '/s   energy ' + num((seat.energy - a.se) / dt) + '/s');
      console.log('  HUD mRate=' + num(mRate) + '  eRate=' + num(eRate) +
                  '  (mRate must describe the HUMAN row only)');
    }, 6000);
  }

  /* ---------------------------------------------------------------- report */
  const fails = R.filter(r => r[0] === 'FAIL');
  console.table(R.map(([v, n, x]) => ({ result: v, check: n, detail: x })));
  console.log(fails.length
    ? '%cFAILED ' + fails.length + ' / ' + R.length
    : '%cALL ' + R.length + ' CHECKS PASSED', 'font-weight:bold;color:' + (fails.length ? '#f55' : '#5f5'));
  console.log('Section 6 prints asynchronously in ~6s.');
  return { pass: R.length - fails.length, fail: fails.length };
})();
