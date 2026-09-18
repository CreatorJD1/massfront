// @ts-nocheck
/** @ts-nocheck */
/** Land is the seafloor rising through the sea — no separate island mesh. */
export { ISLANDS, islandHeight, probeSurface, landLiftM } from "../world/land.js";

export function createIslands() {
  function update() {}
  function dispose() {}
  return { update, dispose, heightAt: () => 0 };
}
