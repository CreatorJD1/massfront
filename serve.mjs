import http from 'http';
import { readFile } from 'fs';
import { extname, join, normalize } from 'path';

const root = (await import('path')).resolve(process.argv[2] || 'www');
const port = +(process.argv[3] || 8901);
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.png':'image/png', '.json':'application/json', '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.svg':'image/svg+xml', '.glb':'model/gltf-binary', '.gltf':'model/gltf+json' };
http.createServer((req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') path = '/index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found: ' + path); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log('serving ' + root + ' on ' + port));
