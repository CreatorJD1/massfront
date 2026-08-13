/* Minimal PNG decode/encode (RGBA8, no filters on write). Node zlib only. */
const fs=require('fs'),zlib=require('zlib');
function decode(file){
  /* Accepts a path or an already-loaded PNG. Callers that decode a canvas
     toDataURL have the bytes in hand and no file to point at. */
  const buf=Buffer.isBuffer(file)?file:fs.readFileSync(file);
  let p=8,w=0,h=0,ct=0,idat=[],plte=null,trns=null;
  while(p<buf.length){
    const len=buf.readUInt32BE(p),type=buf.toString('ascii',p+4,p+8);
    const d=buf.slice(p+8,p+8+len);
    if(type==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);ct=d[9];}
    else if(type==='IDAT')idat.push(d);
    else if(type==='PLTE')plte=d;
    else if(type==='tRNS')trns=d;
    else if(type==='IEND')break;
    p+=12+len;
  }
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const src=ct===6?4:ct===2?3:ct===3?1:ct===4?2:1;
  const stride=w*src, cur=Buffer.alloc(h*stride);
  let off=0;
  for(let y=0;y<h;y++){
    const ft=raw[off++],line=raw.slice(off,off+stride);off+=stride;
    const row=cur.slice(y*stride,(y+1)*stride),prev=y?cur.slice((y-1)*stride,y*stride):Buffer.alloc(stride);
    for(let x=0;x<stride;x++){
      const a=x>=src?row[x-src]:0,b=prev[x],c=x>=src?prev[x-src]:0;let v=line[x];
      if(ft===1)v+=a;else if(ft===2)v+=b;else if(ft===3)v+=(a+b)>>1;
      else if(ft===4){const pa=Math.abs(b-c),pb=Math.abs(a-c),pc=Math.abs(a+b-2*c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);}
      row[x]=v&255;
    }
  }
  const out=Buffer.alloc(w*h*4);
  for(let i=0,n=w*h;i<n;i++){
    let r,g,b,al=255;
    if(src===4){r=cur[i*4];g=cur[i*4+1];b=cur[i*4+2];al=cur[i*4+3];}
    else if(src===3){r=cur[i*3];g=cur[i*3+1];b=cur[i*3+2];}
    else if(src===2){r=g=b=cur[i*2];al=cur[i*2+1];}
    else if(ct===3&&plte){const ix=cur[i];r=plte[ix*3];g=plte[ix*3+1];b=plte[ix*3+2];if(trns&&ix<trns.length)al=trns[ix];}
    else {r=g=b=cur[i];}
    out[i*4]=r;out[i*4+1]=g;out[i*4+2]=b;out[i*4+3]=al;
  }
  return {w,h,px:out};
}
function encode(w,h,px,file){
  const stride=w*4,raw=Buffer.alloc((stride+1)*h);
  for(let y=0;y<h;y++){raw[y*(stride+1)]=0;px.copy(raw,y*(stride+1)+1,y*stride,(y+1)*stride);}
  const chunks=[Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])];
  const chunk=(type,data)=>{
    const len=Buffer.alloc(4);len.writeUInt32BE(data.length);
    const td=Buffer.concat([Buffer.from(type,'ascii'),data]);
    const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td)>>>0);
    return Buffer.concat([len,td,crc]);
  };
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);
  ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  chunks.push(chunk('IHDR',ihdr));
  chunks.push(chunk('IDAT',zlib.deflateSync(raw,{level:9})));
  chunks.push(chunk('IEND',Buffer.alloc(0)));
  fs.writeFileSync(file,Buffer.concat(chunks));
}
let T=null;
function crc32(b){
  if(!T){T=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;T[n]=c>>>0;}}
  let c=0xffffffff;for(let i=0;i<b.length;i++)c=T[(c^b[i])&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
module.exports={decode,encode};
