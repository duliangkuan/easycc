/* EasyCC v3 渲染层：BYOK 无账户版
   页签：应用启动 / Skill 商店（免费开源目录）/ Memory / 设置·接入 */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* ── 接入服务商预设（BYOK 模板）── */
const PROVIDERS = {
  deepseek: {
    name: "DeepSeek 官方",
    baseUrl: "https://api.deepseek.com/anthropic",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
    help: "去 platform.deepseek.com 注册 → 充值（10 元起）→ API Keys 页创建 Key 粘到下面",
  },
  siliconflow: {
    name: "硅基流动",
    baseUrl: "https://api.siliconflow.cn",
    models: ["deepseek-ai/DeepSeek-V3.2", "deepseek-ai/DeepSeek-V4-Flash", "Pro/deepseek-ai/DeepSeek-V3.2"],
    defaultModel: "deepseek-ai/DeepSeek-V3.2",
    help: "去 siliconflow.cn 注册 → API 密钥页创建 Key 粘到下面（新用户送额度）",
  },
  custom: {
    name: "自定义",
    baseUrl: "",
    models: [],
    defaultModel: "",
    help: "填任意 Anthropic 协议兼容的接口地址与 Key（支持自建网关 / 其他中转服务）",
  },
};

/* ── 页签 ── */
const PAGES = ["launch", "skills", "memory", "settings"];
let currentTab = "launch";

function setTab(tab) {
  currentTab = tab;
  $$(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.tab === tab));
  for (const name of PAGES) $(`#page-${name}`).hidden = name !== tab;
  if (tab === "launch") refreshBinStatus();
  if (tab === "skills") loadSkills();
  if (tab === "memory") loadMemory();
  if (tab === "settings") loadSettingsForm();
}

$$(".nav-item").forEach((el) => el.addEventListener("click", () => setTab(el.dataset.tab)));
document.addEventListener("click", (e) => {
  const goto = e.target.closest("[data-goto]");
  if (goto) setTab(goto.dataset.goto);
});

/* ── 标题栏 ── */
$("#minBtn").addEventListener("click", () => window.fy.winCtl("minimize"));
$("#maxBtn").addEventListener("click", () => window.fy.winCtl("maximize"));
$("#closeBtn").addEventListener("click", () => window.fy.winCtl("close"));

/* ── 主题 ── */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("#iconMoon").style.display = theme === "light" ? "" : "none";
  $("#iconSun").style.display = theme === "dark" ? "" : "none";
}
$("#themeBtn").addEventListener("click", async () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
  const cfg = await window.fy.getConfig();
  await window.fy.saveConfig({ ...cfg, theme: next });
});

/* ══ 网络自检（走 relay，与 CC 同路径）══ */

async function runNetCheck() {
  const diag = $("#netDiag");
  const r = await window.fy.netCheck();
  diag.hidden = r.ok;
  return r;
}
$("#diagRetryBtn").addEventListener("click", async () => {
  const st = $("#diagStatus");
  st.textContent = "检测中…";
  const r = await runNetCheck();
  st.textContent = r.ok ? "" : `仍被拦截（${r.error}），按上面办法处理后再试`;
});

/* ══ 应用启动 ══ */

async function refreshBinStatus() {
  const st = await window.fy.binStatus();
  const el = $("#status-cc");
  if (el) {
    if (st.cc.ready) {
      el.textContent = st.cc.bundled ? "✓ 已就绪（内置组件）" : "✓ 已就绪";
      el.classList.add("ready");
    } else {
      el.textContent = "首次启动将自动下载组件（仅一次）";
      el.classList.remove("ready");
    }
  }
}

$$("[data-launch]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "启动中…";
    try {
      const r = await window.fy.launch(btn.dataset.launch);
      if (!r.ok) {
        await window.fy.msgbox(r.error);
        setTab("settings");
      }
    } finally {
      btn.disabled = false;
      btn.textContent = "▶ 启动";
      refreshBinStatus();
    }
  })
);

/* 下载进度（主进程推送）*/
const fmtMB = (b) => (b / 1048576).toFixed(0) + "MB";
window.fy.onProgress((p) => {
  const wrap = $(`#dl-${p.tool}`);
  if (!wrap) return;
  const bar = wrap.querySelector(".dl-bar");
  const text = wrap.querySelector(".dl-text");
  if (p.phase === "start") {
    wrap.hidden = false;
    bar.style.width = "0";
    text.textContent = `正在下载 ${p.label}（仅首次）…`;
  } else if (p.phase === "downloading") {
    bar.style.width = p.percent + "%";
    text.textContent = `${p.percent}%　${fmtMB(p.got)} / ${fmtMB(p.total)}`;
  } else if (p.phase === "extracting") {
    bar.style.width = "100%";
    text.textContent = "解压中…";
  } else {
    wrap.hidden = true;
    refreshBinStatus();
  }
});

