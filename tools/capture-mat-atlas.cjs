const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('www');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(root, p), (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  });
});
(async () => {
  const { launchPwBrowser, closePwBrowser } = await import('./pw-browser.mjs');
  const { assertHardwareGpu } = await import('./chrome-gpu.mjs');
  await new Promise(r => server.listen(8903, r));
  const b = await launchPwBrowser();
  try {
    const p = await b.newPage({ viewport: { width: 412, height: 900 }, hasTouch: true });
    p.on('pageerror', e => console.log('PAGEERR ' + e.message));
    await p.goto('http://127.0.0.1:8903/?materialCapture', { waitUntil: 'domcontentloaded' });
    await assertHardwareGpu(p);
    await p.waitForTimeout(20000);   // boot + initGL3D + buildMatAtlas
    const atlas = await p.evaluate(() => window.__MF_MATERIAL_ATLASES || null);
    if (!atlas || !atlas.albedo || !atlas.normal || !atlas.orm) {
      console.error('Material atlas capture failed');
      process.exitCode = 1;
      return;
    }
    const outDir = path.resolve('assets/textures');
    fs.mkdirSync(outDir, { recursive: true });
    const save = (name, dataUrl) => {
      const base64 = dataUrl.split(',')[1];
      const buf = Buffer.from(base64, 'base64');
      const out = path.join(outDir, name);
      fs.writeFileSync(out, buf);
      console.log(name + ' -> ' + out + ' (' + (buf.length / 1024).toFixed(1) + ' KB)');
    };
    save('mat-albedo.png', atlas.albedo);
    save('mat-normal.png', atlas.normal);
    save('mat-orm.png', atlas.orm);
  } finally {
    await closePwBrowser();
    server.close();
  }
})().catch(e => { console.error('FAIL ' + e.message); process.exit(1); });
