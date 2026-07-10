// 删除用不到的 Electron 语言包（只留 zh-CN 和 en-US），减小体积
const fs = require("fs");
const path = require("path");
exports.default = async function (ctx) {
  const localesDir = path.join(ctx.appOutDir, "locales");
  if (!fs.existsSync(localesDir)) return;
  const keep = new Set(["zh-CN.pak", "en-US.pak"]);
  let removed = 0;
  for (const f of fs.readdirSync(localesDir)) {
    if (f.endsWith(".pak") && !keep.has(f)) {
      fs.rmSync(path.join(localesDir, f));
      removed++;
    }
  }
  console.log(`[afterPack] 删除 ${removed} 个多余语言包`);
};
