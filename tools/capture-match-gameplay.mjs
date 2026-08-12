import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

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
const DEBUG_PORT = 9222;

server.listen(PORT, async () => {
  console.log(`Serving www on http://127.0.0.1:${PORT}/`);

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browserBin = fs.existsSync(chromePath) ? chromePath : edgePath;

  const targetUrl = `http://127.0.0.1:${PORT}/?defenseshow=1`;
  const chromeArgs = [
    '--headless=new',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--enable-unsafe-swiftshader',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--window-size=1280,720',
    targetUrl
  ];

  console.log('Launching browser for CDP capture...');
  const child = spawn(browserBin, chromeArgs);

  const delay = ms => new Promise(res => setTimeout(res, ms));

  await delay(8000); // Wait 8s for live WebGL match render

  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
    const pages = await res.json();
    const wsUrl = pages[0].webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);
    await new Promise(res => ws.addEventListener('open', res));

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
    console.error('Capture error:', e);
  } finally {
    try { child.kill(); } catch (e) {}
    server.close();
    process.exit(0);
  }
});
