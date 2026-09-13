/* --------------------------------------------------------------------------
   MASSFRONT — UGA WINDOW EMISSIVE BLOOM

   Selective, depth-aware post-processing for authored UGA window materials.
   The pass reuses existing meshes tagged with:

     object.userData.render_role === 'window_emissive'

   No duplicate world geometry, lights, canvas, renderer, or animation loop is
   created. A small fullscreen quad exists only inside the post-process graph.
   -------------------------------------------------------------------------- */

const WINDOW_RENDER_ROLE = 'window_emissive';
const DEFAULT_MAX_SCENE_PIXELS = 1000000;
const DEFAULT_MAX_BLOOM_PIXELS = 262144;
const DEFAULT_BLOOM_SCALE = 0.5;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function renderableObject(object) {
  return Boolean(object && (object.isMesh || object.isPoints || object.isLine || object.isSprite));
}

function taggedWindowMesh(object) {
  return Boolean(
    object
    && object.isMesh
    && object.userData
    && object.userData.render_role === WINDOW_RENDER_ROLE
  );
}

function targetOptions() {
  return {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false
  };
}

function makeColorTarget(width, height, name) {
  const target = new THREE.WebGLRenderTarget(width, height, targetOptions());
  target.texture.name = name;
  target.texture.encoding = THREE.LinearEncoding;
  target.texture.generateMipmaps = false;
  return target;
}

function makeSceneTarget(width, height) {
  const target = makeColorTarget(width, height, 'UGA Window Bloom Scene');
  target.depthBuffer = true;
  target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
  target.depthTexture.name = 'UGA Window Bloom Scene Depth';
  target.depthTexture.format = THREE.DepthFormat;
  target.depthTexture.type = THREE.UnsignedIntType;
  target.depthTexture.minFilter = THREE.NearestFilter;
  target.depthTexture.magFilter = THREE.NearestFilter;
  target.depthTexture.generateMipmaps = false;
  return target;
}