/* ══ Skill 商店（免费开源目录）══ */

let installedSkills = [];

async function loadSkills() {
  const list = $("#skillList");
  list.innerHTML = '<p class="field-help">加载中…</p>';
  const [r, installed] = await Promise.all([window.fy.skillList(), window.fy.skillInstalled()]);
  installedSkills = installed;
  if (!r.ok) return (list.innerHTML = `<p class="field-help err">${esc(r.error)}</p>`);
  if (!r.skills.length) return (list.innerHTML = '<p class="field-help">目录暂时为空</p>');
  list.innerHTML = "";
  for (const s of r.skills) list.appendChild(skillCard(s));
}

function skillCard(s) {
  const el = document.createElement("div");
  el.className = "tool-card skill-card";
  const isInstalled = installedSkills.includes(s.slug);
  el.innerHTML = `
    <div class="skill-head">
      <div class="tool-name">${esc(s.title)}</div>
      <span class="chip on">免费</span>
    </div>
    <div class="tool-desc">${esc(s.subtitle || "")}</div>
    <div class="tool-status">${s.version ? "v" + esc(s.version) + " · " : ""}${isInstalled ? "✓ 已安装（重启 CC 生效）" : "未安装"}</div>
    <button class="btn btn-launch">${isInstalled ? "重新安装" : "安装到本地"}</button>`;
  const btn = el.querySelector("button");
  btn.addEventListener("click", async () => {
    const msg = $("#skillMsg");
    msg.className = "field-help";
    btn.disabled = true;
    msg.textContent = "下载安装中…";
    try {
      const inst = await window.fy.skillInstall(s.slug, s.file);
      if (!inst.ok) {
        msg.className = "field-help err";
        msg.textContent = inst.error;
        return;
      }
      msg.className = "field-help ok";
      msg.textContent = `✓ 已安装「${s.title}」——重启 Claude Code 后生效（关掉 CC 窗口重新点启动）`;
      loadSkills();
    } finally {
      btn.disabled = false;
    }
  });
  return el;
}

function esc(x) {
  const d = document.createElement("span");
  d.textContent = x ?? "";
  return d.innerHTML;
}

/* ══ Memory 可视化 ══ */

let memRaw = "";
let memEditing = false;

/** 轻量 markdown 渲染（无 CDN）：标题/粗体/斜体/行内码/码块/列表/引用/链接/分割线 */
function mdRender(md) {
  if (!md || !md.trim()) {
    return '<p class="mem-empty">还没有全局 Memory。<br/><br/>点右上角「编辑」写下你希望 Claude Code 一直记住的偏好和约定；<br/>或在 CC 对话里以 <code class="md-inline">#</code> 开头发消息，CC 会自己记到这里。</p>';
  }
  const lines = esc(md).split("\n");
  let html = "", inCode = false, inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      closeList();
      html += inCode ? "</code></pre>" : '<pre class="md-code"><code>';
      inCode = !inCode;
      continue;
    }
    if (inCode) { html += line + "\n"; continue; }
    let l = line
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
      .replace(/`([^`]+)`/g, '<code class="md-inline">$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="md-link">$1</span>');
    if (/^###\s/.test(l)) { closeList(); html += `<h3>${l.slice(4)}</h3>`; }
    else if (/^##\s/.test(l)) { closeList(); html += `<h2>${l.slice(3)}</h2>`; }
    else if (/^#\s/.test(l)) { closeList(); html += `<h1>${l.slice(2)}</h1>`; }
    else if (/^\s*[-*]\s/.test(l)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${l.replace(/^\s*[-*]\s/, "")}</li>`; }
    else if (/^>\s?/.test(l)) { closeList(); html += `<blockquote>${l.replace(/^>\s?/, "")}</blockquote>`; }
    else if (/^\s*(---|\*\*\*)\s*$/.test(l)) { closeList(); html += "<hr/>"; }
    else if (l.trim() === "") { closeList(); html += '<div class="md-gap"></div>'; }
    else { closeList(); html += `<p>${l}</p>`; }
  }
  closeList();
  if (inCode) html += "</code></pre>";
  return html;
}

async function loadMemory() {
  if (memEditing) return; // 编辑中不覆盖
  const r = await window.fy.memoryRead();
  memRaw = r.content || "";
  $("#memView").innerHTML = mdRender(memRaw);
  window.fy.memoryWatch();
}

window.fy.onMemoryChanged(() => {
  if (currentTab === "memory" && !memEditing) {
    loadMemory();
    const live = $("#memLive");
    live.textContent = "● 刚刚同步";
    setTimeout(() => (live.textContent = "● 实时同步中"), 1500);
  }
});

