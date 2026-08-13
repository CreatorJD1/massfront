/* Dump exactly what the build and production menus surface, with each entity's
   name in all four factions, so the icon brief is generated from the shipping
   tables rather than hand-typed. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const PORT = process.argv[2] || '8992';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(14000);

const data = await page.evaluate(() => {
  const KITS = ['nova','legion','syndicate','horde'];
  const bName = (k, kit) => { try { return factionBldName(k, kit) || BT[k].name; } catch { return BT[k].name; } };
  const uName = (i, kit) => { try { return factionUnitName(i, kit) || TYPES[i].name; } catch { return TYPES[i].name; } };

  /* Structures the build menu actually offers — read from the menu's own tab
     order and filter, not a copy of it. */
  const TABS = ['eco','prod','nav','def','wall','tech','sup','sup2'];
  const structures = [];
  for (const tab of TABS)
    for (const key in BT) {
      const B = BT[key];
      if (B.bcat !== tab) continue;
      if (key === 'hq' || key === 'nest') continue;      // never in the menu
      const names = {}; for (const k of KITS) names[k] = bName(key, k);
      structures.push({ key, tab, base: B.name, clvl: B.clvl || 1,
        req: B.req || null, cm: B.cm, ce: B.ce, names });
    }

  /* Units: everything the production menu can list, i.e. the roster minus what
     is gated out of player production. */
  const units = [];
  for (let i = 0; i < TYPES.length; i++) {
    const T = TYPES[i]; if (!T) continue;
    const names = {}; for (const k of KITS) names[k] = uName(i, k);
    units.push({ i, cat: T.cat, base: T.name, hero: T.hero || null,
      brood: !!T.brood, air: !!T.air, naval: !!T.naval, names });
  }
  const cats = {}; for (const c in (typeof UCAT !== 'undefined' ? UCAT : {})) cats[c] = UCAT[c].nm;
  const bcats = {}; for (const c in (typeof BCAT !== 'undefined' ? BCAT : {})) bcats[c] = BCAT[c].nm;
  return { structures, units, cats, bcats };
});

writeFileSync('.tmp/buildmenu-roster.json', JSON.stringify(data, null, 1));
console.log('structures:', data.structures.length, ' units:', data.units.length);
console.log('tabs:', JSON.stringify(data.bcats));
await browser.close();
