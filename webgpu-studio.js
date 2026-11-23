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
  const FX_CANVAS_ID = "agy-fx-overlay";
  const UI_ROOT_ID = "agy-theme-studio-root";
  const STORAGE_KEY = "agy-theme-studio-v1";
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
    alpha: 0.24,
    blur: 5,
    ecoMode: true,
    lightning: true,
    aiPulse: true,
    typingSparks: true,
    clickRipple: true,
    cursorTrail: false,
    constellation: false,
    doneChime: true,
    ambientAudio: false,
    ambientVol: 0.28,
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

      // 引力弯曲形成的爱因斯坦上下光环
      let haloRing = exp(-pow((r - 0.195) * 26.0, 2.0));
      let upperArc = exp(-pow((r - 0.22) * 10.5, 2.0)) * (0.45 + 0.55 * abs(sin(atan2(tilt.y, tilt.x))));
      let arcNoise = fbm(vec2f(atan2(tilt.y, tilt.x) * 3.0 + t * 0.55, r * 14.0));
      col += vec3f(1.0, 0.74, 0.38) * (haloRing * 1.45 + upperArc * (0.5 + 0.8 * arcNoise) * 0.95);

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
        let rays = 0.55 + 0.45 * fbm(vec2f(p.x * (6.5 + fi * 2.0) + t * 0.18, in.uv.y * 1.8 - t * 0.12));
        let lowCol = vec3f(0.12, 0.95, 0.64);
        let midCol = vec3f(0.18, 0.72, 0.96);
        let highCol = vec3f(0.62, 0.28, 0.92);
        let aCol = mix(mix(lowCol, midCol, smoothstep(0.0, 0.18, dy)), highCol, smoothstep(0.16, 0.42, dy));
        col += aCol * curtain * rays * (0.48 - fi * 0.08);
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

      // 复古扫描线落日
      let sunPos = vec2f(0.1, horizon + 0.17);
      let sd = length(p - sunPos);
      if (sd < 0.22 && in.uv.y > horizon) {
        let sunGrad = mix(vec3f(1.0, 0.18, 0.58), vec3f(1.0, 0.84, 0.28), smoothstep(horizon, horizon + 0.36, in.uv.y));
        let stripe = step(0.22, fract(in.uv.y * 38.0 - t * 0.35)) + smoothstep(horizon + 0.24, horizon + 0.28, in.uv.y);
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
      col *= 0.95 + 0.05 * sin(in.uv.y * res.y * 1.1);
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

      // 水面穿透的体积光柱（God Rays）
      let rayCoord = p.x * 2.8 - (1.0 - in.uv.y) * 0.65;
      let rays = pow(0.5 + 0.5 * sin(rayCoord * 4.5 + t * 0.35 + fbm(vec2f(rayCoord * 2.0, t * 0.12)) * 2.5), 3.0);
      col += vec3f(0.12, 0.56, 0.72) * rays * smoothstep(0.05, 1.0, in.uv.y) * 0.34;

      // 双层水波焦散网（Caustics）
      let c1 = fbm(p * 4.2 + vec2f(t * 0.12, -t * 0.08));
      let c2 = fbm(p * 4.2 + vec2f(-t * 0.1, t * 0.11) + vec2f(3.1, 7.4));
      let caustics = pow(1.0 - abs(c1 - c2) * 3.2, 4.0);
      col += vec3f(0.16, 0.78, 0.88) * clamp(caustics, 0.0, 1.0) * (0.2 + 0.35 * in.uv.y);

      // 缓缓上浮的深海生物荧光微粒
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

      return vec4f(aces(col), 1.0);
    }
  `;

  // --- Scene 7: Matrix Digital Rain (黑客帝国代码雨) ---
  const SHADER_MATRIX = WGSL_COMMON + /* wgsl */ `
    @fragment
    fn fs(in: VsOut) -> @location(0) vec4f {
      let res = max(u.resolution, vec2f(1.0));
      let cols = floor(res.x / 18.0);
      let rows = floor(res.y / 22.0);
      let uv = vec2f(in.uv.x, 1.0 - in.uv.y);
      let grid = vec2f(uv.x * cols, uv.y * rows);
      let cell = floor(grid);
      let f = fract(grid);
      let t = u.time;

      let colSeed = hash11(cell.x * 1.37 + 0.13);
      let speed = 3.2 + colSeed * 7.5;
      let offset = hash11(cell.x * 7.91) * 40.0;
      let trailLen = 10.0 + hash11(cell.x * 3.19) * 18.0;
      let headY = fract((t * speed + offset) / (rows + trailLen)) * (rows + trailLen);
      let dist = headY - cell.y;

      var col = vec3f(0.006, 0.018, 0.012);

      if (dist >= 0.0 && dist < trailLen) {
        let fade = pow(1.0 - dist / trailLen, 1.85);
        // 伪字符点阵块（每 0.18s 随机跳变）
        let glyphTime = floor(t * 5.5 + hash21(cell) * 12.0);
        let sub = floor(f * vec2f(3.0, 4.0));
        let glyphBit = step(0.42, hash21(cell * 13.7 + sub * 3.1 + glyphTime * 0.37));
        let margin = step(0.18, f.x) * step(f.x, 0.82) * step(0.15, f.y) * step(f.y, 0.85);
        let charMask = glyphBit * margin;

        let isHead = smoothstep(1.3, 0.0, dist);
        let bodyCol = mix(vec3f(0.02, 0.72, 0.34), vec3f(0.12, 1.0, 0.62), fade);
        let headCol = vec3f(0.82, 1.0, 0.9);
        col += mix(bodyCol, headCol, isHead) * charMask * (0.28 + 0.95 * fade);
        col += vec3f(0.04, 0.45, 0.24) * fade * 0.14;
      }

      // 轻微 CRT 扫描线
      col *= 0.92 + 0.08 * sin(in.uv.y * res.y * 1.25);
      return vec4f(aces(col), 1.0);
    }
  `;

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

      // 薄膜干涉全息虹彩
      let phase = h * 5.2 + fresnel * 2.8 + t * 0.18;
      let irid = 0.5 + 0.5 * cos(6.2831 * (phase + vec3f(0.0, 0.33, 0.67)));

      var col = vec3f(0.035, 0.04, 0.058) + vec3f(0.14, 0.16, 0.22) * max(dot(n, lightDir), 0.0);
      col += irid * (fresnel * 0.62 + 0.16);
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

      // 双层飘落樱花瓣
      col += petalLayer(p, 5.2, t * 0.55) * 0.65;
      col += petalLayer(p + vec2f(3.7, 1.9), 8.6, t * 0.85) * 0.85;

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

      // 缓缓上升的火星余烬
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

      // 山间飘渺白云带
      let cloudBand = exp(-pow((in.uv.y - 0.24) * 8.5, 2.0)) * smoothstep(0.35, 0.82, mist1);
      col = mix(col, vec3f(0.97, 0.96, 0.93), cloudBand * 0.62);

      return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
    }
  `;

  // --- Scene 12: AI-Linked 3D Holographic Core (Jarvis / Raymarched Crystal + Rings) ---
  const SHADER_JARVIS = WGSL_COMMON + /* wgsl */ `
    fn rot2(a: f32) -> mat2x2f {
      let c = cos(a);
      let s = sin(a);
      return mat2x2f(c, -s, s, c);
    }

    fn sdOctahedron(p: vec3f, s: f32) -> f32 {
      let ap = abs(p);
      return (ap.x + ap.y + ap.z - s) * 0.57735027;
    }

    fn sdTorus(p: vec3f, t: vec2f) -> f32 {
      let q = vec2f(length(p.xz) - t.x, p.y);
      return length(q) - t.y;
    }

    fn mapCore(p_in: vec3f, t: f32, busy: f32) -> vec2f {
      let speed = 1.0 + busy * 2.2;
      var p = p_in;
      let r1 = rot2(t * 0.55 * speed);
      let r2 = rot2(t * 0.38 * speed);
      p = vec3f(r1 * p.xz, p.y).xzy;
      p = vec3f(p.x, r2 * p.yz);

      // 核心八面体水晶（略微呼吸脉动）
      let pulse = 0.52 + 0.03 * sin(t * (2.5 + busy * 5.0));
      let dCore = sdOctahedron(p, pulse);

      // 两个交错旋转的全息轨道环
      var pr1 = p_in;
      let rr1 = rot2(t * 0.8 * speed);
      pr1 = vec3f(rr1 * pr1.xy, pr1.z);
      pr1 = vec3f(pr1.x, rot2(0.75) * pr1.yz);
      let dRing1 = sdTorus(pr1, vec2f(0.84, 0.012 + busy * 0.008));

      var pr2 = p_in;
      let rr2 = rot2(-t * 0.65 * speed);
      pr2 = vec3f(pr2.x, rr2 * pr2.yz);
      pr2 = vec3f(rot2(1.1) * pr2.xz, pr2.y).xzy;
      let dRing2 = sdTorus(pr2, vec2f(1.06, 0.009 + busy * 0.006));

      let dRings = min(dRing1, dRing2);
      if (dCore < dRings) {
        return vec2f(dCore, 1.0);
      }
      return vec2f(dRings, 2.0);
    }

    @fragment
    fn fs(in: VsOut) -> @location(0) vec4f {
      let res = max(u.resolution, vec2f(1.0));
      let aspect = res.x / res.y;
      let busy = clamp(u.aiBusy, 0.0, 1.0);
      let t = u.time;
      let m = (u.mouse - 0.5) * 1.1;

      // 略偏右中构图，避开左侧导航栏
      let uv = (in.uv - 0.5) * vec2f(aspect, 1.0) - vec2f(0.12, 0.0);

      // 深空全息网格基底
      var col = mix(vec3f(0.015, 0.028, 0.068), vec3f(0.008, 0.012, 0.028), smoothstep(0.0, 1.1, length(uv)));
      let accent = mix(vec3f(0.12, 0.84, 1.0), vec3f(1.0, 0.52, 0.18), busy * 0.72);
      let accent2 = mix(vec3f(0.48, 0.36, 1.0), vec3f(1.0, 0.25, 0.62), busy * 0.65);

      // 相机光线步进
      var ro = vec3f(0.0, 0.0, 2.75);
      var rd = normalize(vec3f(uv, -1.65));
      let camYaw = rot2(m.x * 0.45);
      let camPitch = rot2(-m.y * 0.3);
      ro = vec3f(camYaw * ro.xz, ro.y).xzy;
      rd = vec3f(camYaw * rd.xz, rd.y).xzy;
      ro = vec3f(ro.x, camPitch * ro.yz);
      rd = vec3f(rd.x, camPitch * rd.yz);

      var dist = 0.0;
      var glow = 0.0;
      var ringGlow = 0.0;
      var hitMat = 0.0;

      for (var i = 0; i < 52; i = i + 1) {
        let pos = ro + rd * dist;
        let h = mapCore(pos, t, busy);
        if (h.y < 1.5) {
          glow += 0.012 / (abs(h.x) + 0.025);
        } else {
          ringGlow += 0.008 / (abs(h.x) + 0.018);
        }
        if (h.x < 0.0025) {
          hitMat = h.y;
          break;
        }
        dist += h.x * 0.85;
        if (dist > 6.0) { break; }
      }

      if (hitMat > 0.5) {
        let pos = ro + rd * dist;
        let e = 0.003;
        let n = normalize(vec3f(
          mapCore(pos + vec3f(e, 0.0, 0.0), t, busy).x - mapCore(pos - vec3f(e, 0.0, 0.0), t, busy).x,
          mapCore(pos + vec3f(0.0, e, 0.0), t, busy).x - mapCore(pos - vec3f(0.0, e, 0.0), t, busy).x,
          mapCore(pos + vec3f(0.0, 0.0, e), t, busy).x - mapCore(pos - vec3f(0.0, 0.0, e), t, busy).x
        ));
        let fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 2.2);
        if (hitMat < 1.5) {
          col += accent * (0.28 + fresnel * 1.4) + accent2 * fresnel * 0.65;
        } else {
          col += accent * 1.15;
        }
      }

      col += accent * glow * (0.045 + busy * 0.035);
      col += accent2 * ringGlow * (0.055 + busy * 0.045);

      return vec4f(aces(col), 1.0);
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
      col = mix(col, cloudCol, cloudMask * 0.55);

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
    matrix: SHADER_MATRIX,
    chrome: SHADER_CHROME,
    sakura: SHADER_SAKURA,
    ember: SHADER_EMBER,
    inkwash: SHADER_INKWASH,
    jarvis: SHADER_JARVIS,
    circadian: SHADER_CIRCADIAN,
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
    matrix: ["#00ff88", "#34d399", "#a7f3d0"],
    chrome: ["#e2e8f0", "#a78bfa", "#38bdf8"],
    sakura: ["#f9a8d4", "#fbcfe8", "#c4b5fd"],
    ember: ["#f97316", "#ef4444", "#fde047"],
    inkwash: ["#c84b31", "#4a665f", "#242c30"],
    jarvis: ["#22d3ee", "#a78bfa", "#fb923c"],
    circadian: ["#fb923c", "#38bdf8", "#fde68a"],
    none: ["#d97757", "#e8a87c", "#f2ece2"],
  };

  // 光标彗尾与星座引力微尘节点
  let cursorClientX = -999;
  let cursorClientY = -999;
  const cursorTrail = [];
  const dustNodes = Array.from({ length: 24 }, () => ({
    x: Math.random() * Math.max(window.innerWidth, 1200),
    y: Math.random() * Math.max(window.innerHeight, 800),
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    r: 1.1 + Math.random() * 1.4,
  }));

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
    if (scene === "cyberrain" || scene === "sakura") return "rain";
    if (scene === "abyssal") return "ocean";
    if (scene === "ember") return "fire";
    if (scene === "inkwash" || scene === "circadian" || scene === "none") return "wind";
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

  function applyStateToDOM() {
    const html = document.documentElement;
    if (state.scene === "none") {
      html.removeAttribute("data-cosmic-bg");
      html.removeAttribute("data-scene");
      bgCanvas.style.display = "none";
    } else {
      html.setAttribute("data-cosmic-bg", "on");
      html.setAttribute("data-scene", state.scene);
      bgCanvas.style.display = "block";
    }
    html.style.setProperty("--studio-glass-alpha", String(state.alpha));
    html.style.setProperty("--studio-main-alpha", String(Math.min(0.85, state.alpha + 0.08)));
    html.style.setProperty("--studio-sidebar-blur", `${state.blur}px`);
    html.setAttribute("data-ai-pulse-enabled", state.aiPulse ? "on" : "off");
    window.__cosmicRenderer = state.scene === "none" ? "none" : `webgpu:${state.scene}`;
  }

  /* ========================================================================
     3. 交互特效：光标跟踪、点击涟漪、打字微火花、AI 思考呼吸环
     ======================================================================== */
  let lastActivityTime = performance.now();
  const markActive = () => {
    lastActivityTime = performance.now();
  };

  const onMouseMove = (e) => {
    markActive();
    cursorClientX = e.clientX;
    cursorClientY = e.clientY;
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

  const onKeyDown = (e) => {
    markActive();
    if (!state.typingSparks) return;
    const box = document.querySelector('[data-testid="agent-input-box"]');
    if (!box) return;
    const active = document.activeElement;
    if (!active || !box.contains(active)) return;
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

  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("keydown", onKeyDown, { passive: true });
  window.addEventListener("resize", resizeCanvases, { passive: true });

  // 检测 AI 是否正在思考/输出（驱动流光呼吸环、3D 核心加速、完成极光脉冲与水晶提示音）
  let aiBusyTarget = 0;
  let aiBusySmooth = 0;
  let wasAiBusy = false;

  let busyCheckTimer = setInterval(() => {
    if (destroyed) return;
    const rawBusy = Boolean(
      document.querySelector('[data-testid="status-loading-spinner"]') ||
        document.querySelector('[data-testid="stop-button"]') ||
        document.querySelector('button[aria-label*="Stop" i]')
    );
    aiBusyTarget = rawBusy ? 1 : 0;
    document.documentElement.setAttribute("data-ai-busy", state.aiPulse && rawBusy ? "true" : "false");

    if (wasAiBusy && !rawBusy && state.doneChime) {
      triggerDonePulse();
      playCompletionChime();
    }
    wasAiBusy = rawBusy;

    // 昼夜天空在白天时段自动切为高可读浅色文本
    if (state.scene === "circadian") {
      const now = new Date();
      const hr = now.getHours() + now.getMinutes() / 60;
      document.documentElement.setAttribute("data-circadian-day", hr >= 7.5 && hr <= 16.8 ? "true" : "false");
    } else {
      document.documentElement.removeAttribute("data-circadian-day");
    }
  }, 450);

  function renderFxOverlay() {
    if (!fxCtx) return;
    const needDraw = sparks.length > 0 || ripples.length > 0 || cursorTrail.length > 0 || state.constellation;
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

    // 2. 漂浮星尘与光标引力星座连线（独立开关，默认关闭）
    if (state.constellation) {
      const w = fxCanvas.width;
      const h = fxCanvas.height;
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
        const dist = Math.hypot(dx, dy);
        if (dist < 155 && dist > 6) {
          const pull = (1 - dist / 155) * 0.45;
          nd.x += (dx / dist) * pull;
          nd.y += (dy / dist) * pull;

          fxCtx.save();
          fxCtx.beginPath();
          fxCtx.moveTo(nd.x, nd.y);
          fxCtx.lineTo(cursorClientX, cursorClientY);
          fxCtx.strokeStyle = accent;
          fxCtx.globalAlpha = (1 - dist / 155) * 0.32;
          fxCtx.lineWidth = 0.75;
          fxCtx.stroke();
          fxCtx.restore();
        }

        fxCtx.save();
        fxCtx.fillStyle = i % 2 === 0 ? accent : palette[1];
        fxCtx.globalAlpha = dist < 155 ? 0.65 : 0.22;
        fxCtx.beginPath();
        fxCtx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2);
        fxCtx.fill();
        fxCtx.restore();
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

    const SCENES_META = [
      { id: "cyberrain", label: "🌧️ 赛博雨夜" },
      { id: "cosmic", label: "🌌 宇宙星空" },
      { id: "blackhole", label: "🕳️ 星际黑洞" },
      { id: "jarvis", label: "🔮 AI 全息核" },
      { id: "aurora", label: "✨ 北极极光" },
      { id: "circadian", label: "🌅 真实昼夜" },
      { id: "synthwave", label: "🌇 蒸汽波网格" },
      { id: "abyssal", label: "🌊 深海荧光" },
      { id: "matrix", label: "💚 代码雨" },
      { id: "chrome", label: "🫧 液态金属" },
      { id: "sakura", label: "🌸 樱吹雪夜" },
      { id: "ember", label: "🔥 火山余烬" },
      { id: "inkwash", label: "🏔️ 水墨云海" },
      { id: "none", label: "☕ 纯净编辑室" },
    ];

    root.innerHTML = `
      <div class="agy-studio-panel" data-open="false">
        <div class="agy-studio-head">
          <span>✦ 主题工坊</span>
          <button type="button" class="agy-studio-close" title="收起">×</button>
        </div>
        <div class="agy-studio-sec-label">实时场景</div>
        <div class="agy-studio-grid">
          ${SCENES_META.map(
            (s) =>
              `<button type="button" class="agy-scene-btn" data-scene-id="${s.id}">${s.label}</button>`
          ).join("")}
        </div>
        <div class="agy-studio-sec-label">通透度与磨砂</div>
        <label class="agy-slider-row">
          <span>遮罩浓度</span>
          <input type="range" id="agy-sl-alpha" min="0.06" max="0.78" step="0.02" value="${state.alpha}" />
          <em id="agy-val-alpha">${Math.round(state.alpha * 100)}%</em>
        </label>
        <label class="agy-slider-row">
          <span>侧栏模糊</span>
          <input type="range" id="agy-sl-blur" min="0" max="24" step="1" value="${state.blur}" />
          <em id="agy-val-blur">${state.blur}px</em>
        </label>
        <div class="agy-studio-sec-label">交互与氛围特效</div>
        <div class="agy-toggles">
          <label><input type="checkbox" id="agy-fx-eco" ${state.ecoMode ? "checked" : ""}/> 🔋 省电模式</label>
          <label><input type="checkbox" id="agy-fx-lightning" ${state.lightning ? "checked" : ""}/> ⚡ 雨夜闪电</label>
          <label><input type="checkbox" id="agy-fx-aipulse" ${state.aiPulse ? "checked" : ""}/> ✨ AI 流光环</label>
          <label><input type="checkbox" id="agy-fx-sparks" ${state.typingSparks ? "checked" : ""}/> ⌨️ 打字火花</label>
          <label><input type="checkbox" id="agy-fx-ripple" ${state.clickRipple ? "checked" : ""}/> 💧 点击涟漪</label>
          <label><input type="checkbox" id="agy-fx-trail" ${state.cursorTrail ? "checked" : ""}/> ☄️ 鼠标轨迹</label>
          <label><input type="checkbox" id="agy-fx-constellation" ${state.constellation ? "checked" : ""}/> 🧲 星尘星座</label>
          <label><input type="checkbox" id="agy-fx-chime" ${state.doneChime ? "checked" : ""}/> 🔔 完成提示</label>
          <label><input type="checkbox" id="agy-fx-audio" ${state.ambientAudio ? "checked" : ""}/> 🎧 氛围白噪音</label>
        </div>
        <label class="agy-slider-row">
          <span>氛围音量</span>
          <input type="range" id="agy-sl-vol" min="0.05" max="1" step="0.05" value="${state.ambientVol}" />
          <em id="agy-val-vol">${Math.round(state.ambientVol * 100)}%</em>
        </label>
      </div>
      <button type="button" class="agy-studio-fab" title="切换主题与特效">✦ 主题</button>
    `;

    document.body.appendChild(root);

    const panel = root.querySelector(".agy-studio-panel");
    const fab = root.querySelector(".agy-studio-fab");
    const closeBtn = root.querySelector(".agy-studio-close");

    const syncButtons = () => {
      root.querySelectorAll(".agy-scene-btn").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-scene-id") === state.scene);
      });
    };
    syncButtons();

    const togglePanel = (open) => {
      state.panelOpen = typeof open === "boolean" ? open : !state.panelOpen;
      panel.setAttribute("data-open", state.panelOpen ? "true" : "false");
    };

    fab.addEventListener("click", () => togglePanel());
    closeBtn.addEventListener("click", () => togglePanel(false));

    root.querySelectorAll(".agy-scene-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.scene = btn.getAttribute("data-scene-id");
        applyStateToDOM();
        syncAmbientAudio();
        saveState();
        syncButtons();
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

    const slBlur = root.querySelector("#agy-sl-blur");
    const valBlur = root.querySelector("#agy-val-blur");
    slBlur.addEventListener("input", () => {
      state.blur = Number(slBlur.value);
      valBlur.textContent = `${state.blur}px`;
      applyStateToDOM();
      saveState();
    });

    root.querySelector("#agy-fx-eco").addEventListener("change", (e) => {
      state.ecoMode = e.target.checked;
      resizeCanvases();
      saveState();
    });
    root.querySelector("#agy-fx-lightning").addEventListener("change", (e) => {
      state.lightning = e.target.checked;
      saveState();
    });
    root.querySelector("#agy-fx-aipulse").addEventListener("change", (e) => {
      state.aiPulse = e.target.checked;
      applyStateToDOM();
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
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", resizeCanvases);
    if (device) {
      try {
        device.destroy();
      } catch {
        // ignore
      }
      device = null;
    }
    [BG_CANVAS_ID, FX_CANVAS_ID, UI_ROOT_ID].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    const html = document.documentElement;
    html.removeAttribute("data-cosmic-bg");
    html.removeAttribute("data-scene");
    html.removeAttribute("data-ai-busy");
    html.removeAttribute("data-ai-pulse-enabled");
  };

  resizeCanvases();
  applyStateToDOM();
  buildStudioUI();

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

    const frame = (now) => {
      if (destroyed) return;
      rafId = requestAnimationFrame(frame);
      if (document.hidden) return;

      resizeCanvases();
      renderFxOverlay();

      const activePipeline = pipelines[state.scene];
      if (!activePipeline) return;

      // 省电模式 30fps + 无操作 10 秒自动降频 20fps（AI 思考时保持流畅）
      const isIdle = aiBusyTarget < 0.5 && now - lastActivityTime > 10000;
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
      uniformData[5] = state.lightning ? 1.0 : 0.0;
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
