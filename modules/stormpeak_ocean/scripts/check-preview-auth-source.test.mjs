import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("preview metadata contains no baked OAuth credential", () => {
  const preview = read("src/lib/auth/preview.ts");
  assert.doesNotMatch(preview, /PREVIEW_CLIENT_(?:ID|SECRET)/);
  assert.doesNotMatch(preview, /["'][A-Za-z0-9_-]{48,}["']/);
});

test("broker client credentials come only from server environment", () => {
  const server = read("src/lib/auth/server.ts");
  assert.match(server, /const grokClientId = env\("GROK_AUTH_CLIENT_ID"\);/);
  assert.match(server, /const grokClientSecret = env\("GROK_AUTH_CLIENT_SECRET"\);/);
  assert.doesNotMatch(server, /PREVIEW_CLIENT_(?:ID|SECRET)/);
});

test("shared dev user requires an explicit auth-off flag and no database", () => {
  const server = read("src/lib/auth/server.ts");
  const verify = read("src/lib/auth/verify.server.ts");
  assert.match(server, /export const authDisabled = env\("VITE_AUTH_ENABLED"\) === "false";/);
  const branch = verify.slice(verify.indexOf("export async function requireUserId"));
  assert.match(branch, /if \(!authConfigured && !gateIdentityEnabled\(\)\) \{\s*if \(!authDisabled\) \{\s*throw new Error\(/);
  assert.match(branch, /if \(databaseConfigured\) \{\s*throw new Error\(/);
  assert.match(branch, /return DEV_USER_ID;/);
});

test("real environment files are ignored while the example stays visible", () => {
  const ignore = read(".gitignore");
  assert.match(ignore, /^\.env$/m);
  assert.match(ignore, /^\.env\.\*$/m);
  assert.match(ignore, /^!\.env\.example$/m);
  const example = read(".env.example");
  assert.match(example, /^VITE_AUTH_ENABLED=false$/m);
  assert.match(example, /^GROK_AUTH_CLIENT_SECRET=$/m);
});
