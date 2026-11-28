# Antigravity Theme Studio

专为 **Google Antigravity 2.x（macOS）** 打造的零侵入、零依赖主题与原生 WebGPU 动态场景工坊。

- **零侵入**：不修改 `Antigravity.app` 安装包，通过本地 CDP 热注入，一键还原。
- **即点即切**：右下角内置 **`✦ 主题`** 悬浮工坊，含多套原生 WebGPU 场景、本地动态壁纸播放列表与纯净编辑室。
- **自动挂载**：支持 macOS `LaunchAgent` 后台守护，重启或 `Cmd + R` 自动恢复。

## 快速开始

环境要求：macOS、Node.js `>= 22`（无需 `npm install`）、Google Antigravity `2.x`。

```bash
# 一键启动并应用（也可在 Finder 双击 start-theme.command）
node scripts/agy-theme.mjs relaunch

# 开启后台自动挂载（推荐）
node scripts/agy-theme.mjs install-daemon
```

### 常用命令

```bash
node scripts/agy-theme.mjs inject            # 热注入当前配置
node scripts/agy-theme.mjs watch             # 改 CSS 自动热重载
node scripts/agy-theme.mjs status            # 查看状态
node scripts/agy-theme.mjs remove            # 还原原厂界面（或双击 restore-default.command）
node scripts/agy-theme.mjs uninstall-daemon  # 卸载后台守护
```

## 主要特性

- **场景与壁纸**：19 套原生 WebGPU 实时动态场景（含深色、昼夜、水墨/抹茶/午后窗影浅色）+ 本地视频/图片动态壁纸（自动取色与轮播）+ 暖调纯净编辑室。
- **视觉与专注**：自适应护眼、通透度/模糊/对话宽度调节、边框聚光灯、鼠标光晕、AI 旋转流光环、星尘星座、场景氛围微粒、禅模式（`⌥⇧Z`）、番茄钟、氛围白噪音与机械键盘音效。

## License

MIT
