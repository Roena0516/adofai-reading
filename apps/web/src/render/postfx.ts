/**
 * Screen filters (ADOFAI SetFilter) and bloom as one WebGL pass over the finished 2D frame.
 * Each filter is an approximation of the game's effect; strengths follow the level's intensity.
 */

/** Filters the shader knows, in uniform order (four per vec4). */
export const POSTFX_FILTERS = [
  'Grayscale',
  'Sepia',
  'Invert',
  'Contrast',
  'Aberration',
  'Fisheye',
  'Waves',
  'Glitch',
  'VHS',
  'EightiesTV',
  'Arcade',
  'LED',
  'Compression',
  'Neon',
  'Drawing',
  'Grain',
  'MotionBlur',
  'PixelSnow',
  'Blizzard',
  'Rain',
  'PetalsInstant',
  'Petals',
  'Posterize',
  'Sharpen',
] as const;

const ALIASES: Record<string, string> = {
  Fifties: 'Sepia',
  Funk: 'Neon',
  Handheld: 'Waves',
  NightVision: 'Grayscale',
  Weird3D: 'Aberration',
  Tunnel: 'Fisheye',
  Blur: 'MotionBlur',
  BlurFocus: 'MotionBlur',
  GaussianBlur: 'MotionBlur',
  Static: 'Grain',
  LightWater: 'Waves',
  WaterDrop: 'Waves',
  OilPaint: 'Posterize',
  SuperDot: 'LED',
  HexagonBlack: 'LED',
  EdgeBlackLine: 'Drawing',
};

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uPrev;
uniform vec2 uRes; // CSS pixels, so particles and scanlines look the same on any screen
uniform float uTime;
uniform vec4 uF0; // grayscale sepia invert contrast
uniform vec4 uF1; // aberration fisheye waves glitch
uniform vec4 uF2; // vhs eighties arcade led
uniform vec4 uF3; // compression neon drawing grain
uniform vec4 uF4; // motionblur pixelsnow blizzard rain
uniform vec4 uF5; // petals(instant) petals posterize sharpen
uniform vec4 uBloom; // intensity threshold
uniform vec3 uBloomColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 scene(vec2 uv) { return texture2D(uTex, clamp(uv, 0.0, 1.0)).rgb; }

// falling particles: one per cell, drifting down (dir.y) and sideways
float flakes(vec2 px, float cell, float speed, float size, float drift, float seed) {
  vec2 g = px / cell;
  float col = floor(g.x);
  float off = hash(vec2(col, seed));
  float y = fract(g.y / 6.0 + uTime * speed * (0.6 + off) + off);
  vec2 cellUv = vec2(fract(g.x + sin(uTime * 1.3 + off * 6.28) * drift), y * 6.0);
  float row = floor(cellUv.y);
  float show = step(0.55, hash(vec2(col, row + seed)));
  vec2 d = vec2(cellUv.x - 0.5, fract(cellUv.y) - 0.5);
  return show * (1.0 - smoothstep(size * 0.3, size, length(d)));
}

