/* Read-only extractor for MAPDEFS site counts and biome climates from gl.js.
   Does not execute the engine. Used by the exact-template placement probe. */

const PLANET_FAC = { aelos: 'nova', pyraeth: 'legion', nordhall: 'syndicate', vespera: 'horde' };

export function planetOfRegion(region) {
  if (!region) return 'aelos';
  const i = region.indexOf('_');
  return i < 0 ? region : region.slice(0, i);
}

export function parseBiomeClimates(glSrc) {
  const out = {};
  const re = /([a-z_]+):\{climate:'([^']+)'/g;
  let m;
  while ((m = re.exec(glSrc))) out[m[1]] = m[2];
  return out;
}

function extrasOf(row) {
  const last = row[row.length - 1];
  return (last && typeof last === 'object' && !Array.isArray(last)) ? last : {};
}

export function parseMapDefs(glSrc) {
  const climates = parseBiomeClimates(glSrc);
  const maps = [];
  const legacy = glSrc.match(/const MAPDEFS=\(\(\)=>\{[\s\S]*?const add=/);
  if (legacy) {
    const block = legacy[0];
    const rowRe = /(\w+):\{nm:'([^']+)',ds:'([^']+)',seed:(\d+)([^}]*)\}/g;
    let m;
    while ((m = rowRe.exec(block))) {
      const id = m[1], rest = m[5];
      const num = (k) => {
        const hit = rest.match(new RegExp(k + ':(-?\\d+)'));
        return hit ? (+hit[1]) : 0;
      };
      maps.push(finishMap({
        id, nm: m[2], seed: +m[4], region: null, theme: null,
        city: num('city'), indus: num('indus'),
        outpost: num('outpost'), relic: num('relic'), towns: num('towns'),
        spaceport: num('spaceport'), domes: num('domes'),
        legacy: true
      }, climates));
    }
  }
  const addRe = /add\('([^']+)','([^']+)',(\d+),\[([\s\S]*?)\]\);/g;
  let a;
  while ((a = addRe.exec(glSrc))) {
    const region = a[1], theme = a[2], base = +a[3];
    let sites;
    try { sites = Function(`'use strict'; return [${a[4]}];`)(); }
    catch (e) { throw new Error(`MAPDEFS add(${region}) parse failed: ${e.message}`); }
    for (let i = 0; i < sites.length; i++) {
      const row = sites[i], X = extrasOf(row), S = X === row[row.length - 1] ? row.slice(0, -1) : row;
      maps.push(finishMap({
        id: region + '_' + S[0], nm: S[1], seed: base + i * 7919,
        region, theme, city: S[6] | 0, indus: S[7] | 0,
        outpost: (X.outpost) | 0, relic: (X.relic) | 0, towns: (X.towns) | 0,
        spaceport: (X.spaceport) | 0, domes: (X.domes) | 0,
        infest: X.infest || 0, purpose: X.purpose || null, era: X.era || null,
        legacy: false
      }, climates));
    }
  }
  const seen = new Set();
  return maps.filter(M => { if (seen.has(M.id)) return false; seen.add(M.id); return true; });
}

function finishMap(M, climates) {
  const region = M.region || 'aelos_north';
  M.climate = climates[region] || climates.aelos_north || 'civic';
  M.planet = planetOfRegion(M.region || 'aelos_north');
  M.faction = PLANET_FAC[M.planet] || 'nova';
  M.biome = M.climate;
  M.infest = M.infest || 0;
  M.condition = M.condition || (M.infest ? 'infested' : null);
  M.purpose = M.purpose || null;
  M.era = M.era || null;
  return M;
}
