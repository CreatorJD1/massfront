import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';

const url = process.env.MF_SPACE_URL || 'http://127.0.0.1:8991/';
const output = new URL('../tmp/artifact-diagnostics/', import.meta.url);
await mkdir(output, { recursive: true });

const browser = await launchPwBrowser();
let page;

async function capture(name) {
  await page.screenshot({
    path: fileURLToPath(new URL(`${name}.png`, output)),
    fullPage: true
  });
}

try {
  const gpuPage = await browser.newPage({ viewport: { width: 320, height: 240 } });
  await gpuPage.goto('about:blank');
  await assertHardwareGpu(gpuPage);
  await gpuPage.close();

  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 15000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.waitForTimeout(900);

  const inventory = await page.evaluate(() => {
    const engine = window.__MASSFRONT_SPACE__.engine;
    const rows = [];
    engine.scene.updateMatrixWorld(true);
    engine.scene.traverse(object => {
      if (!object.isMesh && !object.isLine && !object.isPoints && !object.isSprite) return;
      const geometry = object.geometry;
      geometry?.computeBoundingSphere?.();
      const scale = object.getWorldScale(new THREE.Vector3());
      const radius = geometry?.boundingSphere
        ? geometry.boundingSphere.radius * Math.max(scale.x, scale.y, scale.z)
        : null;
      const materials = (Array.isArray(object.material) ? object.material : [object.material])
        .filter(Boolean)
        .map(material => ({
          type: material.type,
          transparent: material.transparent,
          opacity: material.opacity,
          blending: material.blending,
          depthWrite: material.depthWrite,
          side: material.side
        }));
      rows.push({
        uuid: object.uuid,
        name: object.name || '(unnamed)',
        type: object.type,
        geometry: geometry?.type || null,
        radius: radius == null ? null : Number(radius.toFixed(2)),
        position: object.getWorldPosition(new THREE.Vector3()).toArray().map(v => Number(v.toFixed(2))),
        materials
      });
    });
    return rows.sort((a, b) => (b.radius || 0) - (a.radius || 0));
  });
  console.log(JSON.stringify(inventory.slice(0, 80), null, 2));
  await capture('00-baseline');

  const cases = [
    ['01-no-grid', object => object === window.__MASSFRONT_SPACE__.engine.gridMesh],
    ['02-no-ring-geometry', object => object.geometry?.type === 'RingGeometry'],
    ['03-no-planes', object => object.geometry?.type === 'PlaneGeometry'],
    ['04-no-atmospheres', object => object.material?.side === THREE.BackSide && object.material?.isShaderMaterial],
    ['05-no-transparent-meshes', object => object.isMesh && object.material?.transparent]
  ];

  for (const [name, predicate] of cases) {
    await page.evaluate(source => {
      const engine = window.__MASSFRONT_SPACE__.engine;
      engine.scene.traverse(object => {
        if (object.userData.__artifactVisible == null) object.userData.__artifactVisible = object.visible;
        object.visible = object.userData.__artifactVisible;
      });
      let matches;
      if (source === 'grid') matches = object => object === engine.gridMesh;
      else if (source === 'ring') matches = object => object.geometry?.type === 'RingGeometry';
      else if (source === 'plane') matches = object => object.geometry?.type === 'PlaneGeometry';
      else if (source === 'atmosphere') matches = object => object.material?.side === THREE.BackSide && object.material?.isShaderMaterial;
      else matches = object => object.isMesh && object.material?.transparent;
      engine.scene.traverse(object => { if (matches(object)) object.visible = false; });
    }, name.includes('grid') ? 'grid' : name.includes('ring') ? 'ring' : name.includes('planes') ? 'plane' : name.includes('atmospheres') ? 'atmosphere' : 'transparent');
    await page.waitForTimeout(250);
    await capture(name);
  }
} finally {
  if (page) await page.close().catch(() => {});
  await Promise.race([
    closePwBrowser(),
    new Promise(resolve => setTimeout(resolve, 5000))
  ]);
}

process.exit(0);
