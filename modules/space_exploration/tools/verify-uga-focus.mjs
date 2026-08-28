import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';

const url = process.env.MF_SPACE_URL || 'http://127.0.0.1:8991/';
const output = new URL('../tmp/browser-captures/uga-focus/', import.meta.url);
const districts = ['command', 'navigation', 'survey', 'mission_ops', 'research', 'fabricator', 'engineering', 'habitat', 'factions', 'hangar', 'logistics'];
const districtDeck = {
  command: 'A', navigation: 'A', survey: 'A', mission_ops: 'A',
  research: 'B', fabricator: 'B', engineering: 'B',
  habitat: 'C', factions: 'C', hangar: 'C', logistics: 'C'
};
const failures = [];
const pageErrors = [];
await mkdir(output, { recursive: true });

function check(condition, message) {
  if (!condition) failures.push(message);
}

const browser = await launchPwBrowser();
let page;
let gpu;
const reports = [];
try {
  const gpuPage = await browser.newPage({ viewport: { width: 320, height: 240 } });
  await gpuPage.goto('about:blank');
  gpu = await assertHardwareGpu(gpuPage);
  await gpuPage.close();

  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => pageErrors.push(`request failed: ${request.url()} ${request.failure()?.errorText || ''}`));
  console.log(`NAVIGATE ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready);
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.click('#btnUgaCommand');
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.commandScene?.loaded);
  await page.waitForTimeout(900);

  for (const id of districts) {
    await page.click(`[data-deck-filter="${districtDeck[id]}"]`);
    await page.click(`.uga-district-button[data-district="${id}"]`);
    await page.waitForTimeout(1150);
    const report = await page.evaluate(districtId => {
      const scene = window.__MASSFRONT_SPACE__.commandScene;
      const renderer = window.__MASSFRONT_SPACE__.engine.renderer;
      scene.render();
      const anchor = scene.focusAnchors.get(districtId);
      const target = new THREE.Vector3();
      anchor.getWorldPosition(target);
      const canvasRect = renderer.domElement.getBoundingClientRect();
      const stageRect = document.querySelector('.uga-command-stage').getBoundingClientRect();
      const railRect = document.querySelector('.uga-district-rail').getBoundingClientRect();
      const contextRect = document.querySelector('.uga-context-panel').getBoundingClientRect();
      const aimClient = {
        x: (railRect.right + contextRect.left) * 0.5,
        y: (stageRect.top + stageRect.bottom) * 0.5
      };
      const aimNdc = new THREE.Vector2(
        ((aimClient.x - canvasRect.left) / canvasRect.width) * 2 - 1,
        -((aimClient.y - canvasRect.top) / canvasRect.height) * 2 + 1
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(aimNdc, scene.camera);
      const hit = ray.intersectObject(scene.root, true)[0];
      let aimHitDistrict = null;
      let current = hit?.object || null;
      while (current) {
        if (current.userData?.district_id) {
          aimHitDistrict = current.userData.district_id;
          break;
        }
        current = current.parent;
      }

      const root = scene.districtRoots.get(districtId);
      const landmark = root.getObjectByName(`${districtId}_Structure_1`) || root.getObjectByName(`${districtId}_OperationsTable`) || root.getObjectByName('Command_Core');
      const landmarkCenter = landmark ? new THREE.Box3().setFromObject(landmark).getCenter(new THREE.Vector3()) : null;
      const landmarkNdc = landmarkCenter ? landmarkCenter.clone().project(scene.camera) : null;
      const framingDistance = landmarkNdc ? landmarkNdc.distanceTo(new THREE.Vector3(aimNdc.x, aimNdc.y, landmarkNdc.z)) : Infinity;
      const names = [];
      const readoutMaterials = new Set();
      root.traverse(object => {
        names.push(object.name || '');
        if (object.name?.includes('StatusIndicatorBank') && object.material) readoutMaterials.add(object.material.uuid);
      });
      const crown2 = root.getObjectByName(`${districtId}_Crown_2`);
      const gl = renderer.getContext();
      return {
        id: districtId,
        selected: scene.selectedDistrictId,
        anchor: target.toArray().map(value => Number(value.toFixed(3))),
        camera: scene.camera.position.toArray().map(value => Number(value.toFixed(3))),
        cameraTarget: scene.cameraTarget.toArray().map(value => Number(value.toFixed(3))),
        aimNdc: aimNdc.toArray().map(value => Number(value.toFixed(3))),
        aimHitDistrict,
        aimHitObject: hit?.object?.name || null,
        landmark: landmarkCenter?.toArray().map(value => Number(value.toFixed(3))) || null,
        landmarkNdc: landmarkNdc?.toArray().map(value => Number(value.toFixed(3))) || null,
        framingDistance: Number(framingDistance.toFixed(3)),
        oldInsetNodes: names.filter(name => /StatusInset|TowerInset/.test(name)),
        statusHousings: names.filter(name => name.includes('StatusHousing')).length,
        indicatorBanks: names.filter(name => name.includes('StatusIndicatorBank')).length,
        facilityBlocks: names.filter(name => name.includes('FacilityBlock')).length,
        distinctReadoutMaterials: readoutMaterials.size,
        tier2CrownVisible: crown2 ? crown2.visible : null,
        currentLevel: scene.districtLevels.get(districtId) || 1,
        contextLost: gl.isContextLost(),
        glError: gl.getError(),
        memory: { ...renderer.info.memory },
        render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
      };
    }, id);
    reports.push(report);

    check(report.selected === id, `${id}: selected ${report.selected}`);
    check(report.landmark && report.landmarkNdc, `${id}: missing tier-one landmark`);
    check(report.framingDistance <= 0.42, `${id}: landmark outside visible focus area (${report.framingDistance})`);
    check(report.oldInsetNodes.length === 0, `${id}: legacy bright-cap nodes ${report.oldInsetNodes.join(', ')}`);
    check(['command', 'navigation', 'mission_ops'].includes(id) || report.facilityBlocks >= 10, `${id}: insufficient authored facility density (${report.facilityBlocks})`);
    check(report.tier2CrownVisible == null || report.tier2CrownVisible === (report.currentLevel >= 2), `${id}: tier-two crown visibility mismatches level ${report.currentLevel}`);
    check(!report.contextLost && report.glError === 0, `${id}: WebGL context/error failure`);

    await page.screenshot({
      path: fileURLToPath(new URL(`uga-${id}-focus-landscape.png`, output)),
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
      timeout: 45000
    });
    console.log(`FOCUS ${id} framing=${report.framingDistance} aimHit=${report.aimHitDistrict || 'none'} calls=${report.render.calls} tris=${report.render.triangles}`);
  }

  check(pageErrors.length === 0, `browser errors: ${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({ gpu, reports, failures, captureDirectory: fileURLToPath(output) }, null, 2));
} finally {
  await Promise.race([page?.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))]);
  await Promise.race([closePwBrowser().catch(() => {}), new Promise(resolve => setTimeout(resolve, 5000))]);
}

if (failures.length) {
  console.error(`UGA focus verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('UGA focus verification passed.');
process.exit(0);
