/* tools/chrome-gpu.mjs — Playwright / Chrome launch for MASSFRONT QA.

   Production is the hand-written WebGL2 battle renderer on the device GPU
   (Capacitor WebView / player Chrome). Do not replace it with Filament,
   Three.js, Babylon, Unity, or Godot.

   ANGLE SwiftShader (`--use-angle=swiftshader`) was Google's CPU OpenGL ES
   used only for headless Chromium/Playwright on machines without a GPU. It is
   unmaintained, strobes/flickers, and is not the APK/iOS/player path.
   Recaptures on this Windows box already ran RTX 4060 D3D11. These args force
   ANGLE D3D11 (Windows) or native GL (elsewhere) and never enable SwiftShader.
   If WebGL reports a software renderer, abort — do not silently fall back. */

import { existsSync } from 'node:fs';

export const CHROME_GPU_ARGS = process.platform === 'win32'
  ? [
      '--use-gl=angle',
      '--use-angle=d3d11',
      '--ignore-gpu-blocklist',
      '--enable-gpu',
      '--disable-gpu-sandbox',
      '--disable-software-rasterizer',
    ]
  : [
      '--use-gl=angle',
      '--use-angle=gl',
      '--ignore-gpu-blocklist',
      '--enable-gpu',
      '--disable-gpu-sandbox',
      '--disable-software-rasterizer',
    ];

const CHROME_CANDIDATES = process.platform === 'win32'
  ? [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ]
  : [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    ];

export function chromeExecutablePath() {
  for (const p of CHROME_CANDIDATES) {
    if (p && existsSync(p)) return p;
  }
  return undefined;
}

/** Playwright launch options: hardware GPU, never SwiftShader.
    Do not call chromium.launch() with these directly — that piles up Chrome
    processes. Use `launchPwBrowser()` from `./pw-browser.mjs`. */
export function playwrightGpuLaunch(overrides = {}) {
  const { extraArgs, args, executablePath, ...rest } = overrides;
  const exe = executablePath !== undefined ? executablePath : chromeExecutablePath();
  const opts = {
    headless: true,
    args: [...CHROME_GPU_ARGS, ...(args || []), ...(extraArgs || [])],
    ...rest,
  };
  if (exe) opts.executablePath = exe;
  return opts;
}

const SOFTWARE_GPU = /swiftshader|software|llvmpipe|lavapipe|microsoft basic render/i;

export async function readGpuRenderer(page) {
  return page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl2', { powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true })
        || c.getContext('webgl2', { powerPreference: 'high-performance' });
      if (!g) return { renderer: 'NO-WEBGL2', vendor: '' };
      const d = g.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: d ? String(g.getParameter(d.UNMASKED_RENDERER_WEBGL)) : String(g.getParameter(g.RENDERER)),
        vendor: d ? String(g.getParameter(d.UNMASKED_VENDOR_WEBGL)) : String(g.getParameter(g.VENDOR)),
      };
    } catch (e) {
      return { renderer: 'THROW:' + e.message, vendor: '' };
    }
  });
}

/** Fail loudly if this Chromium is on SwiftShader / llvmpipe / no WebGL. */
export async function assertHardwareGpu(page) {
  const gpu = await readGpuRenderer(page);
  const blob = (gpu.renderer || '') + ' ' + (gpu.vendor || '');
  if (!gpu.renderer || gpu.renderer === 'NO-WEBGL2' || gpu.renderer === 'NO-WEBGL' || gpu.renderer.startsWith('THROW:') || SOFTWARE_GPU.test(blob)) {
    throw new Error(
      'REFUSING: no hardware WebGL2 GPU (SwiftShader is retired and must not be used). renderer=' +
      gpu.renderer + ' vendor=' + gpu.vendor +
      ' — launch with --use-gl=angle --use-angle=d3d11 (Windows) on a discrete GPU. Never pass --use-angle=swiftshader.'
    );
  }
  console.log('UNMASKED_RENDERER_WEBGL: ' + gpu.renderer);
  return gpu;
}