void main() {
  vec2 uv = vUv;
  float t = uTime;
  vec2 px = uv * uRes;

  // --- geometry: fisheye, waves, VHS jitter, glitch slices, pixel grids
  if (uF1.y > 0.0) {
    vec2 d = uv - 0.5;
    // gentle barrel: Feral's Fisheye 48 keeps its side bars almost straight in the game
    uv = 0.5 + d * (1.0 - min(uF1.y, 2.0) * 0.3 * dot(d, d));
  }
  if (uF1.z > 0.0) {
    uv.x += sin(uv.y * 24.0 + t * 5.0) * 0.012 * uF1.z;
    uv.y += cos(uv.x * 18.0 + t * 4.0) * 0.008 * uF1.z;
  }
  if (uF2.x > 0.0) {
    float line = floor(px.y / 3.0);
    uv.x += (hash(vec2(line, floor(t * 24.0))) - 0.5) * 0.004 * uF2.x;
    float band = step(0.985, hash(vec2(floor(t * 8.0), 7.0))) * step(abs(uv.y - fract(t * 0.37)), 0.03);
    uv.x += band * 0.03 * uF2.x;
  }
  float glitch = uF1.w;
  vec2 split = vec2(0.0);
  if (glitch > 0.0) {
    float band = floor(uv.y * 22.0);
    float tick = floor(t * 12.0);
    float n = hash(vec2(band, tick));
    if (n > 1.0 - 0.3 * min(glitch, 1.5)) uv.x += (hash(vec2(band, tick + 3.0)) - 0.5) * 0.12 * glitch;
    split = vec2(0.006 * glitch * (hash(vec2(tick, 1.0)) - 0.3), 0.0);
  }
  vec2 cellUv = uv;
  float led = uF2.w;
  float comp = uF3.x;
  float arcade = uF2.z;
  if (comp > 0.0) {
    float block = 2.0 + 2.0 * min(comp, 2.0);
    cellUv = (floor(uv * uRes / block) + 0.5) * block / uRes;
  }
  if (led > 0.0) {
    float cell = 7.0;
    cellUv = (floor(uv * uRes / cell) + 0.5) * cell / uRes;
  }

  // --- colour with chromatic aberration (and glitch split)
  vec2 ab = (uv - 0.5) * 0.014 * uF1.x + vec2(0.0025 * uF1.x, 0.0) + split;
  vec3 col = vec3(scene(cellUv + ab).r, scene(cellUv).g, scene(cellUv - ab).b);
  // compression only smears in faint blocks (Timeline's Compression 150 is barely visible in the game)
  if (comp > 0.0) col = mix(vec3(scene(uv + ab).r, scene(uv).g, scene(uv - ab).b), col, 0.35 * min(comp, 1.0));

  // --- edges for neon, drawing and sharpen
  if (uF3.y > 0.0 || uF3.z > 0.0 || uF5.w > 0.0) {
    vec2 e = 1.5 / uRes;
    vec3 ctl = scene(uv + vec2(-e.x, e.y)), ctc = scene(uv + vec2(0.0, e.y)), ctr = scene(uv + e);
    vec3 cml = scene(uv - vec2(e.x, 0.0)), cmr = scene(uv + vec2(e.x, 0.0));
    vec3 cbl = scene(uv - e), cbc = scene(uv - vec2(0.0, e.y)), cbr = scene(uv + vec2(e.x, -e.y));
    float tl = luma(ctl), tc = luma(ctc), tr = luma(ctr), ml = luma(cml), mr = luma(cmr);
    float bl = luma(cbl), bc = luma(cbc), br = luma(cbr);
    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -bl - 2.0 * bc - br + tl + 2.0 * tc + tr;
    float edge = clamp(length(vec2(gx, gy)), 0.0, 1.0);
    if (uF3.y > 0.0) {
      // only the outlines glow, in the colour of their bright side; flat areas (even white ones) go black
      vec3 hi = max(max(max(ctl, ctc), max(ctr, cml)), max(max(cmr, cbl), max(cbc, cbr)));
      vec3 neon = hi * smoothstep(0.04, 0.5, edge) * 1.6;
      col = mix(col, neon, min(uF3.y, 1.0));
    }
    if (uF3.z > 0.0) {
      vec3 paper = vec3(0.95, 0.93, 0.88);
      float ink = smoothstep(0.08, 0.45, edge);
      float shade = 0.85 + 0.15 * step(0.5, fract((px.x + px.y) / 6.0)) * step(luma(col), 0.35);
      vec3 drawing = paper * (1.0 - ink * 0.85) * shade;
      col = mix(col, drawing, min(uF3.z, 1.0));
    }
    if (uF5.w > 0.0) col += (col - (tl + tc + tr + ml + mr + bl + bc + br) / 8.0) * uF5.w;
  }

  // --- bloom: bright parts of the frame, spread and tinted
  if (uBloom.x > 0.0) {
    float th = clamp(uBloom.y, 0.0, 0.98);
    vec3 glow = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      for (int r = 1; r <= 3; r++) {
        vec2 o = vec2(cos(a), sin(a)) * float(r * r) * 3.0 / uRes;
        vec3 s = scene(uv + o);
        glow += s * max(0.0, luma(s) - th) / (1.0 - th);
      }
    }
    // screen blend: bright parts glow without the whole frame burning out to white
    vec3 g = clamp(glow / 36.0 * uBloom.x * 1.6 * uBloomColor, 0.0, 1.0);
    col = 1.0 - (1.0 - col) * (1.0 - g);
  }

  // --- colour grading
  float gray = luma(col);
  col = mix(col, vec3(gray), clamp(uF0.x, 0.0, 1.0));
  vec3 sep = vec3(dot(col, vec3(0.393, 0.769, 0.189)), dot(col, vec3(0.349, 0.686, 0.168)), dot(col, vec3(0.272, 0.534, 0.131)));
  col = mix(col, sep, clamp(uF0.y, 0.0, 1.0));
  col = mix(col, 1.0 - col, clamp(uF0.z, 0.0, 1.0));
  col = (col - 0.5) * (1.0 + uF0.w * 1.2) + 0.5;
  if (uF5.z > 0.0) {
    float levels = mix(12.0, 3.0, clamp(uF5.z, 0.0, 1.0));
    col = floor(col * levels + 0.5) / levels;
  }
  if (comp > 0.0) {
    float levels = mix(64.0, 24.0, clamp(comp, 0.0, 1.0));
    col = mix(col, floor(col * levels + 0.5) / levels, 0.5);
  }

  // --- screens: LED dots, scanlines, TV looks
  if (led > 0.0) {
    vec2 c = fract(uv * uRes / 7.0) - 0.5;
    float dotMask = 1.0 - smoothstep(0.32, 0.45, length(c));
    col = mix(col, col * dotMask * 1.4, min(led, 1.0));
  }
  float scan = max(max(uF2.y, arcade), uF2.x * 0.6);
  if (scan > 0.0) {
    float s = 0.5 + 0.5 * sin(px.y * 3.14159 / 1.5);
    col *= 1.0 - min(scan, 1.0) * (1.0 - s) * 0.3;
  }
  if (uF2.y > 0.0) {
    vec2 d = vUv - 0.5;
    col *= 1.0 - min(uF2.y, 1.0) * dot(d, d) * 1.1;
    col = mix(col, col * vec3(1.08, 0.98, 0.9), min(uF2.y, 1.0));
  }
  if (uF2.x > 0.0) {
    col = mix(col, vec3(luma(col)) * vec3(1.05, 0.95, 1.1), 0.25 * min(uF2.x, 1.0));
    col += (hash(vec2(floor(px.y / 2.0), floor(t * 30.0))) - 0.5) * 0.08 * uF2.x;
  }
  if (arcade > 0.0) col = mix(col, col * 1.15, min(arcade, 1.0));

  // --- weather and grain
  if (uF3.w > 0.0) col += (hash(px + fract(t) * 91.7) - 0.5) * 0.3 * uF3.w;
  if (uF4.y > 0.0) col = mix(col, vec3(1.0), flakes(floor(px / 3.0) * 3.0, 42.0, 0.05, 0.12, 0.15, 3.0) * min(uF4.y, 1.0));
  if (uF4.z > 0.0) {
    vec2 sk = vec2(px.x + px.y * 0.35, px.y);
    // soft, small flakes in two depths, like snow drifting past the camera
    float f = flakes(sk, 26.0, 0.11, 0.1, 0.3, 11.0) * 0.6 + flakes(sk * 1.7, 34.0, 0.16, 0.07, 0.4, 5.0) * 0.35;
    col = mix(col, vec3(0.92, 0.95, 1.0), min(1.0, f) * min(uF4.z, 1.0) * 0.55);
    col = mix(col, vec3(0.85, 0.88, 0.95), 0.06 * min(uF4.z, 1.0));
  }
  if (uF4.w > 0.0) {
    vec2 rp = vec2(px.x + px.y * 0.18, px.y);
    float colId = floor(rp.x / 9.0);
    float off = hash(vec2(colId, 2.0));
    float y = fract(rp.y / uRes.y * 1.5 + t * (1.4 + off) + off);
    float streak = step(0.82, fract(y * 3.0)) * step(0.45, off) * (1.0 - abs(fract(rp.x / 9.0) - 0.5) * 6.0);
    col = mix(col, vec3(0.75, 0.82, 0.95), clamp(streak, 0.0, 1.0) * 0.55 * min(uF4.w, 1.0));
    col *= 1.0 - 0.12 * min(uF4.w, 1.0);
  }
  float petals = max(uF5.x, uF5.y);
  if (petals > 0.0) {
    float f = flakes(px, 64.0, 0.06, 0.18, 0.35, 21.0);
    col = mix(col, vec3(1.0, 0.72, 0.82), f * min(petals, 1.0));
  }

  // --- motion blur: bright things leave a fading trail (uF4.x = share of the previous frame), but the
  // trail only lightens, so tiles and planets in this frame stay as sharp as they are
  if (uF4.x > 0.0) col = max(col, mix(col, texture2D(uPrev, vUv).rgb, uF4.x));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const BLIT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
