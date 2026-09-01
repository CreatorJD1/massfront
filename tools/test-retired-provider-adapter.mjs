import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'src/account.js'), 'utf8');

for (const retired of [
  'accounts.google.com/gsi/client',
  'connect.facebook.net/en_US/sdk.js',
  'function signInGoogle',
  'function signInFacebook',
  'function authPrompt',
  'googleClientId',
  'facebookAppId'
]) assert.equal(source.includes(retired), false, `retired provider adapter remains: ${retired}`);

for (const compatibility of [
  "const ACC_KEY='massfront_account_v1'",
  'function accLoad()',
  'function signOut()',
  'function syncPush()',
  'function syncPull()',
  "ACCOUNT.provider==='google'?'Google':'Facebook'"
]) assert.equal(source.includes(compatibility), true, `legacy save compatibility missing: ${compatibility}`);

console.log(JSON.stringify({
  status: 'PASS',
  contract: 'retired-provider-adapter',
  removed: 'external provider SDK and prompt paths',
  preserved: 'legacy linked-account load, display, sign-out and sync migration'
}, null, 2));
