// @ts-nocheck
/** @ts-nocheck */
/** Land is the seafloor rising through the sea — no separate island mesh. */
import { seabedMetres } from "../world/abyss.js";
export { ISLANDS, islandHeight, landLiftM } from "../world/land.js";

export function probeSurface(x, z, ents) {
  /* Uplift alone is not dry land: the underlying shelf or trench matters. */
  if (seabedMetres(x, z) < -0.9) return "land";
  if (ents) {
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive || !e.building) continue;
      if (Math.hypot(e.x - x, e.z - z) < (e.radius || 14) + 16) return "land";
    }
  }
  return "water";
}

export function createIslands() {
  function update() {}
  function dispose() {}
  return { update, dispose, heightAt: () => 0 };
}
