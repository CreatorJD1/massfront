#!/usr/bin/env node

/*
 * Authoring exporter for the Galactic Campaign Deployment Arena.
 *
 * The RTS deployer craft are procedural MeshBuilder models, not source GLBs.
 * This tool evaluates those exact builders in the real base-game browser
 * runtime and snapshots their indexed geometry into a small ESM data module.
 * The exploration runtime therefore does not duplicate or reinterpret the
 * builders, while its isolated document remains independent of the main game.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const OUTPUT = resolve(HERE, '../src/assets/generated/deployment_ship_geometry_v1.js');
const BASE_URL = process.env.MF_BASE_URL || 'http://127.0.0.1:9016/?offline=1';

const BUILDERS = Object.freeze({
  nova: Object.freeze({ body: 'mdlDropship', gear: 'mdlDropGear', vtol: 'mdlDropVtol', rotor: 'mdlDropRotor' }),
  dominion: Object.freeze({ body: 'mdlLegionDropship', gear: 'mdlLegionDropGear' }),
  syndicate: Object.freeze({ body: 'mdlSyndicateDropship' })
});

const modelsSource = await readFile(resolve(ROOT, 'src/engine/models.js'));
const meshSource = await readFile(resolve(ROOT, 'src/engine/mesh.js'));
const materialsSource = await readFile(resolve(ROOT, 'src/engine/materials.js'));
const localSourceHashes = Object.freeze({
  models: sha256(modelsSource),
  mesh: sha256(meshSource),
  materials: sha256(materialsSource)
});

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

const browser = await launchPwBrowser({ headless: true, ownershipMode: 'isolated' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => (
    typeof mdlDropship === 'function'
    && typeof mdlLegionDropship === 'function'
    && typeof mdlSyndicateDropship === 'function'
    && typeof mdlDropGear === 'function'
    && typeof mdlDropVtol === 'function'
    && typeof mdlDropRotor === 'function'
    && typeof mdlLegionDropGear === 'function'
  ), { timeout: 60_000 });

  const snapshot = await page.evaluate(async builders => {
    const output = {};
    for (const [factionId, parts] of Object.entries(builders)) {
      output[factionId] = {};
      for (const [partId, builderName] of Object.entries(parts)) {
        const geometry = globalThis[builderName]();
        output[factionId][partId] = {
          builder: builderName,
          vertexStride: VFLOATS,
          vertices: Array.from(geometry.v),
          indices: Array.from(geometry.i)
        };
      }
    }
    const servedModels = await (await fetch('/src/engine/models.js', { cache: 'no-store' })).text();
    const servedMesh = await (await fetch('/src/engine/mesh.js', { cache: 'no-store' })).text();
    const servedMaterials = await (await fetch('/src/engine/materials.js', { cache: 'no-store' })).text();
    return {
      parts: output,
      profiles: {
        nova: JSON.parse(JSON.stringify(DROP_PROFILE.nova)),
        dominion: JSON.parse(JSON.stringify(DROP_PROFILE.legion)),
        syndicate: JSON.parse(JSON.stringify(DROP_PROFILE.syndicate))
      },
      vertexStride: VFLOATS,
      servedModels,
      servedMesh,
      servedMaterials
    };
  }, BUILDERS);

  const servedSourceHashes = {
    models: sha256(Buffer.from(snapshot.servedModels, 'utf8')),
    mesh: sha256(Buffer.from(snapshot.servedMesh, 'utf8')),
    materials: sha256(Buffer.from(snapshot.servedMaterials, 'utf8'))
  };
  if (servedSourceHashes.models !== localSourceHashes.models
    || servedSourceHashes.mesh !== localSourceHashes.mesh
    || servedSourceHashes.materials !== localSourceHashes.materials) {
    throw new Error(`MF_DEPLOYMENT_EXPORT_SOURCE_MISMATCH ${JSON.stringify({ localSourceHashes, servedSourceHashes })}`);
  }
  const encoded = {};
  for (const [factionId, parts] of Object.entries(snapshot.parts)) {
    encoded[factionId] = {};
    for (const [partId, part] of Object.entries(parts)) {
      const vertexBytes = Buffer.from(new Float32Array(part.vertices).buffer);
      const indexBytes = Buffer.from(new Uint16Array(part.indices).buffer);
      encoded[factionId][partId] = {
        builder: part.builder,
        vertexStride: part.vertexStride,
        vertexCount: part.vertices.length / part.vertexStride,
        indexCount: part.indices.length,
        geometrySha256: sha256(Buffer.concat([vertexBytes, indexBytes])),
        verticesBase64: vertexBytes.toString('base64'),
        indicesBase64: indexBytes.toString('base64')
      };
    }
  }

  const provenance = {
    schema: 'MassfrontDeploymentShipGeometryV1',
    sourceModelsSha256: localSourceHashes.models,
    sourceMeshSha256: localSourceHashes.mesh,
    sourceMaterialsSha256: localSourceHashes.materials,
    servedSourceHashes,
    sourceBuilders: BUILDERS,
    sourceProfiles: snapshot.profiles,
    vertexStride: snapshot.vertexStride,
    gameplayEnvelopes: { body: [112, 82], landing: [112, 88], snapGrid: 20, units: 'simulation' },
    coordinateConvention: 'source x/z ground,+y up; consumer converts to Three x/y ground,+z up'
  };
  const source = [
    '/* GENERATED FILE. Run modules/space_exploration/tools/export-deployment-ship-geometry.mjs. */',
    `export const DEPLOYMENT_SHIP_GEOMETRY_V1 = Object.freeze(${JSON.stringify({ provenance, factions: encoded })});`,
    ''
  ].join('\n');
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, source, 'utf8');
  console.log(JSON.stringify({ output: OUTPUT, bytes: Buffer.byteLength(source), provenance }, null, 2));
} finally {
  await closePwBrowser(browser);
}
