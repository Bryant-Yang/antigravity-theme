# Antigravity Theme Studio

一套专为 **Google Antigravity 2.x（实测 2.34.0+）** 打造的**零侵入、零依赖**主题与动态场景工坊：
- **不修改 `Antigravity.app` 安装包**，通过本地 CDP 端口 0.1 秒热注入与还原，同时单文件 `warm-atelier.css` 兼容 BetterGravity。
- **13 套原生 WebGPU WGSL 实时动态场景 + 1 套浅/深双模纯净编辑室**，内置右下角 **`✦ 主题`** 悬浮工坊面板，点击 0 延迟瞬切并自动记住偏好。
- **悬浮玻璃岛侧边栏**、主工作区与右侧辅助面板统一通透联动、设置页/弹窗高对比可读性保护。
- **内置省电模式**（默认 30fps + 0.85x 分辨率缩放 + 无操作 10 秒降频 20fps + 窗口隐藏自动暂停）。
- **macOS `LaunchAgent` 后台自动挂载守护**：从 Dock 正常启动、电脑重启或 `Cmd + R` 刷新页面都会自动恢复。

---

## 内置 14 套主题场景

| 场景 ID | 名称 | 视觉亮点 |
| :--- | :--- | :--- |
| `cyberrain` | 🌧️ 赛博雨夜 | 双层玻璃雨滴折射 + 霓虹散景天际线 + 周期分叉闪电 |
| `cosmic` | 🌌 宇宙星空 | 三层视差星空 + 十字星芒 + 双层 FBM 流动星云 |
| `blackhole` | 🕳️ 星际黑洞 | 引力透镜扭曲星空 + 多普勒增亮旋转吸积盘 + 爱因斯坦光环 |
| `jarvis` | 🔮 AI 全息核 | 3D 光线步进水晶 + 双轨道环，随 AI 思考自动加速并点亮能量态 |
| `aurora` | ✨ 北极极光 | 三层丝绸翡翠绿/紫极光幕布 + 极地雪山与繁星 |
| `circadian` | 🌅 真实昼夜 | 读取本机真实时钟，从晨曦 → 晴空（自动浅色文字）→ 日落 → 星夜自然演进 |
| `synthwave` | 🌇 蒸汽波网格 | 无限延伸 3D 霓虹网格 + 复古扫描线落日 + 远山剪影 |
| `abyssal` | 🌊 深海荧光 | 水面体积光柱 + 双层水波焦散网 + 生物荧光微粒 |
| `wallpaper` | 🎬 动态壁纸 | 支持自选本地高清 `.mp4 / .webm / .mov / .gif / .png` 无缝循环播放，IndexedDB 自动持久化 |
| `chrome` | 🫧 液态金属 | 暗黑液态水银流体 + 随鼠标角度变化的薄膜干涉全息反光 |
| `sakura` | 🌸 樱吹雪夜 | 靛蓝满月 + 远山剪影 + 双层旋落樱花瓣 |
| `ember` | 🔥 火山余烬 | 玄武岩熔岩流纹脉动 + 上升火星余烬微粒 |
| `inkwash` | 🏔️ 水墨云海 | 浅色系动态主题：宣纸肌理 + 三重青绿远山 + 流动云雾与朱砂印日 |
| `none` | ☕ 纯净编辑室 | 无动态画布的暖调编辑室（米白宣纸浅色 / 暖炭黑深色双模） |

---

## 交互与氛围特效（均可在 `✦ 主题` 面板独立开关）

- **🔋 省电模式**（默认开启）：降低像素填充量 ~68% 并智能限帧，插电时可取消勾选切换高画质
- **⚡ 雨夜闪电**：赛博雨夜远景周期分叉闪电与云层闪光
- **✨ AI 流光环**：AI 思考/输出时输入框外圈自动呼吸发光
- **⌨️ 打字火花**：输入框敲字迸发微光粒子，回车发送触发流光脉冲
- **💧 点击涟漪**：点击界面荡开柔和光圈
- **☄️ 鼠标轨迹**（默认关闭）：光标移动拖出渐变彗尾
- **🧲 星尘星座**（默认关闭）：漂浮微尘粒子受光标引力吸引并连成星图几何线
- **🔔 完成提示**：AI 生成结束时边缘极光脉冲 + 空灵水晶双音提示
- **🎧 氛围白噪音**（默认关闭，带音量滑块）：Web Audio API 零素材实时合成，自动匹配雨声 / 深空和声 / 水下潜流 / 暖流 / 山风

---

## 目录结构

```text
.
├── warm-atelier.css           # 核心样式（适配 Antigravity 2.34+ 全套 tokens、悬浮玻璃岛、设置页高对比保护）
├── webgpu-studio.js           # 13 套 WGSL 着色器引擎 + 交互特效 + Web Audio 合成器 + 「✦ 主题」工坊面板
├── scripts/
│   ├── agy-theme.mjs          # 零依赖 Node 22+ CLI（relaunch / inject / watch / remove / status / daemon 管理）
│   └── agy-daemon.mjs         # macOS LaunchAgent 轻量后台自动挂载守护
├── preview.html               # 纯色主题本地交互预览页
├── 启动 Warm Atelier.command   # macOS Finder 双击一键启动并应用
├── 还原原厂界面.command         # macOS Finder 双击一键还原原厂界面
├── LICENSE
└── README.md
```

---

## 快速开始（macOS）

**环境要求**：Node.js `>= 22`（使用原生 `fetch` 与 `WebSocket`，无需 `npm install`）、Google Antigravity `2.x`。

### 1. 一键应用（零侵入）
- **Finder 双击**：直接双击 **`启动 Warm Atelier.command`**；如需还原，双击 **`还原原厂界面.command`**。
- **命令行**：
  ```bash
  node scripts/agy-theme.mjs relaunch
  ```

### 2. 开启后台自动挂载（推荐）
安装后，以后从 Dock 正常打开、电脑重启或 `Cmd + R` 刷新页面都会自动恢复主题与右下角 `✦ 主题` 按钮：

```bash
# 安装并启动 macOS LaunchAgent
node scripts/agy-theme.mjs install-daemon

# 如需卸载后台守护
node scripts/agy-theme.mjs uninstall-daemon
```

### 3. 常用命令

```bash
# 热注入或切换指定场景（无需重启）
node scripts/agy-theme.mjs inject
node scripts/agy-theme.mjs inject --scene blackhole
node scripts/agy-theme.mjs inject --scene none --mode light

# 边改 CSS 边 0.1 秒自动热重载
node scripts/agy-theme.mjs watch

# 查看连接与生效状态
node scripts/agy-theme.mjs status

# 一键还原原厂界面（同时释放 WebGPU 设备与画布）
node scripts/agy-theme.mjs remove
```

### 4. BetterGravity 单文件兼容（纯静态样式）
如果已安装 [BetterGravity](https://github.com/YashjitPal/BetterGravity)，可直接将 `./warm-atelier.css` 复制到 BetterGravity 的 `themes/` 目录使用。

### 5. 本地静态预览
```bash
open ./preview.html
```
