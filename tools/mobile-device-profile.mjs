/* Canonical mobile evidence identity. Browser probes must use this profile
   instead of treating Playwright's `isMobile` flag as a renderer guarantee. */
export const S25_ULTRA_MODEL_PATTERN = /(?:SM-S938|Galaxy\s*S25\s*Ultra)/i;
export const ANDROID_S25_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 15; SM-S938U Build/AP3A.240905.015.A2; wv) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.260 Mobile Safari/537.36';

export const S25_VIEWPORT = Object.freeze({ width: 412, height: 900, dpr: 2 });

export function isAndroidMobileUserAgent(userAgent) {
  const value = String(userAgent || '');
  return /Android/i.test(value) && /Mobile/i.test(value);
}

export function mobileGpuBranchExpected(userAgent) {
  return isAndroidMobileUserAgent(userAgent);
}

export function assertMobileGpuBranch(actual, userAgent, source = 'probe') {
  const expected = mobileGpuBranchExpected(userAgent);
  if (actual !== expected) {
    throw new Error(`${source}: MF_MOBILE_GPU mismatch (expected ${expected}, received ${actual})`);
  }
  return expected;
}