function makeFullscreenVertexShader() {
  return `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;
}

function makeMaskVertexShader() {
  return `
    uniform mat3 uMapTransform;
    varying vec2 vMapUv;
    varying float vViewDistance;

    void main() {
      vMapUv = (uMapTransform * vec3(uv, 1.0)).xy;
      vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
      vViewDistance = max(0.0, -viewPosition.z);
      gl_Position = projectionMatrix * viewPosition;
    }
  `;
}

function makeMaskFragmentShader() {
  return `
    uniform sampler2D uEmissionMap;
    uniform sampler2D uSceneDepth;
    uniform vec2 uMaskResolution;
    uniform vec3 uEmissionColor;
    uniform float uEmissionStrength;
    uniform float uMapIsSrgb;
    uniform float uAlphaCutoff;
    uniform float uFogDensity;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform float uDepthTolerance;
    varying vec2 vMapUv;
    varying float vViewDistance;

    vec3 srgbToLinear(vec3 value) {
      vec3 low = value / 12.92;
      vec3 high = pow((value + 0.055) / 1.055, vec3(2.4));
      return mix(low, high, step(vec3(0.04045), value));
    }

    float viewDistanceFromDepth(float depth) {
      float viewZ = (uCameraNear * uCameraFar)
        / ((uCameraFar - uCameraNear) * depth - uCameraFar);
      return max(0.0, -viewZ);
    }

    void main() {
      vec2 screenUv = clamp(gl_FragCoord.xy / uMaskResolution, vec2(0.0), vec2(1.0));
      float sceneDistance = viewDistanceFromDepth(texture2D(uSceneDepth, screenUv).r);
      float tolerance = max(uDepthTolerance, sceneDistance * 0.0015);

      // Reject a luminous surface hidden behind the depth already written by
      // the authored scene. Equality and a small derivative-safe tolerance
      // preserve the visible window itself at half-resolution mask edges.
      if (vViewDistance > sceneDistance + tolerance) discard;

      vec4 mapSample = texture2D(uEmissionMap, vMapUv);
      vec3 mapColor = mix(mapSample.rgb, srgbToLinear(mapSample.rgb), uMapIsSrgb);
      float mapAlpha = mapSample.a;
      if (mapAlpha <= uAlphaCutoff) discard;

      float fogVisibility = exp(-uFogDensity * uFogDensity
        * vViewDistance * vViewDistance);
      vec3 emission = mapColor * uEmissionColor * uEmissionStrength
        * mapAlpha * fogVisibility;
      gl_FragColor = vec4(max(emission, vec3(0.0)), 1.0);
    }
  `;
}

function makeBlurFragmentShader() {
  return `
    uniform sampler2D uInput;
    uniform sampler2D uSceneDepth;
    uniform vec2 uTexelSize;
    uniform vec2 uDirection;
    uniform float uRadius;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform float uDepthSigma;
    varying vec2 vUv;

    float viewDistanceFromDepth(float depth) {
      float viewZ = (uCameraNear * uCameraFar)
        / ((uCameraFar - uCameraNear) * depth - uCameraFar);
      return max(0.0, -viewZ);
    }

    float occlusionWeight(vec2 sampleUv, float centerDistance) {
      float sampleDistance = viewDistanceFromDepth(texture2D(uSceneDepth, sampleUv).r);
      float fartherBy = max(0.0, sampleDistance - centerDistance);
      float sigma = max(uDepthSigma, centerDistance * 0.004);
      return exp(-(fartherBy * fartherBy) / max(0.0001, 2.0 * sigma * sigma));
    }

    void main() {
      float centerDistance = viewDistanceFromDepth(texture2D(uSceneDepth, vUv).r);
      vec2 stepUv = uDirection * uTexelSize * uRadius;
      vec3 color = texture2D(uInput, vUv).rgb * 0.2270270270;
      float totalWeight = 0.2270270270;

      vec2 uvP1 = vUv + stepUv;
      vec2 uvN1 = vUv - stepUv;
      vec2 uvP2 = vUv + stepUv * 2.0;
      vec2 uvN2 = vUv - stepUv * 2.0;
      vec2 uvP3 = vUv + stepUv * 3.0;
      vec2 uvN3 = vUv - stepUv * 3.0;
      vec2 uvP4 = vUv + stepUv * 4.0;
      vec2 uvN4 = vUv - stepUv * 4.0;

      float wP1 = 0.1945945946 * occlusionWeight(clamp(uvP1, vec2(0.001), vec2(0.999)), centerDistance);
      float wN1 = 0.1945945946 * occlusionWeight(clamp(uvN1, vec2(0.001), vec2(0.999)), centerDistance);
      float wP2 = 0.1216216216 * occlusionWeight(clamp(uvP2, vec2(0.001), vec2(0.999)), centerDistance);
      float wN2 = 0.1216216216 * occlusionWeight(clamp(uvN2, vec2(0.001), vec2(0.999)), centerDistance);
      float wP3 = 0.0540540541 * occlusionWeight(clamp(uvP3, vec2(0.001), vec2(0.999)), centerDistance);
      float wN3 = 0.0540540541 * occlusionWeight(clamp(uvN3, vec2(0.001), vec2(0.999)), centerDistance);
      float wP4 = 0.0162162162 * occlusionWeight(clamp(uvP4, vec2(0.001), vec2(0.999)), centerDistance);
      float wN4 = 0.0162162162 * occlusionWeight(clamp(uvN4, vec2(0.001), vec2(0.999)), centerDistance);

      color += texture2D(uInput, clamp(uvP1, vec2(0.001), vec2(0.999))).rgb * wP1;
      color += texture2D(uInput, clamp(uvN1, vec2(0.001), vec2(0.999))).rgb * wN1;
      color += texture2D(uInput, clamp(uvP2, vec2(0.001), vec2(0.999))).rgb * wP2;
      color += texture2D(uInput, clamp(uvN2, vec2(0.001), vec2(0.999))).rgb * wN2;
      color += texture2D(uInput, clamp(uvP3, vec2(0.001), vec2(0.999))).rgb * wP3;
      color += texture2D(uInput, clamp(uvN3, vec2(0.001), vec2(0.999))).rgb * wN3;
      color += texture2D(uInput, clamp(uvP4, vec2(0.001), vec2(0.999))).rgb * wP4;
      color += texture2D(uInput, clamp(uvN4, vec2(0.001), vec2(0.999))).rgb * wN4;
      totalWeight += wP1 + wN1 + wP2 + wN2 + wP3 + wN3 + wP4 + wN4;

      gl_FragColor = vec4(color / max(totalWeight, 0.0001), 1.0);
    }
  `;
}

function makeCompositeFragmentShader() {
  return `
    uniform sampler2D uScene;
    uniform sampler2D uBloom;
    uniform float uBloomStrength;
    uniform vec3 uBackgroundColor;
    uniform float uUseBackgroundColor;
    varying vec2 vUv;

    void main() {
      vec4 sceneSample = texture2D(uScene, vUv);
      vec3 sceneColor = sceneSample.rgb;
      if (uUseBackgroundColor > 0.5) {
        sceneColor += uBackgroundColor * (1.0 - clamp(sceneSample.a, 0.0, 1.0));
      }
      vec3 bloomColor = texture2D(uBloom, vUv).rgb * uBloomStrength;
      gl_FragColor = vec4(sceneColor + bloomColor, 1.0);
      #include <encodings_fragment>
    }
  `;
}

function captureRendererState(renderer) {
  const viewport = new THREE.Vector4();
  const scissor = new THREE.Vector4();
  const clearColor = new THREE.Color();
  renderer.getViewport(viewport);
  renderer.getScissor(scissor);
  renderer.getClearColor(clearColor);
  return {
    target: renderer.getRenderTarget(),
    viewport,
    scissor,
    scissorTest: renderer.getScissorTest(),
    clearColor,
    clearAlpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear,
    autoClearColor: renderer.autoClearColor,
    autoClearDepth: renderer.autoClearDepth,
    autoClearStencil: renderer.autoClearStencil,
    toneMapping: renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
    outputEncoding: renderer.outputEncoding
  };
}

function restoreRendererState(renderer, state) {
  if (!renderer || !state) return;
  renderer.setRenderTarget(state.target);
  renderer.setViewport(state.viewport.x, state.viewport.y, state.viewport.z, state.viewport.w);
  renderer.setScissor(state.scissor.x, state.scissor.y, state.scissor.z, state.scissor.w);
  renderer.setScissorTest(state.scissorTest);
  renderer.setClearColor(state.clearColor, state.clearAlpha);
  renderer.autoClear = state.autoClear;
  renderer.autoClearColor = state.autoClearColor;
  renderer.autoClearDepth = state.autoClearDepth;
  renderer.autoClearStencil = state.autoClearStencil;
  renderer.toneMapping = state.toneMapping;
  renderer.toneMappingExposure = state.toneMappingExposure;
  renderer.outputEncoding = state.outputEncoding;
}

export class UgaWindowEmissiveBloom {
  constructor(renderer, options = {}) {
    // Three r128's WebGLRenderer predates the public `isWebGLRenderer` marker
    // used by later revisions, so validate the renderer contract directly.
    if (!renderer
      || typeof renderer.render !== 'function'
      || typeof renderer.setRenderTarget !== 'function'
      || typeof renderer.getContext !== 'function') {
      throw new TypeError('UgaWindowEmissiveBloom requires an existing THREE.WebGLRenderer.');
    }
    if (!globalThis.THREE || THREE.REVISION !== '128') {
      throw new Error('UgaWindowEmissiveBloom requires the pinned global Three.js r128 runtime.');
    }

    this.renderer = renderer;
    this.enabled = options.enabled !== false;
    this.maxScenePixels = Math.max(65536, Math.round(finiteNumber(
      options.maxScenePixels,
      DEFAULT_MAX_SCENE_PIXELS
    )));
    this.maxBloomPixels = Math.max(16384, Math.round(finiteNumber(
      options.maxBloomPixels,
      DEFAULT_MAX_BLOOM_PIXELS
    )));
    this.bloomScale = clamp(finiteNumber(options.bloomScale, DEFAULT_BLOOM_SCALE), 0.25, 0.5);
    this.bloomStrength = clamp(finiteNumber(options.bloomStrength, 0.32), 0, 1.5);
    this.blurRadius = clamp(finiteNumber(options.blurRadius, 0.72), 0.35, 1.25);
    this.depthSigma = clamp(finiteNumber(options.depthSigma, 0.34), 0.08, 2.0);
    this.depthTolerance = clamp(finiteNumber(options.depthTolerance, 0.055), 0.005, 0.5);
    this.emissionGain = clamp(finiteNumber(options.emissionGain, 1.0), 0.05, 4.0);
    this.maxEmissionStrength = clamp(finiteNumber(options.maxEmissionStrength, 3.0), 0.5, 6.0);
    this.onTelemetry = typeof options.onTelemetry === 'function' ? options.onTelemetry : null;

    this._disposed = false;
    this._failed = false;
    this._sizeDirty = true;
    this._sceneTarget = null;
    this._emissionTarget = null;
    this._blurTarget = null;
    this._bloomTarget = null;
    this._sceneWidth = 0;
    this._sceneHeight = 0;
    this._bloomWidth = 0;
    this._bloomHeight = 0;
    this._maskMaterials = new Map();

    this._whiteTexture = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    this._whiteTexture.name = 'UGA Window Bloom White Fallback';
    this._whiteTexture.encoding = THREE.LinearEncoding;
    this._whiteTexture.needsUpdate = true;

    this._blurMaterial = new THREE.ShaderMaterial({
      name: 'UGA Window Bloom Depth-Gated Blur',
      uniforms: {
        uInput: { value: null },
        uSceneDepth: { value: null },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
        uDirection: { value: new THREE.Vector2(1, 0) },
        uRadius: { value: this.blurRadius },
        uCameraNear: { value: 0.1 },
        uCameraFar: { value: 300 },
        uDepthSigma: { value: this.depthSigma }
      },
      vertexShader: makeFullscreenVertexShader(),
      fragmentShader: makeBlurFragmentShader(),
      depthTest: false,
      depthWrite: false,
      transparent: false,
      blending: THREE.NoBlending,
      toneMapped: false
    });

    this._compositeMaterial = new THREE.ShaderMaterial({
      name: 'UGA Window Bloom Composite',
      uniforms: {
        uScene: { value: null },
        uBloom: { value: null },
        uBloomStrength: { value: this.bloomStrength },
        uBackgroundColor: { value: new THREE.Color(0, 0, 0) },
        uUseBackgroundColor: { value: 0 }
      },
      vertexShader: makeFullscreenVertexShader(),
      fragmentShader: makeCompositeFragmentShader(),
      depthTest: false,
      depthWrite: false,
      transparent: false,
      blending: THREE.NoBlending,
      toneMapped: false
    });

    this._passScene = new THREE.Scene();
    this._passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._passGeometry = new THREE.PlaneBufferGeometry(2, 2);
    this._passQuad = new THREE.Mesh(this._passGeometry, this._blurMaterial);
    this._passQuad.name = 'UGA Window Bloom Fullscreen Quad';
    this._passQuad.frustumCulled = false;
    this._passScene.add(this._passQuad);

    this.telemetry = {
      enabled: this.enabled,
      failed: false,
      frames: 0,
      bloomFrames: 0,
      directFrames: 0,
      fallbackFrames: 0,
      invalidations: 0,
      windowCount: 0,
      sceneWidth: 0,
      sceneHeight: 0,
      bloomWidth: 0,
      bloomHeight: 0,
      approximateGpuBytes: 0,
      passRenderCalls: 0,
      timingKind: 'cpu-submit',
      lastFrameMs: 0,
      averageFrameMs: 0,
      lastMode: 'uninitialized',
      lastInvalidation: null,
      lastError: null
    };
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.telemetry.enabled = this.enabled;
    return this;
  }

  refresh() {
    // Materials may be replaced when a construction stage completes. Drop only
    // the inexpensive mask-material cache; render targets remain resident.
    this._disposeMaskMaterials();
    return this;
  }

  resize() {
    // The shared engine owns renderer.setSize(). Query its drawing buffer on
    // the next frame so adaptive DPR and pixel-budget changes stay authoritative.
    this._sizeDirty = true;
    return this;
  }

  invalidate(reason = 'manual') {
    if (this._disposed) return this;
    this._disposeTargets();
    this._disposeMaskMaterials();
    this._whiteTexture.needsUpdate = true;
    this._blurMaterial.needsUpdate = true;
    this._compositeMaterial.needsUpdate = true;
    this._failed = false;
    this._sizeDirty = true;
    this.telemetry.failed = false;
    this.telemetry.lastError = null;
    this.telemetry.invalidations++;
    this.telemetry.lastInvalidation = String(reason || 'manual');
    return this;
  }

  getTelemetry() {
    return { ...this.telemetry };
  }

  render(scene, camera) {
    if (this._disposed) throw new Error('UgaWindowEmissiveBloom has been disposed.');
    if (!scene || !scene.isScene || !camera || !camera.isCamera) {
      throw new TypeError('UgaWindowEmissiveBloom.render requires a THREE.Scene and camera.');
    }

    const started = nowMs();
    const rendererState = captureRendererState(this.renderer);
    let windowState = null;
    let completed = false;
    let directReason = null;

    try {
      const context = this.renderer.getContext();
      if (!context || context.isContextLost()) {
        directReason = 'context-lost';
        this._recordFrame(started, directReason, 0, 0);
        return false;
      }

      const sceneObjects = this._collectSceneObjects(scene);
      this.telemetry.windowCount = sceneObjects.windows.length;
      if (!this.enabled) directReason = 'disabled';
      else if (this._failed) directReason = 'failed-disabled';
      else if (sceneObjects.windows.length === 0) directReason = 'no-tagged-windows';

      if (directReason) {
        this.renderer.render(scene, camera);
        completed = true;
        this._recordFrame(started, 'direct', sceneObjects.windows.length, 1, directReason);
        return false;
      }

      this._ensureTargets(rendererState.target);
      // Three r128 writes a Color background through gl.clearColor, bypassing
      // output encoding. Render color backgrounds as transparent here and
      // restore them analytically in the final linear composite. This avoids
      // both broad background lift and RGBA8 quantization of very dark colors.
      const authoredBackground = scene.background;
      const separateColorBackground = Boolean(authoredBackground && authoredBackground.isColor);
      scene.background = separateColorBackground ? null : authoredBackground;
      try {
        this._renderToTarget(this._sceneTarget, () => {
          this.renderer.render(scene, camera);
        });
      } finally {
        scene.background = authoredBackground;
      }

      windowState = this._installWindowMask(scene, camera, sceneObjects);
      try {
        this._renderToTarget(this._emissionTarget, () => {
          this.renderer.render(scene, camera);
        });
      } finally {
        windowState.restore();
        windowState = null;
      }

      this._renderBlur(camera, this._emissionTarget.texture, this._blurTarget, 1, 0);
      this._renderBlur(camera, this._blurTarget.texture, this._bloomTarget, 0, 1);
      this._renderComposite(rendererState, separateColorBackground ? authoredBackground : null);
      completed = true;
      this._recordFrame(started, 'bloom', sceneObjects.windows.length, 5);
      return true;
    } catch (error) {
      if (windowState) {
        try { windowState.restore(); } catch (_) {}
        windowState = null;
      }
      this._failed = true;
      this.telemetry.failed = true;
      this.telemetry.lastError = error && error.message ? error.message : String(error);

      // Restore every externally visible state before drawing the unmodified
      // scene. A failed target or shader must never leave the UGA view blank.
      restoreRendererState(this.renderer, rendererState);
      try {
        this.renderer.render(scene, camera);
        completed = true;
        this._recordFrame(started, 'fallback', this.telemetry.windowCount, 1, this.telemetry.lastError);
        return false;
      } catch (fallbackError) {
        this.telemetry.lastError = `${this.telemetry.lastError}; direct fallback failed: ${fallbackError.message || fallbackError}`;
        throw fallbackError;
      }
    } finally {
      if (windowState) {
        try { windowState.restore(); } catch (_) {}
      }
      restoreRendererState(this.renderer, rendererState);
      if (!completed && directReason === 'context-lost') {
        this.telemetry.lastMode = 'context-lost';
      }
    }
  }

  _collectSceneObjects(scene) {
    const renderables = [];
    const windows = [];
    scene.traverse(object => {
      if (!renderableObject(object)) return;
      renderables.push(object);
      if (taggedWindowMesh(object)) windows.push(object);
    });
    return { renderables, windows };
  }

  _measureTargetSize(previousTarget) {
    let width = 1;
    let height = 1;
    if (previousTarget && previousTarget.width && previousTarget.height) {
      width = previousTarget.width;
      height = previousTarget.height;
    } else if (typeof this.renderer.getDrawingBufferSize === 'function') {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      width = size.x;
      height = size.y;
    } else {
      const canvas = this.renderer.domElement;
      width = canvas.width || canvas.clientWidth || 1;
      height = canvas.height || canvas.clientHeight || 1;
    }

    const sceneScale = Math.min(1, Math.sqrt(this.maxScenePixels / Math.max(1, width * height)));
    const sceneWidth = Math.max(1, Math.round(width * sceneScale));
    const sceneHeight = Math.max(1, Math.round(height * sceneScale));
    let bloomWidth = Math.max(1, Math.round(sceneWidth * this.bloomScale));
    let bloomHeight = Math.max(1, Math.round(sceneHeight * this.bloomScale));
    const bloomPixelScale = Math.min(
      1,
      Math.sqrt(this.maxBloomPixels / Math.max(1, bloomWidth * bloomHeight))
    );
    bloomWidth = Math.max(1, Math.round(bloomWidth * bloomPixelScale));
    bloomHeight = Math.max(1, Math.round(bloomHeight * bloomPixelScale));
    return { sceneWidth, sceneHeight, bloomWidth, bloomHeight };
  }

  _ensureTargets(previousTarget) {
    const size = this._measureTargetSize(previousTarget);
    const changed = this._sizeDirty
      || size.sceneWidth !== this._sceneWidth
      || size.sceneHeight !== this._sceneHeight
      || size.bloomWidth !== this._bloomWidth
      || size.bloomHeight !== this._bloomHeight;
    if (!changed && this._sceneTarget && this._emissionTarget && this._blurTarget && this._bloomTarget) return;

    this._disposeTargets();
    this._sceneWidth = size.sceneWidth;
    this._sceneHeight = size.sceneHeight;
    this._bloomWidth = size.bloomWidth;
    this._bloomHeight = size.bloomHeight;
    this._sceneTarget = makeSceneTarget(this._sceneWidth, this._sceneHeight);
    this._emissionTarget = makeColorTarget(this._bloomWidth, this._bloomHeight, 'UGA Window Bloom Emission');
    this._blurTarget = makeColorTarget(this._bloomWidth, this._bloomHeight, 'UGA Window Bloom Horizontal');
    this._bloomTarget = makeColorTarget(this._bloomWidth, this._bloomHeight, 'UGA Window Bloom Vertical');
    this._blurMaterial.uniforms.uSceneDepth.value = this._sceneTarget.depthTexture;
    this._compositeMaterial.uniforms.uScene.value = this._sceneTarget.texture;
    this._compositeMaterial.uniforms.uBloom.value = this._bloomTarget.texture;
    this._sizeDirty = false;

    this.telemetry.sceneWidth = this._sceneWidth;
    this.telemetry.sceneHeight = this._sceneHeight;
    this.telemetry.bloomWidth = this._bloomWidth;
    this.telemetry.bloomHeight = this._bloomHeight;
    // RGBA8 scene + DEPTH_COMPONENT32 plus three half-resolution RGBA8 targets.
    this.telemetry.approximateGpuBytes = this._sceneWidth * this._sceneHeight * 8
      + this._bloomWidth * this._bloomHeight * 12;
  }

  _renderToTarget(target, draw) {
    this.renderer.setRenderTarget(target);
    // Three r128 applies renderer pixelRatio inside the public setViewport()
    // API even while a render target is bound. setRenderTarget() has already
    // installed the target's physical-pixel viewport; setting it again here
    // would shrink/reframe the entire scene on adaptive-resolution devices.
    this.renderer.setScissorTest(false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.renderer.clear(true, true, false);
    this._assertFramebufferComplete();
    draw();
  }

  _assertFramebufferComplete() {
    const context = this.renderer.getContext();
    const status = context.checkFramebufferStatus(context.FRAMEBUFFER);
    if (status !== context.FRAMEBUFFER_COMPLETE) {
      throw new Error(`UGA window bloom framebuffer is incomplete (0x${status.toString(16)}).`);
    }
  }

  _installWindowMask(scene, camera, sceneObjects) {
    const previousBackground = scene.background;
    const previousOverrideMaterial = scene.overrideMaterial;
    const visibility = [];
    const materials = [];
    const windowSet = new Set(sceneObjects.windows);

    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      for (const record of materials) record.object.material = record.material;
      for (const object of visibility) object.visible = true;
      scene.background = previousBackground;
      scene.overrideMaterial = previousOverrideMaterial;
    };

    try {
      for (const object of sceneObjects.renderables) {
        if (windowSet.has(object)) {
          materials.push({ object, material: object.material });
          const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
          const maskMaterials = sourceMaterials.map(source => this._maskMaterialFor(source, camera, scene));
          object.material = Array.isArray(object.material) ? maskMaterials : maskMaterials[0];
        } else if (object.visible) {
          visibility.push(object);
          object.visible = false;
        }
      }
      scene.background = null;
      scene.overrideMaterial = null;
      return { restore };
    } catch (error) {
      restore();
      throw error;
    }
  }

  _maskMaterialFor(source, camera, scene) {
    const cacheKey = source || this._whiteTexture;
    let material = this._maskMaterials.get(cacheKey);
    if (!material) {
      material = new THREE.ShaderMaterial({
        name: `UGA Window Emission Mask · ${source?.name || 'Fallback'}`,
        uniforms: {
          uEmissionMap: { value: this._whiteTexture },
          uSceneDepth: { value: this._sceneTarget.depthTexture },
          uMaskResolution: { value: new THREE.Vector2(this._bloomWidth, this._bloomHeight) },
          uMapTransform: { value: new THREE.Matrix3() },
          uEmissionColor: { value: new THREE.Color(1, 1, 1) },
          uEmissionStrength: { value: 1 },
          uMapIsSrgb: { value: 0 },
          uAlphaCutoff: { value: 0.005 },
          uFogDensity: { value: 0 },
          uCameraNear: { value: camera.near || 0.1 },
          uCameraFar: { value: camera.far || 300 },
          uDepthTolerance: { value: this.depthTolerance }
        },
        vertexShader: makeMaskVertexShader(),
        fragmentShader: makeMaskFragmentShader(),
        side: source?.side == null ? THREE.FrontSide : source.side,
        depthTest: false,
        depthWrite: false,
        transparent: false,
        blending: THREE.NoBlending,
        toneMapped: false,
        fog: false
      });
      this._maskMaterials.set(cacheKey, material);
    }

    const emissionMap = source?.emissiveMap || source?.map || this._whiteTexture;
    if (emissionMap.matrixAutoUpdate && typeof emissionMap.updateMatrix === 'function') emissionMap.updateMatrix();
    material.uniforms.uEmissionMap.value = emissionMap;
    material.uniforms.uSceneDepth.value = this._sceneTarget.depthTexture;
    material.uniforms.uMaskResolution.value.set(this._bloomWidth, this._bloomHeight);
    material.uniforms.uMapTransform.value.copy(emissionMap.matrix || new THREE.Matrix3());

    const sourceColor = source?.emissive || source?.color;
    material.uniforms.uEmissionColor.value.copy(sourceColor || new THREE.Color(1, 1, 1));
    const extensionStrength = finiteNumber(
      source?.userData?.gltfExtensions?.KHR_materials_emissive_strength?.emissiveStrength,
      NaN
    );
    const runtimeStrength = finiteNumber(source?.emissiveIntensity, 1);
    const authoredStrength = Number.isFinite(extensionStrength)
      ? Math.max(extensionStrength, runtimeStrength)
      : runtimeStrength;
    const opacity = clamp(finiteNumber(source?.opacity, 1), 0, 1);
    material.uniforms.uEmissionStrength.value = clamp(
      authoredStrength * opacity * this.emissionGain,
      0,
      this.maxEmissionStrength
    );
    material.uniforms.uMapIsSrgb.value = emissionMap.encoding === THREE.sRGBEncoding ? 1 : 0;
    material.uniforms.uAlphaCutoff.value = Math.max(0.005, finiteNumber(source?.alphaTest, 0));
    material.uniforms.uFogDensity.value = scene.fog && scene.fog.isFogExp2
      ? Math.max(0, finiteNumber(scene.fog.density, 0))
      : 0;
    material.uniforms.uCameraNear.value = Math.max(0.0001, finiteNumber(camera.near, 0.1));
    material.uniforms.uCameraFar.value = Math.max(
      material.uniforms.uCameraNear.value + 0.001,
      finiteNumber(camera.far, 300)
    );
    material.uniforms.uDepthTolerance.value = this.depthTolerance;
    material.side = source?.side == null ? THREE.FrontSide : source.side;
    return material;
  }

  _renderBlur(camera, inputTexture, target, directionX, directionY) {
    const uniforms = this._blurMaterial.uniforms;
    uniforms.uInput.value = inputTexture;
    uniforms.uSceneDepth.value = this._sceneTarget.depthTexture;
    uniforms.uTexelSize.value.set(1 / this._bloomWidth, 1 / this._bloomHeight);
    uniforms.uDirection.value.set(directionX, directionY);
    uniforms.uRadius.value = this.blurRadius;
    uniforms.uCameraNear.value = Math.max(0.0001, finiteNumber(camera.near, 0.1));
    uniforms.uCameraFar.value = Math.max(uniforms.uCameraNear.value + 0.001, finiteNumber(camera.far, 300));
    uniforms.uDepthSigma.value = this.depthSigma;
    this._passQuad.material = this._blurMaterial;
    this._renderToTarget(target, () => {
      this.renderer.render(this._passScene, this._passCamera);
    });
  }

  _renderComposite(rendererState, backgroundColor = null) {
    this._compositeMaterial.uniforms.uScene.value = this._sceneTarget.texture;
    this._compositeMaterial.uniforms.uBloom.value = this._bloomTarget.texture;
    this._compositeMaterial.uniforms.uBloomStrength.value = this.bloomStrength;
    if (backgroundColor && backgroundColor.isColor) {
      this._compositeMaterial.uniforms.uBackgroundColor.value
        .copy(backgroundColor)
        .convertSRGBToLinear();
      this._compositeMaterial.uniforms.uUseBackgroundColor.value = 1;
    } else {
      this._compositeMaterial.uniforms.uBackgroundColor.value.setRGB(0, 0, 0);
      this._compositeMaterial.uniforms.uUseBackgroundColor.value = 0;
    }
    this._passQuad.material = this._compositeMaterial;
    this.renderer.setRenderTarget(rendererState.target);
    this.renderer.setViewport(
      rendererState.viewport.x,
      rendererState.viewport.y,
      rendererState.viewport.z,
      rendererState.viewport.w
    );
    this.renderer.setScissor(
      rendererState.scissor.x,
      rendererState.scissor.y,
      rendererState.scissor.z,
      rendererState.scissor.w
    );
    this.renderer.setScissorTest(rendererState.scissorTest);
    this.renderer.setClearColor(rendererState.clearColor, rendererState.clearAlpha);
    this.renderer.autoClear = false;
    this.renderer.render(this._passScene, this._passCamera);
  }

  _recordFrame(started, mode, windowCount, passRenderCalls, detail = null) {
    const elapsed = Math.max(0, nowMs() - started);
    const telemetry = this.telemetry;
    telemetry.frames++;
    telemetry.windowCount = windowCount;
    telemetry.passRenderCalls = passRenderCalls;
    telemetry.lastFrameMs = elapsed;
    telemetry.averageFrameMs = telemetry.frames === 1
      ? elapsed
      : telemetry.averageFrameMs + (elapsed - telemetry.averageFrameMs) * 0.08;
    telemetry.lastMode = mode;
    if (mode === 'bloom') telemetry.bloomFrames++;
    else if (mode === 'fallback') telemetry.fallbackFrames++;
    else telemetry.directFrames++;
    if (detail && mode !== 'bloom') telemetry.lastDirectReason = String(detail);
    if (this.onTelemetry) {
      try { this.onTelemetry(this.getTelemetry()); }
      catch (_) {}
    }
  }

  _disposeTargets() {
    for (const key of ['_sceneTarget', '_emissionTarget', '_blurTarget', '_bloomTarget']) {
      const target = this[key];
      if (target) target.dispose();
      this[key] = null;
    }
    this._sceneWidth = 0;
    this._sceneHeight = 0;
    this._bloomWidth = 0;
    this._bloomHeight = 0;
    this.telemetry.sceneWidth = 0;
    this.telemetry.sceneHeight = 0;
    this.telemetry.bloomWidth = 0;
    this.telemetry.bloomHeight = 0;
    this.telemetry.approximateGpuBytes = 0;
  }

  _disposeMaskMaterials() {
    for (const material of this._maskMaterials.values()) material.dispose();
    this._maskMaterials.clear();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.enabled = false;
    this._disposeTargets();
    this._disposeMaskMaterials();
    this._passScene.remove(this._passQuad);
    this._passGeometry.dispose();
    this._blurMaterial.dispose();
    this._compositeMaterial.dispose();
    this._whiteTexture.dispose();
    this._passQuad.material = null;
    this._passQuad = null;
    this._passGeometry = null;
    this._passScene = null;
    this._passCamera = null;
    this.renderer = null;
    this.onTelemetry = null;
    this.telemetry.enabled = false;
    this.telemetry.lastMode = 'disposed';
  }
}

export function createUgaWindowEmissiveBloom(renderer, options) {
  return new UgaWindowEmissiveBloom(renderer, options);
}

export { WINDOW_RENDER_ROLE };
