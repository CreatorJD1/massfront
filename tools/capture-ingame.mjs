import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { spawnProjectChrome } from './pw-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wwwDir = path.join(root, 'www');
// Captures are repository-local scratch evidence, never writes into an agent's
// global state directory. File-relative resolution also makes CWD irrelevant.
const artifactDir = path.join(root, '.tmp', 'agent-captures', 'antigravity', 'ingame');
fs.mkdirSync(artifactDir, { recursive: true });

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

const outPath = path.join(artifactDir, 'ingame_gameplay_live.png');
console.log('Spawning Chrome for WebGL capture...');
const { kill } = await spawnProjectChrome([
  '--headless=new',
  '--window-size=1280,720',
  `--screenshot=${outPath}`,
  `http://127.0.0.1:${PORT}/`
]);

try {
  await new Promise(r => setTimeout(r, 10000));
  console.log('Chrome process finished.');
  if (fs.existsSync(outPath)) {
    console.log('SUCCESS: Real screenshot saved to:', outPath, 'size:', fs.statSync(outPath).size, 'bytes');
  }
} finally {
  await kill();
  server.close();
}
