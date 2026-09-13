import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  fitUgaManagementProfile,
  UGA_MANAGEMENT_PROFILE_CAMERA
} from '../modules/space_exploration/src/core/uga_management_profile_camera.js';

const bounds = {
  min: { x: -30, y: -4.5, z: -1 },
  max: { x: 30, y: 4.5, z: 11 }
};
const corners = [];
for (const x of [bounds.min.x, bounds.max.x]) {
  for (const y of [bounds.min.y, bounds.max.y]) {
    for (const z of [bounds.min.z, bounds.max.z]) corners.push({ x, y, z });
  }
}

assert.deepEqual(UGA_MANAGEMENT_PROFILE_CAMERA.viewAxis, [0, 1, 0]);
assert.deepEqual(UGA_MANAGEMENT_PROFILE_CAMERA.upAxis, [0, 0, 1]);
assert.equal(UGA_MANAGEMENT_PROFILE_CAMERA.cameraSide, 'negative-y');

for (const aspect of [0.45, 1, 1.78]) {
  const framing = fitUgaManagementProfile(bounds, 42, aspect);
  assert.equal(framing.position[0], framing.target[0], `aspect ${aspect}: no fore/aft angle`);
  assert.equal(framing.position[2], framing.target[2], `aspect ${aspect}: no elevation angle`);
  assert.ok(framing.position[1] < bounds.min.y, `aspect ${aspect}: camera stays outside the open -Y side`);
  assert.deepEqual(framing.up, [0, 0, 1]);

  const tangent = Math.tan(42 * Math.PI / 360);
  for (const corner of corners) {
    const depth = corner.y - framing.position[1];
    const projectedX = (corner.x - framing.target[0]) / (depth * tangent * framing.aspect);
    const projectedY = (corner.z - framing.target[2]) / (depth * tangent);
    assert.ok(Math.abs(projectedX) <= 1, `aspect ${aspect}: full ship width must remain framed`);
    assert.ok(Math.abs(projectedY) <= 1, `aspect ${aspect}: full ship height must remain framed`);
  }
}

const sceneSource = await readFile(new URL('../modules/space_exploration/src/core/uga_command_scene.js', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../modules/space_exploration/src/ui/uga_command.js', import.meta.url), 'utf8');
assert.match(sceneSource, /const framing = this\._managementProfileFraming\(\);\s*this\._moveCamera\(framing\.position, framing\.target/);
assert.doesNotMatch(sceneSource, /OVERVIEW_CAMERA\.x \* 1\.2|new THREE\.Vector3\(36, -68, 50\)/,
  'the old angled management overview must not return');

const intensity = name => Number(sceneSource.match(new RegExp(`const ${name} = ([0-9.]+);`))?.[1]);
assert.ok(intensity('COMMAND_EXPOSURE') >= 1.35 && intensity('COMMAND_EXPOSURE') <= 1.60,
  'management-only exposure must preserve detail in the dark authored hull');
assert.ok(intensity('MANAGEMENT_HEMISPHERE_INTENSITY') >= 1.50,
  'management overview needs enough ambient fill for a readable silhouette');
assert.ok(intensity('MANAGEMENT_KEY_INTENSITY') >= 4.00,
  'management overview needs a legible side-on key');
assert.ok(intensity('MANAGEMENT_RIM_INTENSITY') >= 3.00,
  'management overview needs a bounded rim to separate the hull from space');
assert.ok(intensity('MANAGEMENT_PROFILE_FILL_INTENSITY') >= 5.00,
  'distant full-ship management profile needs an overview-only frontal fill');
assert.ok(intensity('MANAGEMENT_PROFILE_RIM_INTENSITY') >= 4.00,
  'distant full-ship management profile needs an overview-only silhouette rim');
assert.match(sceneSource, /new THREE\.DirectionalLight\(0x42b9ff, MANAGEMENT_RIM_INTENSITY\)/,
  'the management rim must remain visibly cyan rather than disappearing into the hull');
assert.match(sceneSource, /material\.color\.lerp\(albedoFloor, 0\.12\)/,
  'restored pale authored rooms need restrained overview lift, not the retired dark-hull grade');
assert.match(sceneSource, /material\.emissive\.lerp\(emissiveFloor, 0\.18\)/,
  'overview emission must not wash out the restored room textures');
assert.match(sceneSource, /focusOverview\(animate = true\)[\s\S]*?this\._setProfileMaterialLift\(!procedural\)/,
  'only the authored side elevation needs the near-black-hull material lift');
assert.match(sceneSource, /return this\._fitProceduralCamera\(bounds, true\)/,
  'the shared camera fitter must respect visible room bounds and inspector insets');
assert.match(sceneSource, /focusDistrict\(id, animate = true\)[\s\S]*?this\._setProfileMaterialLift\(false\)/,
  'focused rooms must restore authored material values');
assert.match(uiSource, /if \(\['command', 'construction'\]\.includes\(activeView\)\) call\('onDistrictFocus', selectedDistrictId\);\s*else call\('onOverviewFocus'\);/,
  'collapsing a non-room inspector must preserve the full-ship overview instead of zooming to Command Core');

console.log('UGA management side-profile camera + visibility rig: PASS');
