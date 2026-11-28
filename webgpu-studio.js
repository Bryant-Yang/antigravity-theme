/**
 * Antigravity WebGPU Theme Studio
 * - 5 套原生 Apple Metal / WebGPU WGSL 实时着色器场景：
 *     cyberrain (赛博雨夜+分叉闪电) | cosmic (宇宙星空) | blackhole (星际黑洞)
 *     aurora (极夜北极光) | synthwave (蒸汽波无限网格) | none (纯净编辑室)
 * - 4 项可独立开关交互特效：雨夜闪电 / AI 思考呼吸光环 / 打字微火花 / 点击涟漪
 * - 内置右下角悬浮「主题控制胶囊」：可视化秒切场景、实时拖动透明度与模糊度、自动记忆偏好
 */
(() => {
  const BG_CANVAS_ID = "cosmic-webgpu-bg";
  const WP_MEDIA_ID = "agy-wallpaper-media";
  const HALO_ID = "agy-cursor-halo";
  const FX_CANVAS_ID = "agy-fx-overlay";
  const POMO_BAR_ID = "agy-pomo-bar";
  const UI_ROOT_ID = "agy-theme-studio-root";
  const STORAGE_KEY = "agy-theme-studio-v1";
  const WP_DB_NAME = "agy-theme-wallpaper-db";
  const WP_STORE = "files";
  const INITIAL_SCENE_OVERRIDE = typeof window.__agyInitialScene === "string" ? window.__agyInitialScene : null;

  if (typeof window.__cosmicWebGpuCleanup === "function") {
    try {
      window.__cosmicWebGpuCleanup();
    } catch {
      // ignore previous cleanup
    }
  }

  const DEFAULT_STATE = {
    scene: "cyberrain",
    activeTab: "scenes", // scenes | visual | fx | focus
    alpha: 0.24,
    mainBlur: 0,
    blur: 5,
    chatWidth: 1080, // 720 ~ 1560，>= 1560 视为 100% 满宽
    ecoMode: true,
    lightning: true,
    sceneFxMap: {},
    aiPulse: true,
    spotlight: true,
    typingSparks: true,
    clickRipple: true,
    cursorTrail: false,
    constellation: true,
    cursorHalo: true,
    ambientParticles: true,
    doneChime: true,
    ambientAudio: false,
    ambientVol: 0.28,
    keySound: "off", // off | thock | clicky | typewriter
    keyVol: 0.65,
    autoAccent: true,
    adaptiveComfort: true,
    customAccent: "",
    activeWallpaperId: "",
    wpAutoRotate: false,
    zenMode: false,
    pomoMinutes: 25,
    panelOpen: false,
  };

  function loadState() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      saved = {};
    }
    const merged = { ...DEFAULT_STATE, ...saved, panelOpen: false };
    if (INITIAL_SCENE_OVERRIDE) {
      merged.scene = INITIAL_SCENE_OVERRIDE;
    }
    return merged;
  }

  const state = loadState();
  function saveState() {
    try {
      const { panelOpen, ...persist } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
    } catch {
      // ignore storage errors
    }
  }

  /* ========================================================================
     1. 公共 WGSL 顶点着色器 + 5 套片段着色器
     ======================================================================== */
  const WGSL_COMMON = /* wgsl */ `
    struct Uniforms {
      resolution: vec2f,
      mouse: vec2f,
      time: f32,
      fxFlag: f32,
      aiBusy: f32,
      dayTime: f32,
    };

    @group(0) @binding(0) var<uniform> u: Uniforms;

    struct VsOut {
      @builtin(position) pos: vec4f,
      @location(0) uv: vec2f,
    };

    @vertex
    fn vs(@builtin(vertex_index) idx: u32) -> VsOut {
      var positions = array<vec2f, 3>(
        vec2f(-1.0, -1.0),
        vec2f( 3.0, -1.0),
        vec2f(-1.0,  3.0)
      );
      var out: VsOut;
      let p = positions[idx];
      out.pos = vec4f(p, 0.0, 1.0);
      out.uv = p * 0.5 + 0.5;
      return out;
    }

    fn hash11(p_in: f32) -> f32 {
      var p = fract(p_in * 0.1031);
      p *= p + 33.33;
      p *= p + p;
      return fract(p);
    }

    fn hash21(p_in: vec2f) -> f32 {
      var p = fract(p_in * vec2f(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    fn hash22(p_in: vec2f) -> vec2f {
      let n = vec3f(p_in.x, p_in.y, p_in.x + p_in.y);
      var p3 = fract(n * vec3f(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.xx + p3.yz) * p3.zy);
    }

    fn noise(p: vec2f) -> f32 {
      let i = floor(p);
      let f = fract(p);
      let u_f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u_f.x),
        mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u_f.x),
        u_f.y
      );
    }

    fn fbm(p_in: vec2f) -> f32 {
      var v = 0.0;
      var amp = 0.5;
      var p = p_in;
      let rot = mat2x2f(0.8, 0.6, -0.6, 0.8);
      for (var i = 0; i < 5; i = i + 1) {
        v += amp * noise(p);
        p = rot * p * 2.02 + vec2f(13.7, 7.3);
        amp *= 0.5;
      }
      return v;
    }

    fn aces(col: vec3f) -> vec3f {
      return clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
    }

    // 周期划空流星（用于宇宙星空 / 沙丘星夜专属特效）
    fn shootingStar(uv: vec2f, aspect: f32, t: f32, seed: f32) -> f32 {
      let period = 5.4;
      let cycle = floor(t / period);
      let phase = fract(t / period);
      if (phase > 0.28) { return 0.0; }
      let prog = phase / 0.28;
      let sx = 0.2 + hash11(cycle * 13.7 + seed) * 0.72;
      let sy = 0.56 + hash11(cycle * 29.1 + seed) * 0.34;
      let dir = normalize(vec2f(-0.82, -0.44));
      let head = vec2f(sx, sy) + dir * prog * 0.52;
      let d = (uv - head) * vec2f(aspect, 1.0);
      let dirA = normalize(dir * vec2f(aspect, 1.0));
      let along = dot(d, -dirA);
      let perp = abs(dot(d, vec2f(-dirA.y, dirA.x)));
      let tail = smoothstep(0.22, 0.0, along) * step(0.0, along);
      let core = exp(-perp * 260.0) * tail + exp(-length(d) * 95.0);
      let env = sin(prog * 3.14159);
      return core * env;
    }
  `;

  // --- Scene 1: Cyber Rain + Forked Lightning ---
  const SHADER_CYBERRAIN = WGSL_COMMON + /* wgsl */ `
    fn rainDrops(uv_in: vec2f, scale: vec2f, time: f32) -> vec3f {
      var uv = uv_in;
      uv.y += time * 0.22;
      let st = uv * scale;
      let id = floor(st);
      let gv = fract(st) - 0.5;
      let n = hash21(id);
      let t = time * 1.15 + n * 6.2831;
      let w = uv_in.y * 8.0;
      let x = (n - 0.5) * 0.72 + (0.4 - abs((n - 0.5) * 0.72)) * sin(3.0 * w) * pow(sin(w), 6.0) * 0.35;
      let y = -sin(t + sin(t + sin(t) * 0.5)) * 0.42;
      let dropPos = (gv - vec2f(x, y)) * vec2f(scale.y / scale.x, 1.0);
      let drop = smoothstep(0.055, 0.022, length(dropPos));
      var trailPos = (gv - vec2f(x, time * 0.22)) / vec2f(1.0, 8.0);
      trailPos.y = (fract(trailPos.y * 8.0) - 0.5) / 8.0;
      let trailDist = length(trailPos * vec2f(scale.y / scale.x, 1.0));
      let trailMask = smoothstep(-0.02, 0.02, gv.y - y) * smoothstep(0.5, y, gv.y);
      let trail = smoothstep(0.026, 0.008, trailDist) * trailMask * 0.75;
      let offs = drop * dropPos * 2.4 + trail * trailPos * 1.6;
      return vec3f(offs, clamp(drop + trail, 0.0, 1.0));
    }

    fn lightningBolt(p: vec2f, uvY: f32, time: f32) -> vec2f {
      if (u.fxFlag < 0.5) { return vec2f(0.0); }
      let period = 11.0;
      let cycle = floor(time / period);
      let t = fract(time / period);
      if (t > 0.095) { return vec2f(0.0); }
      // 双闪脉冲
      let flash1 = exp(-pow((t - 0.018) * 65.0, 2.0));
      let flash2 = exp(-pow((t - 0.058) * 52.0, 2.0)) * 0.78;
      let flash = flash1 + flash2;
      let seed = hash11(cycle * 9.31);
      let bx = -0.65 + seed * 1.3;
      // 锯齿状主干
      let jag = (fbm(vec2f(uvY * 9.0, cycle * 3.7)) - 0.5) * 0.24;
      let distMain = abs(p.x - (bx + jag * (1.0 - uvY * 0.3)));
      let bolt = smoothstep(0.014, 0.001, distMain) * smoothstep(0.18, 0.42, uvY);
      // 分叉支流
      let branchOffset = (uvY - 0.58) * (0.45 * select(-1.0, 1.0, seed > 0.5));
      let distBranch = abs(p.x - (bx + jag + branchOffset));
      let branch = smoothstep(0.008, 0.0008, distBranch) * smoothstep(0.32, 0.58, uvY) * smoothstep(0.75, 0.56, uvY) * 0.65;
      let skyGlow = exp(-abs(p.x - bx) * 1.9) * smoothstep(0.1, 0.95, uvY) * 0.34;
      return vec2f((bolt + branch) * flash * 1.5, skyGlow * flash);
    }

    fn cityBackdrop(uv: vec2f, aspect: f32, time: f32) -> vec3f {
      let p = vec2f((uv.x - 0.5) * aspect, uv.y);
      var col = mix(vec3f(0.06, 0.03, 0.12), vec3f(0.016, 0.024, 0.058), smoothstep(0.0, 0.95, uv.y));
      let mist = noise(vec2f(p.x * 2.2 + time * 0.03, uv.y * 3.0)) * 0.6
               + noise(vec2f(p.x * 5.0 - time * 0.05, uv.y * 6.0)) * 0.4;
      let glowCyan = exp(-pow((p.x + 0.42) * 1.6, 2.0)) * exp(-pow((uv.y - 0.28) * 2.4, 2.0));
      let glowMagenta = exp(-pow((p.x - 0.38) * 1.5, 2.0)) * exp(-pow((uv.y - 0.32) * 2.2, 2.0));
      let glowAmber = exp(-pow((p.x - 0.02) * 2.4, 2.0)) * exp(-pow((uv.y - 0.16) * 3.4, 2.0));
      col += vec3f(0.0, 0.72, 0.92) * glowCyan * (0.28 + 0.22 * mist);
      col += vec3f(0.95, 0.16, 0.55) * glowMagenta * (0.26 + 0.22 * mist);
      col += vec3f(1.0, 0.52, 0.18) * glowAmber * (0.18 + 0.16 * mist);

      let lt = lightningBolt(p, uv.y, time);
      col += vec3f(0.75, 0.92, 1.0) * lt.x + vec3f(0.38, 0.56, 0.95) * lt.y * (0.7 + 0.5 * mist);

      let bGrid = vec2f(p.x, uv.y) * 5.2;
      let bId = floor(bGrid);
      let bGv = fract(bGrid) - 0.5;
      for (var y = -1; y <= 1; y = y + 1) {
        for (var x = -1; x <= 1; x = x + 1) {
          let cell = bId + vec2f(f32(x), f32(y));
          let rnd = hash22(cell);
          if (rnd.x < 0.62) { continue; }
          let worldY = (cell.y + 0.5) / 5.2;
          if (worldY > 0.76) { continue; }
          let center = vec2f(f32(x), f32(y)) + (rnd - 0.5) * 0.72;
          let d = length(bGv - center);
          let radius = 0.08 + rnd.y * 0.16;
          let ring = smoothstep(radius, radius * 0.62, d) * (0.55 + 0.45 * smoothstep(radius * 0.2, radius * 0.78, d));
          let pulse = 0.72 + 0.28 * sin(time * (0.7 + rnd.x * 1.4) + rnd.y * 12.0);
          let pick = fract(rnd.x * 13.7);
          var bCol = vec3f(0.08, 0.85, 1.0);
          if (pick < 0.35) { bCol = vec3f(1.0, 0.18, 0.58); }
          else if (pick < 0.62) { bCol = vec3f(0.58, 0.32, 1.0); }
          else if (pick < 0.8) { bCol = vec3f(1.0, 0.62, 0.22); }
          col += bCol * ring * pulse * 0.22 * (1.0 - worldY * 0.65);
        }
      }

      let colIdx = floor((p.x + 2.0) * 14.0);
      let bHeight = 0.10 + hash11(colIdx * 1.37) * 0.26;
      if (uv.y < bHeight) {
        let localX = fract((p.x + 2.0) * 14.0);
        let bldgBase = vec3f(0.015, 0.018, 0.042);
        let edgeNeon = smoothstep(0.08, 0.0, abs(uv.y - bHeight)) * 0.35;
        let isCyanBldg = hash11(colIdx * 7.13) > 0.5;
        let edgeCol = select(vec3f(0.95, 0.2, 0.58), vec3f(0.08, 0.85, 1.0), isCyanBldg);
        let winX = fract(localX * 5.0);
        let winY = fract(uv.y * 95.0);
        let winId = vec2f(floor(localX * 5.0) + colIdx * 7.0, floor(uv.y * 95.0));
        let winOn = step(0.76, hash21(winId));
        let winMask = step(0.24, winX) * step(winX, 0.76) * step(0.28, winY) * step(winY, 0.72) * winOn;
        let winCol = select(vec3f(1.0, 0.72, 0.36), vec3f(0.32, 0.9, 1.0), hash21(winId + 3.1) > 0.45);
        col = mix(col, bldgBase + edgeCol * edgeNeon + winCol * winMask * 0.42, 0.78);
      }

      let slant = vec2f(p.x + uv.y * 0.16, uv.y);
      let streakGrid = vec2f(slant.x * 58.0, slant.y * 7.5 + time * 5.2);
      let sId = floor(streakGrid);
      let sGv = fract(streakGrid);
      if (hash21(sId) > 0.82) {
        let line = smoothstep(0.09, 0.0, abs(sGv.x - 0.5)) * smoothstep(0.0, 0.3, sGv.y) * smoothstep(1.0, 0.3, sGv.y);
        col += vec3f(0.55, 0.82, 1.0) * line * (0.16 + lt.y * 0.65);
      }
      return col;
    }

    @fragment
    fn fs(in: VsOut) -> @location(0) vec4f {
      let res = max(u.resolution, vec2f(1.0));
      let aspect = res.x / res.y;
      let m = (u.mouse - 0.5) * 0.035;
      let t = u.time;
      let uv = in.uv + m * 0.35;
      let d1 = rainDrops(vec2f(uv.x * aspect, uv.y), vec2f(6.5, 2.2), t * 0.85);
      let d2 = rainDrops(vec2f(uv.x * aspect + 2.7, uv.y + 1.3), vec2f(13.0, 4.2), t * 1.15);
      let refractOffs = d1.xy * 0.11 + d2.xy * 0.055;
      let dropMask = clamp(d1.z + d2.z * 0.65, 0.0, 1.0);
      // 单次主采样（比 3 次 RGB 全采样降低 ~65% GPU 开销）+ 雨滴边缘解析色散高光
      var col = cityBackdrop(uv - refractOffs, aspect, t);
      let rim = length(refractOffs) * 9.5;
      let dispTint = vec3f(refractOffs.x * 1.4, 0.0, -refractOffs.x * 1.4) * dropMask * 0.9;
      col += mix(vec3f(0.18, 0.88, 1.0), vec3f(1.0, 0.3, 0.68), uv.x) * rim * dropMask * 0.58 + dispTint;
      let radial = length((in.uv - 0.5) * vec2f(aspect * 0.72, 1.0));
      col *= 1.0 - smoothstep(0.55, 1.45, radial) * 0.36;
      return vec4f(aces(col), 1.0);
    }
  `;

  // --- Scene 2: Cosmic Starry Sky ---
  const SHADER_COSMIC = WGSL_COMMON + /* wgsl */ `
    fn starLayer(uv: vec2f, scale: f32, time: f32, flareStrength: f32) -> vec3f {
      let gv = fract(uv * scale) - 0.5;
      let id = floor(uv * scale);
      var col = vec3f(0.0);
      for (var y = -1; y <= 1; y = y + 1) {
        for (var x = -1; x <= 1; x = x + 1) {
          let offs = vec2f(f32(x), f32(y));
          let rnd = hash22(id + offs);
          let n = rnd.x;
          if (n < 0.72) { continue; }
          let starPos = offs + (rnd - 0.5) * 0.78;
          let d = length(gv - starPos);
          let size = pow((n - 0.72) / 0.28, 2.2) * 0.036 + 0.004;
          let core = smoothstep(size, 0.0, d);
          let halo = exp(-d * 18.0) * (0.28 + 0.45 * size * 18.0);
          var flare = 0.0;
          if (n > 0.94 && flareStrength > 0.0) {
            let dp = gv - starPos;
            flare = (max(0.0, 1.0 - abs(dp.y * 55.0)) * exp(-abs(dp.x) * 8.0)
                   + max(0.0, 1.0 - abs(dp.x * 55.0)) * exp(-abs(dp.y) * 8.0)) * flareStrength * 0.55;
          }
          let twinkle = 0.68 + 0.32 * sin(time * (1.2 + rnd.y * 3.2) + n * 62.83);
          let tintPick = fract(n * 17.31);
          var starColor = vec3f(0.88, 0.93, 1.0);
          if (tintPick < 0.28) { starColor = vec3f(0.66, 0.82, 1.0); }
          else if (tintPick < 0.54) { starColor = vec3f(1.0, 0.87, 0.72); }
          else if (tintPick < 0.72) { starColor = vec3f(0.86, 0.76, 1.0); }
          col += starColor * (core * 1.15 + halo * 0.55 + flare) * twinkle;
        }
      }
      return col;
    }

    @fragment
    fn fs(in: VsOut) -> @location(0) vec4f {
      let res = max(u.resolution, vec2f(1.0));
      let aspect = res.x / res.y;
      let p = (in.uv - 0.5) * vec2f(aspect, 1.0);
      let m = (u.mouse - 0.5) * 0.06;
      let t = u.time;
      let radial = length(p * vec2f(0.75, 1.05));
      var col = mix(vec3f(0.032, 0.044, 0.105), vec3f(0.012, 0.015, 0.038), smoothstep(0.0, 1.25, radial));
      let gp = mat2x2f(0.913, -0.408, 0.408, 0.913) * (p + m * 0.35);
      let band = exp(-abs(gp.y + 0.06 * sin(gp.x * 2.2 + t * 0.06)) * 2.4);
      let q = vec2f(fbm(gp * 1.8 + vec2f(t * 0.014, -t * 0.009)), fbm(gp * 1.8 + vec2f(-t * 0.011, t * 0.013) + vec2f(5.2, 1.3)));
      let neb1 = fbm(gp * 2.2 + q * 1.4 + vec2f(t * 0.008, 0.0));
      let neb2 = fbm(gp * 3.4 - q * 1.1 + vec2f(2.7, -t * 0.01));
      col += vec3f(0.11, 0.28, 0.68) * pow(neb1, 2.2) * (0.38 + 0.52 * band);
      col += vec3f(0.42, 0.21, 0.66) * pow(neb2, 2.6) * (0.28 + 0.48 * band);
      col += vec3f(0.22, 0.62, 0.84) * smoothstep(0.56, 0.92, neb1 * neb2 * 1.65) * 0.32 * band;
      col += vec3f(0.76, 0.42, 0.31) * smoothstep(0.58, 0.92, neb2) * 0.24 * band;
      col += starLayer(p + m * 0.25 + vec2f(t * 0.0035, t * 0.0012), 18.0, t * 0.7, 0.0) * 0.52;
      col += starLayer(p + m * 0.55 + vec2f(t * 0.0065 + 11.3, -t * 0.002 + 4.7), 10.5, t, 0.35) * 0.82;
      col += starLayer(p + m * 0.95 + vec2f(t * 0.01 + 23.1, t * 0.0025 + 19.4), 5.8, t * 1.25, 1.0) * 1.05;
      if (u.fxFlag > 0.5) {
        let m1 = shootingStar(in.uv, aspect, t, 1.3);
        let m2 = shootingStar(in.uv, aspect, t + 2.7, 7.9);
        col += vec3f(0.78, 0.9, 1.0) * (m1 + m2 * 0.75) * 1.15;
      }
      col *= 1.0 - smoothstep(0.55, 1.55, radial) * 0.35;
      return vec4f(aces(col), 1.0);
    }
  `;

  // --- Scene 3: Interstellar Black Hole (Gargantua) ---
  const SHADER_BLACKHOLE = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(in: VsOut) -> @location(0) vec4f {
      let res = max(u.resolution, vec2f(1.0));
      let aspect = res.x / res.y;
      let m = (u.mouse - 0.5) * 0.08;
      // 黑洞略偏右中，给左侧导航栏留出绝佳构图
      let center = vec2f(0.12, 0.02) - m * 0.45;
      let p = (in.uv - 0.5) * vec2f(aspect, 1.0) - center;
      let r = length(p);
      let t = u.time;

      // 引力透镜扭曲后的背景星空
      let lens = 1.0 + 0.075 / (r * r + 0.028);
      let warped = p * lens;
      let starGrid = warped * 14.0;
      let sId = floor(starGrid);
      let sGv = fract(starGrid) - 0.5;
      let sRnd = hash22(sId);
      var stars = vec3f(0.0);
      if (sRnd.x > 0.76) {
        let d = length(sGv - (sRnd - 0.5) * 0.7);
        stars = vec3f(0.95, 0.92, 0.88) * smoothstep(0.05, 0.0, d) * (0.65 + 0.35 * sin(t * 2.0 + sRnd.y * 20.0));
      }

      var col = vec3f(0.014, 0.01, 0.02) + stars * smoothstep(0.17, 0.32, r);

      // 旋转吸积盘（倾斜椭圆 + 弯曲上下光弧）
      let tilt = mat2x2f(0.97, -0.24, 0.24, 0.97) * p;
      let diskP = vec2f(tilt.x, tilt.y * 4.4);
      let dr = length(diskP);
      let ang = atan2(diskP.y, diskP.x);
      let swirl = fbm(vec2f(dr * 9.0 - t * 0.35, ang * 2.5 + t * 0.85));
      let swirl2 = fbm(vec2f(dr * 18.0 - t * 0.6, ang * 4.0 + t * 1.4));

      let diskBand = exp(-pow((dr - 0.36) * 6.5, 2.0)) * smoothstep(0.16, 0.22, dr);
      // 多普勒增亮（左侧向观测者旋转更炽热）
      let doppler = 0.72 + 0.55 * smoothstep(0.5, -0.5, tilt.x);
      let diskColor = mix(vec3f(0.95, 0.36, 0.08), vec3f(1.0, 0.84, 0.52), clamp(swirl * 1.25 * doppler, 0.0, 1.0));
      col += diskColor * diskBand * (0.55 + 0.9 * swirl2) * doppler * 1.35;

      // 引力弯曲形成的爱因斯坦上下光环 + 专属相对论耀斑脉冲
      let flarePulse = 1.0 + u.fxFlag * (0.28 * pow(0.5 + 0.5 * sin(t * 1.65), 3.0) + 0.22 * u.aiBusy);
      let haloRing = exp(-pow((r - 0.195) * 26.0, 2.0));
      let upperArc = exp(-pow((r - 0.22) * 10.5, 2.0)) * (0.45 + 0.55 * abs(sin(atan2(tilt.y, tilt.x))));
      let arcNoise = fbm(vec2f(atan2(tilt.y, tilt.x) * 3.0 + t * 0.55, r * 14.0));
      col += vec3f(1.0, 0.74, 0.38) * (haloRing * 1.45 + upperArc * (0.5 + 0.8 * arcNoise) * 0.95) * flarePulse;

      // 广域暖琥珀散射辉光
      col += vec3f(0.85, 0.42, 0.14) * exp(-r * 3.6) * 0.32;

      // 事件视界绝对黑暗核心
      let horizon = smoothstep(0.162, 0.178, r);
      col *= horizon;

      // 前景吸积盘横穿事件视界前方
      let frontMask = smoothstep(-0.02, 0.05, -tilt.y) * smoothstep(0.12, 0.01, abs(tilt.y));
      col += diskColor * diskBand * frontMask * (0.7 + 0.8 * swirl) * doppler * 1.1;

      return vec4f(aces(col), 1.0);
    }
  `;

  // --- Scene 4: Boreal Aurora ---
  const SHADER_AURORA = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(in: VsOut) -> @location(0) vec4f {
      let res = max(u.resolution, vec2f(1.0));
      let aspect = res.x / res.y;
      let m = (u.mouse - 0.5) * 0.05;
      let p = vec2f((in.uv.x - 0.5) * aspect, in.uv.y) + m * 0.3;
      let t = u.time;

      // 极夜深蓝青天空
      var col = mix(vec3f(0.012, 0.032, 0.068), vec3f(0.008, 0.012, 0.036), smoothstep(0.0, 1.0, in.uv.y));

      // 极地繁星
      let sg = vec2f(p.x, in.uv.y) * 26.0;
      let sr = hash22(floor(sg));
      if (sr.x > 0.84 && in.uv.y > 0.18) {
        let sd = length(fract(sg) - 0.5 - (sr - 0.5) * 0.6);
        let tw = 0.65 + 0.35 * sin(t * (1.5 + sr.y * 3.0) + sr.x * 40.0);
        col += vec3f(0.82, 0.94, 1.0) * smoothstep(0.07, 0.0, sd) * tw * 0.85;
      }

      // 3 层丝绸极光幕布
      for (var i = 0; i < 3; i = i + 1) {
        let fi = f32(i);
        let wave = sin(p.x * (1.8 + fi * 0.55) + t * (0.22 + fi * 0.08) + fi * 2.1) * 0.12
                 + (fbm(vec2f(p.x * 1.4 + t * 0.08, fi * 3.1)) - 0.5) * 0.26;
        let baseH = 0.36 + fi * 0.13 + wave;
        let dy = in.uv.y - baseH;
        // 向下锐利边缘、向上柔和拉丝
        let curtain = exp(-max(dy, 0.0) * (5.2 - fi * 0.6)) * smoothstep(-0.06, 0.025, dy);
        let rays = 0.55 + (0.45 * u.fxFlag + 0.12) * fbm(vec2f(p.x * (6.5 + fi * 2.0) + t * (0.18 + 0.14 * u.fxFlag), in.uv.y * 1.8 - t * 0.12));
        let lowCol = vec3f(0.12, 0.95, 0.64);
        let midCol = vec3f(0.18, 0.72, 0.96);
        let highCol = vec3f(0.62, 0.28, 0.92);
        let aCol = mix(mix(lowCol, midCol, smoothstep(0.0, 0.18, dy)), highCol, smoothstep(0.16, 0.42, dy));
        let ribbonBoost = 1.0 + u.fxFlag * 0.32 * sin(p.x * 4.5 - t * 1.1 + fi * 1.7);
        col += aCol * curtain * rays * (0.48 - fi * 0.08) * ribbonBoost;
      }

      // 远景极地雪山剪影
      let mtn1 = 0.11 + fbm(vec2f(p.x * 2.6 + 1.4, 0.5)) * 0.12;
      let mtn2 = 0.07 + fbm(vec2f(p.x * 4.2 + 5.1, 1.2)) * 0.08;
      if (in.uv.y < mtn1) {
        col = mix(col, vec3f(0.015, 0.032, 0.055), 0.72);
      }
      if (in.uv.y < mtn2) {
        col = mix(col, vec3f(0.008, 0.016, 0.032), 0.9);
      }

      return vec4f(aces(col), 1.0);
    }
  `;

  // --- Scene 5: Synthwave Outrun Grid ---
  const SHADER_SYNTHWAVE = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(in: VsOut) -> @location(0) vec4f {
      let res = max(u.resolution, vec2f(1.0));
      let aspect = res.x / res.y;
      let m = (u.mouse - 0.5) * 0.04;
      let p = vec2f((in.uv.x - 0.5) * aspect, in.uv.y) + m * 0.25;
      let t = u.time;
      let horizon = 0.44;

      // 复古霓虹天空
      var col = mix(vec3f(0.28, 0.05, 0.32), vec3f(0.03, 0.02, 0.12), smoothstep(horizon, 1.0, in.uv.y));
      col += vec3f(0.95, 0.22, 0.52) * exp(-abs(in.uv.y - horizon) * 14.0) * 0.55;

      // 复古扫描线落日（受专属开关控制）
      let sunPos = vec2f(0.1, horizon + 0.17);
      let sd = length(p - sunPos);
      if (sd < 0.22 && in.uv.y > horizon) {
        let sunGrad = mix(vec3f(1.0, 0.18, 0.58), vec3f(1.0, 0.84, 0.28), smoothstep(horizon, horizon + 0.36, in.uv.y));
        let stripe = mix(1.0, step(0.22, fract(in.uv.y * 38.0 - t * 0.35)) + smoothstep(horizon + 0.24, horizon + 0.28, in.uv.y), u.fxFlag);
        col = mix(col, sunGrad, clamp(stripe, 0.0, 1.0) * smoothstep(0.22, 0.212, sd));
      }

      // 远景山脉轮廓
      let ridge = horizon + (fbm(vec2f(p.x * 3.8 + 2.0, 0.3)) * 0.14) * smoothstep(0.18, 0.45, abs(p.x - 0.1));
      if (in.uv.y > horizon && in.uv.y < ridge) {
        let rim = smoothstep(0.008, 0.0, abs(in.uv.y - ridge));
        col = vec3f(0.04, 0.02, 0.1) + vec3f(0.95, 0.25, 0.72) * rim * 0.85;
      }

      // 3D 透视无限延伸霓虹网格
      if (in.uv.y <= horizon) {
        let dy = max(horizon - in.uv.y, 0.004);
        let z = 0.28 / dy;
        let gx = p.x * z * 1.4;
        let gz = z + t * 1.45;
        let lineX = smoothstep(0.06, 0.0, abs(fract(gx) - 0.5));
        let lineZ = smoothstep(0.06, 0.0, abs(fract(gz) - 0.5));
        let grid = max(lineX, lineZ);
        let fog = exp(-dy * 4.5);
        let ground = mix(vec3f(0.025, 0.015, 0.08), vec3f(0.14, 0.04, 0.24), fog);
        let gridCol = mix(vec3f(0.12, 0.9, 1.0), vec3f(1.0, 0.22, 0.68), fog);
        col = ground + gridCol * grid * (1.0 - fog * 0.35) * 0.92;
      }

      // 极细 CRT 扫描线
      col *= 1.0 - 0.05 * u.fxFlag + 0.05 * u.fxFlag * sin(in.uv.y * res.y * 1.1);
      return vec4f(aces(col), 1.0);
    }
  `;

  // --- Scene 6: Abyssal Bioluminescence (深海荧光) ---
  const SHADER_ABYSSAL = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(in: VsOut) -> @location(0) vec4f {
      let res = max(u.resolution, vec2f(1.0));
      let aspect = res.x / res.y;
      let m = (u.mouse - 0.5) * 0.05;
      let p = vec2f((in.uv.x - 0.5) * aspect, in.uv.y) + m * 0.3;
      let t = u.time;

      // 深海纵深渐变
      var col = mix(vec3f(0.008, 0.025, 0.065), vec3f(0.018, 0.11, 0.21), smoothstep(0.0, 1.0, in.uv.y));

      // 水面穿透的体积光柱（God Rays，受专属开关控制）
      if (u.fxFlag > 0.5) {
        let rayCoord = p.x * 2.8 - (1.0 - in.uv.y) * 0.65;
        let rays = pow(0.5 + 0.5 * sin(rayCoord * 4.5 + t * 0.35 + fbm(vec2f(rayCoord * 2.0, t * 0.12)) * 2.5), 3.0);
        col += vec3f(0.12, 0.56, 0.72) * rays * smoothstep(0.05, 1.0, in.uv.y) * 0.34;
      }

      // 双层水波焦散网（Caustics）
      let c1 = fbm(p * 4.2 + vec2f(t * 0.12, -t * 0.08));
      let c2 = fbm(p * 4.2 + vec2f(-t * 0.1, t * 0.11) + vec2f(3.1, 7.4));
      let caustics = pow(1.0 - abs(c1 - c2) * 3.2, 4.0);
      col += vec3f(0.16, 0.78, 0.88) * clamp(caustics, 0.0, 1.0) * (0.2 + 0.35 * in.uv.y);

      // 缓缓上浮的深海生物荧光微粒（受专属开关控制）
      if (u.fxFlag > 0.5) {
        let bg = vec2f(p.x * 7.5, in.uv.y * 7.5 - t * 0.18);
        let bId = floor(bg);
        let bGv = fract(bg) - 0.5;
        for (var y = -1; y <= 1; y = y + 1) {
          for (var x = -1; x <= 1; x = x + 1) {
            let cell = bId + vec2f(f32(x), f32(y));
            let rnd = hash22(cell);
            if (rnd.x < 0.74) { continue; }
            let wob = vec2f(sin(t * (0.8 + rnd.y) + rnd.x * 15.0) * 0.16, 0.0);
            let d = length(bGv - vec2f(f32(x), f32(y)) - (rnd - 0.5) * 0.65 + wob);
            let pulse = 0.55 + 0.45 * sin(t * (1.4 + rnd.y * 2.0) + rnd.x * 30.0);
            let bioCol = select(vec3f(0.18, 0.95, 0.78), vec3f(0.28, 0.78, 1.0), rnd.y > 0.5);
            col += bioCol * exp(-d * 18.0) * pulse * 0.72;
          }
        }
      }

      return vec4f(aces(col), 1.0);
    }
  `;

  // (Scene 7 已升级为本地高清动态壁纸模式 wallpaper，由 HTML5 硬件解码 video/img + IndexedDB 持久化驱动)

  // --- Scene 8: Liquid Iridescent Chrome (液态全息金属) ---
  const SHADER_CHROME = WGSL_COMMON + /* wgsl */ `
    fn liquidHeight(p: vec2f, t: f32) -> f32 {
      let q = vec2f(
        fbm(p * 1.9 + vec2f(t * 0.12, -t * 0.09)),
        fbm(p * 1.9 + vec2f(-t * 0.1, t * 0.11) + vec2f(4.2, 2.8))
      );
      return fbm(p * 2.3 + q * 1.85 + vec2f(t * 0.06, -t * 0.05));
    }

    @fragment
    fn fs(in: VsOut) -> @location(0) vec4f {
      let res = max(u.resolution, vec2f(1.0));
      let aspect = res.x / res.y;
      let m = (u.mouse - 0.5) * 0.65;
      let p = (in.uv - 0.5) * vec2f(aspect, 1.0) - m * 0.18;
      let t = u.time;

      let eps = 0.008;
      let h = liquidHeight(p, t);
      let hx = liquidHeight(p + vec2f(eps, 0.0), t);
      let hy = liquidHeight(p + vec2f(0.0, eps), t);
      let n = normalize(vec3f((h - hx) * 7.5, (h - hy) * 7.5, 1.0));

      let lightDir = normalize(vec3f(m.x + 0.35, m.y + 0.45, 0.85));
      let viewDir = vec3f(0.0, 0.0, 1.0);
      let halfVec = normalize(lightDir + viewDir);
      let spec = pow(max(dot(n, halfVec), 0.0), 34.0);
      let fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.4);

      // 薄膜干涉全息虹彩（关掉后呈冷冽纯银液态水银）
      let phase = h * 5.2 + fresnel * 2.8 + t * 0.18;
      let irid = 0.5 + 0.5 * cos(6.2831 * (phase + vec3f(0.0, 0.33, 0.67)));

      var col = vec3f(0.035, 0.04, 0.058) + vec3f(0.14, 0.16, 0.22) * max(dot(n, lightDir), 0.0);
      col += mix(vec3f(0.32, 0.36, 0.44), irid, u.fxFlag) * (fresnel * 0.62 + 0.16);
      col += vec3f(0.95, 0.97, 1.0) * spec * 0.72;
      return vec4f(aces(col), 1.0);
    }
  `;

  // --- Scene 9: Sakura Moonlit Night (樱吹雪月夜) ---
  const SHADER_SAKURA = WGSL_COMMON + /* wgsl */ `
    fn petalLayer(uv: vec2f, scale: f32, time: f32) -> vec3f {
      var st = uv * scale;
      st.x -= time * 0.55;
      st.y += time * 0.68;
      let id = floor(st);
      let gv = fract(st) - 0.5;
      var col = vec3f(0.0);
      for (var y = -1; y <= 1; y = y + 1) {
        for (var x = -1; x <= 1; x = x + 1) {
          let offs = vec2f(f32(x), f32(y));
          let rnd = hash22(id + offs);
          if (rnd.x < 0.74) { continue; }
          let sway = vec2f(sin(time * 1.4 + rnd.y * 12.0) * 0.18, cos(time * 1.1 + rnd.x * 10.0) * 0.1);
          var dp = gv - offs - (rnd - 0.5) * 0.6 + sway;
          let ang = time * (1.2 + rnd.y * 1.8) + rnd.x * 6.28;
          let ca = cos(ang);
          let sa = sin(ang);
          dp = mat2x2f(ca, -sa, sa, ca) * dp;
          // 椭圆花瓣形状
          let d = length(dp * vec2f(1.0, 2.2));
          let petal = smoothstep(0.13, 0.06, d);
          let glow = exp(-d * 10.0) * 0.25;
          let pCol = mix(vec3f(0.98, 0.62, 0.78), vec3f(1.0, 0.88, 0.94), rnd.y);
          col += pCol * (petal * 0.85 + glow);
        }
      }
      return col;
    }

    @fragment
    fn fs(in: VsOut) -> @location(0) vec4f {
      let res = max(u.resolution, vec2f(1.0));
      let aspect = res.x / res.y;
      let m = (u.mouse - 0.5) * 0.04;
      let p = vec2f((in.uv.x - 0.5) * aspect, in.uv.y) + m * 0.25;
      let t = u.time;

      // 靛蓝月夜渐变
      var col = mix(vec3f(0.09, 0.06, 0.16), vec3f(0.024, 0.032, 0.095), smoothstep(0.0, 1.0, in.uv.y));

      // 右上方皎洁满月 + 月晕
      let moonPos = vec2f(aspect * 0.26, 0.74);
      let md = length(p - moonPos);
      let moonDisk = smoothstep(0.108, 0.102, md);
      let moonTex = 0.92 + 0.08 * fbm((p - moonPos) * 26.0);
      col += vec3f(0.98, 0.95, 0.88) * moonDisk * moonTex * 1.15;
      col += vec3f(0.58, 0.52, 0.82) * exp(-md * 3.8) * 0.34;
      col += vec3f(0.95, 0.65, 0.8) * exp(-md * 7.5) * 0.22;

      // 远山剪影与薄雾
      let m1 = 0.16 + fbm(vec2f(p.x * 2.2 + 0.8, 0.4)) * 0.14;
      let m2 = 0.09 + fbm(vec2f(p.x * 3.8 + 4.3, 1.1)) * 0.09;
      if (in.uv.y < m1) { col = mix(col, vec3f(0.05, 0.04, 0.11), 0.76); }
      if (in.uv.y < m2) { col = mix(col, vec3f(0.025, 0.02, 0.06), 0.9); }

      // 双层飘落樱花瓣（受专属开关控制）
      if (u.fxFlag > 0.5) {
        col += petalLayer(p, 5.2, t * 0.55) * 0.65;
        col += petalLayer(p + vec2f(3.7, 1.9), 8.6, t * 0.85) * 0.85;
      }

      return vec4f(aces(col), 1.0);
    }
  `;

  // --- Scene 10: Volcanic Ember (火山熔岩余烬) ---
  const SHADER_EMBER = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(in: VsOut) -> @location(0) vec4f {
      let res = max(u.resolution, vec2f(1.0));
      let aspect = res.x / res.y;
      let m = (u.mouse - 0.5) * 0.05;
      let p = vec2f((in.uv.x - 0.5) * aspect, in.uv.y) + m * 0.3;
      let t = u.time;

      // 暗黑玄武岩熔岩裂纹
      let q = vec2f(fbm(p * 2.4 + vec2f(t * 0.05, -t * 0.04)), fbm(p * 2.4 + vec2f(2.1, t * 0.05)));
      let magma = fbm(p * 3.2 + q * 1.6);
      let crack = smoothstep(0.56, 0.86, magma) * (1.0 - in.uv.y * 0.55);
      let pulse = 0.8 + 0.2 * sin(t * 1.2 + magma * 6.0);

      var col = vec3f(0.032, 0.016, 0.014);
      let lavaCol = mix(vec3f(0.85, 0.16, 0.03), vec3f(1.0, 0.76, 0.22), smoothstep(0.62, 0.88, magma));
      col += lavaCol * crack * pulse * 0.95;
      // 底部炽热热浪辉光
      col += vec3f(0.72, 0.18, 0.04) * exp(-in.uv.y * 2.6) * 0.34;

      // 缓缓上升的火星余烬（受专属开关控制）
      if (u.fxFlag > 0.5) {
        let eg = vec2f(p.x * 11.0, in.uv.y * 11.0 - t * 1.15);
        let eId = floor(eg);
        let eGv = fract(eg) - 0.5;
        for (var y = -1; y <= 1; y = y + 1) {
          for (var x = -1; x <= 1; x = x + 1) {
            let cell = eId + vec2f(f32(x), f32(y));
            let rnd = hash22(cell);
            if (rnd.x < 0.78) { continue; }
            let drift = vec2f(sin(t * 2.2 + rnd.y * 14.0) * 0.22, 0.0);
            let d = length(eGv - vec2f(f32(x), f32(y)) - (rnd - 0.5) * 0.6 + drift);
            let spark = smoothstep(0.075, 0.0, d) + exp(-d * 18.0) * 0.45;
            let eCol = mix(vec3f(1.0, 0.35, 0.05), vec3f(1.0, 0.88, 0.42), rnd.y);
            col += eCol * spark * (0.65 + 0.35 * sin(t * 6.0 + rnd.x * 20.0));
          }
        }
      }

      return vec4f(aces(col), 1.0);
    }
  `;

  // --- Scene 11: Ink Wash Mist (东方水墨云海 · 浅色动态主题) ---
  const SHADER_INKWASH = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(in: VsOut) -> @location(0) vec4f {
      let res = max(u.resolution, vec2f(1.0));
      let aspect = res.x / res.y;
      let m = (u.mouse - 0.5) * 0.03;
      let p = vec2f((in.uv.x - 0.5) * aspect, in.uv.y) + m * 0.2;
      let t = u.time;

      // 宣纸底色与纤维微纹
      let paperGrain = (noise(in.uv * 160.0) - 0.5) * 0.025;
      var col = mix(vec3f(0.91, 0.89, 0.84), vec3f(0.96, 0.94, 0.9), smoothstep(0.0, 1.0, in.uv.y)) + paperGrain;

      // 右上淡淡朱砂印日
      let sunPos = vec2f(aspect * 0.28, 0.76);
      let sd = length(p - sunPos);
      let sun = smoothstep(0.078, 0.068, sd);
      col = mix(col, vec3f(0.8, 0.31, 0.22), sun * 0.68);

      // 流动云雾
      let mist1 = fbm(vec2f(p.x * 2.1 + t * 0.04, in.uv.y * 3.8));
      let mist2 = fbm(vec2f(p.x * 3.2 - t * 0.03, in.uv.y * 4.5 + 2.4));

      // 三重青绿水墨远山
      let mFar = 0.34 + fbm(vec2f(p.x * 1.9 + 1.2, 0.3)) * 0.22;
      let mMid = 0.22 + fbm(vec2f(p.x * 2.8 + 4.7, 0.8)) * 0.16;
      let mNear = 0.11 + fbm(vec2f(p.x * 4.1 + 8.1, 1.5)) * 0.11;

      if (in.uv.y < mFar) {
        let fade = smoothstep(mFar - 0.16, mFar, in.uv.y);
        col = mix(col, vec3f(0.56, 0.64, 0.61), (0.35 + 0.35 * fade) * (1.0 - mist1 * 0.45));
      }
      if (in.uv.y < mMid) {
        let fade = smoothstep(mMid - 0.14, mMid, in.uv.y);
        col = mix(col, vec3f(0.32, 0.4, 0.41), (0.48 + 0.35 * fade) * (1.0 - mist2 * 0.35));
      }
      if (in.uv.y < mNear) {
        let fade = smoothstep(mNear - 0.1, mNear, in.uv.y);
        col = mix(col, vec3f(0.18, 0.22, 0.24), 0.68 + 0.22 * fade);
      }

      // 山间飘渺白云带（受专属开关控制）
      let cloudBand = exp(-pow((in.uv.y - 0.24) * 8.5, 2.0)) * smoothstep(0.35, 0.82, mist1) * u.fxFlag;
      col = mix(col, vec3f(0.97, 0.96, 0.93), cloudBand * 0.62);

      return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
    }
  `;

  // --- Scene 13: Circadian Sky (真实昼夜天空 · 随 Mac 本地时钟演进) ---
  const SHADER_CIRCADIAN = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(in: VsOut) -> @location(0) vec4f {
      let res = max(u.resolution, vec2f(1.0));
      let aspect = res.x / res.y;
      let m = (u.mouse - 0.5) * 0.035;
      let p = vec2f((in.uv.x - 0.5) * aspect, in.uv.y) + m * 0.25;
      let t = u.time;
      let hour = u.dayTime;

      // 计算四个时段权重（晨曦 / 白昼 / 日落 / 星夜）
      let dawnW = exp(-pow((hour - 6.4) * 0.65, 2.0));
      let dayW = smoothstep(6.5, 9.0, hour) * smoothstep(17.6, 15.2, hour);
      let sunsetW = exp(-pow((hour - 18.0) * 0.55, 2.0));
      let nightW = clamp(1.0 - max(max(dawnW, dayW), sunsetW), 0.0, 1.0);
      let wSum = max(dawnW + dayW + sunsetW + nightW, 0.001);

      let topCol = (
        vec3f(0.24, 0.34, 0.64) * dawnW +
        vec3f(0.18, 0.48, 0.85) * dayW +
        vec3f(0.16, 0.14, 0.38) * sunsetW +
        vec3f(0.015, 0.022, 0.062) * nightW
      ) / wSum;

      let botCol = (
        vec3f(0.98, 0.66, 0.56) * dawnW +
        vec3f(0.72, 0.88, 0.98) * dayW +
        vec3f(0.98, 0.44, 0.28) * sunsetW +
        vec3f(0.045, 0.06, 0.14) * nightW
      ) / wSum;

      var col = mix(botCol, topCol, smoothstep(0.0, 0.95, in.uv.y));

      // 太阳 / 月亮轨迹
      let sunAngle = (hour - 6.0) / 12.0 * 3.14159;
      let sunPos = vec2f(-cos(sunAngle) * aspect * 0.38, sin(sunAngle) * 0.68 + 0.12);
      if (hour >= 5.2 && hour <= 19.4) {
        let sd = length(p - sunPos);
        let sunCol = mix(vec3f(1.0, 0.55, 0.25), vec3f(1.0, 0.96, 0.85), dayW);
        col += sunCol * (smoothstep(0.065, 0.052, sd) * 1.2 + exp(-sd * 4.5) * 0.45);
      }

      // 夜间繁星
      if (nightW > 0.15) {
        let sg = vec2f(p.x, in.uv.y) * 24.0;
        let sr = hash22(floor(sg));
        if (sr.x > 0.82 && in.uv.y > 0.15) {
          let d = length(fract(sg) - 0.5 - (sr - 0.5) * 0.6);
          let tw = 0.65 + 0.35 * sin(t * 2.2 + sr.y * 25.0);
          col += vec3f(0.9, 0.94, 1.0) * smoothstep(0.07, 0.0, d) * tw * nightW * 0.9;
        }
      }

      // 流动体积云层
      let c1 = fbm(vec2f(p.x * 1.9 + t * 0.025, in.uv.y * 4.2));
      let c2 = fbm(vec2f(p.x * 3.4 + t * 0.04, in.uv.y * 5.8 + 3.1));
      let cloudMask = smoothstep(0.46, 0.82, c1 * 0.65 + c2 * 0.35) * smoothstep(0.06, 0.45, in.uv.y);
      let cloudCol = (
        vec3f(1.0, 0.82, 0.74) * dawnW +
        vec3f(0.98, 0.99, 1.0) * dayW +
        vec3f(1.0, 0.56, 0.42) * sunsetW +
        vec3f(0.11, 0.14, 0.26) * nightW
      ) / wSum;
      col = mix(col, cloudCol, cloudMask * 0.55 * u.fxFlag);

      return vec4f(aces(col), 1.0);
    }
  `;

  // (12) 荧光海滩：午夜黑沙滩 + 缓慢涌上的蓝眼泪生物荧光潮汐 + 湿沙星光倒影
  const SHADER_BIOLUM = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(v: VsOut) -> @location(0) vec4f {
      let uv = v.uv;
      let aspect = u.resolution.x / max(u.resolution.y, 1.0);
      let t = u.time * 0.34;
      let m = (u.mouse - 0.5) * 0.14;

      var col = mix(vec3f(0.012, 0.022, 0.055), vec3f(0.025, 0.048, 0.105), pow(clamp(uv.y, 0.0, 1.0), 0.7));

      // 夜空微星
      if (uv.y > 0.44) {
        let sg = floor(uv * vec2f(aspect * 78.0, 78.0));
        let sh = hash21(sg);
        if (sh > 0.992) {
          let tw = 0.5 + 0.5 * sin(u.time * 2.2 + sh * 90.0);
          col += vec3f(0.68, 0.85, 1.0) * tw * smoothstep(0.44, 0.68, uv.y) * 0.72;
        }
      }

      // 海平面与湿沙滩分界线
      let shoreBase = 0.36 + 0.028 * sin(uv.x * 4.5 + t * 0.7) + 0.015 * sin(uv.x * 11.0 - t * 1.1);
      let waveCycle = 0.5 + 0.5 * sin(t * 1.35 + uv.x * 2.2);
      let waveEdge = shoreBase + waveCycle * 0.085 + (fbm(vec2f(uv.x * 6.0 + t * 0.2, t * 0.35)) - 0.5) * 0.04;

      // 深海波纹
      let seaMask = smoothstep(shoreBase - 0.02, shoreBase + 0.05, uv.y) * (1.0 - smoothstep(0.58, 0.72, uv.y));
      let ripple = fbm(vec2f(uv.x * 7.5 + m.x * 2.0, uv.y * 16.0 - t * 0.8));
      col += vec3f(0.03, 0.14, 0.26) * seaMask * ripple * 0.65;

      // 蓝眼泪荧光浪线（主浪 + 二次退潮微光）
      let dWave1 = abs(uv.y - waveEdge);
      let foamNoise = fbm(vec2f(uv.x * 18.0 - t * 0.5, uv.y * 24.0 + t * 0.4));
      let glow1 = exp(-dWave1 * 72.0) * (0.55 + 0.85 * foamNoise);
      let waveEdge2 = shoreBase + (0.5 + 0.5 * sin(t * 1.35 - 1.9 + uv.x * 2.8)) * 0.055;
      let dWave2 = abs(uv.y - waveEdge2);
      let glow2 = exp(-dWave2 * 88.0) * (0.45 + 0.75 * foamNoise) * 0.68;

      let bioCol = mix(vec3f(0.04, 0.72, 1.0), vec3f(0.38, 0.92, 1.0), foamNoise);
      col += bioCol * (glow1 * (0.45 + 0.7 * u.fxFlag) + glow2 * (0.35 + 0.5 * u.fxFlag)) * (0.85 + 0.22 * u.aiBusy);

      // 湿沙上的蓝光漫反射与荧光微粒（微粒受专属开关控制）
      let sandMask = 1.0 - smoothstep(waveEdge - 0.01, waveEdge + 0.02, uv.y);
      let wetRefl = exp(-max(0.0, waveEdge - uv.y) * 9.0) * sandMask;
      col += vec3f(0.02, 0.28, 0.48) * wetRefl * (0.55 + 0.45 * ripple);

      if (u.fxFlag > 0.5) {
        let sparkGrid = floor(vec2f(uv.x * aspect * 64.0, uv.y * 64.0));
        let spH = hash21(sparkGrid);
        if (spH > 0.986 && sandMask > 0.2) {
          let pulse = pow(0.5 + 0.5 * sin(u.time * 1.8 + spH * 50.0), 3.0);
          col += vec3f(0.22, 0.86, 1.0) * pulse * wetRefl * 0.95;
        }
      }

      // 光标拂过海面激起柔和荧光涟漪
      let dm = length((uv - u.mouse) * vec2f(aspect, 1.0));
      col += vec3f(0.14, 0.76, 1.0) * exp(-dm * 7.0) * 0.22;

      return vec4f(aces(col), 1.0);
    }
  `;

  // (13) 竹林雾雨：青黛山岚 + 摇曳分层竹影 + 萤火微光与细雨丝
  const SHADER_BAMBOO = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(v: VsOut) -> @location(0) vec4f {
      let uv = v.uv;
      let aspect = u.resolution.x / max(u.resolution.y, 1.0);
      let t = u.time * 0.28;
      let m = (u.mouse - 0.5) * 0.06;

      // 幽静青黛渐变底色
      var col = mix(vec3f(0.024, 0.062, 0.056), vec3f(0.058, 0.145, 0.128), pow(clamp(uv.y, 0.0, 1.0), 0.85));

      // 远处林间柔和天光
      let sunDist = length((uv - vec2f(0.68 + m.x * 0.4, 0.78 + m.y * 0.3)) * vec2f(aspect, 1.0));
      col += vec3f(0.16, 0.36, 0.29) * exp(-sunDist * 2.2) * 0.55;

      // 三层摇曳竹影
      for (var layer = 0; layer < 3; layer = layer + 1) {
        let lf = f32(layer);
        let density = 7.5 + lf * 4.5;
        let sway = sin(t * (0.9 + lf * 0.25) + uv.y * 2.2 + lf * 1.7) * (0.012 + lf * 0.006) * uv.y;
        let xScaled = (uv.x + sway + m.x * (0.3 + lf * 0.25)) * aspect * density;
        let cell = floor(xScaled);
        let fx = fract(xScaled) - 0.5;
        let rnd = hash11(cell * 17.3 + lf * 31.7);
        if (rnd > 0.36) {
          let offset = (rnd - 0.65) * 0.45;
          let width = (0.065 - lf * 0.014) * (0.75 + 0.45 * hash11(cell * 5.1 + lf));
          let stalk = smoothstep(width, width * 0.45, abs(fx - offset));
          // 竹节高亮细线
          let nodeY = fract(uv.y * (4.2 + lf * 1.5) + rnd * 3.0);
          let nodeBand = exp(-abs(nodeY - 0.5) * 48.0) * stalk;
          let shade = mix(vec3f(0.042, 0.11, 0.092), vec3f(0.014, 0.036, 0.032), lf / 2.0);
          col = mix(col, shade + vec3f(0.05, 0.12, 0.09) * nodeBand, stalk * (0.34 + lf * 0.24));
        }
      }

      // 流动山岚雾气
      let mist1 = fbm(vec2f(uv.x * 3.2 - t * 0.22, uv.y * 2.4 + 1.2));
      let mist2 = fbm(vec2f(uv.x * 5.5 + t * 0.14, uv.y * 4.0));
      let mistMask = smoothstep(0.1, 0.72, mist1 * 0.65 + mist2 * 0.35) * (1.0 - smoothstep(0.55, 0.98, uv.y));
      col = mix(col, vec3f(0.14, 0.28, 0.24), mistMask * 0.38);

      // 林间飘浮暖绿萤火与细斜雨丝（受专属开关控制）
      if (u.fxFlag > 0.5) {
        for (var i = 0; i < 12; i = i + 1) {
          let fi = f32(i);
          let fx = fract(hash11(fi * 13.7) + sin(t * 0.5 + fi * 2.1) * 0.06);
          let fy = fract(hash11(fi * 29.3) + t * (0.04 + hash11(fi * 7.1) * 0.04));
          let d = length((uv - vec2f(fx, fy)) * vec2f(aspect, 1.0));
          let blink = 0.45 + 0.55 * sin(u.time * (1.4 + hash11(fi * 3.9)) + fi * 5.0);
          col += vec3f(0.45, 0.95, 0.68) * exp(-d * 42.0) * blink * 0.52;
        }

        let rUV = vec2f((uv.x + uv.y * 0.12) * aspect * 46.0, uv.y * 12.0 + u.time * 2.4);
        let rCell = floor(rUV);
        let rF = fract(rUV);
        let rH = hash21(rCell);
        if (rH > 0.88) {
          let streak = smoothstep(0.16, 0.0, abs(rF.x - 0.5)) * smoothstep(0.0, 0.3, rF.y) * smoothstep(1.0, 0.5, rF.y);
          col += vec3f(0.42, 0.72, 0.65) * streak * 0.16;
        }
      }

      return vec4f(aces(col), 1.0);
    }
  `;

  // (14) 棱镜极光：黑曜石玻璃基底 + 柔和光谱色散折射焦散光带
  const SHADER_PRISM = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(v: VsOut) -> @location(0) vec4f {
      let uv = v.uv;
      let aspect = u.resolution.x / max(u.resolution.y, 1.0);
      let p = (uv - 0.5) * vec2f(aspect, 1.0);
      let m = (u.mouse - 0.5) * 0.35;
      let t = u.time * 0.22;

      var col = vec3f(0.018, 0.02, 0.038);

      // 旋转斜向玻璃折射坐标系
      let ang = 0.46 + m.x * 0.25;
      let ca = cos(ang);
      let sa = sin(ang);
      let q = vec2f(p.x * ca - p.y * sa, p.x * sa + p.y * ca);

      // 三通道微错位色散焦散（模拟玻璃棱镜分光）
      let nR = fbm(vec2f(q.x * 2.2 + t * 0.45 + 0.06, q.y * 1.4 - t * 0.25));
      let nG = fbm(vec2f(q.x * 2.2 + t * 0.45,        q.y * 1.4 - t * 0.25 + 0.02));
      let nB = fbm(vec2f(q.x * 2.2 + t * 0.45 - 0.06, q.y * 1.4 - t * 0.25 - 0.02));

      let bandR = exp(-abs(q.y + (nR - 0.5) * 0.62 - m.y * 0.2) * 5.8);
      let bandG = exp(-abs(q.y + (nG - 0.5) * 0.62 - m.y * 0.2) * 6.2);
      let bandB = exp(-abs(q.y + (nB - 0.5) * 0.62 - m.y * 0.2) * 5.6);

      let spec = vec3f(
        bandR * 0.92 + bandB * 0.32,
        bandG * 0.58 + bandB * 0.48,
        bandB * 1.05 + bandR * 0.28
      );

      // 柔和棱镜边缘高光丝带
      let ridge = pow(clamp(1.0 - abs(sin(q.x * 4.5 + nG * 3.8 - t * 0.7)), 0.0, 1.0), 6.0);
      let ribbonCol = mix(vec3f(0.68, 0.34, 0.96), vec3f(0.14, 0.82, 0.96), 0.5 + 0.5 * sin(q.x * 2.0 + t));
      let warmTouch = vec3f(0.98, 0.72, 0.34) * pow(bandR, 2.2) * smoothstep(-0.3, 0.6, q.x) * 0.42;

      col += spec * 0.52 + ribbonCol * ridge * (bandG + 0.22) * 0.48 * u.fxFlag + warmTouch * (0.4 + 0.6 * u.fxFlag);
      col *= 0.88 + 0.2 * u.aiBusy;

      // 细腻暗角收边
      let vig = 1.0 - smoothstep(0.45, 1.25, length(p));
      col *= 0.62 + 0.38 * vig;

      return vec4f(aces(col), 1.0);
    }
  `;

  // (15) 沙丘星夜：月色大漠层叠沙脊 + 暖琥珀沙纹 + 静谧银河流星
  const SHADER_DUNE = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(v: VsOut) -> @location(0) vec4f {
      let uv = v.uv;
      let aspect = u.resolution.x / max(u.resolution.y, 1.0);
      let t = u.time * 0.16;
      let m = (u.mouse - 0.5) * 0.08;

      // 暮蓝到暖琥珀地平线夜空
      var col = mix(vec3f(0.14, 0.09, 0.12), vec3f(0.028, 0.035, 0.085), smoothstep(0.28, 0.92, uv.y));
      let horizonGlow = exp(-abs(uv.y - 0.38) * 7.5);
      col += vec3f(0.42, 0.22, 0.12) * horizonGlow * 0.42;

      // 柔和弯月辉光
      let moonPos = vec2f(0.76 + m.x * 0.2, 0.76 + m.y * 0.15);
      let dMoon = length((uv - moonPos) * vec2f(aspect, 1.0));
      col += vec3f(0.96, 0.82, 0.58) * exp(-dMoon * 5.2) * 0.36;
      let moonDisc = smoothstep(0.036, 0.031, dMoon) * (1.0 - smoothstep(0.032, 0.026, length((uv - moonPos - vec2f(0.011, 0.006)) * vec2f(aspect, 1.0))));
      col += vec3f(1.0, 0.92, 0.74) * moonDisc * 0.95;

      // 夜空繁星与大漠流星（流星受专属开关控制）
      if (uv.y > 0.32) {
        let sg = floor(uv * vec2f(aspect * 88.0, 88.0));
        let sh = hash21(sg);
        if (sh > 0.991) {
          let tw = 0.5 + 0.5 * sin(u.time * 2.0 + sh * 100.0);
          col += vec3f(0.95, 0.88, 0.78) * tw * smoothstep(0.32, 0.56, uv.y) * 0.78;
        }
        if (u.fxFlag > 0.5) {
          let m1 = shootingStar(uv, aspect, u.time, 4.1);
          col += vec3f(1.0, 0.86, 0.58) * m1 * 1.1;
        }
      }

      // 三层绵延沙丘剪影与月光脊线
      let h1 = 0.34 + 0.055 * sin(uv.x * 2.6 + 0.4 + m.x * 0.6) + 0.022 * sin(uv.x * 6.2 - 1.0);
      let h2 = 0.24 + 0.048 * sin(uv.x * 3.8 + 2.3 + m.x * 1.1) + 0.016 * cos(uv.x * 8.4);
      let h3 = 0.14 + 0.038 * sin(uv.x * 5.1 + 4.2 + m.x * 1.6) + 0.012 * sin(uv.x * 11.0 + t * 0.5);

      let windRipple = 0.5 + 0.5 * sin(uv.x * 42.0 + uv.y * 90.0 + fbm(uv * 8.0 + vec2f(t * 0.3, 0.0)) * 4.5);

      if (uv.y < h1) {
        let rim1 = exp(-abs(uv.y - h1) * 55.0);
        col = mix(vec3f(0.11, 0.068, 0.064), vec3f(0.24, 0.13, 0.09), windRipple * 0.32) + vec3f(0.72, 0.44, 0.22) * rim1 * 0.52;
      }
      if (uv.y < h2) {
        let rim2 = exp(-abs(uv.y - h2) * 62.0);
        col = mix(vec3f(0.075, 0.046, 0.048), vec3f(0.18, 0.098, 0.072), windRipple * 0.38) + vec3f(0.84, 0.52, 0.24) * rim2 * 0.62;
      }
      if (uv.y < h3) {
        let rim3 = exp(-abs(uv.y - h3) * 70.0);
        col = mix(vec3f(0.045, 0.028, 0.034), vec3f(0.12, 0.065, 0.052), windRipple * 0.42) + vec3f(0.92, 0.60, 0.28) * rim3 * 0.68;
      }

      return vec4f(aces(col), 1.0);
    }
  `;

  // (16) 禅意抹茶（浅色系动态主题）：素雅青瓷茶面 + 同心枯山水涟漪 + 飘浮金箔微尘
  const SHADER_MATCHA = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(v: VsOut) -> @location(0) vec4f {
      let uv = v.uv;
      let aspect = u.resolution.x / max(u.resolution.y, 1.0);
      let p = (uv - 0.5) * vec2f(aspect, 1.0);
      let t = u.time * 0.32;

      // 温润素雅的抹茶青瓷底色
      let tex = fbm(uv * 6.5 + vec2f(t * 0.04, -t * 0.03));
      var col = mix(vec3f(0.86, 0.90, 0.83), vec3f(0.77, 0.84, 0.74), uv.y * 0.65 + tex * 0.35);

      // 柔和枯山水同心水波（主中心 + 次中心 + 光标微涟漪）
      let d1 = length(p - vec2f(-0.22, 0.08));
      let d2 = length(p - vec2f(0.32, -0.14));
      let dm = length((uv - u.mouse) * vec2f(aspect, 1.0));

      let r1 = sin(d1 * 28.0 - t * 2.1) * exp(-d1 * 2.4);
      let r2 = sin(d2 * 24.0 - t * 1.7 + 1.4) * exp(-d2 * 2.8);
      let rm = sin(dm * 34.0 - t * 3.0) * exp(-dm * 4.5);

      let ripple = (r1 * 0.55 + r2 * 0.4 + rm * 0.45) * u.fxFlag;
      col += vec3f(0.05, 0.065, 0.04) * ripple * 0.45;
      col -= vec3f(0.06, 0.04, 0.05) * max(0.0, -ripple) * 0.25;

      // 极淡的飘浮暖金箔微粒（受专属开关控制）
      if (u.fxFlag > 0.5) {
        for (var i = 0; i < 10; i = i + 1) {
          let fi = f32(i);
          let gx = fract(hash11(fi * 19.1) + t * 0.015 + sin(t * 0.4 + fi) * 0.02);
          let gy = fract(hash11(fi * 37.7) + cos(t * 0.35 + fi * 2.0) * 0.02);
          let dg = length((uv - vec2f(gx, gy)) * vec2f(aspect, 1.0));
          col = mix(col, vec3f(0.78, 0.64, 0.32), smoothstep(0.012, 0.002, dg) * 0.42);
        }
      }

      // 柔和四周晕边，保持中心阅读区通透干净
      let vig = smoothstep(0.35, 1.25, length(p));
      col = mix(col, vec3f(0.72, 0.79, 0.69), vig * 0.28);

      return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
    }
  `;

  // (17) 午后窗影（浅色系动态主题）：暖白肌理墙面 + 斜射百叶窗金光 + 微风摇曳树叶斑驳投影
  const SHADER_SUNLIT = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(v: VsOut) -> @location(0) vec4f {
      let uv = v.uv;
      let aspect = u.resolution.x / max(u.resolution.y, 1.0);
      let t = u.time * 0.25;
      let m = (u.mouse - 0.5) * 0.05;

      // 温润暖白石膏墙肌理底色
      let plaster = fbm(uv * 11.0) * 0.045;
      var col = mix(vec3f(0.92, 0.89, 0.84), vec3f(0.84, 0.80, 0.75), (1.0 - uv.y) * 0.65 + uv.x * 0.25) + plaster;

      // 斜射百叶窗光栅（右上向左下倾斜）
      let slant = uv.y * 1.15 - uv.x * 0.42 + m.x * 0.35;
      let slat = smoothstep(-0.22, 0.38, sin(slant * 26.0));
      let winMask = smoothstep(0.05, 0.26, uv.x) * smoothstep(0.98, 0.72, uv.x) * smoothstep(0.04, 0.28, uv.y);

      // 窗外微风摇曳的树影斑驳
      let breeze = vec2f(sin(t * 0.85 + uv.y * 2.4) * 0.045, cos(t * 0.65 + uv.x * 2.0) * 0.025);
      let leafA = fbm((uv + breeze + m * 0.4) * vec2f(aspect * 3.8, 3.8) + vec2f(1.3, 0.7));
      let leafB = fbm((uv - breeze * 0.7) * vec2f(aspect * 6.2, 6.2) + vec2f(4.8, 2.1));
      let leafShadow = smoothstep(0.46, 0.68, leafA * 0.65 + leafB * 0.35);

      let sunLight = slat * winMask * (1.0 - leafShadow * 0.78 * u.fxFlag);
      // 暖金午后日光叠加
      col = mix(col * 0.91, vec3f(0.99, 0.95, 0.86) + plaster * 0.5, sunLight * 0.85);
      // 柔和空气丁达尔柔光
      let glow = exp(-length((uv - vec2f(0.75, 0.82)) * vec2f(aspect, 1.0)) * 1.9);
      col += vec3f(0.08, 0.05, 0.01) * glow;

      return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
    }
  `;

  // (18) 长安雨巷：深夜蓝靛雨巷 + 暖红宫灯散景 + 湿润青石板倒影与细雨
  const SHADER_CHANGAN = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(v: VsOut) -> @location(0) vec4f {
      let uv = v.uv;
      let aspect = u.resolution.x / max(u.resolution.y, 1.0);
      let t = u.time * 0.3;
      let m = (u.mouse - 0.5) * 0.06;

      // 深夜雨巷青灰蓝底色
      var col = mix(vec3f(0.022, 0.026, 0.048), vec3f(0.045, 0.052, 0.085), smoothstep(0.25, 0.95, uv.y));

      // 沿街透视屋檐暗影
      let roofL = smoothstep(0.26, 0.14, uv.x + uv.y * 0.12);
      let roofR = smoothstep(0.74, 0.86, uv.x - uv.y * 0.12);
      col *= 1.0 - (roofL + roofR) * 0.52;

      // 5 盏暖红/琥珀和纸灯笼（上空光源 + 下半湿青石板拉长倒影）
      for (var i = 0; i < 5; i = i + 1) {
        let fi = f32(i);
        let lx = 0.16 + fi * 0.17 + sin(t * 0.7 + fi * 1.9) * 0.012 * u.fxFlag + m.x * (0.4 + fi * 0.08);
        let ly = 0.56 + hash11(fi * 11.7) * 0.22 + m.y * 0.2;
        let sway = 0.88 + 0.12 * u.fxFlag * sin(u.time * (1.8 + fi * 0.4) + fi * 3.1);
        let lanternCol = mix(vec3f(1.0, 0.28, 0.14), vec3f(1.0, 0.64, 0.22), hash11(fi * 5.3));

        // 纸灯笼光晕
        let d = length((uv - vec2f(lx, ly)) * vec2f(aspect, 1.0));
        col += lanternCol * (exp(-d * 18.0) * 0.72 + exp(-d * 5.2) * 0.24) * sway;

        // 湿润石板路面倒影（uv.y < 0.42）
        if (uv.y < 0.44) {
          let ripple = (fbm(vec2f(uv.x * 16.0, uv.y * 28.0 - t * 0.8)) - 0.5) * 0.035;
          let rx = abs(uv.x - lx + ripple) * aspect;
          let ry = max(0.0, 0.44 - uv.y);
          let refl = exp(-rx * 16.0) * exp(-ry * 3.8) * smoothstep(0.44, 0.34, uv.y);
          col += lanternCol * refl * 0.52 * sway;
        }
      }

      // 细斜雨丝（受专属开关控制）
      if (u.fxFlag > 0.5) {
        let rUV = vec2f((uv.x + uv.y * 0.15) * aspect * 52.0, uv.y * 10.0 + u.time * 3.2);
        let rCell = floor(rUV);
        let rF = fract(rUV);
        if (hash21(rCell) > 0.86) {
          let streak = smoothstep(0.14, 0.0, abs(rF.x - 0.5)) * smoothstep(0.0, 0.3, rF.y) * smoothstep(1.0, 0.4, rF.y);
          col += vec3f(0.68, 0.74, 0.88) * streak * 0.18;
        }
      }

      return vec4f(aces(col), 1.0);
    }
  `;

  // (19) 极地雪夜：深靛蓝雪夜天幕 + 远方暖木屋微光 + 三层景深轻柔飘雪
  const SHADER_SNOWFALL = WGSL_COMMON + /* wgsl */ `
    fn snowLayer(uv: vec2f, scale: f32, speed: f32, drift: f32, t: f32) -> f32 {
      var st = vec2f(uv.x + sin(t * 0.45 + uv.y * 3.0 + drift) * 0.03, uv.y + t * speed) * scale;
      let id = floor(st);
      let gv = fract(st) - 0.5;
      let rnd = hash22(id + vec2f(drift, drift * 1.7));
      if (rnd.x < 0.52) { return 0.0; }
      let pos = (rnd - 0.5) * 0.72;
      let d = length(gv - pos);
      let rad = 0.045 + (rnd.x - 0.52) * 0.11;
      return smoothstep(rad, rad * 0.15, d) * (0.45 + 0.55 * rnd.y);
    }

    @fragment
    fn fs(v: VsOut) -> @location(0) vec4f {
      let uv = v.uv;
      let aspect = u.resolution.x / max(u.resolution.y, 1.0);
      let t = u.time;
      let m = (u.mouse - 0.5) * 0.06;

      // 极地深靛蓝暮夜渐变
      var col = mix(vec3f(0.05, 0.08, 0.16), vec3f(0.015, 0.024, 0.062), smoothstep(0.15, 0.92, uv.y));

      // 远景柔和雪丘与暖黄木屋灯火
      let hill = 0.18 + 0.045 * sin(uv.x * 3.4 + 0.8 + m.x) + 0.018 * cos(uv.x * 7.2);
      let cabinDist = length((uv - vec2f(0.72 + m.x * 0.5, hill + 0.015)) * vec2f(aspect, 1.0));
      col += vec3f(1.0, 0.68, 0.30) * exp(-cabinDist * 11.0) * 0.58;
      col += vec3f(1.0, 0.82, 0.52) * exp(-cabinDist * 38.0) * 0.72;

      if (uv.y < hill) {
        let rim = exp(-abs(uv.y - hill) * 55.0);
        col = mix(vec3f(0.06, 0.09, 0.16), vec3f(0.14, 0.19, 0.29), rim) + vec3f(0.85, 0.55, 0.25) * exp(-cabinDist * 8.0) * 0.28;
      }

      // 三层景深飘雪（受专属开关控制）
      if (u.fxFlag > 0.5) {
        let p = vec2f(uv.x * aspect, uv.y) + m * 0.35;
        let s1 = snowLayer(p, 18.0, 0.065, 1.1, t) * 0.38;
        let s2 = snowLayer(p + vec2f(2.4, 0.8), 11.0, 0.095, 3.7, t) * 0.58;
        let s3 = snowLayer(p + vec2f(5.1, 1.9), 6.5, 0.13, 7.3, t) * 0.72;
        col += vec3f(0.86, 0.93, 1.0) * (s1 + s2 + s3);
      }

      return vec4f(aces(col), 1.0);
    }
  `;

  const SHADER_MAP = {
    cyberrain: SHADER_CYBERRAIN,
    cosmic: SHADER_COSMIC,
    blackhole: SHADER_BLACKHOLE,
    aurora: SHADER_AURORA,
    synthwave: SHADER_SYNTHWAVE,
    abyssal: SHADER_ABYSSAL,
    chrome: SHADER_CHROME,
    sakura: SHADER_SAKURA,
    ember: SHADER_EMBER,
    inkwash: SHADER_INKWASH,
    circadian: SHADER_CIRCADIAN,
    biolum: SHADER_BIOLUM,
    bamboo: SHADER_BAMBOO,
    prism: SHADER_PRISM,
    dune: SHADER_DUNE,
    matcha: SHADER_MATCHA,
    sunlit: SHADER_SUNLIT,
    changan: SHADER_CHANGAN,
    snowfall: SHADER_SNOWFALL,
  };

  /* ========================================================================
     2. 背景 WebGPU 画布 + 顶层交互特效 2D 画布
     ======================================================================== */
  let bgCanvas = document.getElementById(BG_CANVAS_ID);
  if (!bgCanvas) {
    bgCanvas = document.createElement("canvas");
    bgCanvas.id = BG_CANVAS_ID;
    document.body.prepend(bgCanvas);
  }
  Object.assign(bgCanvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "0",
    pointerEvents: "none",
    display: "block",
  });

  let fxCanvas = document.getElementById(FX_CANVAS_ID);
  if (!fxCanvas) {
    fxCanvas = document.createElement("canvas");
    fxCanvas.id = FX_CANVAS_ID;
    document.body.appendChild(fxCanvas);
  }
  Object.assign(fxCanvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "2147482000",
    pointerEvents: "none",
    display: "block",
  });
  const fxCtx = fxCanvas.getContext("2d");

  let rafId = 0;
  let destroyed = false;
  let device = null;
  let gpuCtx = null;
  let uniformBuffer = null;
  let uniformData = new Float32Array(8);
  const pipelines = {};
  const bindGroups = {};

  let mouseX = 0.5;
  let mouseY = 0.5;
  let targetMouseX = 0.5;
  let targetMouseY = 0.5;

  const sparks = [];
  const ripples = [];

  const SCENE_COLORS = {
    cyberrain: ["#22d3ee", "#f43f8e", "#a855f7"],
    cosmic: ["#8aa8ff", "#c084fc", "#f3b58e"],
    blackhole: ["#f59e0b", "#fb923c", "#fde68a"],
    aurora: ["#34d399", "#38bdf8", "#a78bfa"],
    synthwave: ["#f43f8e", "#22d3ee", "#facc15"],
    abyssal: ["#2dd4bf", "#38bdf8", "#818cf8"],
    wallpaper: ["#f59e0b", "#38bdf8", "#f472b6"],
    chrome: ["#e2e8f0", "#a78bfa", "#38bdf8"],
    sakura: ["#f9a8d4", "#fbcfe8", "#c4b5fd"],
    ember: ["#f97316", "#ef4444", "#fde047"],
    inkwash: ["#c84b31", "#4a665f", "#242c30"],
    circadian: ["#fb923c", "#38bdf8", "#fde68a"],
    biolum: ["#38bdf8", "#22d3ee", "#818cf8"],
    bamboo: ["#34d399", "#6ee7b7", "#a7f3d0"],
    prism: ["#c084fc", "#38bdf8", "#fbbf24"],
    dune: ["#f59e0b", "#fb923c", "#fde68a"],
    matcha: ["#4d7c5b", "#9b7b35", "#2d4234"],
    sunlit: ["#b87a3d", "#d9a05b", "#5c4a38"],
    changan: ["#f97316", "#ef4444", "#fbbf24"],
    snowfall: ["#93c5fd", "#e0f2fe", "#fbbf24"],
    none: ["#d97757", "#e8a87c", "#f2ece2"],
  };

  // 每套内置场景的专属特效名称（统一由 u.fxFlag 驱动，各场景独立记忆开关状态）
  const SCENE_FX_META = {
    cyberrain: "⚡ 雨夜闪电",
    changan: "🌧️ 细雨摇灯",
    snowfall: "❄️ 景深飘雪",
    cosmic: "🌠 划空流星",
    blackhole: "💫 吸积盘耀斑",
    aurora: "✨ 极光流波",
    biolum: "🌊 蓝眼泪微粒",
    bamboo: "✨ 萤火与细雨",
    prism: "🌈 色散丝带",
    dune: "🌠 大漠流星",
    synthwave: "⚡ 复古扫描线",
    abyssal: "✨ 体积光与浮游光",
    chrome: "🫧 全息虹彩反光",
    sakura: "🌸 漫天落樱",
    ember: "🔥 升腾火星",
    circadian: "☁️ 流动云雾",
    sunlit: "🍃 微风树影",
    inkwash: "☁️ 流动山岚",
    matcha: "✨ 涟漪与金箔",
  };

  function isSceneFxEnabled(scene) {
    if (!SCENE_FX_META[scene]) return false;
    if (state.sceneFxMap && typeof state.sceneFxMap[scene] === "boolean") {
      return state.sceneFxMap[scene];
    }
    if (scene === "cyberrain") return state.lightning !== false;
    return true;
  }

  // 光标彗尾与星座引力微尘节点
  let cursorClientX = -999;
  let cursorClientY = -999;
  const cursorTrail = [];
  const dustNodes = Array.from({ length: 32 }, () => ({
    x: Math.random() * Math.max(window.innerWidth, 1400),
    y: Math.random() * Math.max(window.innerHeight, 900),
    vx: (Math.random() - 0.5) * 0.36,
    vy: (Math.random() - 0.5) * 0.36,
    r: 1.3 + Math.random() * 1.3,
  }));

  // 场景专属飘浮微粒（花瓣 / 萤火 / 金箔 / 火星 / 雪花，极轻量 22 颗）
  const driftMotes = Array.from({ length: 22 }, () => ({
    x: Math.random() * Math.max(window.innerWidth, 1400),
    y: Math.random() * Math.max(window.innerHeight, 900),
    size: 1.8 + Math.random() * 2.6,
    phase: Math.random() * Math.PI * 2,
    speed: 0.35 + Math.random() * 0.65,
    rot: Math.random() * Math.PI * 2,
  }));

  // 光标环境柔光灯（纯 CSS radial-gradient 跟随 --cursor-x/y，零每帧 JS 开销）
  let cursorHaloEl = document.getElementById(HALO_ID);
  if (!cursorHaloEl) {
    cursorHaloEl = document.createElement("div");
    cursorHaloEl.id = HALO_ID;
    document.body.appendChild(cursorHaloEl);
  }

  // Web Audio 零素材氛围白噪音 + 完成水晶音引擎
  let audioCtx = null;
  let ambientMaster = null;
  let ambientNodes = [];
  let currentAmbientProfile = null;

  function ensureAudioCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function stopAmbientAudio() {
    for (const node of ambientNodes) {
      try {
        if (typeof node.stop === "function") node.stop();
        if (typeof node.disconnect === "function") node.disconnect();
      } catch {
        // ignore
      }
    }
    ambientNodes = [];
    ambientMaster = null;
    currentAmbientProfile = null;
  }

  function getAmbientProfile(scene) {
    if (scene === "cyberrain" || scene === "sakura" || scene === "bamboo" || scene === "changan") return "rain";
    if (scene === "abyssal" || scene === "biolum") return "ocean";
    if (scene === "ember") return "fire";
    if (
      scene === "inkwash" ||
      scene === "matcha" ||
      scene === "sunlit" ||
      scene === "snowfall" ||
      scene === "dune" ||
      scene === "circadian" ||
      scene === "wallpaper" ||
      scene === "none"
    ) {
      return "wind";
    }
    return "space";
  }

  function createNoiseBuffer(ctx, pink) {
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      if (!pink) {
        data[i] = white * 0.5;
      } else {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
        b6 = white * 0.115926;
      }
    }
    return buf;
  }

  function syncAmbientAudio() {
    if (!state.ambientAudio) {
      stopAmbientAudio();
      return;
    }
    const profile = getAmbientProfile(state.scene);
    if (currentAmbientProfile === profile && ambientMaster) {
      ambientMaster.gain.setTargetAtTime(state.ambientVol * 0.45, audioCtx.currentTime, 0.1);
      return;
    }
    stopAmbientAudio();
    const ctx = ensureAudioCtx();
    if (!ctx) return;

    const master = ctx.createGain();
    master.gain.value = state.ambientVol * 0.45;
    master.connect(ctx.destination);
    ambientMaster = master;
    ambientNodes.push(master);
    currentAmbientProfile = profile;

    if (profile === "space") {
      // 深空温暖低频和声无人机（110Hz + 164.8Hz 柔和低通）
      const lpf = ctx.createBiquadFilter();
      lpf.type = "lowpass";
      lpf.frequency.value = 260;
      lpf.connect(master);
      ambientNodes.push(lpf);
      [55, 82.41, 110.2].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = idx === 0 ? "sine" : "triangle";
        osc.frequency.value = freq;
        g.gain.value = idx === 0 ? 0.24 : 0.08;
        osc.connect(g);
        g.connect(lpf);
        osc.start();
        ambientNodes.push(osc, g);
      });
    } else {
      const src = ctx.createBufferSource();
      src.buffer = createNoiseBuffer(ctx, true);
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      if (profile === "rain") {
        filter.type = "bandpass";
        filter.frequency.value = 1150;
        filter.Q.value = 0.55;
      } else if (profile === "ocean") {
        filter.type = "lowpass";
        filter.frequency.value = 340;
      } else if (profile === "fire") {
        filter.type = "lowpass";
        filter.frequency.value = 480;
      } else {
        filter.type = "bandpass";
        filter.frequency.value = 620;
        filter.Q.value = 1.2;
      }

      src.connect(filter);
      filter.connect(master);
      src.start();
      ambientNodes.push(src, filter);
    }
  }

  function playCompletionChime() {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    // 空灵双音水晶提示（E5 -> B5）
    [659.25, 987.77].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.11);
      gain.gain.setValueAtTime(0.0001, now + i * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.11 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.11 + 0.85);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.11);
      osc.stop(now + i * 0.11 + 0.9);
    });
  }

  function triggerDonePulse() {
    let el = document.getElementById("agy-done-pulse");
    if (el) el.remove();
    el = document.createElement("div");
    el.id = "agy-done-pulse";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  // 物理建模客制化机械键盘声学引擎（无蜂鸣器正弦波，采用多腔体共振滤波器 + 按下触底/抬起回弹双阶段物理瞬态）
  let keyImpulseBuf = null;
  let keyWarmCurve = null;

  function ensureKeyAudioAssets(ctx) {
    if (!keyImpulseBuf) {
      // 70ms 全振幅白噪声（包络完全交由 GainNode 精确控制，避免双重衰减导致音量过轻）
      const len = Math.floor(ctx.sampleRate * 0.07);
      keyImpulseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = keyImpulseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) {
        d[i] = Math.random() * 2 - 1;
      }
    }
    if (!keyWarmCurve) {
      keyWarmCurve = new Float32Array(256);
      for (let i = 0; i < 256; i += 1) {
        const x = (i * 2) / 255 - 1;
        keyWarmCurve[i] = Math.tanh(x * 1.45);
      }
    }
  }

  function hashKeyCode(code) {
    let h = 2166136261;
    const s = String(code || "KeyA");
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 1000) / 1000;
  }

  function triggerResonantTap(ctx, dest, when, freq, q, gainVal, dur) {
    const src = ctx.createBufferSource();
    src.buffer = keyImpulseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(freq, when);
    f.Q.setValueAtTime(q, when);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(when);
    src.stop(when + dur + 0.005);
  }

  function playKeySound(profile, key, code, phase = "down") {
    if (!profile || profile === "off") return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    ensureKeyAudioAssets(ctx);

    const now = ctx.currentTime;
    const isSpace = code === "Space" || key === " ";
    const isEnter = key === "Enter" || code === "Enter";
    const isBack = key === "Backspace" || code === "Backspace";
    const isBig = isSpace || isEnter || isBack;
    const isUp = phase === "up";

    // 按键固定音色微差（同一颗键一致，相邻键自然错落）+ 微小力度抖动
    const keyPitch = 0.91 + hashKeyCode(code) * 0.18;
    const velJitter = 0.88 + Math.random() * 0.24;
    const bigScale = isSpace ? 0.72 : isBig ? 0.84 : 1.0;

    // 轻度饱和 + 极短近场桌面反射总线
    const vol = Math.max(0, Math.min(1.5, Number(state.keyVol ?? 0.65)));
    if (vol <= 0.001) return;
    const bus = ctx.createGain();
    bus.gain.value = (isUp ? 0.52 : 0.95) * velJitter * vol;
    const shaper = ctx.createWaveShaper();
    shaper.curve = keyWarmCurve;
    bus.connect(shaper);
    shaper.connect(ctx.destination);

    if (profile === "thock") {
      // 客制化 Gasket 铝坨坨 + PBT 键帽麻将音：饱满低频闷响 + 温润空腔木鱼声
      const pitch = keyPitch * bigScale * (isUp ? 1.32 : 1.0);
      if (!isUp) {
        triggerResonantTap(ctx, bus, now, 230 * pitch, 1.4, isSpace ? 3.2 : 2.4, 0.055);
        triggerResonantTap(ctx, bus, now + 0.002, 860 * pitch, 2.0, 2.2, 0.042);
        triggerResonantTap(ctx, bus, now, 2100 * pitch, 1.4, 0.85, 0.018);
      } else {
        triggerResonantTap(ctx, bus, now, 1320 * pitch, 1.8, 1.35, 0.025);
        triggerResonantTap(ctx, bus, now + 0.001, 2600 * pitch, 1.5, 0.65, 0.014);
      }
    } else if (profile === "clicky") {
      // Box White / 青轴扭簧：清晰明快的双段金属脆响 + 扎实触底 + 干脆回弹
      const pitch = keyPitch * bigScale * (isUp ? 1.22 : 1.0);
      if (!isUp) {
        triggerResonantTap(ctx, bus, now, 4200 * pitch, 2.2, 2.6, 0.016);
        triggerResonantTap(ctx, bus, now + 0.0015, 6200 * pitch, 1.8, 1.5, 0.012);
        triggerResonantTap(ctx, bus, now + 0.0045, 360 * pitch, 1.3, isSpace ? 2.4 : 1.7, 0.038);
        triggerResonantTap(ctx, bus, now + 0.0045, 1600 * pitch, 1.8, 1.8, 0.024);
      } else {
        triggerResonantTap(ctx, bus, now, 4800 * pitch, 2.2, 1.6, 0.013);
        triggerResonantTap(ctx, bus, now + 0.002, 1900 * pitch, 1.6, 1.0, 0.018);
      }
    } else if (profile === "typewriter") {
      // 复古机械打字机：金属字锤硬朗连击 + 滚筒敲击 + 回车金属摇铃
      const pitch = keyPitch * bigScale * (isUp ? 1.18 : 1.0);
      if (!isUp) {
        triggerResonantTap(ctx, bus, now, 1650 * pitch, 1.8, 2.6, 0.032);
        triggerResonantTap(ctx, bus, now + 0.006, 3200 * pitch, 2.0, 2.2, 0.024);
        triggerResonantTap(ctx, bus, now + 0.006, 290 * pitch, 1.2, 2.1, 0.044);
        if (isEnter) {
          [2280, 4590].forEach((freq, idx) => {
            const bell = ctx.createOscillator();
            const bg = ctx.createGain();
            bell.type = "sine";
            bell.frequency.setValueAtTime(freq, now + 0.025);
            bg.gain.setValueAtTime((idx === 0 ? 0.14 : 0.05) * vol, now + 0.025);
            bg.gain.exponentialRampToValueAtTime(0.0001, now + (idx === 0 ? 0.52 : 0.24));
            bell.connect(bg);
            bg.connect(ctx.destination);
            bell.start(now + 0.025);
            bell.stop(now + 0.55);
          });
        }
      } else {
        triggerResonantTap(ctx, bus, now, 2400 * pitch, 1.6, 1.25, 0.02);
      }
    }
  }

  function resizeCanvases() {
    const maxDpr = state.ecoMode ? 0.85 : 1.5;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (bgCanvas.width !== w || bgCanvas.height !== h) {
      bgCanvas.width = w;
      bgCanvas.height = h;
    }
    const fw = Math.max(1, Math.floor(window.innerWidth));
    const fh = Math.max(1, Math.floor(window.innerHeight));
    if (fxCanvas.width !== fw || fxCanvas.height !== fh) {
      fxCanvas.width = fw;
      fxCanvas.height = fh;
    }
  }

  // IndexedDB 多文件动态壁纸收藏夹（支持多选 mp4/webm/mov/gif/png、一键切换、删除与自动轮播）
  let wallpaperObjectUrl = null;
  let wallpaperEl = null;
  let wallpaperList = []; // [{ id, name, type, blob, createdAt }]
  let wpRotateTimer = null;
  let accentSampleTimer = null;
  let samplerCanvas = null;
  let samplerCtx = null;

  function openWallpaperDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(WP_DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(WP_STORE)) {
          db.createObjectStore(WP_STORE);
        }
        if (!db.objectStoreNames.contains("playlist")) {
          db.createObjectStore("playlist", { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function addWallpaperFiles(files) {
    const db = await openWallpaperDB();
    const added = [];
    await new Promise((resolve, reject) => {
      const tx = db.transaction("playlist", "readwrite");
      const store = tx.objectStore("playlist");
      for (const file of files) {
        const rec = {
          id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          type: file.type,
          blob: file,
          createdAt: Date.now(),
        };
        store.put(rec);
        added.push(rec);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
    wallpaperList = [...wallpaperList, ...added];
    return added;
  }

  async function deleteWallpaperById(id) {
    const db = await openWallpaperDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("playlist", "readwrite");
      tx.objectStore("playlist").delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
    wallpaperList = wallpaperList.filter((w) => w.id !== id);
    if (state.activeWallpaperId === id) {
      state.activeWallpaperId = wallpaperList[0]?.id || "";
      if (wallpaperList[0]) {
        mountWallpaperBlob(wallpaperList[0]);
      } else {
        clearWallpaperElement();
      }
      saveState();
    }
    renderWallpaperPlaylistUI();
  }

  async function loadAllWallpapers() {
    const db = await openWallpaperDB();
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction("playlist", "readonly");
      const req = tx.objectStore("playlist").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    // 兼容旧版单壁纸数据自动迁移
    if (items.length === 0 && db.objectStoreNames.contains(WP_STORE)) {
      const legacy = await new Promise((resolve) => {
        const tx = db.transaction(WP_STORE, "readonly");
        const req = tx.objectStore(WP_STORE).get("current");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (legacy && legacy.blob) {
        const migrated = {
          id: `wp_legacy_${Date.now()}`,
          name: legacy.name || "已保存壁纸",
          type: legacy.type || "",
          blob: legacy.blob,
          createdAt: Date.now(),
        };
        await new Promise((resolve) => {
          const tx = db.transaction("playlist", "readwrite");
          tx.objectStore("playlist").put(migrated);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
        items.push(migrated);
      }
    }
    db.close();
    items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    wallpaperList = items;
    return items;
  }

  // 动态壁纸自动取色（从视频帧 / 图片提取高饱和柔和主色调，实时同步全界面高亮）
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h * 360, s, l];
  }

  function hslToHex(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function applyAccentOverride(hex) {
    const html = document.documentElement;
    if (!hex) {
      html.removeAttribute("data-custom-accent");
      html.style.removeProperty("--studio-custom-accent");
      return;
    }
    html.setAttribute("data-custom-accent", "on");
    html.style.setProperty("--studio-custom-accent", hex);
    const picker = document.getElementById("agy-accent-picker");
    if (picker && picker.value.toLowerCase() !== hex.toLowerCase()) {
      picker.value = hex;
    }
  }

  function sampleWallpaperAccent() {
    if (state.scene !== "wallpaper" || !wallpaperEl || document.hidden) return;
    if (wallpaperEl.tagName === "VIDEO" && wallpaperEl.readyState < 2) return;
    if (wallpaperEl.tagName === "IMG" && !wallpaperEl.complete) return;
    try {
      if (!samplerCanvas) {
        samplerCanvas = document.createElement("canvas");
        samplerCanvas.width = 24;
        samplerCanvas.height = 14;
        samplerCtx = samplerCanvas.getContext("2d", { willReadFrequently: true });
      }
      samplerCtx.drawImage(wallpaperEl, 0, 0, 24, 14);
      const data = samplerCtx.getImageData(0, 0, 24, 14).data;
      let bestScore = -1;
      let bestHsl = [38, 0.78, 0.62];
      let lumaSum = 0;
      let lumaSqSum = 0;
      const pixelCount = data.length / 4;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        lumaSum += lum;
        lumaSqSum += lum * lum;

        if (state.autoAccent && !state.customAccent) {
          const [h, s, l] = rgbToHsl(r, g, b);
          if (l >= 0.14 && l <= 0.88) {
            const score = s * (1 - Math.abs(l - 0.55));
            if (score > bestScore) {
              bestScore = score;
              bestHsl = [h, s, l];
            }
          }
        }
      }

      // 1. 自动主色调同步
      if (state.autoAccent && !state.customAccent) {
        const vibrantHex = hslToHex(
          bestHsl[0],
          Math.min(0.88, Math.max(0.55, bestHsl[1] * 1.15)),
          Math.min(0.72, Math.max(0.58, bestHsl[2]))
        );
        applyAccentOverride(vibrantHex);
      }

      // 2. 优雅自适应视觉友好：根据画面平均亮度 + 局部对比度动态计算阅读区柔光遮罩与微模糊
      const html = document.documentElement;
      if (state.adaptiveComfort) {
        const avgLuma = lumaSum / Math.max(pixelCount, 1);
        const variance = Math.max(0, lumaSqSum / Math.max(pixelCount, 1) - avgLuma * avgLuma);
        const stdDev = Math.sqrt(variance);
        // 极亮浅色壁纸（如雪景/白底插画 avgLuma > 0.62）自动切入浅底深墨字模式
        const isBrightWallpaper = avgLuma > 0.62;
        html.setAttribute("data-light-surface", isBrightWallpaper ? "on" : "off");
        const baseAlpha = Number(state.alpha) || 0.24;
        const adaptiveScrim = Math.min(0.58, Math.max(baseAlpha + 0.06, 0.22 + avgLuma * 0.36 + stdDev * 0.28));
        const chipAlpha = Math.min(0.76, Math.max(0.54, adaptiveScrim + 0.16));
        html.style.setProperty("--studio-adaptive-scrim", adaptiveScrim.toFixed(3));
        html.style.setProperty("--studio-chip-alpha", chipAlpha.toFixed(3));
      }
    } catch {
      // ignore cross-origin or decode errors
    }
  }

  function clearWallpaperElement() {
    const old = document.getElementById(WP_MEDIA_ID);
    if (old) {
      if (old.tagName === "VIDEO") {
        try {
          old.pause();
          old.src = "";
        } catch {}
      }
      old.remove();
    }
    wallpaperEl = null;
  }

  function mountWallpaperBlob(record) {
    if (!record || !record.blob) {
      clearWallpaperElement();
      return;
    }
    const prevEl = document.getElementById(WP_MEDIA_ID);
    const prevUrl = wallpaperObjectUrl;
    const doFade = Boolean(prevEl && state.scene === "wallpaper");
    if (!doFade) {
      clearWallpaperElement();
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
      }
    } else if (prevEl) {
      prevEl.removeAttribute("id");
      prevEl.style.transition = "opacity 460ms cubic-bezier(0.22, 1, 0.36, 1)";
      prevEl.style.opacity = "0";
      setTimeout(() => {
        if (prevEl.tagName === "VIDEO") {
          try {
            prevEl.pause();
            prevEl.src = "";
          } catch {}
        }
        prevEl.remove();
        if (prevUrl) {
          try {
            URL.revokeObjectURL(prevUrl);
          } catch {}
        }
      }, 480);
    }
    state.activeWallpaperId = record.id || state.activeWallpaperId;
    wallpaperObjectUrl = URL.createObjectURL(record.blob);
    const isVideo = String(record.type || "").startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(record.name || "");
    const el = document.createElement(isVideo ? "video" : "img");
    el.id = WP_MEDIA_ID;
    el.src = wallpaperObjectUrl;
    if (isVideo) {
      el.autoplay = true;
      el.loop = true;
      el.muted = true;
      el.playsInline = true;
      el.addEventListener("loadeddata", () => setTimeout(sampleWallpaperAccent, 180), { once: true });
    } else {
      el.addEventListener("load", () => setTimeout(sampleWallpaperAccent, 80), { once: true });
    }
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      objectFit: "cover",
      zIndex: "0",
      pointerEvents: "none",
      display: state.scene === "wallpaper" ? "block" : "none",
      opacity: doFade ? "0" : "1",
      transition: "opacity 460ms cubic-bezier(0.22, 1, 0.36, 1)",
    });
    document.body.prepend(el);
    wallpaperEl = el;
    if (lastHoleClip) el.style.clipPath = lastHoleClip;
    if (isVideo && state.scene === "wallpaper") {
      el.play().catch(() => {});
    }
    if (doFade) {
      requestAnimationFrame(() => {
        el.style.opacity = "1";
      });
    }
    renderWallpaperPlaylistUI();
  }

  function nextWallpaper() {
    if (wallpaperList.length === 0) return;
    const idx = wallpaperList.findIndex((w) => w.id === state.activeWallpaperId);
    const next = wallpaperList[(idx + 1) % wallpaperList.length];
    if (next) {
      state.scene = "wallpaper";
      mountWallpaperBlob(next);
      applyStateToDOM();
      saveState();
    }
  }

  function syncWallpaperRotation() {
    if (wpRotateTimer) {
      clearInterval(wpRotateTimer);
      wpRotateTimer = null;
    }
    if (state.wpAutoRotate && wallpaperList.length > 1) {
      wpRotateTimer = setInterval(() => {
        if (!document.hidden && state.scene === "wallpaper") {
          nextWallpaper();
        }
      }, 10 * 60 * 1000); // 每 10 分钟自动轮换下一条
    }
  }

  function renderWallpaperPlaylistUI() {
    const wrap = document.getElementById("agy-wp-list");
    if (!wrap) return;
    if (wallpaperList.length === 0) {
      wrap.innerHTML = `<div class="agy-wp-name">尚未添加壁纸（支持多选 mp4/webm/mov/gif/png）</div>`;
      return;
    }
    wrap.innerHTML = wallpaperList
      .map((w) => {
        const active = w.id === state.activeWallpaperId && state.scene === "wallpaper";
        const shortName = String(w.name || "壁纸").slice(0, 26);
        return `<div class="agy-wp-item ${active ? "active" : ""}" data-wp-id="${w.id}">
          <span class="agy-wp-title" title="${w.name || ""}">${active ? "▶ " : ""}${shortName}</span>
          <button type="button" class="agy-wp-del" data-wp-del="${w.id}" title="删除">×</button>
        </div>`;
      })
      .join("");

    wrap.querySelectorAll(".agy-wp-item").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target && e.target.closest && e.target.closest(".agy-wp-del")) return;
        const id = row.getAttribute("data-wp-id");
        const found = wallpaperList.find((x) => x.id === id);
        if (!found) return;
        state.scene = "wallpaper";
        mountWallpaperBlob(found);
        applyStateToDOM();
        syncAmbientAudio();
        saveState();
        document.querySelectorAll("#agy-theme-studio-root .agy-scene-btn").forEach((b) => {
          b.classList.toggle("active", b.getAttribute("data-scene-id") === "wallpaper");
        });
      });
    });

    wrap.querySelectorAll(".agy-wp-del").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteWallpaperById(btn.getAttribute("data-wp-del")).catch(() => {});
      });
    });
    syncWallpaperRotation();
  }

  // 番茄钟专注倒计时 + 顶部极细流光进度条
  let pomoRunning = false;
  let pomoTotalSec = state.pomoMinutes * 60;
  let pomoRemainSec = pomoTotalSec;
  let pomoInterval = null;

  function ensurePomoBar() {
    let bar = document.getElementById(POMO_BAR_ID);
    if (!bar) {
      bar = document.createElement("div");
      bar.id = POMO_BAR_ID;
      bar.innerHTML = `<div class="agy-pomo-fill"></div>`;
      document.body.appendChild(bar);
    }
    return bar;
  }

  function formatMMSS(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const r = String(s % 60).padStart(2, "0");
    return `${m}:${r}`;
  }

  function updatePomoUI() {
    const bar = ensurePomoBar();
    const fill = bar.querySelector(".agy-pomo-fill");
    const pct = pomoTotalSec > 0 ? ((pomoTotalSec - pomoRemainSec) / pomoTotalSec) * 100 : 0;
    bar.style.display = pomoRunning || pomoRemainSec < pomoTotalSec ? "block" : "none";
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;

    const readout = document.getElementById("agy-pomo-time");
    if (readout) readout.textContent = formatMMSS(pomoRemainSec);
    const toggleBtn = document.getElementById("agy-pomo-toggle");
    if (toggleBtn) toggleBtn.textContent = pomoRunning ? "⏸ 暂停" : "▶ 开始专注";

    const fab = document.querySelector(`#${UI_ROOT_ID} .agy-studio-fab`);
    if (fab) {
      fab.textContent = pomoRunning ? `🍅 ${formatMMSS(pomoRemainSec)}` : "✦ 主题";
    }
  }

  function togglePomo() {
    if (pomoRunning) {
      pomoRunning = false;
      clearInterval(pomoInterval);
      pomoInterval = null;
    } else {
      if (pomoRemainSec <= 0) {
        pomoTotalSec = state.pomoMinutes * 60;
        pomoRemainSec = pomoTotalSec;
      }
      pomoRunning = true;
      pomoInterval = setInterval(() => {
        if (!pomoRunning) return;
        pomoRemainSec -= 1;
        if (pomoRemainSec <= 0) {
          pomoRemainSec = 0;
          pomoRunning = false;
          clearInterval(pomoInterval);
          pomoInterval = null;
          triggerDonePulse();
          playCompletionChime();
        }
        updatePomoUI();
      }, 1000);
    }
    updatePomoUI();
  }

  function resetPomo(minutes) {
    pomoRunning = false;
    if (pomoInterval) {
      clearInterval(pomoInterval);
      pomoInterval = null;
    }
    if (minutes) state.pomoMinutes = minutes;
    pomoTotalSec = state.pomoMinutes * 60;
    pomoRemainSec = pomoTotalSec;
    updatePomoUI();
  }

  const onVisibilityChange = () => {
    if (!wallpaperEl || wallpaperEl.tagName !== "VIDEO") return;
    if (document.hidden || state.scene !== "wallpaper") {
      wallpaperEl.pause();
    } else {
      wallpaperEl.play().catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  // 场景丝滑转场（Cross-Fade Morph）：切场景时柔和亮度与微模糊淡变，内置默认生效
  let sceneMorphTimer = null;
  function triggerSceneMorph() {
    const html = document.documentElement;
    html.classList.remove("agy-scene-morphing");
    void html.offsetWidth;
    html.classList.add("agy-scene-morphing");
    if (sceneMorphTimer) clearTimeout(sceneMorphTimer);
    sceneMorphTimer = setTimeout(() => {
      html.classList.remove("agy-scene-morphing");
      sceneMorphTimer = null;
    }, 460);
  }

  function applyStateToDOM() {
    const html = document.documentElement;
    if (state.scene === "none") {
      html.removeAttribute("data-cosmic-bg");
      html.removeAttribute("data-scene");
      bgCanvas.style.display = "none";
      if (wallpaperEl) {
        wallpaperEl.style.display = "none";
        if (wallpaperEl.tagName === "VIDEO") wallpaperEl.pause();
      }
    } else if (state.scene === "wallpaper") {
      html.setAttribute("data-cosmic-bg", "on");
      html.setAttribute("data-scene", "wallpaper");
      bgCanvas.style.display = "none";
      if (wallpaperEl) {
        wallpaperEl.style.display = "block";
        if (wallpaperEl.tagName === "VIDEO" && !document.hidden) {
          wallpaperEl.play().catch(() => {});
        }
        if (state.autoAccent) setTimeout(sampleWallpaperAccent, 120);
      }
    } else {
      html.setAttribute("data-cosmic-bg", "on");
      html.setAttribute("data-scene", state.scene);
      bgCanvas.style.display = "block";
      if (wallpaperEl) {
        wallpaperEl.style.display = "none";
        if (wallpaperEl.tagName === "VIDEO") wallpaperEl.pause();
      }
    }

    if (state.customAccent) {
      applyAccentOverride(state.customAccent);
    } else if (state.scene !== "wallpaper" || !state.autoAccent) {
      applyAccentOverride("");
    }

    html.setAttribute("data-zen-mode", state.zenMode ? "on" : "off");
    html.setAttribute("data-adaptive-comfort", state.adaptiveComfort ? "on" : "off");
    html.setAttribute("data-spotlight", state.spotlight ? "on" : "off");
    html.setAttribute("data-cursor-halo", state.cursorHalo ? "on" : "off");
    html.setAttribute("data-magnetic", "on");
    const fxWrap = document.getElementById("agy-fx-scene-exclusive");
    const fxLabel = document.getElementById("agy-fx-scene-label");
    const fxCb = document.getElementById("agy-fx-scene-cb");
    const exclusiveTitle = SCENE_FX_META[state.scene];
    if (fxWrap) {
      fxWrap.style.display = exclusiveTitle ? "" : "none";
    }
    if (fxLabel && exclusiveTitle) {
      fxLabel.textContent = exclusiveTitle;
    }
    if (fxCb && exclusiveTitle) {
      fxCb.checked = isSceneFxEnabled(state.scene);
    }

    const nowHr = new Date().getHours() + new Date().getMinutes() / 60;
    const isCircadianDay = state.scene === "circadian" && nowHr >= 7.5 && nowHr <= 16.8;
    const isLightScene = state.scene === "inkwash" || state.scene === "matcha" || state.scene === "sunlit" || isCircadianDay;
    if (state.scene !== "wallpaper") {
      html.setAttribute("data-light-surface", isLightScene ? "on" : "off");
    } else if (!state.adaptiveComfort) {
      html.setAttribute("data-light-surface", "off");
    }
    html.style.setProperty("--studio-glass-alpha", String(state.alpha));
    html.style.setProperty("--studio-main-alpha", String(Math.min(0.85, state.alpha + 0.08)));
    html.style.setProperty("--studio-main-blur", `${state.mainBlur}px`);
    html.style.setProperty("--studio-sidebar-blur", `${state.blur}px`);
    syncChatWidthSlider();
    if (state.scene !== "wallpaper") {
      html.style.setProperty("--studio-adaptive-scrim", String(Math.min(0.6, state.alpha + 0.1)));
      html.style.setProperty("--studio-chip-alpha", "0.56");
    } else if (state.adaptiveComfort) {
      setTimeout(sampleWallpaperAccent, 120);
    }
    html.setAttribute("data-ai-pulse-enabled", state.aiPulse ? "on" : "off");
    window.__cosmicRenderer =
      state.scene === "none" ? "none" : state.scene === "wallpaper" ? "video:wallpaper" : `webgpu:${state.scene}`;
  }

  /* ========================================================================
     3. 交互特效：光标跟踪、点击涟漪、打字微火花、AI 思考呼吸环
     ======================================================================== */
  let lastActivityTime = performance.now();
  const markActive = () => {
    lastActivityTime = performance.now();
  };

  // VisionOS / Linear 级光标边框聚光灯：每帧最多更新一次，靠近 140px 即平滑点亮金属玻璃高光边框
  const SPOTLIGHT_SELECTOR = [
    '[data-testid="sidebar-split"] .contents > .bg-sidebar',
    '[data-testid="agent-input-box"]',
    '[data-testid="overview-panel-host-gutter"]',
    '[data-testid="new-conversation-button"]',
    '#agy-theme-studio-root .agy-studio-panel[data-open="true"]',
    '[data-main-content-body] pre',
  ].join(",");

  let spotRafPending = false;
  let lastSpotX = -999;
  let lastSpotY = -999;

  // 关键控件磁吸微动交互（Magnetic Micro-Physics）：内置默认开启，靠近核心按钮产生 1.5~3px 克制弹性跟随
  const MAGNETIC_SELECTOR = [
    "#agy-theme-studio-root .agy-studio-fab",
    '[data-testid="new-conversation-button"]',
    '[data-testid="settings-button"]',
    '[data-testid="agent-input-box"] [data-testid="input-send-button"]',
    '[data-testid="agent-input-box"] [data-testid="input-cancel-button"]',
    '[data-testid="agent-input-box"] button[aria-label*="Send" i]',
  ].join(",");

  function updateMagneticTargets() {
    if (destroyed) return;
    const nodes = document.querySelectorAll(MAGNETIC_SELECTOR);
    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cx = r.left + r.width * 0.5;
      const cy = r.top + r.height * 0.5;
      const dx = lastSpotX - cx;
      const dy = lastSpotY - cy;
      const near =
        lastSpotX >= r.left - 24 &&
        lastSpotX <= r.right + 24 &&
        lastSpotY >= r.top - 24 &&
        lastSpotY <= r.bottom + 24;
      if (near) {
        const mx = Math.max(-3.2, Math.min(3.2, dx * 0.085));
        const my = Math.max(-2.6, Math.min(2.6, dy * 0.11));
        el.style.setProperty("--mag-x", `${mx.toFixed(2)}px`);
        el.style.setProperty("--mag-y", `${my.toFixed(2)}px`);
        el.dataset.magActive = "1";
      } else if (el.dataset.magActive === "1") {
        el.style.setProperty("--mag-x", "0px");
        el.style.setProperty("--mag-y", "0px");
        el.dataset.magActive = "0";
      }
    }
  }

  function resetMagneticTargets() {
    document.querySelectorAll(MAGNETIC_SELECTOR).forEach((el) => {
      el.style.removeProperty("--mag-x");
      el.style.removeProperty("--mag-y");
      el.dataset.magActive = "0";
    });
  }

  function updateSpotlightTargets() {
    spotRafPending = false;
    if (destroyed) return;
    if (state.spotlight) {
      const nodes = document.querySelectorAll(SPOTLIGHT_SELECTOR);
      const pad = 140;
      for (let i = 0; i < nodes.length; i += 1) {
        const el = nodes[i];
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const near =
          lastSpotX >= r.left - pad &&
          lastSpotX <= r.right + pad &&
          lastSpotY >= r.top - pad &&
          lastSpotY <= r.bottom + pad;
        if (near) {
          el.style.setProperty("--spot-x", `${(lastSpotX - r.left).toFixed(1)}px`);
          el.style.setProperty("--spot-y", `${(lastSpotY - r.top).toFixed(1)}px`);
          el.style.setProperty("--spot-o", "1");
        } else if (el.style.getPropertyValue("--spot-o") === "1") {
          el.style.setProperty("--spot-o", "0");
        }
      }
    }
    updateMagneticTargets();
  }

  const onMouseMove = (e) => {
    markActive();
    cursorClientX = e.clientX;
    cursorClientY = e.clientY;
    lastSpotX = e.clientX;
    lastSpotY = e.clientY;
    if (!spotRafPending) {
      spotRafPending = true;
      requestAnimationFrame(updateSpotlightTargets);
    }
    targetMouseX = e.clientX / Math.max(window.innerWidth, 1);
    targetMouseY = 1.0 - e.clientY / Math.max(window.innerHeight, 1);
    document.documentElement.style.setProperty("--cursor-x", `${e.clientX}px`);
    document.documentElement.style.setProperty("--cursor-y", `${e.clientY}px`);
    if (state.cursorTrail) {
      cursorTrail.push({ x: e.clientX, y: e.clientY, life: 1.0 });
      if (cursorTrail.length > 18) cursorTrail.shift();
    }
  };

  const onPointerDown = (e) => {
    markActive();
    if (!state.clickRipple) return;
    if (e.target && e.target.closest && e.target.closest(`#${UI_ROOT_ID}`)) return;
    const palette = SCENE_COLORS[state.scene] || SCENE_COLORS.cyberrain;
    ripples.push({
      x: e.clientX,
      y: e.clientY,
      r: 4,
      maxR: 62,
      alpha: 0.55,
      color: palette[Math.floor(Math.random() * palette.length)],
    });
  };

  // 代码复制微光气泡（Glass Copy Toast）
  let lastCopyToastAt = 0;
  function showCopyToast(x, y) {
    const now = performance.now();
    if (now - lastCopyToastAt < 280) return;
    lastCopyToastAt = now;
    const toast = document.createElement("div");
    toast.className = "agy-copy-toast";
    toast.textContent = "✓ 已复制";
    const px = Math.min(window.innerWidth - 96, Math.max(24, x));
    const py = Math.max(32, y - 14);
    toast.style.left = `${px}px`;
    toast.style.top = `${py}px`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 960);
  }

  const onCopyButtonClick = (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!btn) return;
    if (btn.closest(`#${UI_ROOT_ID}`)) return;
    const label = `${btn.getAttribute("aria-label") || ""} ${btn.getAttribute("title") || ""} ${btn.textContent || ""}`;
    if (/\bcopy\b|复制/i.test(label)) {
      const r = btn.getBoundingClientRect();
      showCopyToast(r.left + r.width * 0.5, r.top);
    }
  };

  const onDocumentCopy = () => {
    const x = cursorClientX > 0 ? cursorClientX : window.innerWidth * 0.5;
    const y = cursorClientY > 0 ? cursorClientY : window.innerHeight * 0.5;
    showCopyToast(x, y);
  };

  const onKeyDown = (e) => {
    markActive();
    // Option+Shift+Z 一键切换禅模式
    if (e.altKey && e.shiftKey && (e.key === "Z" || e.key === "z" || e.code === "KeyZ")) {
      state.zenMode = !state.zenMode;
      applyStateToDOM();
      saveState();
      const cb = document.getElementById("agy-fx-zen");
      if (cb) cb.checked = state.zenMode;
      return;
    }

    const box = document.querySelector('[data-testid="agent-input-box"]');
    const active = document.activeElement;
    const isEditable = Boolean(
      active &&
        (active.tagName === "TEXTAREA" ||
          active.tagName === "INPUT" ||
          active.isContentEditable ||
          (box && box.contains(active)))
    );
    if (!isEditable) return;

    const ignoredKeys = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Escape", "Tab"]);
    if (state.keySound && state.keySound !== "off" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
      // 兼容中文输入法（IME 敲击时 e.key === "Process"）及所有字符/空格/回车/退格键
      if (!ignoredKeys.has(e.key)) {
        playKeySound(state.keySound, e.code === "Space" ? " " : e.key, e.code, "down");
      }
    }

    if (!state.typingSparks || !box || !box.contains(active)) return;
    const rect = box.getBoundingClientRect();
    const palette = SCENE_COLORS[state.scene] || SCENE_COLORS.cyberrain;

    if (e.key === "Enter" && !e.shiftKey) {
      // 发送流光脉冲
      for (let i = 0; i < 16; i += 1) {
        const px = rect.left + (rect.width * i) / 15;
        sparks.push({
          x: px,
          y: rect.top + 2,
          vx: (Math.random() - 0.5) * 1.8,
          vy: -1.4 - Math.random() * 2.4,
          size: 1.8 + Math.random() * 2.2,
          alpha: 0.95,
          decay: 0.028 + Math.random() * 0.02,
          color: palette[i % palette.length],
        });
      }
      return;
    }

    if (e.key.length === 1 || e.key === "Backspace") {
      let sx = rect.left + 28 + Math.random() * Math.max(40, rect.width - 60);
      let sy = rect.top + 24;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0).getBoundingClientRect();
        if (r && r.left > 0 && r.top > 0) {
          sx = r.left;
          sy = r.top + r.height * 0.5;
        }
      }
      for (let i = 0; i < 4; i += 1) {
        sparks.push({
          x: sx,
          y: sy,
          vx: (Math.random() - 0.5) * 2.6,
          vy: -0.9 - Math.random() * 2.2,
          size: 1.3 + Math.random() * 1.8,
          alpha: 0.9,
          decay: 0.04 + Math.random() * 0.025,
          color: palette[Math.floor(Math.random() * palette.length)],
        });
      }
    }
  };

  const onKeyUp = (e) => {
    if (!state.keySound || state.keySound === "off") return;
    const ignoredKeys = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Escape", "Tab"]);
    if (ignoredKeys.has(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
    const active = document.activeElement;
    const box = document.querySelector('[data-testid="agent-input-box"]');
    const isEditable = Boolean(
      active &&
        (active.tagName === "TEXTAREA" ||
          active.tagName === "INPUT" ||
          active.isContentEditable ||
          (box && box.contains(active)))
    );
    if (!isEditable) return;
    playKeySound(state.keySound, e.code === "Space" ? " " : e.key, e.code, "up");
  };

  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("click", onCopyButtonClick, true);
  document.addEventListener("copy", onDocumentCopy, true);
  // 使用捕获阶段监听，避免富文本输入框拦截冒泡导致键盘音效/火花漏触发
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("resize", resizeCanvases, { passive: true });

  // 检测 AI 是否正在思考/输出（驱动流光呼吸环、3D 核心加速、完成极光脉冲与水晶提示音）
  let aiBusyTarget = 0;
  let aiBusySmooth = 0;
  let wasAiBusy = false;

  // 动态计算当前可用对话宽度有效范围（自动扣除侧边栏与已展开的 Overview Panel 宽度，消除滑块死区）
  function getEffectiveChatWidthBounds() {
    const host =
      document.querySelector('[data-testid="overview-panel-host"]') ||
      document.querySelector("[data-main-content-body]");
    let avail = 1200;
    if (host) {
      const cs = getComputedStyle(host);
      const pr = parseFloat(cs.paddingRight) || 0;
      const pl = parseFloat(cs.paddingLeft) || 0;
      avail = Math.floor(host.clientWidth - pr - pl - 32);
    }
    const maxW = Math.max(640, Math.floor(avail / 20) * 20);
    const minW = Math.min(640, Math.max(480, maxW - 120));
    return { minW, maxW };
  }

  function syncChatWidthSlider() {
    const { minW, maxW } = getEffectiveChatWidthBounds();
    const isFull = state.chatWidth === "full" || Number(state.chatWidth) >= maxW;
    const effectiveVal = isFull ? maxW : Math.min(maxW, Math.max(minW, Number(state.chatWidth) || 1080));
    document.documentElement.style.setProperty(
      "--studio-chat-width",
      isFull ? "100%" : `${effectiveVal}px`
    );

    const sl = document.getElementById("agy-sl-chatw");
    const valEl = document.getElementById("agy-val-chatw");
    if (sl) {
      if (Number(sl.min) !== minW) sl.min = String(minW);
      if (Number(sl.max) !== maxW) sl.max = String(maxW);
      if (Number(sl.value) !== effectiveVal) sl.value = String(effectiveVal);
      sl.title = `当前有效范围: ${minW}px ~ ${maxW}px`;
    }
    if (valEl) {
      valEl.textContent = isFull ? `满宽` : `${effectiveVal}`;
      valEl.title = `有效上限 ${maxW}px`;
    }
  }

  // 内置侧边浏览器（Electron browser-hole）动态镂空：
  // 仅当 body[data-has-browser-hole="true"] 真正激活原生浏览器视图时才抠出浏览器矩形，
  // 切到 Side Question / 文件 / 终端等标签时自动恢复完整动态背景
  let lastHoleClip = "";
  function syncBrowserHoleCutout() {
    const isBrowserHoleActive =
      document.body.getAttribute("data-has-browser-hole") === "true" ||
      Boolean(document.querySelector('[data-side-panel-body] [data-has-browser-hole="true"]'));
    const sp = isBrowserHoleActive ? document.querySelector("[data-side-panel-body]") : null;
    let holeRect = null;
    if (sp) {
      const r = sp.getBoundingClientRect();
      if (r.width > 120 && r.height > 120 && r.left < window.innerWidth) {
        holeRect = r;
      }
    }
    let clip = "none";
    if (holeRect) {
      const x1 = Math.max(0, Math.floor(holeRect.left));
      const y1 = Math.max(0, Math.floor(holeRect.top));
      const x2 = Math.ceil(holeRect.right);
      const y2 = Math.ceil(holeRect.bottom);
      clip = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x1}px ${y1}px, ${x1}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${y1}px, ${x1}px ${y1}px)`;
    }
    if (clip !== lastHoleClip) {
      lastHoleClip = clip;
      bgCanvas.style.clipPath = clip;
      if (wallpaperEl) wallpaperEl.style.clipPath = clip;
    }
  }

  let busyCheckTimer = setInterval(() => {
    if (destroyed) return;
    syncBrowserHoleCutout();
    syncChatWidthSlider();
    // 仅检测当前对话输入框内部的取消/停止按钮，避免被左侧栏其他会话的加载图标误触发常亮
    const rawBusy = Boolean(
      document.querySelector('[data-testid="agent-input-box"] [data-testid="input-cancel-button"]') ||
        document.querySelector('[data-testid="agent-input-box"] [data-testid="stop-button"]') ||
        document.querySelector('[data-testid="agent-input-box"] button[aria-label*="Stop" i]')
    );
    aiBusyTarget = rawBusy ? 1 : 0;
    document.documentElement.setAttribute("data-ai-busy", state.aiPulse && rawBusy ? "true" : "false");

    if (wasAiBusy && !rawBusy && state.doneChime) {
      triggerDonePulse();
      playCompletionChime();
    }
    wasAiBusy = rawBusy;

    // 昼夜天空在白天时段自动切为高可读浅色文本（同步更新 data-light-surface）
    if (state.scene === "circadian") {
      const now = new Date();
      const hr = now.getHours() + now.getMinutes() / 60;
      const isDay = hr >= 7.5 && hr <= 16.8;
      document.documentElement.setAttribute("data-circadian-day", isDay ? "true" : "false");
      document.documentElement.setAttribute("data-light-surface", isDay ? "on" : "off");
    } else {
      document.documentElement.removeAttribute("data-circadian-day");
    }
  }, 450);

  function renderFxOverlay() {
    if (!fxCtx) return;
    const needDraw =
      sparks.length > 0 || ripples.length > 0 || cursorTrail.length > 0 || state.constellation || state.ambientParticles;
    if (!needDraw) {
      if (fxCanvas.dataset.dirty === "1") {
        fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
        fxCanvas.dataset.dirty = "0";
      }
      return;
    }
    fxCanvas.dataset.dirty = "1";
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);

    const palette = SCENE_COLORS[state.scene] || SCENE_COLORS.cyberrain;
    const accent = palette[0];

    // 1. 鼠标彗尾轨迹（独立开关，默认关闭）
    if (cursorTrail.length > 0) {
      for (let i = cursorTrail.length - 1; i >= 0; i -= 1) {
        cursorTrail[i].life -= 0.055;
        if (cursorTrail[i].life <= 0) {
          cursorTrail.splice(i, 1);
        }
      }
      if (state.cursorTrail && cursorTrail.length > 1) {
        for (let i = 1; i < cursorTrail.length; i += 1) {
          const a = cursorTrail[i - 1];
          const b = cursorTrail[i];
          fxCtx.save();
          fxCtx.beginPath();
          fxCtx.moveTo(a.x, a.y);
          fxCtx.lineTo(b.x, b.y);
          fxCtx.strokeStyle = accent;
          fxCtx.globalAlpha = b.life * 0.36;
          fxCtx.lineWidth = Math.max(0.8, b.life * 2.8);
          fxCtx.lineCap = "round";
          fxCtx.stroke();
          fxCtx.restore();
        }
      }
    }

    // 2. 漂浮星尘与光标引力星座连线（默认开启，零 shadowBlur 双层圆绘制以保持极低 CPU 占用）
    if (state.constellation) {
      const w = fxCanvas.width;
      const h = fxCanvas.height;
      const nearNodes = [];
      const secondary = palette[1] || accent;
      fxCtx.lineCap = "round";
      for (let i = 0; i < dustNodes.length; i += 1) {
        const nd = dustNodes[i];
        nd.x += nd.vx;
        nd.y += nd.vy;
        if (nd.x < 0) nd.x = w;
        if (nd.x > w) nd.x = 0;
        if (nd.y < 0) nd.y = h;
        if (nd.y > h) nd.y = 0;

        const dx = cursorClientX - nd.x;
        const dy = cursorClientY - nd.y;
        const distSq = dx * dx + dy * dy;
        const isNear = distSq < 44100; // 210^2
        if (isNear) {
          const dist = Math.sqrt(distSq);
          nearNodes.push(nd);
          if (dist > 85) {
            // 远区微弱引力靠近，同时带一丝切向环绕
            const pull = (1 - dist / 210) * 0.14;
            nd.x += (dx / dist) * pull - (dy / dist) * 0.12;
            nd.y += (dy / dist) * pull + (dx / dist) * 0.12;
          } else if (dist > 1) {
            // 近区柔和排斥缓冲，防止星尘被吸到鼠标下凝成一团
            const push = (1 - dist / 85) * 0.42;
            nd.x -= (dx / dist) * push;
            nd.y -= (dy / dist) * push;
          }

          fxCtx.beginPath();
          fxCtx.moveTo(nd.x, nd.y);
          fxCtx.lineTo(cursorClientX, cursorClientY);
          fxCtx.strokeStyle = accent;
          fxCtx.globalAlpha = (1 - dist / 210) * 0.5;
          fxCtx.lineWidth = 1.0;
          fxCtx.stroke();
        }

        const r = isNear ? nd.r * 1.25 : nd.r;
        const fill = i % 2 === 0 ? accent : secondary;
        // 外圈柔和光晕（用低透明大圆替代高开销 shadowBlur）
        fxCtx.fillStyle = fill;
        fxCtx.globalAlpha = isNear ? 0.22 : 0.1;
        fxCtx.beginPath();
        fxCtx.arc(nd.x, nd.y, r * 2.5, 0, Math.PI * 2);
        fxCtx.fill();
        // 内核星点
        fxCtx.globalAlpha = isNear ? 0.88 : 0.42;
        fxCtx.beginPath();
        fxCtx.arc(nd.x, nd.y, r, 0, Math.PI * 2);
        fxCtx.fill();
      }

      // 光标附近的星尘两两互连，同时保持最小安全间距避免抱团
      fxCtx.strokeStyle = secondary;
      fxCtx.lineWidth = 0.8;
      for (let i = 0; i < nearNodes.length; i += 1) {
        const a = nearNodes[i];
        for (let j = i + 1; j < nearNodes.length; j += 1) {
          const b = nearNodes[j];
          const sdx = a.x - b.x;
          const sdy = a.y - b.y;
          const dSq = sdx * sdx + sdy * sdy;
          if (dSq < 16900) { // 130^2
            const d = Math.sqrt(dSq);
            if (d < 42 && d > 0.5) {
              const sep = (1 - d / 42) * 0.35;
              const nx = (sdx / d) * sep;
              const ny = (sdy / d) * sep;
              a.x += nx;
              a.y += ny;
              b.x -= nx;
              b.y -= ny;
            }
            fxCtx.globalAlpha = (1 - d / 130) * 0.3;
            fxCtx.beginPath();
            fxCtx.moveTo(a.x, a.y);
            fxCtx.lineTo(b.x, b.y);
            fxCtx.stroke();
          }
        }
      }
      fxCtx.globalAlpha = 1;
    }

    // 2.5 场景专属飘浮微粒（花瓣 / 雪花 / 萤火 / 暖金箔 / 火星，自动适配当前场景）
    if (state.ambientParticles) {
      const w = fxCanvas.width;
      const h = fxCanvas.height;
      const nowSec = performance.now() * 0.001;
      const sc = state.scene;
      const isFalling = sc === "sakura" || sc === "snowfall";
      const isRising = sc === "ember" || sc === "dune" || sc === "changan" || sc === "bamboo";
      const isPetal = sc === "sakura";
      const isSnow = sc === "snowfall";
      const isFirefly = sc === "bamboo" || sc === "inkwash";
      const isGold = sc === "matcha" || sc === "sunlit";

      for (let i = 0; i < driftMotes.length; i += 1) {
        const m = driftMotes[i];
        const sway = Math.sin(nowSec * 0.8 + m.phase) * 0.45;
        if (isFalling) {
          m.x += (isPetal ? 0.55 : 0.25) * m.speed + sway * 0.6;
          m.y += (isSnow ? 0.85 : 0.68) * m.speed;
        } else if (isRising) {
          m.x += sway * 0.65;
          m.y -= (sc === "ember" ? 0.82 : 0.42) * m.speed;
        } else {
          m.x += sway * 0.45 + 0.14 * m.speed;
          m.y += Math.cos(nowSec * 0.6 + m.phase) * 0.28;
        }
        m.rot += 0.015 * m.speed;

        if (m.x < -12) m.x = w + 10;
        if (m.x > w + 12) m.x = -10;
        if (m.y < -12) m.y = h + 10;
        if (m.y > h + 12) m.y = -10;

        const blink = isFirefly ? 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(nowSec * 2.1 + m.phase)) : 0.72;
        if (isPetal) {
          fxCtx.save();
          fxCtx.translate(m.x, m.y);
          fxCtx.rotate(m.rot);
          fxCtx.fillStyle = i % 2 === 0 ? "#fbcfe8" : "#f9a8d4";
          fxCtx.globalAlpha = 0.52;
          fxCtx.beginPath();
          fxCtx.ellipse(0, 0, m.size * 1.45, m.size * 0.72, 0, 0, Math.PI * 2);
          fxCtx.fill();
          fxCtx.restore();
        } else {
          const color = isSnow
            ? "#e2f1ff"
            : isFirefly
              ? "#6ee7b7"
              : isGold
                ? "#c9a44c"
                : i % 2 === 0
                  ? accent
                  : palette[1] || accent;
          fxCtx.fillStyle = color;
          // 柔和外晕
          fxCtx.globalAlpha = blink * (isSnow ? 0.18 : 0.16);
          fxCtx.beginPath();
          fxCtx.arc(m.x, m.y, m.size * 2.3, 0, Math.PI * 2);
          fxCtx.fill();
          // 粒子内核
          fxCtx.globalAlpha = blink * (isSnow ? 0.78 : isGold ? 0.56 : 0.68);
          fxCtx.beginPath();
          fxCtx.arc(m.x, m.y, m.size * 0.85, 0, Math.PI * 2);
          fxCtx.fill();
        }
      }
      fxCtx.globalAlpha = 1;
    }

    // 避让聊天与预览中的图片/视频区域，防止星尘或氛围微粒覆盖在图片画面上干扰观图
    if (state.constellation || state.ambientParticles) {
      const w = fxCanvas.width;
      const h = fxCanvas.height;
      const mediaEls = document.querySelectorAll(
        '[data-main-content-body] img, [data-side-panel-body] img, [role="dialog"] img, [data-main-content-body] video, [data-side-panel-body] video'
      );
      for (let i = 0; i < mediaEls.length; i += 1) {
        const r = mediaEls[i].getBoundingClientRect();
        if (r.width >= 80 && r.height >= 60 && r.bottom > 0 && r.top < h && r.right > 0 && r.left < w) {
          fxCtx.clearRect(r.left, r.top, r.width, r.height);
        }
      }
    }

    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      const rp = ripples[i];
      rp.r += (rp.maxR - rp.r) * 0.14 + 1.2;
      rp.alpha *= 0.91;
      if (rp.alpha < 0.02 || rp.r >= rp.maxR) {
        ripples.splice(i, 1);
        continue;
      }
      fxCtx.save();
      fxCtx.beginPath();
      fxCtx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      fxCtx.strokeStyle = rp.color;
      fxCtx.globalAlpha = rp.alpha;
      fxCtx.lineWidth = 1.4;
      fxCtx.stroke();
      fxCtx.restore();
    }

    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const sp = sparks[i];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.vy += 0.07;
      sp.alpha -= sp.decay;
      if (sp.alpha <= 0.02) {
        sparks.splice(i, 1);
        continue;
      }
      fxCtx.save();
      fxCtx.globalAlpha = sp.alpha;
      fxCtx.fillStyle = sp.color;
      fxCtx.shadowColor = sp.color;
      fxCtx.shadowBlur = 8;
      fxCtx.beginPath();
      fxCtx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
      fxCtx.fill();
      fxCtx.restore();
    }
  }

  /* ========================================================================
     4. 悬浮「主题控制胶囊」UI
     ======================================================================== */
  function buildStudioUI() {
    let root = document.getElementById(UI_ROOT_ID);
    if (root) root.remove();
    root = document.createElement("div");
    root.id = UI_ROOT_ID;

    const SCENES_DARK = [
      { id: "cyberrain", label: "🌧️ 赛博雨夜" },
      { id: "changan", label: "🏮 长安雨巷" },
      { id: "snowfall", label: "❄️ 极地雪夜" },
      { id: "cosmic", label: "🌌 宇宙星空" },
      { id: "blackhole", label: "🕳️ 星际黑洞" },
      { id: "aurora", label: "✨ 北极极光" },
      { id: "biolum", label: "🪼 荧光海滩" },
      { id: "bamboo", label: "🎋 竹林雾雨" },
      { id: "prism", label: "🔮 棱镜极光" },
      { id: "dune", label: "🏜️ 沙丘星夜" },
      { id: "synthwave", label: "🌇 蒸汽波网格" },
      { id: "abyssal", label: "🌊 深海荧光" },
      { id: "chrome", label: "🫧 液态金属" },
      { id: "sakura", label: "🌸 樱吹雪夜" },
      { id: "ember", label: "🔥 火山余烬" },
      { id: "circadian", label: "🌅 真实昼夜" },
    ];
    const SCENES_LIGHT_AND_BASE = [
      { id: "sunlit", label: "🌤️ 午后窗影" },
      { id: "inkwash", label: "🏔️ 水墨云海" },
      { id: "matcha", label: "🍵 禅意抹茶" },
      { id: "wallpaper", label: "🎬 动态壁纸" },
      { id: "none", label: "☕ 纯净编辑室" },
    ];
    const VALID_TABS = new Set(["scenes", "visual", "fx", "focus"]);
    const initTab = VALID_TABS.has(state.activeTab) ? state.activeTab : "scenes";

    root.innerHTML = `
      <div class="agy-studio-panel" data-open="false">
        <div class="agy-studio-head">
          <span>✦ 主题工坊</span>
          <button type="button" class="agy-studio-close" title="收起">×</button>
        </div>
        <div class="agy-studio-tabs" role="tablist">
          <button type="button" class="agy-tab-btn ${initTab === "scenes" ? "active" : ""}" data-tab="scenes">🎨 场景</button>
          <button type="button" class="agy-tab-btn ${initTab === "visual" ? "active" : ""}" data-tab="visual">👁️ 视觉</button>
          <button type="button" class="agy-tab-btn ${initTab === "fx" ? "active" : ""}" data-tab="fx">✨ 动效</button>
          <button type="button" class="agy-tab-btn ${initTab === "focus" ? "active" : ""}" data-tab="focus">🎧 专注</button>
        </div>

        <div class="agy-tab-body">
          <!-- 分页 1：场景与壁纸 -->
          <div class="agy-tab-pane ${initTab === "scenes" ? "active" : ""}" data-pane="scenes">
            <div class="agy-studio-sec-label">深色与昼夜动态场景</div>
            <div class="agy-studio-grid">
              ${SCENES_DARK.map(
                (s) =>
                  `<button type="button" class="agy-scene-btn" data-scene-id="${s.id}">${s.label}</button>`
              ).join("")}
            </div>
            <div class="agy-studio-sec-label">浅色雅致 / 壁纸与纯色</div>
            <div class="agy-studio-grid">
              ${SCENES_LIGHT_AND_BASE.map(
                (s) =>
                  `<button type="button" class="agy-scene-btn" data-scene-id="${s.id}">${s.label}</button>`
              ).join("")}
            </div>
            <div class="agy-wp-bar">
              <div class="agy-wp-actions">
                <button type="button" class="agy-wp-pick-btn" id="agy-wp-pick">📁 添加本地视频 / 图片</button>
                <button type="button" class="agy-mini-btn" id="agy-wp-next" title="切换下一张壁纸">⏭ 换一张</button>
              </div>
              <input type="file" id="agy-wp-file" multiple accept="video/mp4,video/webm,video/quicktime,image/*" style="display:none" />
              <div class="agy-wp-list" id="agy-wp-list"></div>
              <div class="agy-wp-subrow">
                <label><input type="checkbox" id="agy-wp-rotate" ${state.wpAutoRotate ? "checked" : ""}/> 10 分钟自动轮换壁纸</label>
              </div>
            </div>
          </div>

          <!-- 分页 2：视觉、护眼与配色 -->
          <div class="agy-tab-pane ${initTab === "visual" ? "active" : ""}" data-pane="visual">
            <div class="agy-studio-sec-label">通透度、模糊与排版</div>
            <label class="agy-slider-row">
              <span>遮罩浓度</span>
              <input type="range" id="agy-sl-alpha" min="0.06" max="0.78" step="0.02" value="${state.alpha}" />
              <em id="agy-val-alpha">${Math.round(state.alpha * 100)}%</em>
            </label>
            <label class="agy-slider-row">
              <span>画面模糊</span>
              <input type="range" id="agy-sl-mainblur" min="0" max="16" step="1" value="${state.mainBlur}" />
              <em id="agy-val-mainblur">${state.mainBlur}px</em>
            </label>
            <label class="agy-slider-row">
              <span>侧栏模糊</span>
              <input type="range" id="agy-sl-blur" min="0" max="24" step="1" value="${state.blur}" />
              <em id="agy-val-blur">${state.blur}px</em>
            </label>
            <label class="agy-slider-row">
              <span>对话宽度</span>
              <input type="range" id="agy-sl-chatw" min="720" max="1560" step="20" value="${state.chatWidth}" />
              <em id="agy-val-chatw">${state.chatWidth >= 1560 ? "满宽" : `${state.chatWidth}`}</em>
            </label>
            <div class="agy-studio-sec-label">护眼与高亮主色</div>
            <div class="agy-toggles">
              <label><input type="checkbox" id="agy-adaptive-comfort" ${state.adaptiveComfort ? "checked" : ""}/> 👁️ 自适应护眼</label>
              <label><input type="checkbox" id="agy-auto-accent" ${state.autoAccent ? "checked" : ""}/> 🎨 壁纸自动取色</label>
            </div>
            <div class="agy-accent-row">
              <span>自定义高亮主色</span>
              <input type="color" id="agy-accent-picker" value="${state.customAccent || "#22d3ee"}" title="自定义界面高亮色" />
              <button type="button" class="agy-mini-btn" id="agy-accent-reset">恢复默认</button>
            </div>
          </div>

          <!-- 分页 3：质感与交互动效 -->
          <div class="agy-tab-pane ${initTab === "fx" ? "active" : ""}" data-pane="fx">
            <div class="agy-studio-sec-label">界面光效与反馈</div>
            <div class="agy-toggles">
              <label><input type="checkbox" id="agy-fx-spotlight" ${state.spotlight ? "checked" : ""}/> 💎 边框聚光灯</label>
              <label><input type="checkbox" id="agy-fx-halo" ${state.cursorHalo ? "checked" : ""}/> 💡 鼠标光晕</label>
              <label><input type="checkbox" id="agy-fx-aipulse" ${state.aiPulse ? "checked" : ""}/> ✨ AI 流光环</label>
              <label><input type="checkbox" id="agy-fx-chime" ${state.doneChime ? "checked" : ""}/> 🔔 完成提示</label>
              <label><input type="checkbox" id="agy-fx-eco" ${state.ecoMode ? "checked" : ""}/> 🔋 省电模式</label>
            </div>
            <div class="agy-studio-sec-label">粒子与鼠标特效</div>
            <div class="agy-toggles">
              <label><input type="checkbox" id="agy-fx-particles" ${state.ambientParticles ? "checked" : ""}/> 🌸 氛围微粒</label>
              <label><input type="checkbox" id="agy-fx-constellation" ${state.constellation ? "checked" : ""}/> 🧲 星尘星座</label>
              <label><input type="checkbox" id="agy-fx-sparks" ${state.typingSparks ? "checked" : ""}/> ⌨️ 打字火花</label>
              <label><input type="checkbox" id="agy-fx-ripple" ${state.clickRipple ? "checked" : ""}/> 💧 点击涟漪</label>
              <label><input type="checkbox" id="agy-fx-trail" ${state.cursorTrail ? "checked" : ""}/> ☄️ 鼠标轨迹</label>
            </div>
            <div id="agy-fx-scene-exclusive" style="${SCENE_FX_META[state.scene] ? "" : "display:none"}">
              <div class="agy-studio-sec-label">当前主题专属</div>
              <div class="agy-toggles">
                <label><input type="checkbox" id="agy-fx-scene-cb" ${isSceneFxEnabled(state.scene) ? "checked" : ""}/> <span id="agy-fx-scene-label">${SCENE_FX_META[state.scene] || "⚡ 主题特效"}</span></label>
              </div>
            </div>
          </div>

          <!-- 分页 4：专注、番茄钟与音效 -->
          <div class="agy-tab-pane ${initTab === "focus" ? "active" : ""}" data-pane="focus">
            <div class="agy-studio-sec-label">禅模式与专注番茄钟</div>
            <div class="agy-pomo-box">
              <div class="agy-pomo-top">
                <label><input type="checkbox" id="agy-fx-zen" ${state.zenMode ? "checked" : ""}/> 🧘 禅模式 <small>(⌥⇧Z)</small></label>
                <span class="agy-pomo-clock" id="agy-pomo-time">${formatMMSS(pomoRemainSec)}</span>
              </div>
              <div class="agy-pomo-btns">
                <button type="button" class="agy-mini-btn primary" id="agy-pomo-toggle">▶ 开始专注</button>
                <button type="button" class="agy-mini-btn" id="agy-pomo-25">25m</button>
                <button type="button" class="agy-mini-btn" id="agy-pomo-50">50m</button>
                <button type="button" class="agy-mini-btn" id="agy-pomo-reset">重置</button>
              </div>
            </div>
            <div class="agy-studio-sec-label">客制化机械键盘音效</div>
            <div class="agy-key-row">
              <select id="agy-key-sound" class="agy-select">
                <option value="off" ${state.keySound === "off" ? "selected" : ""}>🔇 关闭按键音</option>
                <option value="thock" ${state.keySound === "thock" ? "selected" : ""}>⌨️ 温润麻将音 (Thock)</option>
                <option value="clicky" ${state.keySound === "clicky" ? "selected" : ""}>💠 清脆青轴 (Clicky)</option>
                <option value="typewriter" ${state.keySound === "typewriter" ? "selected" : ""}>🎞️ 复古打字机</option>
              </select>
            </div>
            <label class="agy-slider-row">
              <span>按键音量</span>
              <input type="range" id="agy-sl-keyvol" min="0.05" max="1" step="0.05" value="${state.keyVol}" />
              <em id="agy-val-keyvol">${Math.round(state.keyVol * 100)}%</em>
            </label>
            <div class="agy-studio-sec-label">场景氛围白噪音</div>
            <div class="agy-toggles">
              <label><input type="checkbox" id="agy-fx-audio" ${state.ambientAudio ? "checked" : ""}/> 🎧 开启氛围白噪音</label>
            </div>
            <label class="agy-slider-row">
              <span>氛围音量</span>
              <input type="range" id="agy-sl-vol" min="0.05" max="1" step="0.05" value="${state.ambientVol}" />
              <em id="agy-val-vol">${Math.round(state.ambientVol * 100)}%</em>
            </label>
          </div>
        </div>
      </div>
      <button type="button" class="agy-studio-fab" title="切换主题与特效">✦ 主题</button>
    `;

    document.body.appendChild(root);

    const panel = root.querySelector(".agy-studio-panel");
    const fab = root.querySelector(".agy-studio-fab");
    const closeBtn = root.querySelector(".agy-studio-close");

    // 优雅分页切换
    root.querySelectorAll(".agy-tab-btn").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        const tab = tabBtn.getAttribute("data-tab");
        if (!tab || !VALID_TABS.has(tab)) return;
        state.activeTab = tab;
        root.querySelectorAll(".agy-tab-btn").forEach((b) => {
          b.classList.toggle("active", b.getAttribute("data-tab") === tab);
        });
        root.querySelectorAll(".agy-tab-pane").forEach((p) => {
          p.classList.toggle("active", p.getAttribute("data-pane") === tab);
        });
        if (tab === "visual") syncChatWidthSlider();
        saveState();
      });
    });

    const syncButtons = () => {
      root.querySelectorAll(".agy-scene-btn").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-scene-id") === state.scene);
      });
    };
    syncButtons();

    const togglePanel = (open) => {
      state.panelOpen = typeof open === "boolean" ? open : !state.panelOpen;
      panel.setAttribute("data-open", state.panelOpen ? "true" : "false");
      if (state.panelOpen) syncChatWidthSlider();
    };

    fab.addEventListener("click", () => togglePanel());
    closeBtn.addEventListener("click", () => togglePanel(false));

    const wpPickBtn = root.querySelector("#agy-wp-pick");
    const wpNextBtn = root.querySelector("#agy-wp-next");
    const wpFileInput = root.querySelector("#agy-wp-file");
    wpPickBtn.addEventListener("click", () => wpFileInput.click());
    wpNextBtn.addEventListener("click", () => nextWallpaper());
    wpFileInput.addEventListener("change", async () => {
      const files = Array.from(wpFileInput.files || []);
      if (files.length === 0) return;
      try {
        const added = await addWallpaperFiles(files);
        if (added.length > 0) {
          state.scene = "wallpaper";
          mountWallpaperBlob(added[added.length - 1]);
          applyStateToDOM();
          syncAmbientAudio();
          saveState();
          syncButtons();
        }
      } catch (err) {
        console.warn("[Wallpaper] save failed:", err);
      }
      wpFileInput.value = "";
    });

    root.querySelector("#agy-wp-rotate").addEventListener("change", (e) => {
      state.wpAutoRotate = e.target.checked;
      syncWallpaperRotation();
      saveState();
    });

    root.querySelector("#agy-auto-accent").addEventListener("change", (e) => {
      state.autoAccent = e.target.checked;
      if (state.autoAccent) {
        state.customAccent = "";
        sampleWallpaperAccent();
      } else if (!state.customAccent) {
        applyAccentOverride("");
      }
      saveState();
    });

    root.querySelector("#agy-adaptive-comfort").addEventListener("change", (e) => {
      state.adaptiveComfort = e.target.checked;
      applyStateToDOM();
      saveState();
    });

    root.querySelector("#agy-accent-picker").addEventListener("input", (e) => {
      state.customAccent = e.target.value;
      state.autoAccent = false;
      const autoCb = root.querySelector("#agy-auto-accent");
      if (autoCb) autoCb.checked = false;
      applyAccentOverride(state.customAccent);
      saveState();
    });

    root.querySelector("#agy-accent-reset").addEventListener("click", () => {
      state.customAccent = "";
      applyAccentOverride("");
      if (state.scene === "wallpaper" && state.autoAccent) {
        sampleWallpaperAccent();
      }
      saveState();
    });

    root.querySelector("#agy-fx-zen").addEventListener("change", (e) => {
      state.zenMode = e.target.checked;
      applyStateToDOM();
      saveState();
    });

    root.querySelector("#agy-pomo-toggle").addEventListener("click", () => togglePomo());
    root.querySelector("#agy-pomo-25").addEventListener("click", () => {
      resetPomo(25);
      saveState();
    });
    root.querySelector("#agy-pomo-50").addEventListener("click", () => {
      resetPomo(50);
      saveState();
    });
    root.querySelector("#agy-pomo-reset").addEventListener("click", () => resetPomo());

    root.querySelector("#agy-key-sound").addEventListener("change", (e) => {
      state.keySound = e.target.value;
      if (state.keySound !== "off") {
        playKeySound(state.keySound, "a", "KeyA", "down");
        setTimeout(() => playKeySound(state.keySound, "a", "KeyA", "up"), 65);
      }
      saveState();
    });

    const slKeyVol = root.querySelector("#agy-sl-keyvol");
    const valKeyVol = root.querySelector("#agy-val-keyvol");
    slKeyVol.addEventListener("input", () => {
      state.keyVol = Number(slKeyVol.value);
      valKeyVol.textContent = `${Math.round(state.keyVol * 100)}%`;
      saveState();
    });
    slKeyVol.addEventListener("change", () => {
      if (state.keySound !== "off") {
        playKeySound(state.keySound, "a", "KeyA", "down");
        setTimeout(() => playKeySound(state.keySound, "a", "KeyA", "up"), 65);
      }
    });

    root.querySelectorAll(".agy-scene-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextScene = btn.getAttribute("data-scene-id");
        const changed = nextScene !== state.scene;
        state.scene = nextScene;
        if (changed) triggerSceneMorph();
        applyStateToDOM();
        syncAmbientAudio();
        saveState();
        syncButtons();
        if (nextScene === "wallpaper" && wallpaperList.length === 0) {
          wpFileInput.click();
        } else if (nextScene === "wallpaper" && !wallpaperEl && wallpaperList.length > 0) {
          const target = wallpaperList.find((w) => w.id === state.activeWallpaperId) || wallpaperList[0];
          mountWallpaperBlob(target);
        }
      });
    });

    const slAlpha = root.querySelector("#agy-sl-alpha");
    const valAlpha = root.querySelector("#agy-val-alpha");
    slAlpha.addEventListener("input", () => {
      state.alpha = Number(slAlpha.value);
      valAlpha.textContent = `${Math.round(state.alpha * 100)}%`;
      applyStateToDOM();
      saveState();
    });

    const slMainBlur = root.querySelector("#agy-sl-mainblur");
    const valMainBlur = root.querySelector("#agy-val-mainblur");
    slMainBlur.addEventListener("input", () => {
      state.mainBlur = Number(slMainBlur.value);
      valMainBlur.textContent = `${state.mainBlur}px`;
      applyStateToDOM();
      saveState();
    });

    const slBlur = root.querySelector("#agy-sl-blur");
    const valBlur = root.querySelector("#agy-val-blur");
    slBlur.addEventListener("input", () => {
      state.blur = Number(slBlur.value);
      valBlur.textContent = `${state.blur}px`;
      applyStateToDOM();
      saveState();
    });

    const slChatW = root.querySelector("#agy-sl-chatw");
    slChatW.addEventListener("input", () => {
      const { maxW } = getEffectiveChatWidthBounds();
      const v = Number(slChatW.value);
      state.chatWidth = v >= maxW ? "full" : v;
      syncChatWidthSlider();
      saveState();
    });
    syncChatWidthSlider();

    root.querySelector("#agy-fx-eco").addEventListener("change", (e) => {
      state.ecoMode = e.target.checked;
      resizeCanvases();
      saveState();
    });
    root.querySelector("#agy-fx-scene-cb").addEventListener("change", (e) => {
      if (!state.sceneFxMap || typeof state.sceneFxMap !== "object") {
        state.sceneFxMap = {};
      }
      state.sceneFxMap[state.scene] = e.target.checked;
      if (state.scene === "cyberrain") {
        state.lightning = e.target.checked;
      }
      saveState();
    });
    root.querySelector("#agy-fx-aipulse").addEventListener("change", (e) => {
      state.aiPulse = e.target.checked;
      applyStateToDOM();
      saveState();
    });
    root.querySelector("#agy-fx-spotlight").addEventListener("change", (e) => {
      state.spotlight = e.target.checked;
      applyStateToDOM();
      saveState();
    });
    root.querySelector("#agy-fx-halo").addEventListener("change", (e) => {
      state.cursorHalo = e.target.checked;
      applyStateToDOM();
      saveState();
    });
    root.querySelector("#agy-fx-particles").addEventListener("change", (e) => {
      state.ambientParticles = e.target.checked;
      saveState();
    });
    root.querySelector("#agy-fx-sparks").addEventListener("change", (e) => {
      state.typingSparks = e.target.checked;
      saveState();
    });
    root.querySelector("#agy-fx-ripple").addEventListener("change", (e) => {
      state.clickRipple = e.target.checked;
      saveState();
    });
    root.querySelector("#agy-fx-trail").addEventListener("change", (e) => {
      state.cursorTrail = e.target.checked;
      if (!state.cursorTrail) cursorTrail.length = 0;
      saveState();
    });
    root.querySelector("#agy-fx-constellation").addEventListener("change", (e) => {
      state.constellation = e.target.checked;
      saveState();
    });
    root.querySelector("#agy-fx-chime").addEventListener("change", (e) => {
      state.doneChime = e.target.checked;
      if (state.doneChime) {
        triggerDonePulse();
        playCompletionChime();
      }
      saveState();
    });
    root.querySelector("#agy-fx-audio").addEventListener("change", (e) => {
      state.ambientAudio = e.target.checked;
      syncAmbientAudio();
      saveState();
    });
    const slVol = root.querySelector("#agy-sl-vol");
    const valVol = root.querySelector("#agy-val-vol");
    slVol.addEventListener("input", () => {
      state.ambientVol = Number(slVol.value);
      valVol.textContent = `${Math.round(state.ambientVol * 100)}%`;
      syncAmbientAudio();
      saveState();
    });
  }

  /* ========================================================================
     5. 清理钩子与 WebGPU 多管线主循环
     ======================================================================== */
  window.__cosmicWebGpuCleanup = () => {
    destroyed = true;
    if (rafId) cancelAnimationFrame(rafId);
    clearInterval(busyCheckTimer);
    if (wpRotateTimer) clearInterval(wpRotateTimer);
    if (accentSampleTimer) clearInterval(accentSampleTimer);
    if (pomoInterval) clearInterval(pomoInterval);
    if (sceneMorphTimer) clearTimeout(sceneMorphTimer);
    resetMagneticTargets();
    stopAmbientAudio();
    if (audioCtx) {
      try {
        audioCtx.close();
      } catch {
        // ignore
      }
      audioCtx = null;
    }
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("click", onCopyButtonClick, true);
    document.removeEventListener("copy", onDocumentCopy, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("resize", resizeCanvases);
    if (device) {
      try {
        device.destroy();
      } catch {
        // ignore
      }
      device = null;
    }
    document.removeEventListener("visibilitychange", onVisibilityChange);
    clearWallpaperElement();
    if (wallpaperObjectUrl) {
      URL.revokeObjectURL(wallpaperObjectUrl);
      wallpaperObjectUrl = null;
    }
    [BG_CANVAS_ID, WP_MEDIA_ID, HALO_ID, "agy-wp-vignette", FX_CANVAS_ID, POMO_BAR_ID, UI_ROOT_ID].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    const html = document.documentElement;
    [
      "data-cosmic-bg",
      "data-scene",
      "data-ai-busy",
      "data-ai-pulse-enabled",
      "data-zen-mode",
      "data-adaptive-comfort",
      "data-custom-accent",
      "data-light-surface",
      "data-circadian-day",
      "data-spotlight",
      "data-cursor-halo",
      "data-magnetic",
      "data-wp-filter",
    ].forEach((attr) => html.removeAttribute(attr));
    html.classList.remove("agy-scene-morphing");
    [
      "--studio-glass-alpha",
      "--studio-main-alpha",
      "--studio-main-blur",
      "--studio-sidebar-blur",
      "--studio-chat-width",
      "--studio-adaptive-scrim",
      "--studio-chip-alpha",
      "--studio-custom-accent",
    ].forEach((prop) => html.style.removeProperty(prop));
  };

  resizeCanvases();
  applyStateToDOM();
  buildStudioUI();
  updatePomoUI();
  loadAllWallpapers()
    .then((items) => {
      if (destroyed) return;
      renderWallpaperPlaylistUI();
      if (items.length > 0) {
        const chosen = items.find((w) => w.id === state.activeWallpaperId) || items[0];
        mountWallpaperBlob(chosen);
      }
    })
    .catch(() => {});
  accentSampleTimer = setInterval(() => {
    if (!destroyed && state.scene === "wallpaper" && (state.autoAccent || state.adaptiveComfort)) {
      sampleWallpaperAccent();
    }
  }, 2500);

  async function startWebGPU() {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter || destroyed) return false;
    device = await adapter.requestDevice();
    if (destroyed) {
      device.destroy();
      return false;
    }

    gpuCtx = bgCanvas.getContext("webgpu");
    if (!gpuCtx) return false;
    const format = navigator.gpu.getPreferredCanvasFormat();
    gpuCtx.configure({ device, format, alphaMode: "opaque" });

    uniformBuffer = device.createBuffer({
      size: uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    for (const [name, code] of Object.entries(SHADER_MAP)) {
      const module = device.createShaderModule({ code });
      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint: "fs", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });
      pipelines[name] = pipeline;
      bindGroups[name] = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });
    }

    window.__agyLoadedScenes = Object.keys(pipelines);
    const startTime = performance.now();
    let lastGpuFrame = 0;
    let lastFxFrame = 0;

    const frame = (now) => {
      if (destroyed) return;
      rafId = requestAnimationFrame(frame);
      if (document.hidden) return;

      resizeCanvases();

      // 省电模式 30fps + 无操作 10 秒自动降频 20fps（AI 思考或打字火花/涟漪时保持流畅）
      const isIdle = aiBusyTarget < 0.5 && now - lastActivityTime > 10000;
      const hasBurstFx = sparks.length > 0 || ripples.length > 0 || cursorTrail.length > 0;
      const fxMinInterval = hasBurstFx ? 0 : isIdle ? 50 : state.ecoMode ? 33.3 : 16.6;
      if (fxMinInterval === 0 || now - lastFxFrame >= fxMinInterval) {
        lastFxFrame = now;
        renderFxOverlay();
      }

      const activePipeline = pipelines[state.scene];
      if (!activePipeline) return;

      const minInterval = isIdle ? 50 : state.ecoMode ? 33.3 : 0;
      if (minInterval > 0 && now - lastGpuFrame < minInterval) return;
      lastGpuFrame = now;

      mouseX += (targetMouseX - mouseX) * 0.06;
      mouseY += (targetMouseY - mouseY) * 0.06;
      aiBusySmooth += (aiBusyTarget - aiBusySmooth) * 0.05;
      const nowDate = new Date();
      const dayTime = nowDate.getHours() + nowDate.getMinutes() / 60 + nowDate.getSeconds() / 3600;

      uniformData[0] = bgCanvas.width;
      uniformData[1] = bgCanvas.height;
      uniformData[2] = mouseX;
      uniformData[3] = mouseY;
      uniformData[4] = (now - startTime) * 0.001;
      uniformData[5] = isSceneFxEnabled(state.scene) ? 1.0 : 0.0;
      uniformData[6] = aiBusySmooth;
      uniformData[7] = dayTime;
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: gpuCtx.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: { r: 0.015, g: 0.02, b: 0.05, a: 1.0 },
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(activePipeline);
      pass.setBindGroup(0, bindGroups[state.scene]);
      pass.draw(3);
      pass.end();
      device.queue.submit([encoder.finish()]);
    };

    rafId = requestAnimationFrame(frame);
    return true;
  }

  startWebGPU().catch((err) => {
    console.warn("[WebGPU Studio] init failed:", err);
  });
})();
