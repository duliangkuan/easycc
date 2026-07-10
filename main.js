const { app, BrowserWindow, WebContentsView, ipcMain, Menu, shell } = require("electron");
const { spawn, execFileSync } = require("child_process");
const https = require("https");
const path = require("path");
const fs = require("fs");

// 线上网站（改内容/课程/UI 只需网站侧 deploy，桌面端自动同步）
const SITE_URL = process.env.FY_SITE_URL || "https://fy.dufengyun.xyz";
// CLI 二进制下载源：优先 ECS（杭州，国内快），失败兜底 GitHub Release
const BIN_SOURCES = [
  "https://api.dufengyun.xyz/download",
  "https://github.com/duliangkuan/fy-desktop/releases/download/binaries",
];
const TOOLBAR_H = 56;

const configPath = () => path.join(app.getPath("userData"), "config.json");
const binDir = () => path.join(app.getPath("userData"), "bin");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf-8"));
  } catch {
    return { apiKey: "", baseUrl: "https://api.dufengyun.xyz" };
  }
}
function saveConfig(cfg) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

let win, siteView;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "风云AI工具站",
    backgroundColor: "#faf8f5",
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  win.loadFile("toolbar.html");

  siteView = new WebContentsView();
  win.contentView.addChildView(siteView);
  const ua = siteView.webContents.getUserAgent() + " FYDesktop/1.0";
  siteView.webContents.setUserAgent(ua);
  siteView.webContents.loadURL(SITE_URL);

  const layout = () => {
    const { width, height } = win.getContentBounds();
    siteView.setBounds({ x: 0, y: TOOLBAR_H, width, height: height - TOOLBAR_H });
  };
  layout();
  win.on("resize", layout);
  siteView.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ── 下载文件（带进度 + 跟随重定向，GitHub 下载会 302）──
function downloadFile(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + ".downloading";
    const file = fs.createWriteStream(tmp);
    https
      .get(url, (res) => {
        // 跟随重定向
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          file.close();
          fs.rmSync(tmp, { force: true });
          if (redirects > 5) return reject(new Error("重定向过多"));
          return resolve(downloadFile(res.headers.location, dest, onProgress, redirects + 1));
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.rmSync(tmp, { force: true });
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let got = 0;
        res.on("data", (chunk) => {
          got += chunk.length;
          if (total) onProgress(Math.round((got / total) * 100), got, total);
        });
        res.pipe(file);
        file.on("finish", () => file.close(() => {
          fs.renameSync(tmp, dest);
          resolve(dest);
        }));
      })
      .on("error", (e) => {
        file.close();
        fs.rmSync(tmp, { force: true });
        reject(e);
      });
  });
}

// 多源兜底：依次尝试 ECS → GitHub
async function downloadWithFallback(filename, dest, onProgress) {
  let lastErr;
  for (const base of BIN_SOURCES) {
    try {
      return await downloadFile(`${base}/${filename}`, dest, onProgress);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("所有下载源均失败");
}

function sendProgress(payload) {
  if (win && !win.isDestroyed()) win.webContents.send("cli-progress", payload);
}

/**
 * 确保工具二进制就位：不在则从自托管源下载 + 缓存。
 * claude：单文件 claude.exe。codex：codex.tar.gz 解压到 codex/（Windows 自带 tar）。
 * 返回可执行文件的完整路径。
 */
async function ensureBinary(tool) {
  fs.mkdirSync(binDir(), { recursive: true });
  if (tool === "cc") {
    const exe = path.join(binDir(), "claude.exe");
    if (fs.existsSync(exe)) return exe;
    sendProgress({ tool, phase: "start", label: "Claude Code" });
    await downloadWithFallback("claude.exe", exe, (p, got, total) =>
      sendProgress({ tool, phase: "downloading", percent: p, got, total, label: "Claude Code" })
    );
    sendProgress({ tool, phase: "done" });
    return exe;
  }
  // codex（包内可执行在 bin/codex.exe）
  const codexDir = path.join(binDir(), "codex");
  const exe = path.join(codexDir, "bin", "codex.exe");
  if (fs.existsSync(exe)) return exe;
  const tgz = path.join(binDir(), "codex.tar.gz");
  sendProgress({ tool, phase: "start", label: "Codex" });
  await downloadWithFallback("codex.tar.gz", tgz, (p, got, total) =>
    sendProgress({ tool, phase: "downloading", percent: p, got, total, label: "Codex" })
  );
  sendProgress({ tool, phase: "extracting" });
  fs.mkdirSync(codexDir, { recursive: true });
  // Windows 10+ 自带 tar.exe
  execFileSync("tar", ["-xzf", tgz, "-C", codexDir]);
  fs.rmSync(tgz, { force: true });
  sendProgress({ tool, phase: "done" });
  if (!fs.existsSync(exe)) throw new Error("codex 解压后未找到可执行文件");
  return exe;
}

async function launchCli(tool) {
  const cfg = loadConfig();
  if (!cfg.apiKey)
    return { ok: false, error: "请先在右上角「设置」填入你的专属 API Key（在控制台→我的 API Key 获取）" };
  if (process.platform !== "win32")
    return { ok: false, error: "当前版本仅支持 Windows 启动 CLI" };

  let exe;
  try {
    exe = await ensureBinary(tool);
  } catch (e) {
    sendProgress({ tool, phase: "error" });
    return { ok: false, error: `下载 ${tool === "codex" ? "Codex" : "Claude Code"} 失败：${e.message}` };
  }

  let inner;
  if (tool === "codex") {
    inner = `set FY_API_KEY=${cfg.apiKey}&& "${exe}"`;
  } else {
    inner = `set ANTHROPIC_BASE_URL=${cfg.baseUrl}&& set ANTHROPIC_AUTH_TOKEN=${cfg.apiKey}&& "${exe}"`;
  }
  const title = tool === "codex" ? "Codex" : "Claude Code";
  spawn("cmd.exe", ["/c", "start", title, "cmd", "/k", inner], {
    detached: true,
    shell: false,
    windowsHide: false,
  });
  return { ok: true };
}

ipcMain.handle("launch", (_e, tool) => launchCli(tool));
ipcMain.handle("get-config", () => loadConfig());
ipcMain.handle("save-config", (_e, cfg) => {
  saveConfig(cfg);
  return { ok: true };
});
ipcMain.handle("go-console", () => {
  if (siteView) siteView.webContents.loadURL(`${SITE_URL}/console/keys`);
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});
app.on("window-all-closed", () => app.quit());
