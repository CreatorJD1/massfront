import assert from 'node:assert/strict';
import { clampProjectedLabelX } from '../src/galaxy/galaxy_map_engine.js';

assert.equal(clampProjectedLabelX(2, 430, 80), 50, 'left edge includes the translated half-width');
assert.equal(clampProjectedLabelX(428, 430, 80), 380, 'right edge includes the translated half-width');
assert.equal(clampProjectedLabelX(215, 430, 80), 215, 'an in-bounds projection is unchanged');
assert.equal(clampProjectedLabelX(2, 430, 80, 34, 10), 74, 'safe-area clearance is additive to the mobile gutter');
assert.equal(clampProjectedLabelX(2, 100, 140, 10, 10), 50, 'an over-wide label centers in the remaining viewport');

console.log('galaxy label layout tests passed');
