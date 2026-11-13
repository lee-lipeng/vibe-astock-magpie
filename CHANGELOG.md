# Changelog

## 0.2.0 — 2026-11-13

- 「接入 AI」下拉里列出网关的每个模型（`Magpie · GLM-5.3-Flash —— auto/glm-5.3-flash · 1.0M`），
  选中后 Base URL、Model、API Key 自动带出。
- 新增 `models` 命令，在 magpie 里加了 provider / 路由组后刷新下拉；`doctor` 会对比下拉条数与网关条数。
- 模型清单改成一对标记之间的整块，刷新整块替换、卸载整块删除；`Settings.tsx` 加一行 key 预填。
- 重装不再丢 `verify` 写下的 `direct` 段。
- 测试 16 项。

## 0.1.2 — 2026-11-13

- magpie 页面改成外部 `page.css` / `page.js`（magpie 的 page 用外部脚本加载，内联脚本在 CSP 下不保证执行）。
- 去掉页面里的 `/v1/models` 请求：网关不带 CORS 头、`OPTIONS` 返回 404，页面里必被拦。
- 页面现在不发请求、不声明权限，也不需要 `_magpie/bridge.js`。

## 0.1.1 — 2026-11-13

- 补丁保留原文件换行风格（CRLF 检出不再混进 LF）。
- 幂等判据改成显式的 sentinel。
- `--base-url` 走 `normalizeBaseURL`：去尾斜杠、拒绝远程 http 与带凭据的地址。
- 模板安装：显式参数优先，内容没变不重写。
- `--repo` / `--data-root` 漏写值时不再把 `true` 当路径。
- `verify` 先检查矩阵入口与 `orchestrator/node_modules`。
- 页面改用 DOM 构建模型表，不再拼 `innerHTML`。

## 0.1.0 — 2026-11-13

首个版本：provider 模板、`install` / `uninstall` / `verify` / `doctor`、下拉补丁、magpie page 插件。

实测（`auto/glm-5.3-flash`）：10 项里 8 通过；服务端 JSON Schema 不生效，图片输入超时。
