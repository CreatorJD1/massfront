import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawnProjectChrome, PW_CDP_PORT } from './pw-browser.mjs';

const wwwDir = path.resolve('www');
const artifactDir = 'C:\\Users\\Jason\\.gemini\\antigravity\\brain\\c902b81e-2bc5-48ac-9392-b0068d1f28de';
const outPath = path.join(artifactDir, 'ingame_gameplay_live.png');

const server = http.createServer((req, res) => {
  let reqUrl = req.url.split('?')[0];
  let filePath = path.join(wwwDir, reqUrl === '/' ? 'index.html' : reqUrl);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      const ext = path.extname(filePath).toLowerCase();
      let mime = 'text/html';
      if (ext === '.js') mime = 'application/javascript';
      if (ext === '.css') mime = 'text/css';
      if (ext === '.png') mime = 'image/png';
      if (ext === '.jpg') mime = 'image/jpeg';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    }
  });
});

const PORT = 8909;
await new Promise(r => server.listen(PORT, r));
console.log(`Serving www on http://127.0.0.1:${PORT}/`);

const targetUrl = `http://127.0.0.1:${PORT}/?defenseshow=1`;
console.log('Launching browser for CDP capture...');
const { child, kill } = await spawnProjectChrome([
  '--headless=new',
  '--window-size=1280,720',
  targetUrl
]);

const delay = ms => new Promise(res => setTimeout(res, ms));
await delay(8000);

let failed = false;
try {
  const res = await fetch(`http://127.0.0.1:${PW_CDP_PORT}/json`);
  const pages = await res.json();
  const wsUrl = pages[0].webSocketDebuggerUrl;

  const ws = new WebSocket(wsUrl);
  await new Promise(res => ws.addEventListener('open', res));

  const gpuPromise = new Promise((res, rej) => {
    const onMsg = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id !== 41) return;
      ws.removeEventListener('message', onMsg);
      if (msg.error) rej(new Error(JSON.stringify(msg.error)));
      else res(msg.result && msg.result.result && msg.result.result.value);
    };
    ws.addEventListener('message', onMsg);
  });
  ws.send(JSON.stringify({
    id: 41,
    method: 'Runtime.evaluate',
    params: {
      expression: `(function(){
          const c=document.createElement('canvas');
          const g=c.getContext('webgl2');
          if(!g) return 'NO-WEBGL2';
          const d=g.getExtension('WEBGL_debug_renderer_info');
          return d?String(g.getParameter(d.UNMASKED_RENDERER_WEBGL)):String(g.getParameter(g.RENDERER));
        })()`,
      returnByValue: true
    }
  }));
  const renderer = await gpuPromise;
  console.log('UNMASKED_RENDERER_WEBGL:', renderer);
  if (!renderer || /swiftshader|software|llvmpipe|lavapipe|microsoft basic render/i.test(String(renderer))) {
    throw new Error('REFUSING: no hardware GPU (SwiftShader is retired) -> ' + renderer);
  }

  const shotPromise = new Promise(res => {
    ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === 42 && msg.result && msg.result.data) {
        res(msg.result.data);
      }
    });
  });

  ws.send(JSON.stringify({ id: 42, method: 'Page.captureScreenshot', params: { format: 'png' } }));

  const base64Data = await shotPromise;
  const buf = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(outPath, buf);
  console.log('SUCCESS: Captured live WebGL match screenshot!', outPath, `(${buf.length} bytes)`);

  ws.close();
} catch (e) {
  failed = true;
  console.error('Capture error:', e);
} finally {
  try { child.kill(); } catch (e) {}
  await kill();
  server.close();
  process.exit(failed ? 1 : 0);
}
