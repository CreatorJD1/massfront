import assert from 'node:assert/strict';
import worker from '../src/index.js';

function fixture(size=10){
  const gets=[];
  return {
    gets,
    env:{RELEASES:{
      async head(){
        return {
          size,
          httpEtag:'"fixture"',
          writeHttpMetadata(headers){headers.set('content-type','application/javascript');},
        };
      },
      async get(_key,options){
        gets.push(options||null);
        const length=options?.range?.length??size;
        return {body:new Uint8Array(length)};
      },
    }},
  };
}

const android='Mozilla/5.0 (Linux; Android 15; SM-S928U) Chrome/140 Mobile';
const desktop='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140';
async function request(version,userAgent,range='bytes=2-5',method='GET',size=10){
  const f=fixture(size);
  const response=await worker.fetch(new Request(
    `https://updates.test/f/${version}/ota/test.js`,
    {method,headers:{range,'user-agent':userAgent}},
  ),f.env);
  return {response,gets:f.gets};
}

{
  const {response,gets}=await request('1.33.61',android);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-length'),'10');
  assert.equal(response.headers.get('content-range'),null);
  assert.match(response.headers.get('vary'),/User-Agent/i);
  assert.match(response.headers.get('vary'),/Range/i);
  assert.equal((await response.arrayBuffer()).byteLength,10);
  assert.deepEqual(gets,[null]);
}

for(const [version,userAgent] of [['1.33.61',desktop],['1.33.62',desktop]]){
  const {response,gets}=await request(version,userAgent);
  assert.equal(response.status,206);
  assert.equal(response.headers.get('content-range'),'bytes 2-5/10');
  assert.equal(response.headers.get('content-length'),'4');
  assert.equal((await response.arrayBuffer()).byteLength,4);
  assert.deepEqual(gets,[{range:{offset:2,length:4}}]);
}

{
  const {response,gets}=await request('1.33.62',android);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-length'),'10');
  assert.equal(response.headers.get('content-range'),null);
  assert.equal((await response.arrayBuffer()).byteLength,10);
  assert.deepEqual(gets,[null]);
}

for(const range of ['bytes=nope','bytes=10-11','bytes=7-2']){
  const {response,gets}=await request('1.33.61',android,range);
  assert.equal(response.status,416);
  assert.equal(response.headers.get('content-range'),'bytes */10');
  assert.deepEqual(gets,[]);
}

{
  const large=33*1024*1024;
  const {response,gets}=await request('1.33.61',android,'bytes=0-3','GET',large);
  assert.equal(response.status,206);
  assert.equal(response.headers.get('content-range'),`bytes 0-3/${large}`);
  assert.deepEqual(gets,[{range:{offset:0,length:4}}]);
}

{
  const {response,gets}=await request('1.33.61',android,'bytes=2-5','HEAD');
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-length'),'10');
  assert.equal(response.headers.get('content-range'),null);
  assert.deepEqual(gets,[]);
}

console.log('PASS massfront-update Range and legacy Android compatibility');
