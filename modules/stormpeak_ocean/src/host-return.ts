export const STORMPEAK_RETURN_KEY = 'massfront.stormpeak.return.v1';

export type StormpeakReturnTicket = {
  schemaVersion: 1;
  kind: 'MassfrontStormpeakReturnV1';
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  hostUrl: string;
  resume: 'settings' | 'warScr';
};

function readTicket(): StormpeakReturnTicket | null {
  try {
    const rec = JSON.parse(sessionStorage.getItem(STORMPEAK_RETURN_KEY) || 'null');
    if (!rec || rec.schemaVersion !== 1 || rec.kind !== 'MassfrontStormpeakReturnV1') return null;
    if (typeof rec.nonce !== 'string' || !rec.nonce) return null;
    if (!Number.isFinite(rec.expiresAt) || Date.now() > rec.expiresAt) return null;
    if (typeof rec.hostUrl !== 'string' || !rec.hostUrl) return null;
    return rec as StormpeakReturnTicket;
  } catch {
    return null;
  }
}

function fallbackHostUrl(): string {
  try {
    const here = new URL(location.href);
    if (here.pathname.includes('/modules/stormpeak_ocean/')) {
      return new URL('../../index.html', here).href;
    }
  } catch {
    /* ignore */
  }
  return '../../index.html';
}

export function stormpeakReturnUrl(): string {
  const ticket = readTicket();
  const base = ticket ? ticket.hostUrl : fallbackHostUrl();
  try {
    const url = new URL(base, location.href);
    url.searchParams.set('from', 'stormpeak');
    if (ticket) {
      url.searchParams.set('nonce', ticket.nonce);
      url.searchParams.set('resume', ticket.resume || 'settings');
    }
    return url.href;
  } catch {
    return '../../index.html?from=stormpeak';
  }
}

export function returnToMassfront(): void {
  location.href = stormpeakReturnUrl();
}
