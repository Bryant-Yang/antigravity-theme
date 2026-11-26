# Antigravity Theme Studio

专为 **Google Antigravity 2.x（macOS）** 打造的零侵入、零依赖主题与原生 WebGPU 动态场景工坊。

- **零侵入**：不修改 `Antigravity.app` 安装包，通过本地 CDP 端口热注入，一键还原。
- **即点即切**：内置右下角 **`✦ 主题`** 悬浮工坊，含 **11 套原生 WebGPU 场景 + 本地动态壁纸 + 纯净编辑室**。
- **自动挂载**：支持 macOS `LaunchAgent` 后台守护，重启或 `Cmd + R` 自动恢复。

## 快速开始

环境要求：macOS、Node.js `>= 22`（无需 `npm install`）、Google Antigravity `2.x`。

```bash
# 1. 一键启动并应用（也可在 Finder 双击 start-theme.command）
node scripts/agy-theme.mjs relaunch

# 2. 开启后台自动挂载（推荐，重启或刷新页面自动恢复）
node scripts/agy-theme.mjs install-daemon
```

### 常用命令

```bash
node scripts/agy-theme.mjs inject                    # 热注入当前配置
node scripts/agy-theme.mjs inject --scene blackhole  # 指定场景切换
node scripts/agy-theme.mjs watch                     # 改 CSS 自动热重载
node scripts/agy-theme.mjs status                    # 查看运行状态
node scripts/agy-theme.mjs remove                    # 一键还原原厂界面（或双击 restore-default.command）
node scripts/agy-theme.mjs uninstall-daemon          # 卸载后台守护
```

## 内置 13 套场景

- **11 套原生 WebGPU（WGSL）**：`cyberrain` 赛博雨夜 · `cosmic` 宇宙星空 · `blackhole` 星际黑洞 · `aurora` 北极极光 · `circadian` 真实昼夜 · `synthwave` 蒸汽波网格 · `abyssal` 深海荧光 · `chrome` 液态金属 · `sakura` 樱吹雪夜 · `ember` 火山余烬 · `inkwash` 水墨云海
- **`wallpaper` 动态壁纸**：支持本地 `.mp4 / .webm / .mov / .gif / .png` 收藏夹、自动轮播与主色提取（IndexedDB 本地存储）
- **`none` 纯净编辑室**：无动态画布的浅 / 深双模暖调主题

## 面板功能

- **视觉与护眼**：自适应亮度护眼、透明度 / 画面模糊 / 侧栏磨砂、对话区宽度滑块、禅模式（`⌥⇧Z`）、番茄钟光带
- **交互与音效**：省电模式、光标边框聚光灯、AI 流光环、打字火花、点击涟漪、鼠标轨迹、星尘星座、完成提示音、氛围白噪音、机械键盘音效（Thock / Clicky / 打字机，支持中文输入法与独立音量）

## License

MIT