void main() { gl_FragColor = texture2D(uTex, vUv); }`;

function compile(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const program = gl.createProgram()!;
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
    gl.attachShader(program, sh);
  }
  gl.bindAttribLocation(program, 0, 'aPos');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? 'link');
  return program;
}

export interface PostFxInput {
  filters: Record<string, number>;
  bloom: { intensity: number; threshold: number; color: [number, number, number, number] };
  time: number;
  /** Seconds since the previous frame (motion blur fades by time, not by frame). */
  dt: number;
  /** Device pixels per CSS pixel of the source canvas. */
  pixelRatio: number;
}

/** Motion blur keeps at most this share of the previous frame, so tiles and planets stay readable. */
const TRAIL_MAX = 0.55;

/**
 * Share of the previous frame motion blur keeps this frame. Levels use intensities from 100 to 1000;
 * the trail grows with the log of it, halves about every 1/60 s at full strength, and never covers more
 * than TRAIL_MAX of the frame.
 */
export function motionTrail(intensity: number, dt: number): number {
  if (intensity <= 0) return 0;
  const strength = Math.min(1, Math.log10(1 + intensity / 10) / 2);
  const per60 = 0.5 * strength;
  return Math.min(TRAIL_MAX, Math.pow(per60, Math.max(0.25, dt * 60)));
}

/** True when the frame needs the WebGL pass at all. */
export function postFxActive(input: Pick<PostFxInput, 'filters' | 'bloom'>): boolean {
  return input.bloom.intensity > 0.5 || Object.keys(input.filters).length > 0;
}

export class PostFx {
  private readonly gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private blit: WebGLProgram | null = null;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private source: WebGLTexture | null = null;
  private targets: Array<{ tex: WebGLTexture; fb: WebGLFramebuffer }> = [];
  private w = 0;
  private h = 0;
  private flip = 0;
  /** Filters this build cannot draw (reported once to the UI). */
  readonly unknown = new Set<string>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext('webgl', {
      premultipliedAlpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!this.gl) return;
    const gl = this.gl;
    try {
      this.program = compile(gl, VERT, FRAG);
      this.blit = compile(gl, VERT, BLIT);
    } catch (e) {
      console.warn('postfx disabled', e);
      this.program = null;
      return;
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.source = this.texture();
    for (const name of [
      'uTex',
      'uPrev',
      'uRes',
      'uTime',
      'uF0',
      'uF1',
      'uF2',
      'uF3',
      'uF4',
      'uF5',
      'uBloom',
      'uBloomColor',
    ])
      this.uniforms.set(name, gl.getUniformLocation(this.program, name));
  }

  get supported(): boolean {
    return !!this.gl && !!this.program;
  }

  private texture(): WebGLTexture {
    const gl = this.gl!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private resize(w: number, h: number): void {
    const gl = this.gl!;
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    for (const t of this.targets) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fb);
    }
    this.targets = [0, 1].map(() => {
      const tex = this.texture();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fb };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Draw `source` through the filters onto this canvas. */
  render(source: HTMLCanvasElement, input: PostFxInput): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.blit || !this.source) return;
    this.resize(source.width, source.height);
    const f = new Float32Array(24);
    let blur = 0;
    for (const [rawName, value] of Object.entries(input.filters)) {
      const name = ALIASES[rawName] ?? rawName;
      const i = (POSTFX_FILTERS as readonly string[]).indexOf(name);
      if (i < 0) {
        this.unknown.add(rawName);
        continue;
      }
      f[i] = Math.max(f[i]!, Math.min(3, value / 100));
      if (name === 'MotionBlur') blur = Math.max(blur, value);
    }
    f[POSTFX_FILTERS.indexOf('MotionBlur')] = motionTrail(blur, input.dt);
    const u = (n: string) => this.uniforms.get(n) ?? null;

    gl.bindTexture(gl.TEXTURE_2D, this.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    const prev = this.targets[this.flip]!;
    const next = this.targets[1 - this.flip]!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, next.fb);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.source);
    gl.uniform1i(u('uTex'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, prev.tex);
    gl.uniform1i(u('uPrev'), 1);
    const ratio = Math.max(0.5, input.pixelRatio);
    gl.uniform2f(u('uRes'), this.w / ratio, this.h / ratio);
    gl.uniform1f(u('uTime'), input.time);
    for (let k = 0; k < 6; k++)
      gl.uniform4f(u(`uF${k}`), f[k * 4]!, f[k * 4 + 1]!, f[k * 4 + 2]!, f[k * 4 + 3]!);
    gl.uniform4f(u('uBloom'), input.bloom.intensity / 100, input.bloom.threshold / 100, 0, 0);
    const [r, g, b] = input.bloom.color;
    gl.uniform3f(u('uBloomColor'), r / 255, g / 255, b / 255);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.blit);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, next.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.flip = 1 - this.flip;
  }
}
