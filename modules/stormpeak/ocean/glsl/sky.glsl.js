// @ts-nocheck
/** @ts-nocheck */
/**
 * Shared sky gradient, so the sky dome and the ocean's reflection sample the
 * exact same environment. `dir` should be a normalized direction.
 */
export const skyGLSL = /* glsl */`
  uniform vec3 uSkyTop;
  uniform vec3 uSkyBottom;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;

  vec3 skyColor(vec3 dir) {
    dir = normalize(dir);
    vec3 sd = normalize(uSunDirection);
    float up = clamp(dir.y, 0.0, 1.0);

    vec3 col = mix(uSkyBottom, uSkyTop, pow(up, 0.46));
    float haze = pow(1.0 - up, 4.2);
    col = mix(col, uSkyBottom * 1.18 + vec3(0.055, 0.05, 0.042), haze * 0.78);

    float sd_dot = max(0.0, dot(dir, sd));
    float disc = smoothstep(0.9992, 0.99982, sd_dot);
    float glow = pow(sd_dot, 220.0) * 0.68 + pow(sd_dot, 8.0) * 0.26;
    col += uSunColor * (disc * 5.8 + glow);
    return col;
  }
`;
