;
;
/* ============================================================================
   OCEAN CASCADE DRIVER
   ----------------------------------------------------------------------------
   Owns the GPU resources from ocean-fft.js and turns a sea description into
   them. Heights and periods come from the Douglas ladder in src/sea.js, so the
   waves on screen and the sea state the simulation reasons about can never
   name different seas. Fetch is solved from the Douglas period rather than
   guessed, which pins the JONSWAP peak to that period for every wind.

   Cascades split the spectrum by wavenumber, not by overlap: each one owns the
   band from six of its own fundamentals up to where the next one starts, so
   energy is counted once and no tile carries waves its grid cannot resolve.
   ============================================================================ */
const MF_OCEAN_DOUGLAS = [[0.05, 2.0], [0.08, 2.5], [0.30, 3.5], [0.90, 5.0], [1.80, 6.5],
  [3.20, 8.0], [5.00, 9.5], [7.50, 11.0], [11.0, 13.0]];

function mfOceanDouglas(level) {
  const table = (typeof MF_SEA_SCALE !== 'undefined' && MF_SEA_SCALE.length === 9)
    ? MF_SEA_SCALE.map(e => [e.h, e.t]) : MF_OCEAN_DOUGLAS;
  const l = Math.max(0, Math.min(8, Number(level) || 0));
  const i = Math.min(7, Math.floor(l)), f = l - i;
  const a = table[i], b = table[i + 1];
  /* Level 0 is glassy in the simulation; the eye still needs capillaries. */
  return { h: Math.max(0.05, a[0] + (b[0] - a[0]) * f), t: Math.max(2.0, a[1] + (b[1] - a[1]) * f) };
}

