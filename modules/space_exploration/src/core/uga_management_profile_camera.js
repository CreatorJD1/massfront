/* --------------------------------------------------------------------------
   NEXUS-VII management profile framing

   The cutaway is authored longitudinally: X is ship length, Y is depth, and
   Z is height. Management therefore looks straight through the open -Y side
   with Z up. Keeping this math free of Three.js makes the camera contract
   cheap to regression-test without constructing a WebGL renderer.
   -------------------------------------------------------------------------- */

export const UGA_MANAGEMENT_PROFILE_CAMERA = Object.freeze({
  viewAxis: Object.freeze([0, 1, 0]),
  upAxis: Object.freeze([0, 0, 1]),
  cameraSide: 'negative-y',
  maximumFrameFraction: 0.86,
  minimumAspect: 0.35
});

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function fitUgaManagementProfile(bounds, fovDegrees = 42, aspect = 1) {
  const min = bounds?.min || {};
  const max = bounds?.max || {};
  const minX = finite(min.x, -30);
  const minY = finite(min.y, -4.5);
  const minZ = finite(min.z, -1);
  const maxX = Math.max(minX + 0.01, finite(max.x, 30));
  const maxY = Math.max(minY + 0.01, finite(max.y, 4.5));
  const maxZ = Math.max(minZ + 0.01, finite(max.z, 11));
  const center = {
    x: (minX + maxX) * 0.5,
    y: (minY + maxY) * 0.5,
    z: (minZ + maxZ) * 0.5
  };
  const halfWidth = (maxX - minX) * 0.5;
  const halfDepth = (maxY - minY) * 0.5;
  const halfHeight = (maxZ - minZ) * 0.5;
  const safeAspect = Math.max(UGA_MANAGEMENT_PROFILE_CAMERA.minimumAspect, finite(aspect, 1));
  const safeFov = Math.max(10, Math.min(100, finite(fovDegrees, 42)));
  const verticalTangent = Math.tan(safeFov * Math.PI / 360);
  const usable = UGA_MANAGEMENT_PROFILE_CAMERA.maximumFrameFraction;
  const nearestPlaneDistance = Math.max(
    halfWidth / Math.max(0.001, verticalTangent * safeAspect * usable),
    halfHeight / Math.max(0.001, verticalTangent * usable)
  );
  const distance = halfDepth + nearestPlaneDistance;

  return Object.freeze({
    position: Object.freeze([center.x, center.y - distance, center.z]),
    target: Object.freeze([center.x, center.y, center.z]),
    up: UGA_MANAGEMENT_PROFILE_CAMERA.upAxis,
    distance,
    aspect: safeAspect
  });
}
