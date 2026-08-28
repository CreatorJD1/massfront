import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';

const moduleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = join(moduleRoot, 'tmp', 'room-material-verification');
const url = process.env.MF_SPACE_URL || 'http://127.0.0.1:9013/modules/space_exploration/index.html';
const expected = {
  command: 'NEXUS-VII Command Surfaces',
  navigation: 'NEXUS-VII Navigation Surfaces',
  survey: 'NEXUS-VII Survey Surfaces',
  mission_ops: 'NEXUS-VII Mission Operations Surfaces',
  research: 'NEXUS-VII Research Surfaces',
  fabricator: 'NEXUS-VII Fabrication Surfaces',
  engineering: 'NEXUS-VII Engineering Surfaces',
  habitat: 'NEXUS-VII Habitat Medical Surfaces',
  factions: 'NEXUS-VII Coalition Embassy Surfaces',
  hangar: 'NEXUS-VII Strike Bay Surfaces',
  logistics: 'NEXUS-VII Logistics Surfaces'
};
await mkdir(output, { recursive: true });

const browser = await launchPwBrowser();
let page;
const runtimeErrors = [];

try {
  const gpuPage = await browser.newPage({ viewport: { width: 320, height: 240 } });
  const gpu = await assertHardwareGpu(gpuPage);
  await gpuPage.close();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  page.on('pageerror', error => runtimeErrors.push(`page: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 30_000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.evaluate(async () => {
    const domain = await import('./src/domain/index.js');
    localStorage.setItem(domain.DOMAIN_STORAGE_KEY, domain.serializeDomainState(domain.createShowcaseReadyDomainState()));
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 30_000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);

  const districts = [];
  for (const [districtId, expectedName] of Object.entries(expected)) {
    await page.evaluate(id => window.__MASSFRONT_SPACE__.openUga(id), districtId);
    await page.waitForSelector('.uga-command-shell:not([hidden])');
    await page.waitForTimeout(950);
    const report = await page.evaluate(({ districtId, expectedName }) => {
      const experience = window.__MASSFRONT_SPACE__;
      const root = experience.commandScene.districtRoots.get(districtId);
      const matching = [];
      const structuralMisuse = [];
      const surfaceRoles = { floors: [], walls: [], facilities: [], transit: [], glazing: [] };
      root?.traverse(object => {
        if (!object.isMesh || !object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (/(?:_|Pressure)Deck$/.test(object.name)) surfaceRoles.floors.push({ object: object.name, material: material.name });
          if (/FarBulkhead|RearPressureWall|PortBulkhead|StarboardBulkhead|CeilingServiceBeam/.test(object.name)) surfaceRoles.walls.push({ object: object.name, material: material.name });
          if (/Command_Core$|Structure_|FacilityBlock_|AccordRotunda|DelegationTower/.test(object.name)) surfaceRoles.facilities.push({ object: object.name, material: material.name });
          if (/TransitNetwork$|AccordTunnelFloor$/.test(object.name)) surfaceRoles.transit.push({
            object: object.name,
            material: material.name,
            channels: {
              albedo: Boolean(material.map),
              normal: Boolean(material.normalMap),
              roughness: Boolean(material.roughnessMap),
              metallic: Boolean(material.metalnessMap),
              ao: Boolean(material.aoMap),
              emissive: Boolean(material.emissiveMap)
            },
            size: [material.map?.image?.width || material.map?.image?.naturalWidth || 0, material.map?.image?.height || material.map?.image?.naturalHeight || 0]
          });
          if (/AccordTunnelGlazing$/.test(object.name)) surfaceRoles.glazing.push({
            object: object.name,
            material: material.name,
            transparent: Boolean(material.transparent),
            opacity: Number(material.opacity)
          });
          if (material.name === expectedName) matching.push({
            object: object.name,
            channels: {
              albedo: Boolean(material.map),
              normal: Boolean(material.normalMap),
              roughness: Boolean(material.roughnessMap),
              metallic: Boolean(material.metalnessMap),
              ao: Boolean(material.aoMap),
              emissive: Boolean(material.emissiveMap)
            },
            size: [material.map?.image?.width || material.map?.image?.naturalWidth || 0, material.map?.image?.height || material.map?.image?.naturalHeight || 0]
          });
          if (/RearPressureWall|PortBulkhead|StarboardBulkhead|CeilingServiceBeam/.test(object.name) && / Surfaces$/.test(material.name)) {
            structuralMisuse.push({ object: object.name, material: material.name });
          }
        }
      });
      const gl = experience.engine.renderer.getContext();
      return {
        districtId,
        expectedName,
        matching,
        structuralMisuse,
        surfaceRoles,
        contextLost: gl.isContextLost(),
        glError: gl.getError()
      };
    }, { districtId, expectedName });
    const path = join(output, `${districtId}.png`);
    await page.screenshot({ path });
    districts.push({ ...report, path });
  }

  const windows = await page.evaluate(() => {
    const scene = window.__MASSFRONT_SPACE__?.commandScene?.scene;
    const tagged = [];
    scene?.traverse(object => {
      if (!object.isMesh || object.userData?.render_role !== 'window_emissive') return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const map = material?.emissiveMap;
        tagged.push({
          object: object.name,
          material: material?.name || '',
          emissiveMap: Boolean(map),
          mapSize: [map?.image?.width || map?.image?.naturalWidth || 0, map?.image?.height || map?.image?.naturalHeight || 0],
          emissiveIntensity: Number(material?.emissiveIntensity) || 0,
          authoredIntensity: Number(material?.userData?.baseEmissiveIntensity) || 0
        });
      }
    });
    return {
      tagged,
      bloom: window.__MASSFRONT_SPACE__?.commandScene?.windowBloom?.getTelemetry?.() || null
    };
  });

  const checks = {
    everyDistrictAssigned: districts.every(entry => entry.matching.length > 0),
    completePbrChannels: districts.every(entry => entry.matching.every(item => Object.values(item.channels).every(Boolean))),
    correctResolution: districts.every(entry => entry.matching.every(item => item.size[0] === 1024 && item.size[1] === 1024)),
    structuralSeparation: districts.every(entry => entry.structuralMisuse.length === 0),
    floorsSeparated: districts.every(entry => entry.surfaceRoles.floors.length > 0 && entry.surfaceRoles.floors.every(item => item.material === 'NEXUS-VII Interior Deck Floor')),
    wallsSeparated: districts.every(entry => entry.surfaceRoles.walls.length > 0 && entry.surfaceRoles.walls.every(item => item.material === 'NEXUS-VII Pressure Wall Cladding')),
    facilitiesSeparated: districts.every(entry => entry.surfaceRoles.facilities.length > 0 && entry.surfaceRoles.facilities.every(item => item.material === entry.expectedName)),
    transitSeparated: districts.every(entry => entry.surfaceRoles.transit.length > 0 && entry.surfaceRoles.transit.every(item => item.material === 'NEXUS-VII Interior Transit Way')),
    transitPbrInputs: districts.every(entry => entry.surfaceRoles.transit.every(item => Object.values(item.channels).every(Boolean) && item.size[0] === 1024 && item.size[1] === 1024)),
    tunnelGlazingAuthored: districts.find(entry => entry.districtId === 'factions')?.surfaceRoles.glazing.some(item => item.material === 'NEXUS-VII Transit Pressure Glass' && item.transparent && item.opacity > .25 && item.opacity < .5) === true,
    windowsTagged: windows.tagged.length >= 11,
    windowMaterialDedicated: windows.tagged.every(item => item.material === 'NEXUS-VII Authored Window Glazing'),
    windowEmissiveInputs: windows.tagged.every(item => item.emissiveMap && item.mapSize[0] === 1024 && item.mapSize[1] === 1024 && item.authoredIntensity >= 2.4),
    windowBloomActive: Boolean(windows.bloom && windows.bloom.bloomFrames > 0 && windows.bloom.fallbackFrames === 0 && windows.bloom.lastMode === 'bloom'),
    gpuHealthy: districts.every(entry => !entry.contextLost && entry.glError === 0),
    runtimeErrors: runtimeErrors.length === 0
  };
  const report = { gpu, checks, runtimeErrors, windows, districts };
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ gpu, checks, captureCount: districts.length, output }, null, 2));
  if (Object.values(checks).some(value => value !== true)) process.exitCode = 1;
} finally {
  if (page) await page.close().catch(() => {});
  await Promise.race([closePwBrowser(), new Promise(resolve => setTimeout(resolve, 5000))]);
}

process.exit(process.exitCode || 0);
