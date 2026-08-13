/* Faction roster icon acceptance capture.

   REAL GPU ONLY (see docs/POSTMORTEM-1.33.31-REGRESSION.md — a software preview
   already sent one investigation down a wrong path).

       node tools/capture-faction-icons.mjs [port]

   This does not screenshot a mock. It calls the shipping unitIconEl() and
   bldIconEl() inside the live page, once per kit, and lays the results out in a
   contact sheet. So what lands in releases/faction-icons is exactly what the
   build and production menus resolve — a wrong role mapping shows up as a wrong
   glyph, not as a passing test.

   Two frames per kit, because both are true and they differ:
     -base   what the player sees immediately, before any async 3D thumbnail
     -final  4 s later, after every thumbnail that exists has faded in
   The faction sheet is the instant, always-correct layer; the 3D render still
   wins when there is one. Comparing the pair shows which entities have neither
   and would have been a bare diamond before this.                            */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = process.argv[2] || '8992';
const OUT = 'releases/faction-icons';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const KITS = ['nova', 'legion', 'syndicate', 'horde'];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: false,
  args: ['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 980, height: 1200 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const where = (m.location() && m.location().url) || '';
  errors.push('CONSOLE ' + m.text().slice(0, 160) + (where ? '  <- ' + where.slice(-50) : ''));
});

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(13000);

const renderer = await page.evaluate(() => { try {
  const g = document.createElement('canvas').getContext('webgl2');
  const e = g.getExtension('WEBGL_debug_renderer_info');
  return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?';
} catch { return '?'; } });
console.log('renderer:', renderer);
if (/swiftshader|software/i.test(renderer)) {
  console.error('REFUSING: software renderer'); await browser.close(); process.exit(3);
}

await page.evaluate(() => {
  const h = id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; };
  h('apOverlay'); h('loadScr');
  try { hideFrontScreens(); applyTheme(); newSkirmish(); } catch {}
});
await page.waitForTimeout(22000);

/* Did the baked sheets actually decode? Reported rather than assumed — an empty
   MF_BM_URL means every icon below silently came from the pre-existing paths. */
const sheets = await page.evaluate(() => Object.keys(
  (typeof MF_BM_URL !== 'undefined' && MF_BM_URL) || {}));
console.log('sheets decoded:', sheets.join(', ') || '(NONE — icons below are the old art)');

const stats = [];
for (const kit of KITS) {
  const info = await page.evaluate(k => {
    document.getElementById('mfIconProbe')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'mfIconProbe';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;'
      + 'background:#0d1016;color:#cfe3ff;font:12px system-ui;padding:14px';
    const title = document.createElement('div');
    title.textContent = k.toUpperCase();
    title.style.cssText = 'font:700 20px system-ui;letter-spacing:.14em;margin-bottom:10px';
    wrap.appendChild(title);

    const grid = (label, items, make) => {
      const h = document.createElement('div');
      h.textContent = label;
      h.style.cssText = 'margin:12px 0 6px;opacity:.6;letter-spacing:.12em';
      wrap.appendChild(h);
      const g = document.createElement('div');
      g.style.cssText = 'display:grid;grid-template-columns:repeat(9,1fr);gap:8px';
      let placed = 0;
      for (const it of items) {
        const c = document.createElement('div');
        c.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;'
          + 'background:#161b24;border:1px solid #232a36;border-radius:6px;padding:6px 2px';
        let el = null;
        try { el = make(it); } catch (e) { }
        if (el) { c.appendChild(el); placed++; }
        const n = document.createElement('div');
        n.textContent = it.label;
        n.style.cssText = 'font-size:9px;opacity:.65;text-align:center;line-height:1.15';
        c.appendChild(n);
        g.appendChild(c);
      }
      wrap.appendChild(g);
      return placed;
    };

    /* Every unit the roster can actually produce, plus the structures the build
       menu surfaces — i.e. the real menu contents, not a sample. */
    const units = [];
    for (let i = 0; i < TYPES.length; i++)
      units.push({ i, label: (TYPES[i] && TYPES[i].name) || ('#' + i) });
    const blds = Object.keys(BT).map(key => ({ key, label: key }));

    const u = grid('UNITS — unitIconEl()', units, it => unitIconEl(it.i, 44, k));
    const b = grid('STRUCTURES — bldIconEl()', blds, it => bldIconEl(it.key, 44, k));
    document.body.appendChild(wrap);

    /* How many of those actually resolved to a faction-sheet sprite? */
    const fac = wrap.querySelectorAll('.facIcon').length;
    const dia = [...wrap.querySelectorAll('span')].filter(s => s.textContent === '◇').length;
    return { units: units.length, blds: blds.length, fac, dia };
  }, kit);

  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${kit}-base.png`, fullPage: true });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/${kit}-final.png`, fullPage: true });
  stats.push({ kit, ...info });
  console.log(`${kit.padEnd(10)} ${info.fac}/${info.units + info.blds} from faction sheet`
    + `   ${info.dia} diamond placeholders`);
}

await page.evaluate(() => document.getElementById('mfIconProbe')?.remove());
writeFileSync(`${OUT}/report.json`, JSON.stringify({ renderer, sheets, stats, errors }, null, 1));
console.log(errors.length ? `\n${errors.length} ERROR(S):\n  ` + errors.slice(0, 12).join('\n  ')
                          : '\nno console errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