function mfOceanCreate(gl, options) {
  const opts = options || {};
  if (!gl.getExtension('EXT_color_buffer_float')) return { ok: false, error: 'EXT_color_buffer_float unavailable' };
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const N = opts.N || 256;
  const defs = opts.cascades || [
    { L: 1024, rot: 0, lambda: 1.0 },
    { L: 211, rot: 23, lambda: 1.0 },
    { L: 37, rot: -41, lambda: 0.75 }
  ];
  const ocean = {
    ok: true, gl, N, passUnit: opts.passUnit == null ? 8 : opts.passUnit,
    cascades: [], sea: null, foamRead: 0, frames: 0,
    foam: { tau: 3, bias: 0.55, gain: 2.5 }
  };
  ocean.prog = {
    evolve: mfOceanProgram(gl, MF_OCEAN_VS, MF_OCEAN_EVOLVE_FS, 'evolve'),
    fft: mfOceanProgram(gl, MF_OCEAN_VS, MF_OCEAN_FFT_FS, 'fft'),
    assemble: mfOceanProgram(gl, MF_OCEAN_VS, MF_OCEAN_ASSEMBLE_FS, 'assemble'),
    foam: mfOceanProgram(gl, MF_OCEAN_VS, MF_OCEAN_FOAM_FS, 'foam')
  };
  ocean.vao = gl.createVertexArray();
  gl.bindVertexArray(ocean.vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const layers = defs.length;
  /* Displacement ping-pongs so the previous step survives: the foam
     simulation takes surface velocity from the difference. */
  ocean.dispArrs = [mfOceanTexArray(gl, N, layers, aniso), mfOceanTexArray(gl, N, layers, aniso)];
  ocean.dispRead = 0;
  ocean.dispArr = ocean.dispArrs[0];
  ocean.dispPrevArr = ocean.dispArrs[1];
  ocean.derivArr = mfOceanTexArray(gl, N, layers, aniso);
  ocean.foamArr = [mfOceanTexArray(gl, N, layers, aniso), mfOceanTexArray(gl, N, layers, aniso)];

  defs.forEach((d, c) => {
    const rot = d.rot * Math.PI / 180;
    const kLow = c === 0 ? 0 : 6 * 2 * Math.PI / d.L;
    const C = {
      L: d.L, rot, lambda: d.lambda, kLow,
      spec: mfOceanSpectrumCreate(N, d.L, 0x51ed270b + c * 7919),
      h0: mfOceanTex2D(gl, N, gl.RGBA32F, gl.RGBA, gl.FLOAT, null),
      A: [], B: []
    };
    for (let k = 0; k < 4; k += 1) {
      C.A.push(mfOceanTex2D(gl, N, gl.RGBA32F, gl.RGBA, gl.FLOAT, null));
      C.B.push(mfOceanTex2D(gl, N, gl.RGBA32F, gl.RGBA, gl.FLOAT, null));
    }
    C.fbA = mfOceanFbo(gl, C.A.map(tex => ({ tex })));
    C.fbB = mfOceanFbo(gl, C.B.map(tex => ({ tex })));
    C.fbOut = ocean.dispArrs.map(tex => mfOceanFbo(gl, [{ tex, layer: c }, { tex: ocean.derivArr, layer: c }]));
    C.fbFoam = [mfOceanFbo(gl, [{ tex: ocean.foamArr[0], layer: c }]), mfOceanFbo(gl, [{ tex: ocean.foamArr[1], layer: c }])];
    ocean.cascades.push(C);
  });
  ocean.cascades.forEach((C, c) => {
    const next = ocean.cascades[c + 1];
    C.kHigh = next ? next.kLow : Math.min(Math.PI * N / C.L * 0.85, 14);
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return ocean;
}

/* sea: level (0..8, continuous), windDir (rad), swellMix (0..1), swellAngle
   (rad from wind), drama (presentation gain on height), chop (choppiness). */
function mfOceanSetSea(ocean, sea) {
  if (!ocean || !ocean.ok) return;
  const gl = ocean.gl, N = ocean.N;
  const s = Object.assign({ level: 5, windDir: 0.6, swellMix: 0.2, swellAngle: 0.7, drama: 1 }, sea || {});
  const storm = Math.max(0, Math.min(1, (s.level - 2) / 6));
  /* Presentation steepness. Measured on the GPU field (probe-field.mjs), a
     physically normalised HIGH sea has slope rms ~0.13 and a Jacobian that
     never drops below ~0.7: honest, and flat from 60-86 degrees. Choppiness
     and a short-wave gain are what make crests pinch and fold on screen;
     heights stay on the Douglas ladder and the simulation never sees these. */
  const chop = s.chop == null ? 1.0 + 0.7 * storm : s.chop;
  const chopGain = s.chopGain == null ? 1.0 + 1.1 * storm : s.chopGain;
  const nSigma = s.foamSigma == null ? 2.5 - 1.4 * storm : s.foamSigma;
  const dg = mfOceanDouglas(s.level);
  const U = mfOceanWindForLevel(Math.max(1, s.level));
  /* The Douglas period is the SWELL. The wind sea riding it peaks at 0.55 of
     that period (0.30 of the wavelength): ~60 m crests in a HIGH sea, the
     crest spacing measured off the Stormbreak storm concept against its
     platform. Fetch is solved for that peak. */
  const wp = 2 * Math.PI / (dg.t * 0.55);
  const fetch = MF_OCEAN_G * MF_OCEAN_G / (U * Math.pow(wp / 22, 3));
  let variance = 0;
  for (const C of ocean.cascades) {
    mfOceanSpectrumFill(C.spec, {
      windSpeed: U, windDir: s.windDir, fetch, gamma: 3.3,
      swellMix: s.swellMix, swellAngle: s.swellAngle, swellPeakRatio: 0.62, swellSpread: 24,
      /* spreadMin 4: short waves stay wind-aligned, so troughs carry streaks
         rather than the isotropic blotches cycle 17 showed. */
      spreadMin: 4, spreadGain: 2.2, kLow: C.kLow, kHigh: C.kHigh, rotation: C.rot
    });
    /* Realised, not expected, energy: a cascade holds few modes near the peak,
       so one random draw can miss the expected variance by 15% (measured).
       Time-mean variance of h is 2 sum|h0|^2; of slope, 2 sum k^2 |h0|^2. */
    const dk = 2 * Math.PI / C.L, h0 = C.spec.h0;
    let e0 = 0, e2 = 0;
    for (let y = 0; y < N; y += 1) {
      const kz = (y < N / 2 ? y : y - N) * dk;
      for (let x = 0; x < N; x += 1) {
        const kx = (x < N / 2 ? x : x - N) * dk, i = (y * N + x) * 4;
        const a = h0[i] * h0[i] + h0[i + 1] * h0[i + 1];
        e0 += a; e2 += a * (kx * kx + kz * kz);
      }
    }
    C.e0 = 2 * e0; C.e2 = 2 * e2;
    /* Cycle 1 put the gain on every short cascade and the 6-35 m band turned
       the sea into knobbly cells. Steepness belongs to the crest-scale waves
       (cascade 0 holds the ~70 m wind-sea peak), so cascade 0 takes the big
       choppiness, cascade 1 a little amplitude, and cascade 2 stays honest. */
    const idx = ocean.cascades.indexOf(C);
    /* Cycle 2: x3.1 on cascade 0 folded the whole field into lumps. Pinching
       is read through shading at this camera, so geometry stays moderate. */
    C.ampGain = 1;
    C.chopNow = C.lambda * (idx === 0 ? 1 + (chop - 1) * 2.0 : idx === 1 ? 1 + (chop - 1) * 0.5 : 1);
    variance += C.e0 * C.ampGain * C.ampGain;
  }
  const gain = variance > 0 ? (dg.h * s.drama / 4) / Math.sqrt(variance) : 0;
  const up = new Float32Array(N * N * 4);
  let sigmaTotal2 = 0;
  for (const C of ocean.cascades) {
    const g = gain * C.ampGain;
    /* Kept so the CPU mirror (ocean-mirror.js) scales modes exactly as uploaded. */
    C.gainApplied = g;
    for (let i = 0; i < up.length; i += 1) up[i] = C.spec.h0[i] * g;
    gl.bindTexture(gl.TEXTURE_2D, C.h0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGBA, gl.FLOAT, up);
    /* Jxx + Jzz = -lambda k h~, so the Jacobian's spread is lambda * slope rms. */
    C.sigmaJ = C.chopNow * Math.sqrt(C.e2) * g;
    C.foamBias = 1 - nSigma * C.sigmaJ;
    sigmaTotal2 += C.sigmaJ * C.sigmaJ;
  }
  ocean.foam.tau = 1.2 + 1.3 * storm;
  /* Whitecap threshold in units of the crest-scale Jacobian spread, and a web
     floor so a storm's troughs carry faint filaments everywhere. */
  /* A MODERATE sea has scattered whitecaps, not one per crest: cycle 5's
     2.2 - 1.4*storm put partial caps on ~13% of a level-4 sea. */
  /* +0.35 offsets the wave-group modulation, which adds more breaking where it
     lowers the threshold than it removes where it raises it (cycle 18 measured
     8.5% bright foam against the concept's 3.7%). */
  ocean.foam.capSigma = 3.35 - 2.2 * storm;
  /* No floor: the concept's troughs are dark water, not a web (measured). */
  ocean.foam.floor = 0;
  ocean.foam.blur = 0.12 + 0.1 * storm;
  ocean.foam.groupAmp = 1.2;
  ocean.foam.sigma = Math.sqrt(sigmaTotal2);
  ocean.foam.bias = 1 - nSigma * ocean.foam.sigma;
  ocean.sea = Object.assign({}, s, { hs: dg.h * s.drama, period: dg.t, wind: U, fetch, chop, chopGain, nSigma, storm });
  return ocean.sea;
}

function mfOceanUpdate(ocean, time, dt) {
  if (!ocean || !ocean.ok || !ocean.sea) return;
  const gl = ocean.gl, N = ocean.N, U = ocean.passUnit, P = ocean.prog;
  ocean.time = time;
  const saved = {
    fb: gl.getParameter(gl.FRAMEBUFFER_BINDING), vp: gl.getParameter(gl.VIEWPORT),
    prog: gl.getParameter(gl.CURRENT_PROGRAM), active: gl.getParameter(gl.ACTIVE_TEXTURE),
    blend: gl.isEnabled(gl.BLEND), depth: gl.isEnabled(gl.DEPTH_TEST), cull: gl.isEnabled(gl.CULL_FACE)
  };
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(ocean.vao);
  gl.viewport(0, 0, N, N);
  const read = ocean.foamRead, write = 1 - read;
  const dispWrite = 1 - ocean.dispRead;
  const decay = Math.exp(-Math.max(0, Math.min(0.25, dt)) / ocean.foam.tau);
  const bind4 = (texs, prog) => {
    for (let k = 0; k < 4; k += 1) {
      gl.activeTexture(gl.TEXTURE0 + U + k);
      gl.bindTexture(gl.TEXTURE_2D, texs[k]);
      gl.uniform1i(prog.u['uI' + k], U + k);
    }
  };
  ocean.cascades.forEach((C, c) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, C.fbA);
    gl.useProgram(P.evolve.p);
    gl.activeTexture(gl.TEXTURE0 + U);
    gl.bindTexture(gl.TEXTURE_2D, C.h0);
    gl.uniform1i(P.evolve.u.uH0, U);
    gl.uniform1i(P.evolve.u.uN, N);
    gl.uniform1f(P.evolve.u.uL, C.L);
    gl.uniform1f(P.evolve.u.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    let src = C.A, dst = C.B, dstFb = C.fbB;
    gl.useProgram(P.fft.p);
    gl.uniform1i(P.fft.u.uN, N);
    for (let axis = 0; axis < 2; axis += 1) {
      for (let size = 2; size <= N; size *= 2) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dstFb);
        bind4(src, P.fft);
        gl.uniform1i(P.fft.u.uS, size);
        gl.uniform1i(P.fft.u.uAxis, axis);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const t = src; src = dst; dst = t;
        dstFb = dst === C.A ? C.fbA : C.fbB;
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, C.fbOut[dispWrite]);
    gl.useProgram(P.assemble.p);
    bind4(src, P.assemble);
    gl.uniform1f(P.assemble.u.uLambda, C.chopNow || C.lambda);
    gl.uniform2f(P.assemble.u.uRot, Math.cos(C.rot), Math.sin(C.rot));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  });

  /* Foam reads the freshly assembled level 0 of every layer, so it runs after
     all cascades rather than inside the loop above. */
  gl.useProgram(P.foam.p);
  const arrays = [[ocean.dispArrs[dispWrite], 'uDisp'], [ocean.derivArr, 'uDeriv'], [ocean.foamArr[read], 'uPrev']];
  arrays.forEach(([tex, name], k) => {
    gl.activeTexture(gl.TEXTURE0 + U + 4 + k);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.uniform1i(P.foam.u[name], U + 4 + k);
  });
  gl.uniform1f(P.foam.u.uDecay, decay);
  ocean.cascades.forEach((C, c) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, C.fbFoam[write]);
    gl.uniform1i(P.foam.u.uLayer, c);
    /* Each cascade triggers at its own Jacobian spread: no single cascade of a
       summed sea ever reaches a threshold set for the total. */
    gl.uniform1f(P.foam.u.uBias, C.foamBias);
    gl.uniform1f(P.foam.u.uGain, 1 / Math.max(0.02, 0.8 * C.sigmaJ));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  });

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  for (const tex of [ocean.dispArrs[dispWrite], ocean.derivArr, ocean.foamArr[write]]) {
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  }
  ocean.foamRead = write;
  ocean.dispPrevArr = ocean.dispArrs[ocean.dispRead];
  ocean.dispRead = dispWrite;
  ocean.dispArr = ocean.dispArrs[dispWrite];
  ocean.frames += 1;

  gl.bindVertexArray(null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, saved.fb);
  gl.viewport(saved.vp[0], saved.vp[1], saved.vp[2], saved.vp[3]);
  gl.useProgram(saved.prog);
  gl.activeTexture(saved.active);
  if (saved.blend) gl.enable(gl.BLEND);
  if (saved.depth) gl.enable(gl.DEPTH_TEST);
  if (saved.cull) gl.enable(gl.CULL_FACE);
}

function mfOceanFoamTex(ocean) { return ocean.foamArr[ocean.foamRead]; }

/* Wave groups travel at the deep-water group velocity, half the phase speed
   of the wind sea's peak (0.55 of the Douglas period, see mfOceanSetSea). */
function mfOceanGroupDrift(ocean) {
  if (!ocean || !ocean.sea) return [0, 0];
  const cg = MF_OCEAN_G * ocean.sea.period * 0.55 / (4 * Math.PI);
  const t = ocean.time || 0, wd = ocean.sea.windDir;
  return [Math.cos(wd) * cg * t, Math.sin(wd) * cg * t];
}
