import http from 'http';import fs from 'fs';import path from 'path';
const www=path.resolve('www');
http.createServer((q,r)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';const f=path.join(www,u);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}const t={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.m4a':'audio/mp4','.ogg':'audio/ogg'};r.writeHead(200,{'Content-Type':t[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8100,()=>console.log('serving on 8100'));
