import assert from 'node:assert/strict';
import { loadProductionCommanderRosterSnapshot } from '../modules/space_exploration/tools/tests/production-commander-roster.fixture.mjs';
import { MassfrontSoloHost, createMassfrontGalacticEntryTicket, MASSFRONT_GALACTIC_ENTRY_TICKET_KEY } from '../modules/space_exploration/src/host/massfront_solo_host.js';
import { createMemoryStorage, LocalDomainStore, DOMAIN_STORAGE_FORMAT_VERSION, DOMAIN_STATE_SCHEMA_VERSION, COMMANDER1_BY_CAMPAIGN_FACTION } from '../modules/space_exploration/src/domain/index.js';

const roster = await loadProductionCommanderRosterSnapshot();
function createHost(storage = createMemoryStorage(), commissioning = null) {
  const ticket = createMassfrontGalacticEntryTicket('save-recovery-test', {
    commanderRosterSnapshot: roster,
    commanderRosterFingerprint: roster.fingerprint,
    ...(commissioning ? { commissioning } : {})
  });
  return new MassfrontSoloHost({ storage, indexedDB: null, sessionStorage: createMemoryStorage({
    [MASSFRONT_GALACTIC_ENTRY_TICKET_KEY]: JSON.stringify(ticket)
  }) });
}

for (const bad of ['{corrupt', JSON.stringify({ storageFormatVersion: DOMAIN_STORAGE_FORMAT_VERSION + 1, state: {} }), JSON.stringify({ schemaVersion: DOMAIN_STATE_SCHEMA_VERSION + 1 })]) {
  const host = createHost();
  const initial = host.loadCampaignSnapshot();
  host.storage.setItem(host.key, bad);
  assert.throws(() => host.loadCampaignSnapshot(), 'invalid/newer saves must fail visibly instead of returning a new career');
  assert.throws(() => host.saveCampaignSnapshot(initial), 'a failed host load must latch save protection');
  assert.equal(host.storage.getItem(host.key), bad, 'original save bytes must survive');
}

{
  const host = createHost();
  const initial = host.loadCampaignSnapshot();
  host.storage.setItem(host.profileKey, '{corrupt profile');
  assert.throws(() => host.loadCampaignSnapshot());
  assert.throws(() => host.saveCampaignSnapshot(initial));
  assert.equal(host.storage.getItem(host.profileKey), '{corrupt profile');
}

{
  const first = createHost();
  first.saveCampaignSnapshot(first.loadCampaignSnapshot());
  const host = createHost(first.storage, { factionId: 'nova', commanderId: COMMANDER1_BY_CAMPAIGN_FACTION.nova });
  const snapshot = host.loadCampaignSnapshot();
  assert.equal(snapshot.commissioning.completed, true);
  const store = new LocalDomainStore({ storage: host.storage, key: host.key, initialState: snapshot, commanderCatalogContext: host.commanderCatalogContext });
  const loaded = store.load({ recover: false, snapshot });
  assert.deepEqual(loaded.commissioning, snapshot.commissioning, 'raw pre-commissioning save must not replace merged host snapshot');
  assert.equal(Object.keys(loaded.personnel.commanders).length, 9);
  host.saveCampaignSnapshot(loaded);
  const reloaded = createHost(host.storage).loadCampaignSnapshot();
  assert.deepEqual(reloaded.commissioning, loaded.commissioning);
}

{
  const host = createHost();
  const storage = createMemoryStorage({ damaged: '{corrupt' });
  const store = new LocalDomainStore({ storage, key: 'damaged', commanderCatalogContext: host.commanderCatalogContext });
  const fallback = store.load();
  assert.throws(() => store.save(fallback), 'legacy recover=true must not allow accidental autosave');
  assert.equal(storage.getItem('damaged'), '{corrupt');
}
console.log('PASS Galactic save recovery: corrupt/newer/profile bytes preserved, failed-load saves blocked, host commissioning merge retained, canonical roster round trip.');
