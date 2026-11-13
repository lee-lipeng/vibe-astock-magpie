# Changelog

## 0.1.0 — 2026-11-13

首个版本。

- `install`：写 `<数据根>/providers/magpie.json`，现场探测 `GET /v1/models` 挑默认模型（优先 `auto/*` 路由组）；
  可选给 Vibe AStock「接入 AI」的模型下拉补一条 *Magpie 网关*（5 行，带 `// magpie-plugin` 标记）。
- `uninstall`：删模板 + 逐行摘补丁，仓库回到原样。
- `verify`：复用 Vibe AStock 的 `provider_matrix.ts` 跑 10 项兼容矩阵，`--write` 把建议的 `direct` 段写回数据根模板。
- `doctor`：仓库 / 数据根 / 模板 / 网关 / 模型 / 补丁 / 实测记录一次看全。
- `magpie-page/`：magpie page 插件（`@lee-lipeng/page-vibe-astock`），装进 magpie 的 Plugins 页。
- 实测（`auto/glm-5.3-flash`）：8 通过 / 1 失败（服务端 JSON Schema，回落提示词）/ 1 超时（图片输入）。
