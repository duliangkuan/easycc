# fy-desktop · 风云AI工具站 桌面版

Electron 桌面壳：加载完整线上网站（fy-platform.vercel.app）+ 顶部原生「启动 Claude Code / Codex」按钮。

## 架构要点
- **内容零升级**：课程/证书/Skill/UI/价格全在线上网站，deploy 到 Vercel 后桌面端下次打开即同步，无需用户重装。
- **原生层**：只负责启动 CLI（注入用户专属 fy- Key）+ 设置。这部分才需要 App 自动更新，频率极低。
- 站内外链（闲鱼/淘宝充值）用系统浏览器打开。

## 开发
```bash
npm i
npm start          # 本地跑，默认加载线上站；FY_SITE_URL 可覆盖
npm run dist       # 打 Windows NSIS 安装包
```

## 里程碑
- [x] M1：壳加载整站 + 启动 CC/Codex 按钮 + Key 设置
- [ ] M2：把 claude-code / codex 二进制打进安装包（免用户自己装）
- [ ] M3：electron-updater 自动更新 + 签名
- [ ] M4：登录态同步 Key（免手动粘贴）
