# Changelog

## 0.1.1 — 2026-11-13

发布前的一轮代码审查，无接口变更。

- 补丁保留原文件换行风格：Windows 检出是 CRLF，之前插入的行是裸 LF，会让 `git diff` 混行尾。
- 幂等判据改成显式的 `sentinel`，不再依赖 `replace.trim()` 的隐式比较。
- `--base-url` 走 `normalizeBaseURL`：去掉尾斜杠（产品侧拼 `/chat/completions`，多一个斜杠会 404）、
  拒绝远程 http 与带凭据的地址，规则与 Vibe AStock 的 `providerUrlError` 对齐。
- 模板安装语义修正：显式 `--model` / `--base-url` 优先，未给才沿用已装的值；内容没变不重写。
- `--repo` / `--data-root` 忘了给值时不再把 `true` 当路径。
- `verify` 先检查 `orchestrator/node_modules` 与矩阵入口，缺依赖时给一句能照做的提示。
- 安装时模型清单只打前 12 个；`--dry-run` 的补丁输出改成「将打补丁」。
- magpie 页面：模型清单改用 DOM 构建（原来拼 `innerHTML`，网关返回的 `magpie_label` 会被当 HTML 解析），
  并补 `role="status"`、`type="button"`、`rel="noopener"`。
- 测试从 7 项扩到 11 项：CRLF 往返、地址校验、模板安装语义、数据根解析。

## 0.1.0 — 2026-11-13

首个版本。

- `install`：写 `<数据根>/providers/magpie.json`，现场探测 `GET /v1/models` 挑默认模型（优先 `auto/*` 路由组）；
  可选给 Vibe AStock「接入 AI」的模型下拉补一条 *Magpie 网关*（5 行，带 `// magpie-plugin` 标记）。
- `uninstall`：删模板 + 逐行摘补丁，仓库回到原样。
- `verify`：复用 Vibe AStock 的 `provider_matrix.ts` 跑 10 项兼容矩阵，`--write` 把建议的 `direct` 段写回数据根模板。
- `doctor`：仓库 / 数据根 / 模板 / 网关 / 模型 / 补丁 / 实测记录一次看全。
- `magpie-page/`：magpie page 插件（`@lee-lipeng/page-vibe-astock`），装进 magpie 的 Plugins 页。
- 实测（`auto/glm-5.3-flash`）：8 通过 / 1 失败（服务端 JSON Schema，回落提示词）/ 1 超时（图片输入）。
