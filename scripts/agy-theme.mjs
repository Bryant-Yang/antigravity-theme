#!/usr/bin/env node
/**
 * Warm Atelier — 零侵入 macOS CDP 主题注入与热重载脚本
 * 依赖：Node.js >= 22（使用原生 fetch 与 WebSocket，零第三方包）
 *
 * 用法：
 *   node scripts/agy-theme.mjs launch [--port 9222] [--mode auto|light|dark]
 *   node scripts/agy-theme.mjs inject [--port 9222] [--mode auto|light|dark]
 *   node scripts/agy-theme.mjs watch  [--port 9222] [--mode auto|light|dark]
 *   node scripts/agy-theme.mjs remove [--port 9222]
 *   node scripts/agy-theme.mjs status [--port 9222]
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_CSS_PATH = path.join(ROOT_DIR, "warm-atelier.css");
const STUDIO_SCRIPT_PATH = path.join(ROOT_DIR, "webgpu-studio.js");
const VALID_SCENES = [
  "cyberrain",
  "cosmic",
  "blackhole",
  "aurora",
  "synthwave",
  "abyssal",
  "matrix",
  "chrome",
  "sakura",
  "ember",
  "inkwash",
  "jarvis",
  "circadian",
  "none",
];
const STYLE_ID = "warm-atelier-theme";
const APP_PATH = "/Applications/Antigravity.app";
const DEVTOOLS_PORT_FILES = [
  path.join(os.homedir(), "Library", "Application Support", "Antigravity", "DevToolsActivePort"),
  path.join(os.homedir(), "Library", "Application Support", "antigravity", "DevToolsActivePort"),
];

function parseArgs(argv) {
  const args = {
    command: argv[2] || "help",
    port: null,
    mode: "auto",
    scene: null,
    cssPath: DEFAULT_CSS_PATH,
  };
  for (let i = 3; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--port" && argv[i + 1]) {
      args.port = Number(argv[++i]);
    } else if (token === "--mode" && argv[i + 1]) {
      const m = argv[++i].toLowerCase();
      if (!["auto", "light", "dark"].includes(m)) {
        throw new Error(`不支持的模式: ${m}（可选 auto | light | dark）`);
      }
      args.mode = m;
    } else if (token === "--scene" && argv[i + 1]) {
      const s = argv[++i].toLowerCase();
      if (!VALID_SCENES.includes(s)) {
        throw new Error(`不支持的场景: ${s}（可选 ${VALID_SCENES.join(" | ")}）`);
      }
      args.scene = s;
    } else if (token === "--no-cosmic") {
      args.scene = "none";
    } else if (token === "--cosmic") {
      args.scene = "cosmic";
    } else if (token === "--css" && argv[i + 1]) {
      args.cssPath = path.resolve(argv[++i]);
    }
  }
  return args;
}

function readDevToolsActivePort() {
  for (const filePath of DEVTOOLS_PORT_FILES) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/);
      const port = Number(lines[0]);
      if (Number.isInteger(port) && port > 0) {
        return { port, filePath };
      }
    } catch {
      // ignore unreadable file
    }
  }
  return null;
}

async function discoverTargets(preferredPort) {
  const candidatePorts = [];
  if (preferredPort && preferredPort > 0) candidatePorts.push(preferredPort);
  const active = readDevToolsActivePort();
  if (active && !candidatePorts.includes(active.port)) {
    candidatePorts.push(active.port);
  }
  for (const fallback of [9222, 9229]) {
    if (!candidatePorts.includes(fallback)) candidatePorts.push(fallback);
  }

  for (const port of candidatePorts) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) continue;
      const list = await res.json();
      const pages = list.filter(
        (t) =>
          t.type === "page" &&
          t.webSocketDebuggerUrl &&
          /^https:\/\/127\.0\.0\.1:\d+\//.test(String(t.url || ""))
      );
      if (pages.length > 0) {
        return { port, pages };
      }
    } catch {
      // try next candidate port
    }
  }
  return null;
}

function cdpEvaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      reject(new Error("CDP 执行超时"));
    }, 5000);

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: {
            expression,
            returnByValue: true,
          },
        })
      );
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.id !== 1) return;
        clearTimeout(timer);
        ws.close();
        if (msg.error) {
          reject(new Error(msg.error.message || "CDP Runtime.evaluate 错误"));
        } else if (msg.result?.exceptionDetails) {
          reject(new Error(msg.result.exceptionDetails.text || "页面脚本异常"));
        } else {
          resolve(msg.result?.result?.value);
        }
      } catch (err) {
        clearTimeout(timer);
        ws.close();
        reject(err);
      }
    });

    ws.addEventListener("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`WebSocket 连接失败: ${err.message || "unknown"}`));
    });
  });
}

function buildInjectExpression(cssText, mode) {
  return `(() => {
    const STYLE_ID = ${JSON.stringify(STYLE_ID)};
    const MODE = ${JSON.stringify(mode)};
    const CSS_TEXT = ${JSON.stringify(cssText)};

    const parseRgb = (str) => {
      if (!str) return null;
      const m = str.match(/rgba?\\((\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/i);
      if (m) return [+m[1], +m[2], +m[3]];
      const hex = str.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (hex) {
        const h = hex[1];
        if (h.length === 3) {
          return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
        }
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
      return null;
    };

    const detectMode = () => {
      if (MODE === "light" || MODE === "dark") return MODE;
      const html = document.documentElement;
      if (html.classList.contains("dark") || html.dataset.theme === "dark") return "dark";
      if (html.classList.contains("light") || html.dataset.theme === "light") return "light";
      const inlineBg = html.style.getPropertyValue("--background");
      const rgb = parseRgb(inlineBg);
      if (rgb) {
        const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
        return lum < 128 ? "dark" : "light";
      }
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    };

    const applyMode = () => {
      const resolved = detectMode();
      if (document.documentElement.getAttribute("data-atelier-mode") !== resolved) {
        document.documentElement.setAttribute("data-atelier-mode", resolved);
      }
      return resolved;
    };

    const resolvedMode = applyMode();

    let styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = CSS_TEXT;

    if (!window.__warmAtelierObserver) {
      const obs = new MutationObserver(() => applyMode());
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"],
      });
      window.__warmAtelierObserver = obs;
    }

    return { ok: true, mode: resolvedMode, title: document.title };
  })()`;
}

function buildRemoveExpression() {
  return `(() => {
    const el = document.getElementById(${JSON.stringify(STYLE_ID)});
    if (el) el.remove();
    document.documentElement.removeAttribute("data-atelier-mode");
    if (typeof window.__cosmicWebGpuCleanup === "function") {
      window.__cosmicWebGpuCleanup();
    }
    if (window.__warmAtelierObserver) {
      window.__warmAtelierObserver.disconnect();
      delete window.__warmAtelierObserver;
    }
    return { ok: true, removed: Boolean(el) };
  })()`;
}

async function runInject(args) {
  if (!fs.existsSync(args.cssPath)) {
    throw new Error(`找不到样式文件: ${args.cssPath}`);
  }
  const found = await discoverTargets(args.port);
  if (!found) {
    console.error("未检测到 Antigravity 的本地 CDP 调试端口。");
    console.error("请先退出 Antigravity，再运行：");
    console.error("  node scripts/agy-theme.mjs launch");
    process.exitCode = 1;
    return false;
  }

  const cssText = fs.readFileSync(args.cssPath, "utf8");
  const expr = buildInjectExpression(cssText, args.mode);
  const studioSource = fs.existsSync(STUDIO_SCRIPT_PATH)
    ? `window.__agyInitialScene = ${JSON.stringify(args.scene)};\n${fs.readFileSync(STUDIO_SCRIPT_PATH, "utf8")}`
    : "";

  let injected = 0;
  for (const page of found.pages) {
    try {
      const res = await cdpEvaluate(page.webSocketDebuggerUrl, expr);
      if (studioSource) {
        await cdpEvaluate(page.webSocketDebuggerUrl, studioSource);
      }
      injected += 1;
      const tag = args.scene ? `${res.mode}+${args.scene}` : `${res.mode}+studio`;
      console.log(`✓ 已注入 [${tag}] -> ${res.title || page.url} (port ${found.port})`);
    } catch (err) {
      console.warn(`! 跳过页面 ${page.title || page.url}: ${err.message}`);
    }
  }
  return injected > 0;
}

async function runRemove(args) {
  const found = await discoverTargets(args.port);
  if (!found) {
    console.error("未检测到运行中的 Antigravity CDP 端口。");
    process.exitCode = 1;
    return;
  }
  const expr = buildRemoveExpression();
  for (const page of found.pages) {
    try {
      await cdpEvaluate(page.webSocketDebuggerUrl, expr);
      console.log(`✓ 已还原原厂样式 -> ${page.title || page.url}`);
    } catch (err) {
      console.warn(`! 还原失败 ${page.title || page.url}: ${err.message}`);
    }
  }
}

async function runStatus(args) {
  const found = await discoverTargets(args.port);
  if (!found) {
    console.log("CDP 状态: 未连接（未发现开启 --remote-debugging-port 的 Antigravity 实例）");
    return;
  }
  console.log(`CDP 状态: 已连接 (127.0.0.1:${found.port})，发现 ${found.pages.length} 个页面`);
  for (const page of found.pages) {
    try {
      const info = await cdpEvaluate(
        page.webSocketDebuggerUrl,
        `({ active: Boolean(document.getElementById(${JSON.stringify(STYLE_ID)})), mode: document.documentElement.getAttribute("data-atelier-mode"), title: document.title })`
      );
      console.log(`  - ${info.title || page.url}: ${info.active ? `已启用 (${info.mode || "auto"})` : "未启用"}`);
    } catch (err) {
      console.log(`  - ${page.url}: 检查失败 (${err.message})`);
    }
  }
}

async function runLaunch(args) {
  const port = args.port !== null ? args.port : 0;
  if (!fs.existsSync(APP_PATH)) {
    throw new Error(`未找到 ${APP_PATH}，请确认已安装 Antigravity.app`);
  }
  console.log(`正在以本地 CDP 参数 (--remote-debugging-port=${port}) 启动 Antigravity...`);
  const child = spawn("open", ["-a", APP_PATH, "--args", `--remote-debugging-port=${port}`], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const found = await discoverTargets(port > 0 ? port : null);
    if (found) {
      await new Promise((r) => setTimeout(r, 800));
      await runInject({ ...args, port: found.port });
      return;
    }
  }
  console.error("等待 Antigravity CDP 端口就绪超时。如果应用之前已在无调试端口状态下运行，请先完全退出 (Cmd+Q) 后重试。");
  process.exitCode = 1;
}

function isAntigravityRunning() {
  const res = spawnSync("ps", ["-axo", "comm"], { encoding: "utf8" });
  if (res.status !== 0 || !res.stdout) return false;
  return res.stdout
    .split(/\r?\n/)
    .some((line) => line.trim() === "/Applications/Antigravity.app/Contents/MacOS/Antigravity");
}

async function runRelaunch(args) {
  const port = args.port !== null ? args.port : 0;
  const alreadyCdp = await discoverTargets(port > 0 ? port : null);
  if (alreadyCdp) {
    console.log(`检测到 Antigravity 已在 CDP 端口 ${alreadyCdp.port} 运行，直接热注入主题...`);
    await runInject({ ...args, port: alreadyCdp.port });
    return;
  }

  if (isAntigravityRunning()) {
    console.log("正在优雅退出当前 Antigravity 实例（不修改任何安装包文件）...");
    spawnSync("osascript", ["-e", 'tell application "Antigravity" to quit'], {
      stdio: "ignore",
    });
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 400));
      if (!isAntigravityRunning()) break;
    }
    if (isAntigravityRunning()) {
      console.error("Antigravity 仍在运行，请手动 Cmd+Q 退出后重新执行。");
      process.exitCode = 1;
      return;
    }
  }

  await runLaunch({ ...args, port });
}

async function runWatch(args) {
  await runInject(args);
  console.log(`👀 正在监听 ${args.cssPath}，保存即热重载（按 Ctrl+C 退出）...`);
  let timer = null;
  fs.watch(args.cssPath, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      runInject(args).catch((err) => console.error("热重载失败:", err.message));
    }, 120);
  });
}

const PLIST_LABEL = "com.warmatelier.agy-theme";
const PLIST_PATH = path.join(os.homedir(), "Library", "LaunchAgents", `${PLIST_LABEL}.plist`);
const DAEMON_PATH = path.join(__dirname, "agy-daemon.mjs");

function installDaemon() {
  const realNode = fs.realpathSync(process.execPath);
  const logOut = path.join(os.homedir(), "Library", "Logs", "warm-atelier-daemon.log");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${realNode}</string>
    <string>${DAEMON_PATH}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logOut}</string>
  <key>StandardErrorPath</key>
  <string>${logOut}</string>
</dict>
</plist>
`;
  fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true });
  fs.writeFileSync(PLIST_PATH, plist, "utf8");
  const uid = process.getuid();
  spawnSync("launchctl", ["bootout", `gui/${uid}`, PLIST_PATH], { stdio: "ignore" });
  const boot = spawnSync("launchctl", ["bootstrap", `gui/${uid}`, PLIST_PATH], { encoding: "utf8" });
  if (boot.status !== 0) {
    throw new Error(`launchctl bootstrap 失败: ${boot.stderr || boot.stdout}`);
  }
  console.log(`✓ 已安装并启动 macOS 自动挂载守护 (${PLIST_LABEL})`);
  console.log(`  配置文件: ${PLIST_PATH}`);
}

function uninstallDaemon() {
  const uid = process.getuid();
  spawnSync("launchctl", ["bootout", `gui/${uid}`, PLIST_PATH], { stdio: "ignore" });
  if (fs.existsSync(PLIST_PATH)) {
    fs.unlinkSync(PLIST_PATH);
  }
  console.log(`✓ 已卸载 macOS 自动挂载守护 (${PLIST_LABEL})`);
}

function printHelp() {
  console.log(`Antigravity Theme Studio — 零侵入主题与动态场景工具

用法:
  node scripts/agy-theme.mjs relaunch [--port 0] [--mode auto|light|dark] [--scene <id>]
      优雅重启 Antigravity（若已开启 CDP 则直接热注入）并应用主题工坊

  node scripts/agy-theme.mjs launch [--port 0] [--mode auto|light|dark] [--scene <id>]
      以本地调试端口启动 Antigravity 并自动注入主题

  node scripts/agy-theme.mjs inject [--port 0] [--mode auto|light|dark] [--scene <id>]
      向运行中的 Antigravity 热注入（或刷新）主题与场景

  node scripts/agy-theme.mjs watch  [--port 0] [--mode auto|light|dark]
      监听 warm-atelier.css 修改，保存后 0.1 秒自动热重载

  node scripts/agy-theme.mjs remove [--port 0]
      移除注入的主题样式与画布，立即恢复原厂界面

  node scripts/agy-theme.mjs status [--port 0]
      查看 CDP 连接状态与当前主题启用状态

  node scripts/agy-theme.mjs install-daemon
      安装并启动 macOS LaunchAgent 后台自动挂载守护（Dock 启动/刷新自动恢复）

  node scripts/agy-theme.mjs uninstall-daemon
      停止并卸载 macOS LaunchAgent 后台自动挂载守护

可选 --scene 值:
  ${VALID_SCENES.join(" | ")}`);
}

async function main() {
  const args = parseArgs(process.argv);
  switch (args.command) {
    case "relaunch":
      await runRelaunch(args);
      break;
    case "launch":
      await runLaunch(args);
      break;
    case "inject":
      await runInject(args);
      break;
    case "watch":
      await runWatch(args);
      break;
    case "remove":
      await runRemove(args);
      break;
    case "status":
      await runStatus(args);
      break;
    case "install-daemon":
      installDaemon();
      break;
    case "uninstall-daemon":
      uninstallDaemon();
      break;
    default:
      printHelp();
      break;
  }
}

main().catch((err) => {
  console.error(`错误: ${err.message}`);
  process.exitCode = 1;
});
