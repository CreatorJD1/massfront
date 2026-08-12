import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const wwwDir = path.resolve('www');
const artifactDir = 'C:\\Users\\Jason\\.gemini\\antigravity\\brain\\c902b81e-2bc5-48ac-9392-b0068d1f28de';

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

server.listen(PORT, () => {
  console.log(`Serving www on http://127.0.0.1:${PORT}/`);

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browserBin = fs.existsSync(chromePath) ? chromePath : edgePath;

  const outPath = path.join(artifactDir, 'ingame_gameplay_live.png');

  const chromeArgs = [
    '--headless=new',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,720',
    `--screenshot=${outPath}`,
    `http://127.0.0.1:${PORT}/`
  ];

  console.log('Spawning Chrome for WebGL capture...');
  const child = spawn(browserBin, chromeArgs, { stdio: 'ignore' });

  setTimeout(() => {
    try { child.kill(); } catch (e) {}
    console.log('Chrome process finished.');
    if (fs.existsSync(outPath)) {
      console.log('SUCCESS: Real screenshot saved to:', outPath, 'size:', fs.statSync(outPath).size, 'bytes');
    }
    server.close();
    process.exit(0);
  }, 10000);
});