function setMemEditing(on) {
  memEditing = on;
  $("#memView").hidden = on;
  $("#memEditor").hidden = !on;
  $("#memEditBtn").hidden = on;
  $("#memSaveBtn").hidden = !on;
  $("#memCancelBtn").hidden = !on;
}
$("#memEditBtn").addEventListener("click", () => {
  $("#memEditor").value = memRaw;
  setMemEditing(true);
  $("#memEditor").focus();
});
$("#memCancelBtn").addEventListener("click", () => setMemEditing(false));
$("#memSaveBtn").addEventListener("click", async () => {
  const r = await window.fy.memoryWrite($("#memEditor").value);
  const msg = $("#memMsg");
  msg.className = r.ok ? "field-help ok" : "field-help err";
  msg.textContent = r.ok ? "✓ 已保存，CC 下次启动即读取" : r.error;
  setMemEditing(false);
  loadMemory();
  setTimeout(() => (msg.textContent = " "), 2500);
});

/* ══ 设置 · 接入（BYOK）══ */

let curProvider = "deepseek";

function applyProviderUI(provider, cfg = {}) {
  curProvider = provider;
  const p = PROVIDERS[provider];
  $$(".model-chip[data-provider]").forEach((c) =>
    c.classList.toggle("active", c.dataset.provider === provider)
  );
  $("#providerHelp").textContent = p.help;
  $("#customFields").hidden = provider !== "custom";
  if (provider === "custom") {
    $("#baseUrl").value = cfg.baseUrl && cfg.provider === "custom" ? cfg.baseUrl : "";
  }
  // 模型候选
  const dl = $("#modelOptions");
  dl.innerHTML = p.models.map((m) => `<option value="${esc(m)}">`).join("");
  const useSaved = cfg.provider === provider;
  $("#modelInput").value = useSaved && cfg.model ? cfg.model : p.defaultModel;
  $("#smallModelInput").value = useSaved && cfg.smallModel && cfg.smallModel !== cfg.model ? cfg.smallModel : "";
}

$$(".model-chip[data-provider]").forEach((c) =>
  c.addEventListener("click", async () => {
    const cfg = await window.fy.getConfig();
    applyProviderUI(c.dataset.provider, cfg);
  })
);

async function loadSettingsForm() {
  const cfg = await window.fy.getConfig();
  applyProviderUI(cfg.provider || "deepseek", cfg);
  $("#apiKey").value = cfg.apiKey || "";
  $("#saveMsg").textContent = "";
  if (cfg.apiKey) checkConn();
}

$("#eyeBtn").addEventListener("click", () => {
  const input = $("#apiKey");
  const hide = input.type === "password";
  input.type = hide ? "text" : "password";
  $("#eyeBtn").textContent = hide ? "隐藏" : "显示";
});

$("#saveBtn").addEventListener("click", async () => {
  const p = PROVIDERS[curProvider];
  const model = $("#modelInput").value.trim() || p.defaultModel || "deepseek-chat";
  const small = $("#smallModelInput").value.trim() || model;
  const baseUrl = curProvider === "custom" ? $("#baseUrl").value.trim().replace(/\/+$/, "") : p.baseUrl;
  const msg = $("#saveMsg");
  if (!baseUrl) {
    msg.textContent = "接口地址不能为空";
    return;
  }
  const cfg = await window.fy.getConfig();
  await window.fy.saveConfig({
    ...cfg,
    provider: curProvider,
    baseUrl,
    apiKey: $("#apiKey").value.trim(),
    model,
    smallModel: small,
  });
  msg.textContent = "✓ 已保存";
  setTimeout(() => (msg.textContent = ""), 2000);
  setTimeout(checkConn, 800); // relay 重启后再测
});

/** 连接检测：走 relay（与 CC 完全同一条链路） */
async function checkConn() {
  const el = $("#connStatus");
  el.className = "field-help";
  el.textContent = "检测中…";
  const r = await window.fy.netCheck();
  if (r.ok) {
    el.className = "field-help ok";
    el.textContent = `✓ 连接正常 · 延迟 ${r.ms}ms（与 Claude Code 同链路实测）`;
  } else {
    el.className = "field-help err";
    el.textContent = `✗ 连接异常：${r.error} —— 若开着 VPN 请彻底退出或给服务商域名加直连规则`;
  }
}
$("#connBtn").addEventListener("click", checkConn);

/* ── 启动初始化 ── */
(async () => {
  const cfg = await window.fy.getConfig();
  applyTheme(cfg.theme === "dark" ? "dark" : "light");
  $("#verText").textContent = "v" + (await window.fy.version());
  refreshBinStatus();
  setTimeout(runNetCheck, 2500); // 等 relay 起来后自检网络
})();
