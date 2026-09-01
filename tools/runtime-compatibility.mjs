import {createHash} from 'node:crypto';

export const RUNTIME_COMPATIBILITY_SCHEMA='massfront.runtime-compatibility';
export const RUNTIME_COMPATIBILITY_SCHEMA_VERSION=1;
export const RUNTIME_COMPATIBILITY_GLOBAL='__MASSFRONT_RUNTIME_COMPATIBILITY';

/* Versioned deliberately: changing this list changes the meaning of
   balanceHash and therefore requires a schema review, not an accidental edit.
   These are the packaged/OTA files that own deterministic map generation,
   simulation, economy, combat, faction doctrine and match progression. */
export const BALANCE_AUTHORITY_V1=Object.freeze([
  'assets/data/theatreprofiles-stage10.js',
  'assets/data/interiortopology-stage10.js',
  'assets/data/orbitaltopology-stage10.js',
  'assets/data/worldkit.js',
  'assets/data/locationgrammar.js',
  'assets/data/sitetemplates.js',
  'assets/data/sitetemplates-stage9.js',
  'assets/data/locationplans.js',
  'assets/data/battlefieldtopology-stage10.js',
  'src/engine/factionenergy.js',
  'src/engine/terragen.js',
  'src/engine/physics.js',
  'src/game/utilityjobs.js',
  'src/game/sim.js',
  'src/game/airwarfare.js',
  'src/game/economy.js',
  'src/game/commander.js',
  'src/game/meta.js',
  'src/game/ai.js',
  'src/develop.js',
  'src/airlift.js',
  'src/airlift-factions.js',
  'src/factions.js',
  'src/hazards.js',
  'src/factiondoctrine.js',
  'src/endgame.js',
  'src/daily.js',
  'src/economy-net.js',
  'src/session.js',
  'src/faction-id.js',
  'src/main.js',
  'src/intel.js',
  'src/repairbay.js',
  'src/galactic-operations.js'
]);

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

function cleanPath(path){
  const p=String(path||'').replace(/^\.\//,'');
  if(!p||p.includes('\\')||p.startsWith('/')||p.split('/').includes('..'))
    throw new Error('runtime compatibility path must be normalized and relative: '+path);
  return p;
}

export function compatibilityEntry(path,bytes){
  const p=cleanPath(path), b=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  return {path:p,size:b.length,sha256:sha256(b)};
}

/* The root is intentionally not a hash of JSON. Its byte framing is stable
   across serializers and rejects path/size ambiguity. Order is meaningful. */
export function compatibilityRoot(domain,entries){
  const seen=new Set(), h=createHash('sha256');
  h.update(String(domain)+'\0','utf8');
  for(const row of entries){
    const path=cleanPath(row.path);
    if(seen.has(path)) throw new Error('duplicate runtime compatibility path: '+path);
    if(!Number.isSafeInteger(row.size)||row.size<0)
      throw new Error('invalid runtime compatibility size for '+path);
    if(!/^[0-9a-f]{64}$/.test(row.sha256||''))
      throw new Error('invalid runtime compatibility sha256 for '+path);
    seen.add(path);
    h.update(Buffer.from(String(Buffer.byteLength(path)) + ':', 'utf8'));
    h.update(path,'utf8');
    h.update('\0'+row.size+'\0'+row.sha256+'\n','utf8');
  }
  return h.digest('hex');
}

export function buildRuntimeCompatibility({buildVersion,channel,manifestArtifacts,balancePaths,
                                           excluded=[]}){
  if(!/^\d+\.\d+\.\d+$/.test(buildVersion||''))
    throw new Error('runtime compatibility buildVersion must be x.y.z');
  if(!/^[a-z][a-z0-9-]*$/.test(channel||''))
    throw new Error('runtime compatibility channel is invalid');
  if(!Array.isArray(manifestArtifacts)||!manifestArtifacts.length)
    throw new Error('runtime compatibility manifest is empty');
  const manifestEntries=manifestArtifacts.map(a=>compatibilityEntry(a.path,a.bytes));
  const byPath=new Map(manifestArtifacts.map(a=>[cleanPath(a.path),a]));
  const authority=(balancePaths||BALANCE_AUTHORITY_V1).map(cleanPath);
  const missing=authority.filter(path=>!byPath.has(path));
  if(missing.length) throw new Error('balance authority absent from runtime manifest: '+missing.join(', '));
  const balanceEntries=authority.map(path=>compatibilityEntry(path,byPath.get(path).bytes));
  return {
    schema:RUNTIME_COMPATIBILITY_SCHEMA,
    schemaVersion:RUNTIME_COMPATIBILITY_SCHEMA_VERSION,
    buildVersion,
    channel,
    manifestHash:compatibilityRoot('massfront.runtime-manifest.v1',manifestEntries),
    balanceHash:compatibilityRoot('massfront.balance-authority.v1',balanceEntries),
    algorithm:{
      leaf:'sha256(raw-artifact-bytes)',
      root:'sha256(domain\\0 + utf8ByteLength(path):path\\0decimalSize\\0leaf\\n for each ordered entry)',
      path:'forward-slash relative path, no traversal',
      manifestOrder:'entrypoint, styles, then boot manifest for packaged; emitted execution order for OTA',
      balanceAuthority:'massfront.balance-authority.v1',
      runtimeGlobal:RUNTIME_COMPATIBILITY_GLOBAL
    },
    manifestEntries,
    balanceEntries,
    excluded:[...excluded]
  };
}
