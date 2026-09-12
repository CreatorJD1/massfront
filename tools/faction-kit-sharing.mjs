/* SHARED-ROLE GEOMETRY, CHECKED THE RIGHT WAY ROUND.
 *
 * The three faction conversion gates each asserted that certain role slots
 * resolve to the SAME wrapper function — `kit[7]===kit[20]`, and so on — under
 * the heading "otherwise initFactionKits allocates duplicate GPU meshes for
 * cosmetic clones".
 *
 * That property was deliberately removed, and the factory that removed it says
 * why, in tfcNovaFactory / domLegionFactory:
 *
 *   "keying on `fn` alone handed slot 7's wrapper to Reaper, Cinder and
 *    Harbinger and slot 6's to the Lancer, so four bespoke packs were built
 *    and never reached a vertex."
 *
 * Each slot carries its own bespoke decoration pack. Sharing one wrapper
 * across slots meant three of every four bespoke packs were silently
 * discarded — the units built, drew, and looked like the wrong chassis, with a
 * clean console. So the gates were asserting the bug: passing them again would
 * mean reintroducing it.
 *
 * What is actually worth holding is both halves at once:
 *
 *   1. Every wrapper has a unique, stable name. initFactionKits caches
 *      identical builders BY NAME, so a duplicate name is what collapses four
 *      chassis into one — this is the load-bearing property the factory
 *      comment names, and it is cheap to check.
 *   2. A slot that declares a bespoke pack must produce geometry that differs
 *      from the other slots built from the same base builder. That is the
 *      proof the pack reached a vertex.
 *   3. A slot that declares NO pack must still share geometry with its
 *      same-builder siblings — which is the original anti-duplication concern,
 *      kept, and now measured on the bytes rather than on function identity.
 */
import { createHash } from 'node:crypto';

const hash = (mesh) => createHash('sha1')
  .update(Buffer.from(mesh.v.buffer, mesh.v.byteOffset, mesh.v.byteLength))
  .update(Buffer.from(mesh.i.buffer, mesh.i.byteOffset, mesh.i.byteLength))
  .digest('hex');

/* `kit[slot].name` is 'tfcBlue7_mdlTfcLauncher' — the slot prefix the factory
   stamps on, then the base builder it wraps. The suffix is what says two slots
   are the same chassis. */
const baseBuilder = (fn) => {
  const name = String(fn && fn.name || '');
  const at = name.indexOf('_');
  return at > 0 ? name.slice(at + 1) : name;
};

/* What a slot's decoration actually DOES, not what it is called.
   The Legion's Wasp and Kestrel packs are distinct objects with distinct ids
   ("legion-wasp-v2" / "legion-kestrel-v2") and identical `surfaces` maps, so
   they make the same substitutions and the two chassis legitimately build the
   same bytes. Comparing pack presence or identity would call that a lost pack;
   comparing the substitution is what tells the two cases apart. */
const decorationEffect = (pack, decor) => JSON.stringify([
  pack && pack.surfaces ? pack.surfaces : null,
  pack && pack.maps ? pack.maps : null,
  decor ? String(decor) : null
]);

export function assertKitSharing({ label, kit, production, packs = {}, decor = {}, fail }) {
  const throwing = fail || ((message) => { throw new Error(message); });

  /* 1. Unique wrapper names. */
  const byName = new Map();
  for (const slot of production) {
    const fn = kit[slot];
    if (typeof fn !== 'function') throwing(`${label} slot ${slot} has no authored builder`);
    const name = fn.name;
    if (!name) throwing(`${label} slot ${slot} has an anonymous wrapper — initFactionKits caches by name`);
    if (byName.has(name)) {
      throwing(`${label} slots ${byName.get(name)} and ${slot} share the wrapper name "${name}" — `
        + 'initFactionKits caches identical builders by name, so one chassis would replace the other');
    }
    byName.set(name, slot);
  }

  /* 2 and 3. Group slots by the base builder they wrap, then compare bytes. */
  const groups = new Map();
  const signature = new Map();
  for (const slot of production) {
    const model = kit[slot]();
    signature.set(slot, hash(model.hull) + '/' + (model.tur ? hash(model.tur) : '-'));
    const base = baseBuilder(kit[slot]);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(slot);
  }

  let bespoke = 0, shared = 0;
  for (const [base, slots] of groups) {
    if (slots.length < 2) continue;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const [a, b] = [slots[i], slots[j]];
        const same = signature.get(a) === signature.get(b);
        const differentlyDecorated =
          decorationEffect(packs[a], decor[a]) !== decorationEffect(packs[b], decor[b]);
        if (differentlyDecorated && same) {
          throwing(`${label} slots ${a} and ${b} both build ${base} and produce byte-identical geometry, `
            + 'but their bespoke decoration differs — that decoration never reached a vertex');
        }
        if (!differentlyDecorated && !same) {
          throwing(`${label} slots ${a} and ${b} both build ${base} with identical decoration, yet their `
            + 'geometry differs — that is a duplicate GPU mesh for a cosmetic clone');
        }
        if (differentlyDecorated) bespoke++; else shared++;
      }
    }
  }

  return {
    slots: production.length,
    distinctGeometries: new Set(signature.values()).size,
    sharedBuilderGroups: [...groups.values()].filter(s => s.length > 1).length,
    bespokePairs: bespoke,
    sharedPairs: shared
  };
}
