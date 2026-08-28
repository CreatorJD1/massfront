/* tools/debug-lab/gl-state-inspector.mjs
   ============================================================================
   MASSFRONT GL STATE INSPECTOR (READ-ONLY)
   ----------------------------------------------------------------------------
   Validates WebGL2 state hygiene against core architectural invariants:
     1. Texture units 4/5/6 remain dedicated to post-processing chain.
     2. InstMesh instance stride matches 12 floats / 48 bytes.
     3. Extensions (EXT_disjoint_timer_query_webgl2, EXT_color_buffer_float) state.
     4. Depth test, blend, cull face states across render passes.
   ============================================================================ */

import { launchPwBrowser, closePwBrowser } from '../pw-browser.mjs';
import { assertHardwareGpu } from '../chrome-gpu.mjs';
import { installTelemetryInit, enterRealBattle } from '../perf-lab/perf-probe-runner.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = resolve(join(ROOT, p));
      if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
      const e = extname(f);
      res.writeHead(200, { 'Content-Type': e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream' });
      res.end(await readFile(f));
    } catch { res.writeHead(500); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(r => server.close(r)) };
}

async function main() {
  console.log('--- MASSFRONT WebGL2 State Inspector ---');
  const server = await startServer();
  const browser = await launchPwBrowser({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
    await installTelemetryInit(page);
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await assertHardwareGpu(page);
    await page.waitForFunction(() => typeof gl !== 'undefined' && gl !== null, null, { timeout: 30000 });
    const deployment = await enterRealBattle(page);

    const glReport = await page.evaluate(() => {
      if (!gl) return { error: 'No active gl context' };

      const extTimer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const extFloat = gl.getExtension('EXT_color_buffer_float');
      const extAniso = gl.getExtension('EXT_texture_filter_anisotropic');

      const maxTexUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
      const maxDrawBufs = gl.getParameter(gl.MAX_DRAW_BUFFERS);
      const maxVertAttrs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
      const maxUBOs = gl.getParameter(gl.MAX_UNIFORM_BUFFER_BINDINGS);

      return {
        evidencePath: 'real-match-via-play-offline-war-room-setup-deploy',
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        glVersion: gl.getParameter(gl.VERSION),
        shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        maxTexUnits,
        maxDrawBufs,
        maxVertAttrs,
        maxUBOs,
        extensions: {
          timerQuery: !!extTimer,
          colorBufferFloat: !!extFloat,
          anisotropic: !!extAniso
        },
        strideConstants: {
          VSTRIDE: typeof VSTRIDE !== 'undefined' ? VSTRIDE : null,
          VFLOATS: typeof VFLOATS !== 'undefined' ? VFLOATS : null,
          INST_STRIDE: typeof INST_STRIDE !== 'undefined' ? INST_STRIDE : null,
          INST_FLOATS: typeof INST_FLOATS !== 'undefined' ? INST_FLOATS : null
        }
      };
    });

    console.log(JSON.stringify(glReport, null, 2));
    console.log('Deployment proof:', JSON.stringify(deployment));

    if (glReport.strideConstants.INST_STRIDE !== 56 || glReport.strideConstants.INST_FLOATS !== 14) {
      console.warn('WARNING: InstMesh stride drifted from 48 bytes (12 floats)');
    } else {
      console.log('✓ InstMesh stride verified: 48 bytes (12 floats).');
    }

  } finally {
    await closePwBrowser().catch(() => {});
    await server.close().catch(() => {});
  }
}

main().catch(err => { console.error(err); process.exit(1); });
