/* The fixed reticle covers the globe's sub-camera point. With _depositPosition's
   parameterization that point faces the camera at lat = rotation.x and
   lon = -rotation.y. The previous nearestDeposit() crosswired the dimensions
   (lat vs rotation.y, lon vs rotation.x) and flipped the lon sign, so dragging
   a peak onto the reticle LOWERED the signal and no probe could ever lock.
   These tests execute the real class methods against synthetic euler states.
   THREE/WebGL are not imported: only the pure geometry methods are exercised
   through a fabricated instance, mirroring how the class stores deposits. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/systems/planetary_survey.js', import.meta.url), 'utf8');

function extract(pattern, name) {
  const match = source.match(pattern);
  assert.ok(match, `${name} must remain extractable from planetary_survey.js`);
  return match[0];
}

/* Extract _depositPosition and nearestDeposit verbatim from the class body. */
const depositPositionSource = extract(
  /  _depositPosition\(d, radius = 22\) \{[\s\S]*?\n  \}/,
  '_depositPosition'
);
const nearestDepositSource = extract(
  /  \/\* The sub-camera point of the globe[\s\S]*?  nearestDeposit\(\) \{[\s\S]*?\n  \}/,
  'nearestDeposit'
);

function makeInstance({ lat, lon, sensorRange = 1, deposits }) {
  /* Fields and methods must share one `this`, exactly like the real instance. */
  const scope = `(() => ({
  planetGroup: { rotation: { x: ${JSON.stringify(lat)}, y: ${JSON.stringify(lon)} } },
  deposits: ${JSON.stringify(deposits)},
  sensorRange: ${JSON.stringify(sensorRange)},
  ${depositPositionSource},
  ${nearestDepositSource}
}))()`;
  return vm.runInNewContext(scope, {});
}

const D2R = Math.PI / 180;

{
  /* A deposit authored at the reticle's facing point must report a lock-level
     signal — this is the exact case that stalled at 78% on device. */
  const face = { lat: 0.3 * D2R * 1, lon: 1.2 * D2R * 1 };
  const inst = makeInstance({
    lat: face.lat,            /* rotation.x faces lat */
    lon: -face.lon,           /* rotation.y = -lon faces lon */
    deposits: [{ id: 'peak', lat: face.lat, lon: face.lon, extracted: false }]
  });
  const best = inst.nearestDeposit();
  assert.ok(best, 'a deposit exists');
  assert.ok(best.signal > 99, `facing deposit must read ~100 signal, got ${best.signal}`);
}

{
  /* The old crosswired math: lat compared against rotation.y. A deposit on the
     anti-meridian of the facing point must NOT read as centered. */
  const inst = makeInstance({
    lat: 0,                   /* rotation.x = 0 faces the equator */
    lon: 0,                   /* rotation.y = 0 faces lon = 0 */
    deposits: [{ id: 'far', lat: 0, lon: Math.PI, extracted: false }]
  });
  const best = inst.nearestDeposit();
  assert.ok(best.signal < 30, `opposite-side deposit must read weak, got ${best.signal}`);
}

{
  /* Longitude wraps: a deposit just behind the seam is still near. */
  const inst = makeInstance({
    lat: 0,
    lon: -(359 * D2R),        /* rotation.y = -359deg faces lon = 359deg */
    deposits: [{ id: 'wrap', lat: 0, lon: (1 * D2R), extracted: false }]
  });
  const best = inst.nearestDeposit();
  assert.ok(best.signal > 94, `seam-adjacent deposit must read strong (2deg sep ~95.8), got ${best.signal}`);
}

{
  /* Extracted deposits never compete for the lock. */
  const inst = makeInstance({
    lat: 0, lon: 0,
    deposits: [{ id: 'gone', lat: 0, lon: 0, extracted: true }]
  });
  const best = inst.nearestDeposit();
  assert.equal(best, null, 'extracted deposits must be skipped');
}

/* _depositPosition and the reticle-facing convention must agree: the marker's
   local position, rotated by the group euler RX(lat)·RY(-lon), must land on
   the camera axis (+z), not the far side. */
{
  const lat = 0.3, lon = 1.2;
  const inst = makeInstance({
    lat, lon: -lon,
    deposits: [{ id: 'align', lat, lon, extracted: false }]
  });
  const p = inst._depositPosition({ lat, lon });
  /* three.js XYZ order: RY applies first, then RX. */
  const cy = Math.cos(-lon), sy = Math.sin(-lon);
  const rx = p.x * cy + p.z * sy, ry0 = p.y, rz = -p.x * sy + p.z * cy;
  const cx = Math.cos(lat), sx = Math.sin(lat);
  const wy = ry0 * cx - rz * sx, wz = ry0 * sx + rz * cx;
  assert.ok(wz > 20, `rotated marker must face the camera (z+), got z=${wz}`);
  assert.ok(Math.abs(rx) < 0.5 && Math.abs(wy) < 0.5, `rotated marker must be on the axis, got (${rx.toFixed(3)}, ${wy.toFixed(3)})`);
}

console.log('planetary-survey-aim.test.mjs PASS');
