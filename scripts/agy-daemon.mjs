#!/usr/bin/env node
/**
 * Warm Atelier — macOS 轻量后台自动挂载守护进程
 * 功能：
 *   1. 每 4 秒静默巡检（极低开销），Antigravity 携带 CDP 端口运行时，自动为未挂载主题的新窗口/刷新页注入主题与「✦ 主题」面板。
 *   2. 若用户从 Dock 普通图标冷启动 Antigravity（启动时长 < 25 秒且无 CDP 参数），自动平滑接力重启补参，不打断正在进行的长会话。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const CSS_PATH = path.join(ROOT_DIR, "warm-atelier.css");
const STUDIO_PATH = path.join(ROOT_DIR, "webgpu-studio.js");
const APP_PATH = "/Applications/Antigravity.app";
const MAIN_BIN = "/Applications/Antigravity.app/Contents/MacOS/Antigravity";
const DEVTOOLS_PORT_FILE = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Antigravity",
  "DevToolsActivePort"
);

const POLL_MS = 4000;
const COLD_START_WINDOW_SEC = 25;
const handledColdPids = new Set();
let isBusy = false;

function parseEtimeSeconds(etime) {
  // macOS ps etime format: [[dd-]hh:]mm:ss
  const s = String(etime || "").trim();
  if (!s) return 999999;
  let days = 0;
  let rest = s;
  if (rest.includes("-")) {
    const [d, r] = rest.split("-");
    days = Number(d) || 0;
    rest = r;
  }
  const parts = rest.split(":").map((x) => Number(x) || 0);
  if (parts.length === 3) return days * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return days * 86400 + parts[0] * 60 + parts[1];
  return days * 86400 + (parts[0] || 0);
}

function getAntigravityProcess() {
  const res = spawnSync("ps", ["-axo", "pid=,etime=,args="], { encoding: "utf8" });
  if (res.status !== 0 || !res.stdout) return null;
  for (const line of res.stdout.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.+)$/);
    if (!m) continue;
    const [, pidStr, etime, args] = m;
    if (args.startsWith(MAIN_BIN)) {
      return {
        pid: Number(pidStr),
        uptimeSec: parseEtimeSeconds(etime),
        hasCdp: args.includes("--remote-debugging-port"),
      };
    }
  }
  return null;
}

function readCdpPort() {
  try {
    if (!fs.existsSync(DEVTOOLS_PORT_FILE)) return null;
    const first = fs.readFileSync(DEVTOOLS_PORT_FILE, "utf8").trim().split(/\r?\n/)[0];
    const port = Number(first);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

function cdpEval(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(new Error("timeout"));
    }, 4000);
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true },
        })
      );
    });
    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.id !== 1) return;
        clearTimeout(timer);
        ws.close();
        resolve(msg.result?.result?.value);
      } catch (err) {
        clearTimeout(timer);
        ws.close();
        reject(err);
      }
    });
    ws.addEventListener("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function ensureInjectedOnPort(port) {
  let list;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) return;
    list = await res.json();
  } catch {
    return;
  }

  const pages = list.filter(
    (t) =>
      t.type === "page" &&
      t.webSocketDebuggerUrl &&
      /^https:\/\/127\.0\.0\.1:\d+\//.test(String(t.url || ""))
  );

  for (const page of pages) {
    try {
      const mounted = await cdpEval(
        page.webSocketDebuggerUrl,
        `Boolean(document.getElementById("warm-atelier-theme") && document.getElementById("agy-theme-studio-root"))`
      );
      if (mounted) continue;

      if (!fs.existsSync(CSS_PATH) || !fs.existsSync(STUDIO_PATH)) continue;
      // 直接复用 agy-theme.mjs inject，确保逻辑完全一致
      spawnSync(process.execPath, [path.join(__dirname, "agy-theme.mjs"), "inject", "--port", String(port)], {
        stdio: "ignore",
        timeout: 8000,
      });
      console.log(`[agy-daemon] Auto-injected theme on port ${port}`);
      return;
    } catch {
      // ignore transient page reload errors
    }
  }
}

async function handoffColdStart(proc) {
  handledColdPids.add(proc.pid);
  console.log(`[agy-daemon] Cold start detected (pid=${proc.pid}, uptime=${proc.uptimeSec}s), handing off to CDP...`);
  spawnSync("osascript", ["-e", 'tell application "Antigravity" to quit'], { stdio: "ignore" });

  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 350));
    if (!getAntigravityProcess()) break;
  }
  if (getAntigravityProcess()) return;

  const child = spawn("open", ["-a", APP_PATH, "--args", "--remote-debugging-port=0"], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}

async function tick() {
  if (isBusy) return;
  isBusy = true;
  try {
    const proc = getAntigravityProcess();
    if (!proc) return;

    if (proc.hasCdp) {
      const port = readCdpPort();
      if (port) {
        await ensureInjectedOnPort(port);
      }
    } else if (proc.uptimeSec <= COLD_START_WINDOW_SEC && !handledColdPids.has(proc.pid)) {
      await handoffColdStart(proc);
    }
  } finally {
    isBusy = false;
  }
}

console.log("[agy-daemon] Warm Atelier background watcher started.");
tick();
setInterval(tick, POLL_MS);
